import * as shared from "@dreamlit/shared";
const configLoader = (shared as any).configLoader || new (shared as any).ConfigLoader();

function normalizeMoveType(param) {
  if (typeof param === 'string') {
    return param;
  }

  if (!param || typeof param !== 'object') {
    return '';
  }

  const primitiveKeys = ['U8', 'U16', 'U32', 'U64', 'U128', 'U256', 'Bool', 'Address', 'Signer'];
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
    const base = normalizeMoveType({ Struct: param.StructInstantiation.struct });
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
    console.warn('[ABI] Could not normalize Move type:', error?.message || error, param);
    return '';
  }
}

/**
 * Detect on-chain signature for spreadsheet::save_version and whether it expects content_hash and clock.
 * Returns { expectsContentHash: boolean, expectsClock: boolean, params: string[], debug: object }
 */
export async function detectSaveVersionSignature() {
  try {
    const cfg = await configLoader.getConfig();
    const net = cfg.getCurrentNetwork();
    const abi = await configLoader.detectABI(net.packageId, cfg.currentNetwork);

    const func = abi?.functions?.['spreadsheet::save_version'];
    if (!func?.parameters) {
      console.warn('[ABI] Function not found in ABI, using fallback config');

      // Warn if we're on mainnet but ABI detection failed
      if (cfg.currentNetwork === 'mainnet') {
        console.error('[ABI] ⚠️ CRITICAL: Mainnet selected but ABI detection failed');
        console.error('[ABI] This will likely cause "Incorrect number of arguments" errors on save');
        console.error('[ABI] Check RPC connectivity: curl https://fullnode.mainnet.sui.io');
      }

      return {
        expectsContentHash: cfg.getFeature('contentHashInSave', true),
        expectsClock: cfg.getFeature('clockInSave', false),
        params: [],
        debug: {
          reason: 'abi_missing_function',
          fallbackFeatureContentHash: cfg.getFeature('contentHashInSave', true),
          fallbackFeatureClock: cfg.getFeature('clockInSave', false),
          packageId: net.packageId,
          currentNetwork: cfg.currentNetwork
        }
      };
    }

    const rawParams = func.parameters || [];
    const normalizedParams = rawParams.map(normalizeMoveType);

    // Improved string type detection that handles various formats
    const isStringParam = (p) => {
      if (typeof p !== 'string') return false;
      return /string::String/i.test(p);
    };

    // Find the first u64 parameter (cell_count)
    const firstU64Idx = normalizedParams.findIndex((p) =>
    typeof p === 'string' && p.toLowerCase().includes('u64')
    );

    // Count string parameters before the first u64
    const beforeU64 = firstU64Idx === -1 ? normalizedParams : normalizedParams.slice(0, firstU64Idx);
    const stringCountBeforeU64 = beforeU64.filter(isStringParam).length;

    // With content hash and clock: [&mut Spreadsheet, String, String, u64, String, &Clock, &mut TxContext]
    // With content hash, no clock:  [&mut Spreadsheet, String, String, u64, String, &mut TxContext]
    // Without hash, with clock:     [&mut Spreadsheet, String,        u64, String, &Clock, &mut TxContext]
    // Without hash, no clock:       [&mut Spreadsheet, String,        u64, String, &mut TxContext]
    // We expect 2 strings before u64 if content_hash is included, 1 if not
    const expectsContentHash = stringCountBeforeU64 >= 2;

    // Detect Clock parameter by checking for clock::Clock type references
    const clockTypes = ['clock::Clock', '0x6::clock::Clock', '0x2::clock::Clock', '::clock::Clock', 'Clock'];
    const expectsClock = normalizedParams.some((p) =>
    typeof p === 'string' && clockTypes.some((t) => p.includes(t))
    );

    // Validate parameter count matches network expectations
    const paramCount = normalizedParams.length;
    if (cfg.currentNetwork === 'mainnet' && paramCount !== 7) {
      console.error(`[ABI] ⚠️ NETWORK MISMATCH: Mainnet should have 7 parameters but detected ${paramCount}`);
      console.error('[ABI] This indicates the detected package is not the mainnet package');
      console.error('[ABI] Expected:', { expectsContentHash, expectsClock, paramCount: 7 });
      console.error('[ABI] Actual:', { expectsContentHash, expectsClock, paramCount });
    }
    if (cfg.currentNetwork === 'testnet' && paramCount > 7) {
      console.warn(`[ABI] PARAM COUNT MISMATCH: Testnet detected ${paramCount} parameters (expected ≤ 6)`);
    }

    // Keep feature flags aligned but never flip them off at runtime
    try {
      const currentContentHash = cfg.getFeature('contentHashInSave', true);
      const currentClock = cfg.getFeature('clockInSave', false);

      if (expectsContentHash && currentContentHash !== true) {
        cfg.setFeature('contentHashInSave', true);
        console.log('[ABI] contentHashInSave flipped ON to match deployed ABI');
      } else if (!expectsContentHash && currentContentHash === true) {
        // Do not flip to false at runtime to avoid client/chain divergence
        console.warn('[ABI] Deployed ABI indicates no content_hash, but client remains in compatibility mode (true)');
      }

      if (expectsClock && currentClock !== true) {
        cfg.setFeature('clockInSave', true);
        console.log('[ABI] clockInSave flipped ON to match deployed ABI');
      } else if (!expectsClock && currentClock === true) {
        // Do not flip to false at runtime to avoid client/chain divergence
        console.warn('[ABI] Deployed ABI indicates no clock, but client remains in compatibility mode (true)');
      }
    } catch (error) {
      console.warn('[ABI] Could not update feature flags:', error.message);
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
      clockParams: normalizedParams.filter((p) => typeof p === 'string' && clockTypes.some((t) => p.includes(t))),
      rawParams,
      normalizedParams,
      reason: 'abi_detected'
    };

    console.log('[ABI] save_version signature detected:', debug);

    // Warn if detected ABI doesn't match config
    const configClock = cfg.getFeature('clockInSave', false);
    const configHash = cfg.getFeature('contentHashInSave', true);
    if (expectsClock !== configClock || expectsContentHash !== configHash) {
      console.warn('[ABI] ⚠️ Config flags do not match detected ABI');
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
    console.error('[ABI] Detection failed:', error);

    // Fallback to config feature flags
    const cfg = await configLoader.getConfig();
    const fallbackContentHash = cfg.getFeature('contentHashInSave', true);
    const fallbackClock = cfg.getFeature('clockInSave', false);

    return {
      expectsContentHash: fallbackContentHash,
      expectsClock: fallbackClock,
      params: [],
      debug: {
        reason: 'detection_error',
        error: error.message,
        fallbackFeatureContentHash: fallbackContentHash,
        fallbackFeatureClock: fallbackClock
      }
    };
  }
}

/**
 * Helper to build save_version arguments based on detected ABI
 */
export async function buildSaveVersionArgs(tx, data) {
  const sig = await detectSaveVersionSignature();
  const includeHash = !!sig.expectsContentHash;
  const includeClock = !!sig.expectsClock;

  // Validation: Check if we're on mainnet without clock
  try {
    const cfg = await configLoader.getConfig();
    const net = cfg.getCurrentNetwork();
    const isMainnet = cfg.currentNetwork === 'mainnet';

    if (isMainnet && !includeClock) {
      console.warn('[AbiHelpers] ⚠️ WARNING: Mainnet deployment detected but clock parameter is disabled');
      console.warn('[AbiHelpers] This mismatch will cause "Incorrect number of arguments" error');
      console.warn('[AbiHelpers] Detected signature:', {
        expectsClock: includeClock,
        currentNetwork: cfg.currentNetwork,
        fallbackReason: sig.debug?.reason,
        packageId: net.packageId
      });
      console.warn('[AbiHelpers] If this is a false alarm, verify that the deployed contract on mainnet really does not need a clock parameter');
    }
  } catch (e) {

    // Silently continue if we can't verify network
  }
  // Build base arguments
  const args = [
  tx.object(data.spreadsheetId || data.spreadsheetObjectId),
  tx.pure.string(data.walrusBlobId)];


  // Add content hash if expected by ABI
  if (includeHash) {
    args.push(tx.pure.string(data.contentHash || ''));
  }

  // Add cell count and description
  args.push(tx.pure.u64(data.cellCount || 0));
  args.push(tx.pure.string(data.description || `Version ${data.version || 'new'}`));

  // Add clock if expected by ABI
  if (includeClock) {
    args.push(tx.object('0x6')); // Clock object
    console.log('[AbiHelpers] ✅ Clock object included in transaction arguments');
  }

  // Log final argument count for debugging
  console.log('[AbiHelpers] Transaction arguments built:', {
    argumentCount: args.length,
    expectedParameterCount: (includeHash ? 2 : 1) + 2 + (includeClock ? 1 : 0) + 2, // Spreadsheet + walrus blob + content_hash (if) + cell_count + description + clock (if) + ctx (not counted in user args)
    includeHash,
    includeClock,
    spreadsheetId: !!data.spreadsheetId || !!data.spreadsheetObjectId,
    walrusBlobId: !!data.walrusBlobId
  });

  return { args, signature: sig };
}

/**
 * Detect on-chain module version from ABI metadata
 * Returns { moduleVersion: number, debug: object }
 */
export async function detectModuleVersion() {
  try {
    const cfg = await configLoader.getConfig();
    const net = cfg.getCurrentNetwork();
    const abi = await configLoader.detectABI(net.packageId, cfg.currentNetwork);

    // Try to find get_module_version function in ABI
    const versionFunc = abi?.functions?.['spreadsheet::get_module_version'];

    // If ABI has the version getter, we know the module supports versioning
    if (versionFunc) {
      console.log('[ABI] Module version support detected in ABI');

      // If we have the actual version in metadata, use it
      // Otherwise default to config
      const configVersion = net.moduleVersion || 1;

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

    // Fallback to config
    const configVersion = net.moduleVersion || 1;
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
    console.error('[ABI] Module version detection failed:', error);

    // Fallback to config
    const cfg = await configLoader.getConfig();
    const net = cfg.getCurrentNetwork();
    const configVersion = net.moduleVersion || 1;

    return {
      moduleVersion: configVersion,
      supportsVersioning: false,
      debug: {
        reason: 'detection_error',
        error: error.message,
        configVersion
      }
    };
  }
}

/**
 * Check if a spreadsheet object is compatible with current module version
 * Returns { compatible: boolean, spreadsheetVersion: number, moduleVersion: number, needsMigration: boolean }
 */
export async function checkSpreadsheetVersionCompatibility(spreadsheetData) {
  try {
    const { moduleVersion } = await detectModuleVersion();

    // Extract spreadsheet version from object data
    // spreadsheetData could be from blockchain query result
    // Default to 0 for legacy objects that don't have module_version
    const spreadsheetVersion = spreadsheetData?.module_version ||
    spreadsheetData?.content?.fields?.module_version ||
    0;

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
      canWrite: compatible, // Only allow writes if versions match
      canRead: true // Always allow reads
    };

  } catch (error) {
    console.error('[ABI] Version compatibility check failed:', error);

    // Default to legacy object (version 0) when detection fails
    return {
      compatible: false,
      spreadsheetVersion: 0,
      moduleVersion: 0,
      needsMigration: true,
      canWrite: false, // Don't allow writes when version detection fails
      canRead: true, // Always allow reads
      error: error.message
    };
  }
}