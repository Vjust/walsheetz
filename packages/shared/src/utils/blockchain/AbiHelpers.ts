import { configLoader } from '../ConfigLoader.js';

interface MoveParam {
  U8?: unknown;
  U16?: unknown;
  U32?: unknown;
  U64?: unknown;
  U128?: unknown;
  U256?: unknown;
  Bool?: unknown;
  Address?: unknown;
  Signer?: unknown;
  TypeParameter?: number;
  MutableReference?: MoveParam;
  Reference?: MoveParam;
  Vector?: MoveParam;
  StructInstantiation?: {
    struct: unknown;
    typeArguments?: MoveParam[];
  };
  Struct?: {
    address?: string;
    module: string;
    name: string;
    typeArguments?: MoveParam[];
  };
}

interface SaveVersionSignature {
  expectsContentHash: boolean;
  expectsClock: boolean;
  params: string[];
  debug: Record<string, unknown>;
}

interface ModuleVersionResult {
  moduleVersion: number;
  supportsVersioning: boolean;
  debug: Record<string, unknown>;
}

interface SpreadsheetVersionCompatibility {
  compatible: boolean;
  spreadsheetVersion: number;
  moduleVersion: number;
  needsMigration: boolean;
  canWrite: boolean;
  canRead: boolean;
  error?: string;
}

interface SaveVersionData {
  spreadsheetId?: string;
  spreadsheetObjectId?: string;
  walrusBlobId: string;
  contentHash?: string;
  cellCount?: number;
  description?: string;
  version?: string | number;
}

interface Transaction {
  object(id: string): unknown;
  pure: {
    string(value: string): unknown;
    u64(value: number): unknown;
  };
}

function normalizeMoveType(param: MoveParam | string): string {
  if (typeof param === 'string') {
    return param;
  }

  if (!param || typeof param !== 'object') {
    return '';
  }

  const primitiveKeys = ['U8', 'U16', 'U32', 'U64', 'U128', 'U256', 'Bool', 'Address', 'Signer'] as const;
  for (const key of primitiveKeys) {
    if (param[key] !== undefined) {
      return key.toLowerCase();
    }
  }

  if (param.TypeParameter !== undefined) {
    return `T${param.TypeParameter}`;
  }

  if (param.MutableReference !== undefined) {
    return `&mut ${normalizeMoveType(param.MutableReference)}`.trim();
  }

  if (param.Reference !== undefined) {
    return `&${normalizeMoveType(param.Reference)}`.trim();
  }

  if (param.Vector !== undefined) {
    return `vector<${normalizeMoveType(param.Vector)}>`;
  }

  if (param.StructInstantiation) {
    const base = normalizeMoveType({ Struct: param.StructInstantiation.struct } as MoveParam);
    const typeArgs = (param.StructInstantiation.typeArguments || []).map(normalizeMoveType);
    return typeArgs.length ? `${base}<${typeArgs.join(', ')}>` : base;
  }

  if (param.Struct) {
    const { address, module, name, typeArguments } = param.Struct;
    const base = `${address || ''}::${module}::${name}`;
    const normalizedArgs = (typeArguments || []).map(normalizeMoveType);
    return normalizedArgs.length ? `${base}<${normalizedArgs.join(', ')}>` : base;
  }

  try {
    return JSON.stringify(param);
  } catch (error) {
    const err = error as Error;
    console.warn('[ABI] Could not normalize Move type:', err?.message || error, param);
    return '';
  }
}

export async function detectSaveVersionSignature(): Promise<SaveVersionSignature> {
  try {
    const cfg = await configLoader.getConfig();
    const net = cfg.getCurrentNetwork!();
    const abi = await configLoader.detectABI(net.packageId, cfg.currentNetwork);

    const func = abi?.functions?.['spreadsheet::save_version'];
    if (!func?.parameters) {
      console.warn('[ABI] Function not found in ABI, using fallback config');

      if (cfg.currentNetwork === 'mainnet') {
        console.error('[ABI] CRITICAL: Mainnet selected but ABI detection failed');
        console.error('[ABI] This will likely cause "Incorrect number of arguments" errors on save');
        console.error('[ABI] Check RPC connectivity: curl https://fullnode.mainnet.sui.io');
      }

      return {
        expectsContentHash: cfg.getFeature!('contentHashInSave', true) as boolean,
        expectsClock: cfg.getFeature!('clockInSave', false) as boolean,
        params: [],
        debug: {
          reason: 'abi_missing_function',
          fallbackFeatureContentHash: cfg.getFeature!('contentHashInSave', true),
          fallbackFeatureClock: cfg.getFeature!('clockInSave', false),
          packageId: net.packageId,
          currentNetwork: cfg.currentNetwork
        }
      };
    }

    const rawParams = (func.parameters || []) as (MoveParam | string)[];
    const normalizedParams = rawParams.map(normalizeMoveType);

    const isStringParam = (p: string): boolean => {
      if (typeof p !== 'string') return false;
      return /string::String/i.test(p);
    };

    const firstU64Idx = normalizedParams.findIndex((p: string) =>
      typeof p === 'string' && p.toLowerCase().includes('u64')
    );

    const beforeU64 = firstU64Idx === -1 ? normalizedParams : normalizedParams.slice(0, firstU64Idx);
    const stringCountBeforeU64 = beforeU64.filter(isStringParam).length;

    const expectsContentHash = stringCountBeforeU64 >= 2;

    const clockTypes = ['clock::Clock', '0x6::clock::Clock', '0x2::clock::Clock', '::clock::Clock', 'Clock'];
    const expectsClock = normalizedParams.some((p: string) =>
      typeof p === 'string' && clockTypes.some(t => p.includes(t))
    );

    const paramCount = normalizedParams.length;
    if (cfg.currentNetwork === 'mainnet' && paramCount !== 7) {
      console.error(`[ABI] NETWORK MISMATCH: Mainnet should have 7 parameters but detected ${paramCount}`);
      console.error('[ABI] This indicates the detected package is not the mainnet package');
      console.error('[ABI] Expected:', { expectsContentHash, expectsClock, paramCount: 7 });
      console.error('[ABI] Actual:', { expectsContentHash, expectsClock, paramCount });
    }
    if (cfg.currentNetwork === 'testnet' && paramCount > 7) {
      console.warn(`[ABI] PARAM COUNT MISMATCH: Testnet detected ${paramCount} parameters (expected <= 6)`);
    }

    try {
      const currentContentHash = cfg.getFeature!('contentHashInSave', true);
      const currentClock = cfg.getFeature!('clockInSave', false);

      if (expectsContentHash && currentContentHash !== true) {
        cfg.setFeature!('contentHashInSave', true);
        console.log('[ABI] contentHashInSave flipped ON to match deployed ABI');
      } else if (!expectsContentHash && currentContentHash === true) {
        console.warn('[ABI] Deployed ABI indicates no content_hash, but client remains in compatibility mode (true)');
      }

      if (expectsClock && currentClock !== true) {
        cfg.setFeature!('clockInSave', true);
        console.log('[ABI] clockInSave flipped ON to match deployed ABI');
      } else if (!expectsClock && currentClock === true) {
        console.warn('[ABI] Deployed ABI indicates no clock, but client remains in compatibility mode (true)');
      }
    } catch (error) {
      const err = error as Error;
      console.warn('[ABI] Could not update feature flags:', err.message);
    }

    const debug = {
      network: cfg.currentNetwork,
      packageId: net.packageId,
      stringCountBeforeU64,
      firstU64Idx,
      paramCount: normalizedParams.length,
      expectsContentHash,
      expectsClock,
      stringParams: beforeU64.filter(isStringParam),
      clockParams: normalizedParams.filter((p: string) => typeof p === 'string' && clockTypes.some(t => p.includes(t))),
      rawParams,
      normalizedParams
    };

    console.log('[ABI] save_version signature detected:', debug);

    const configClock = cfg.getFeature!('clockInSave', false);
    const configHash = cfg.getFeature!('contentHashInSave', true);
    if (expectsClock !== configClock || expectsContentHash !== configHash) {
      console.warn('[ABI] Config flags do not match detected ABI');
      console.warn('[ABI] Detected: clock=' + expectsClock + ', hash=' + expectsContentHash);
      console.warn('[ABI] Config:   clock=' + configClock + ', hash=' + configHash);
    }

    return {
      expectsContentHash,
      expectsClock,
      params: normalizedParams,
      debug
    };

  } catch (error) {
    const err = error as Error;
    console.error('[ABI] Detection failed:', err);

    const cfg = await configLoader.getConfig();
    const fallbackContentHash = cfg.getFeature!('contentHashInSave', true) as boolean;
    const fallbackClock = cfg.getFeature!('clockInSave', false) as boolean;

    return {
      expectsContentHash: fallbackContentHash,
      expectsClock: fallbackClock,
      params: [],
      debug: {
        reason: 'detection_error',
        error: err.message,
        fallbackFeatureContentHash: fallbackContentHash,
        fallbackFeatureClock: fallbackClock
      }
    };
  }
}

export async function buildSaveVersionArgs(tx: Transaction, data: SaveVersionData) {
  const sig = await detectSaveVersionSignature();
  const includeHash = !!sig.expectsContentHash;
  const includeClock = !!sig.expectsClock;

  try {
    const cfg = await configLoader.getConfig();
    const net = cfg.getCurrentNetwork!();
    const isMainnet = cfg.currentNetwork === 'mainnet';

    if (isMainnet && !includeClock) {
      console.warn('[AbiHelpers] WARNING: Mainnet deployment detected but clock parameter is disabled');
      console.warn('[AbiHelpers] This mismatch will cause "Incorrect number of arguments" error');
      console.warn('[AbiHelpers] Detected signature:', {
        expectsClock: includeClock,
        currentNetwork: cfg.currentNetwork,
        fallbackReason: sig.debug?.reason,
        packageId: net.packageId
      });
      console.warn('[AbiHelpers] If this is a false alarm, verify that the deployed contract on mainnet really does not need a clock parameter');
    }
  } catch {
    // Silently continue if we can't verify network
  }

  const args: unknown[] = [
    tx.object(data.spreadsheetId || data.spreadsheetObjectId || ''),
    tx.pure.string(data.walrusBlobId)
  ];

  if (includeHash) {
    args.push(tx.pure.string(data.contentHash || ''));
  }

  args.push(tx.pure.u64(data.cellCount || 0));
  args.push(tx.pure.string(data.description || `Version ${data.version || 'new'}`));

  if (includeClock) {
    args.push(tx.object('0x6'));
    console.log('[AbiHelpers] Clock object included in transaction arguments');
  }

  console.log('[AbiHelpers] Transaction arguments built:', {
    argumentCount: args.length,
    expectedParameterCount: (includeHash ? 2 : 1) + 2 + (includeClock ? 1 : 0) + 2,
    includeHash,
    includeClock,
    spreadsheetId: !!data.spreadsheetId || !!data.spreadsheetObjectId,
    walrusBlobId: !!data.walrusBlobId
  });

  return { args, signature: sig };
}

export async function detectModuleVersion(): Promise<ModuleVersionResult> {
  try {
    const cfg = await configLoader.getConfig();
    const net = cfg.getCurrentNetwork!();
    const abi = await configLoader.detectABI(net.packageId, cfg.currentNetwork);

    const versionFunc = abi?.functions?.['spreadsheet::get_module_version'];

    if (versionFunc) {
      console.log('[ABI] Module version support detected in ABI');

      const configVersion = ((net as unknown) as Record<string, unknown>).moduleVersion as number || 1;

      return {
        moduleVersion: configVersion,
        supportsVersioning: true,
        debug: {
          reason: 'abi_detected',
          configVersion,
          packageId: net.packageId
        }
      };
    }

    const configVersion = ((net as unknown) as Record<string, unknown>).moduleVersion as number || 1;
    console.warn('[ABI] Module version function not found in ABI, using config fallback:', configVersion);

    return {
      moduleVersion: configVersion,
      supportsVersioning: false,
      debug: {
        reason: 'fallback_to_config',
        configVersion,
        packageId: net.packageId
      }
    };

  } catch (error) {
    const err = error as Error;
    console.error('[ABI] Module version detection failed:', err);

    const cfg = await configLoader.getConfig();
    const net = cfg.getCurrentNetwork!();
    const configVersion = ((net as unknown) as Record<string, unknown>).moduleVersion as number || 1;

    return {
      moduleVersion: configVersion,
      supportsVersioning: false,
      debug: {
        reason: 'detection_error',
        error: err.message,
        configVersion
      }
    };
  }
}

export async function checkSpreadsheetVersionCompatibility(spreadsheetData: Record<string, unknown>): Promise<SpreadsheetVersionCompatibility> {
  try {
    const { moduleVersion } = await detectModuleVersion();

    const content = spreadsheetData?.content as Record<string, unknown> | undefined;
    const fields = content?.fields as Record<string, unknown> | undefined;
    const spreadsheetVersion = (spreadsheetData?.module_version || fields?.module_version || 0) as number;

    const compatible = spreadsheetVersion === moduleVersion;
    const needsMigration = spreadsheetVersion < moduleVersion;

    console.log('[ABI] Spreadsheet version compatibility check:', {
      spreadsheetVersion,
      moduleVersion,
      compatible,
      needsMigration
    });

    return {
      compatible,
      spreadsheetVersion,
      moduleVersion,
      needsMigration,
      canWrite: compatible,
      canRead: true
    };

  } catch (error) {
    const err = error as Error;
    console.error('[ABI] Version compatibility check failed:', err);

    return {
      compatible: false,
      spreadsheetVersion: 0,
      moduleVersion: 0,
      needsMigration: true,
      canWrite: false,
      canRead: true,
      error: err.message
    };
  }
}
