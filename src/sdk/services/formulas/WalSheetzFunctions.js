/**
 * WalSheetz DeFi Formula Functions for Spreadsheet Integration
 *
 * MULTI-LAYER INJECTION STRATEGY:
 *
 * Layer 1 (PRE-INIT):  frontend/services/luckysheet/injectWZLocalePatch.js (legacy path)
 *                      Patches window.luckysheet_function and window.luckysheet_configsetting
 *                      BEFORE luckysheet.create() is called
 *
 * Layer 2 (HOOK):      frontend/services/luckysheet/injectWzIntoSheets.js (legacy path)
 *                      Wraps luckysheet.create() to inject into sheet.luckysheet_function
 *                      DURING/AFTER luckysheet initialization
 *
* Layer 3 (CONFIG):    frontend/presentation/components/spreadsheet/Spreadsheet.jsx
 *                      Passes luckysheet_function in the config to luckysheet.create()
 *                      AS PART OF the initialization config
 *
 * Layer 4 (FALLBACK):  This file - registerWalSheetzFunctions()
 *                      Runtime registration as final safety net
 *
 * Why multiple layers?
 * - Luckysheet's autocomplete may cache formula lists at different timing points
 * - Triple redundancy ensures WZ functions are available regardless of when autocomplete initializes
 * - Each layer reinforces the others to maximize reliability
 */
import { defiStateManager } from "@/sdk/services/DeFiStateManager.js";
import { eventBus } from "@/sdk/shared/utils/EventBus.js";
import { browserWalletManager } from "@/sdk/blockchain-integration/services/BrowserWalletManager.js";
import { suiGraphQLService } from '@/blockchain/sui-graphql-service.js';
import { browserWalrusService } from "@/walrus/BrowserWalrusService.js";
import { browserSuiService } from "@/sdk/blockchain-integration/services/BrowserSuiService.js";
import { blobLineageTracker } from "@/sdk/data-integrity/services/BlobLineageTracker.js";
import { StorageAdapter } from "@/sdk/spreadsheet-core/adapters/StorageAdapter.js";
import { serializeRange } from "@/sdk/utils/BlobParser.js";

class WalSheetzFormulaEngine {
  constructor() {
    this.initialized = true; // No async initialization needed
    this.rateLimiter = new Map();
    this.maxCallsPerMinute = 60;
  }

  checkRateLimit(cellRef) {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const key = `${cellRef}:${minute}`;

    const currentCount = this.rateLimiter.get(key) || 0;
    if (currentCount >= this.maxCallsPerMinute) {
      throw new Error(`Rate limit exceeded for cell ${cellRef}. Max ${this.maxCallsPerMinute} calls per minute.`);
    }

    this.rateLimiter.set(key, currentCount + 1);

    // Cleanup old entries
    const cutoff = minute - 2;
    for (const rateLimitKey of this.rateLimiter.keys()) {
      if (rateLimitKey.endsWith(`:${cutoff}`) || rateLimitKey.endsWith(`:${cutoff - 1}`)) {
        this.rateLimiter.delete(rateLimitKey);
      }
    }
  }

  parseArgs(args) {
    // Handle different argument formats from spreadsheet
    return args.map((arg) => {
      if (typeof arg === 'string') {
        // Try to parse as JSON if it looks like an object/array
        if (arg.startsWith('[') && arg.endsWith(']') || arg.startsWith('{') && arg.endsWith('}')) {
          try {
            return JSON.parse(arg);
          } catch (e) {
            return arg;
          }
        }
        return arg;
      }
      return arg;
    });
  }

  formatResult(result) {
    // Format result for display in spreadsheet cell
    if (result === null || result === undefined) {
      return 'N/A';
    }

    if (typeof result === 'object') {
      if (result.status === 'loading') {
        return 'Loading...';
      }
      if (result.status === 'error') {
        return `Error: ${result.message}`;
      }
      if (Array.isArray(result)) {
        return result.length > 0 ? JSON.stringify(result) : 'No data';
      }
      return JSON.stringify(result);
    }

    return result.toString();
  }
}

// Create singleton instance
const formulaEngine = new WalSheetzFormulaEngine();

/**
 * SUI.GQL() - Execute Sui GraphQL query
 * Usage: =SUI.GQL("query { object(address: \"0x...\") { digest }}")
 * Usage: =SUI.GQL("getBlobsByOwner", "0x123...")
 * Returns: GraphQL query result
 */
export async function SUI_GQL(queryOrPreset, ...args) {
  const cellRef = this?.cellRef || 'A1';

  try {
    await formulaEngine.ensureInitialized();
    formulaEngine.checkRateLimit(cellRef);

    // Check if it's a preset query name or raw GraphQL
    const presets = {
      'getBlobsByOwner': (owner) => suiGraphQLService.getBlobsByOwner(owner),
      'getWalletHistory': (address) => suiGraphQLService.getWalletHistory(address),
      'getWalrusSiteAssets': (siteId) => suiGraphQLService.getWalrusSiteAssets(siteId),
      'getBlobMetadata': (blobId) => suiGraphQLService.getBlobMetadata(blobId)
    };

    let result;
    if (presets[queryOrPreset]) {
      result = await presets[queryOrPreset](...args);
    } else {
      // Raw GraphQL query
      result = await suiGraphQLService.executeQuery(queryOrPreset, args[0] || {});
    }

    return result;
  } catch (error) {
    console.error('[SUI.GQL] Error:', error);
    return { status: 'error', message: error.message };
  }
}

/**
 * WALRUS.CERT() - Get PoA certificate status for a blob
 * Usage: =WALRUS.CERT("blobId")
 * Returns: PoA certificate status and metadata
 */
export async function WALRUS_CERT(blobId) {
  const cellRef = this?.cellRef || 'A1';

  try {
    await formulaEngine.ensureInitialized();
    formulaEngine.checkRateLimit(cellRef);

    if (!blobId) {
      throw new Error('Blob ID required');
    }

    return await defiStateManager.cacheAsyncCall(
      cellRef,
      'walrus',
      'getPoACertificate',
      [blobId],
      async () => {
        const result = await browserWalrusService.getPoACertificate(blobId);

        if (!result.success) {
          throw new Error(result.error || 'Failed to get PoA certificate');
        }

        return {
          blobId: result.blobId,
          status: result.poaStatus,
          certified: result.poaStatus === 'certified',
          certificate: result.certificate
        };
      },
      600000 // 10 minute cache for certificates
    );
  } catch (error) {
    console.error('[WALRUS.CERT] Error:', error);
    return { status: 'error', message: error.message };
  }
}

/**
 * WALRUS.READ() - Read blob content
 * Usage: =WALRUS.READ("blobId")
 * Usage: =WALRUS.READ("blobId", 0, 1024)
 * Returns: Blob content or partial range
 */
export async function WALRUS_READ(blobId, offset = null, length = null) {
  const cellRef = this?.cellRef || 'A1';

  try {
    await formulaEngine.ensureInitialized();
    formulaEngine.checkRateLimit(cellRef);

    if (!blobId) {
      throw new Error('Blob ID required');
    }

    let result;
    if (offset !== null && length !== null) {
      // Partial read
      result = await browserWalrusService.readBlobRange(blobId, offset, length);
    } else {
      // Full read
      result = await browserWalrusService.retrieveBlob(blobId);
    }

    if (!result.success) {
      throw new Error(result.error || 'Failed to read blob');
    }

    return result.data || result;
  } catch (error) {
    console.error('[WALRUS.READ] Error:', error);
    return { status: 'error', message: error.message };
  }
}

/**
 * WALRUS.MAP_BLOB_TO_OBJECT() - Parse blob JSON/CSV into grid range
 * Usage: =WALRUS.MAP_BLOB_TO_OBJECT("blobId", "A1:Z100")
 * Returns: Success status and parsed row/col counts
 */
export async function WALRUS_MAP_BLOB_TO_OBJECT(blobId, targetRange) {
  const cellRef = this?.cellRef || 'A1';

  try {
    await formulaEngine.ensureInitialized();
    formulaEngine.checkRateLimit(cellRef);

    if (!blobId || !targetRange) {
      throw new Error('Blob ID and target range required');
    }

    // Parse target range (e.g., "A1:Z100" -> {startRow: 0, startCol: 0, ...})
    const rangeMatch = targetRange.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!rangeMatch) {
      throw new Error('Invalid range format. Use format like "A1:Z100"');
    }

    const startCol = rangeMatch[1].charCodeAt(0) - 65;
    const startRow = parseInt(rangeMatch[2]) - 1;

    const result = await browserWalrusService.streamBlobToGrid(blobId, startRow, startCol);

    if (!result.success) {
      throw new Error(result.error || 'Failed to map blob to grid');
    }

    // Inject data into grid via Luckysheet API
    if (window.luckysheet && result.data) {
      const { data, startRow: r, startCol: c } = result;
      for (let i = 0; i < data.length; i++) {
        for (let j = 0; j < data[i].length; j++) {
          window.luckysheet.setCellValue(r + i, c + j, data[i][j]);
        }
      }
    }

    return {
      success: true,
      blobId,
      rows: result.metadata?.rows || 0,
      cols: result.metadata?.cols || 0,
      format: result.metadata?.format || 'unknown'
    };
  } catch (error) {
    console.error('[WALRUS.MAP_BLOB_TO_OBJECT] Error:', error);
    return { status: 'error', message: error.message };
  }
}

/**
 * WALRUS.MAP_OBJECT_TO_BLOB() - Serialize grid range to blob format
 * Usage: =WALRUS.MAP_OBJECT_TO_BLOB("A1:Z100", "json")
 * Usage: =WALRUS.MAP_OBJECT_TO_BLOB("A1:Z100", "csv")
 * Returns: Serialized data ready for WALRUS.PUT
 */
export async function WALRUS_MAP_OBJECT_TO_BLOB(sourceRange, format = 'json') {
  const cellRef = this?.cellRef || 'A1';

  try {
    await formulaEngine.ensureInitialized();
    formulaEngine.checkRateLimit(cellRef);

    if (!sourceRange) {
      throw new Error('Source range required');
    }

    // Parse source range
    const rangeMatch = sourceRange.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!rangeMatch) {
      throw new Error('Invalid range format. Use format like "A1:Z100"');
    }

    const startCol = rangeMatch[1].charCodeAt(0) - 65;
    const startRow = parseInt(rangeMatch[2]) - 1;
    const endCol = rangeMatch[3].charCodeAt(0) - 65;
    const endRow = parseInt(rangeMatch[4]) - 1;

    // Extract data from grid
    const gridData = [];
    if (window.luckysheet) {
      for (let r = startRow; r <= endRow; r++) {
        const row = [];
        for (let c = startCol; c <= endCol; c++) {
          const value = window.luckysheet.getCellValue(r, c);
          row.push(value || '');
        }
        gridData.push(row);
      }
    }

    // Serialize data
    const result = await serializeRange(gridData, { format });

    if (!result.success) {
      throw new Error(result.error || 'Failed to serialize range');
    }

    return {
      success: true,
      data: result.data,
      format,
      size: result.metadata?.size || 0,
      rows: result.metadata?.rows || 0,
      cols: result.metadata?.cols || 0
    };
  } catch (error) {
    console.error('[WALRUS.MAP_OBJECT_TO_BLOB] Error:', error);
    return { status: 'error', message: error.message };
  }
}

/**
 * WALRUS.PUT() - Upload grid data to Walrus
 * Usage: =WALRUS.PUT("A1:Z100")
 * Usage: =WALRUS.PUT("A1:Z100", {"compression": true})
 * Returns: Blob ID and upload metadata
 */
export async function WALRUS_PUT(sourceRange, metadata = {}) {
  const cellRef = this?.cellRef || 'A1';

  try {
    await formulaEngine.ensureInitialized();
    formulaEngine.checkRateLimit(cellRef);

    if (!sourceRange) {
      throw new Error('Source range required');
    }

    // First serialize the range
    const serialized = await WALRUS_MAP_OBJECT_TO_BLOB.call(this, sourceRange, metadata.format || 'json');

    if (serialized.status === 'error') {
      throw new Error(serialized.message);
    }

    // Set loading state
    defiStateManager.setLoading(cellRef, 'walrus', 'storeBlob', [sourceRange]);

    try {
      // Upload to Walrus - wrap serialized string in proper object structure
      const uploadResult = await browserWalrusService.storeBlob({
        content: serialized.data,
        format: serialized.format,
        metadata: {
          source: 'spreadsheet',
          range: sourceRange,
          format: serialized.format,
          rows: serialized.rows,
          cols: serialized.cols,
          ...metadata
        }
      });

      defiStateManager.clearLoading(cellRef, 'walrus', 'storeBlob', [sourceRange]);

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Failed to upload to Walrus');
      }

      // Track blob lineage
      try {
        const storageAdapterInstance = new StorageAdapter();

        // Get current spreadsheet ID (object ID) from session
        const objectId = storageAdapterInstance.getCurrentSpreadsheetId();

        // Get parent blob ID (previous version)
        const parentBlobId = storageAdapterInstance.getLastWalrusBlobId();

        if (objectId) {
          blobLineageTracker.trackVersion({
            blobId: uploadResult.blobId,
            objectId,
            parentBlobId,
            size: serialized.size,
            description: `Uploaded from ${sourceRange}`,
            poaStatus: 'uncertified'
          });
        }

        // Update session with latest blob ID
        storageAdapter.setLastWalrusBlobId(uploadResult.blobId);
      } catch (lineageError) {
        // Log but don't fail the operation if lineage tracking fails
        console.warn('[WALRUS_PUT] Failed to track lineage:', lineageError);
      }

      // Emit success event
      eventBus.emit('walrus:blob:stored', {
        cellRef,
        blobId: uploadResult.blobId,
        range: sourceRange,
        size: serialized.size,
        timestamp: Date.now()
      });

      return {
        success: true,
        blobId: uploadResult.blobId,
        size: serialized.size,
        format: serialized.format,
        metadata: uploadResult.metadata
      };
    } catch (error) {
      defiStateManager.setError(cellRef, 'walrus', 'storeBlob', [sourceRange], error);

      eventBus.emit('walrus:blob:failed', {
        cellRef,
        range: sourceRange,
        error: error.message,
        timestamp: Date.now()
      });

      throw error;
    }
  } catch (error) {
    console.error('[WALRUS.PUT] Error:', error);
    return { status: 'error', message: error.message };
  }
}

/**
 * SUI.TX() - Execute Sui transaction with wallet signing
 * Usage: =SUI.TX("certifyBlob", "blobId")
 * Returns: Transaction digest and result
 */
export async function SUI_TX(txType, ...args) {
  const cellRef = this?.cellRef || 'A1';

  try {
    await formulaEngine.ensureInitialized();
    formulaEngine.checkRateLimit(cellRef);

    if (!txType) {
      throw new Error('Transaction type required');
    }

    // Parse arguments
    const parsedArgs = formulaEngine.parseArgs(args);

    // Set loading state
    defiStateManager.setLoading(cellRef, 'sui', txType, parsedArgs);

    try {
      // Check if wallet is connected
      if (!browserWalletManager.isConnected) {
        throw new Error('Wallet not connected. Please connect your wallet to execute transactions.');
      }

      // Execute transaction based on type
      let executionResult;
      switch (txType) {
        case 'certifyBlob':
          executionResult = await browserSuiService.certifyBlob(parsedArgs[0], browserWalletManager);
          break;

        default:
          throw new Error(`Unknown transaction type: ${txType}`);
      }

      defiStateManager.clearLoading(cellRef, 'sui', txType, parsedArgs);

      if (executionResult.success) {
        const result = {
          status: 'success',
          transactionDigest: executionResult.transactionDigest,
          txType,
          args: parsedArgs,
          effects: executionResult.effects,
          timestamp: Date.now()
        };

        // Emit success event
        eventBus.emit('sui:transaction:completed', {
          cellRef,
          ...result
        });

        return result;
      } else {
        throw new Error(executionResult.error || 'Transaction execution failed');
      }
    } catch (error) {
      defiStateManager.setError(cellRef, 'sui', txType, parsedArgs, error);

      eventBus.emit('sui:transaction:failed', {
        cellRef,
        txType,
        args: parsedArgs,
        error: error.message,
        timestamp: Date.now()
      });

      throw error;
    }
  } catch (error) {
    console.error('[SUI.TX] Error:', error);
    return { status: 'error', message: error.message };
  }
}

// Export all functions for registration with spreadsheet engine
export const WALSHEETZ_FUNCTIONS = {
  'SUI.GQL': SUI_GQL,
  'WALRUS.CERT': WALRUS_CERT,
  'WALRUS.READ': WALRUS_READ,
  'WALRUS.MAP_BLOB_TO_OBJECT': WALRUS_MAP_BLOB_TO_OBJECT,
  'WALRUS.MAP_OBJECT_TO_BLOB': WALRUS_MAP_OBJECT_TO_BLOB,
  'WALRUS.PUT': WALRUS_PUT,
  'SUI.TX': SUI_TX
};

// Function metadata for UI discovery and autocomplete
export const WALSHEETZ_FUNCTION_METADATA = {
  'SUI.GQL': {
    signature: 'SUI.GQL(queryOrPreset, ...args)',
    description: 'Execute Sui GraphQL query or preset',
    category: 'graphql',
    icon: '🔍',
    example: '=SUI.GQL("getBlobsByOwner", "0x123...")',
    returns: 'GraphQL query result',
    parameters: [
    { name: 'queryOrPreset', type: 'string', description: 'GraphQL query string or preset name (getBlobsByOwner, getWalletHistory, etc.)' },
    { name: '...args', type: 'any', description: 'Query arguments (depends on preset)', optional: true }]

  },
  'WALRUS.CERT': {
    signature: 'WALRUS.CERT(blobId)',
    description: 'Get PoA certificate status for a blob',
    category: 'walrus',
    icon: '🎫',
    example: '=WALRUS.CERT("blobId")',
    returns: 'PoA certificate status and metadata',
    parameters: [
    { name: 'blobId', type: 'string', description: 'Walrus blob ID' }]

  },
  'WALRUS.READ': {
    signature: 'WALRUS.READ(blobId, offset?, length?)',
    description: 'Read blob content from Walrus',
    category: 'walrus',
    icon: '📖',
    example: '=WALRUS.READ("blobId")',
    returns: 'Blob content data',
    parameters: [
    { name: 'blobId', type: 'string', description: 'Walrus blob ID' },
    { name: 'offset', type: 'number', description: 'Byte offset for partial read', optional: true },
    { name: 'length', type: 'number', description: 'Number of bytes to read', optional: true }]

  },
  'WALRUS.MAP_BLOB_TO_OBJECT': {
    signature: 'WALRUS.MAP_BLOB_TO_OBJECT(blobId, targetRange)',
    description: 'Parse blob JSON/CSV and inject into grid range',
    category: 'walrus',
    icon: '📥',
    example: '=WALRUS.MAP_BLOB_TO_OBJECT("blobId", "A1:Z100")',
    returns: 'Success status with parsed row/col counts',
    parameters: [
    { name: 'blobId', type: 'string', description: 'Walrus blob ID to load' },
    { name: 'targetRange', type: 'string', description: 'Target grid range (e.g., "A1:Z100")' }]

  },
  'WALRUS.MAP_OBJECT_TO_BLOB': {
    signature: 'WALRUS.MAP_OBJECT_TO_BLOB(sourceRange, format?)',
    description: 'Serialize grid range to blob format',
    category: 'walrus',
    icon: '📤',
    example: '=WALRUS.MAP_OBJECT_TO_BLOB("A1:Z100", "json")',
    returns: 'Serialized data ready for WALRUS.PUT',
    parameters: [
    { name: 'sourceRange', type: 'string', description: 'Source grid range (e.g., "A1:Z100")' },
    { name: 'format', type: 'string', description: 'Output format: "json" or "csv" (default: "json")', optional: true }]

  },
  'WALRUS.PUT': {
    signature: 'WALRUS.PUT(sourceRange, metadata?)',
    description: 'Upload grid data to Walrus storage',
    category: 'walrus',
    icon: '☁️',
    example: '=WALRUS.PUT("A1:Z100")',
    returns: 'Blob ID and upload metadata',
    parameters: [
    { name: 'sourceRange', type: 'string', description: 'Source grid range to upload (e.g., "A1:Z100")' },
    { name: 'metadata', type: 'object', description: 'Optional upload metadata', optional: true }]

  },
  'SUI.TX': {
    signature: 'SUI.TX(txType, ...args)',
    description: 'Execute Sui transaction with wallet signing',
    category: 'sui',
    icon: '✍️',
    example: '=SUI.TX("certifyBlob", "blobId")',
    returns: 'Transaction digest and execution result',
    parameters: [
    { name: 'txType', type: 'string', description: 'Transaction type (certifyBlob, etc.)' },
    { name: '...args', type: 'any', description: 'Transaction arguments (depends on type)', optional: true }]

  }
};

// Convert WalSheetz metadata to Luckysheet formula format
function convertToLuckysheetFormula(name, metadata) {
  // Calculate min/max arguments correctly
  const params = metadata.parameters || [];
  let minArgs = 0;
  let maxArgs = 0;
  let hasVariadic = false;

  // Analyze each parameter to determine arity
  for (const param of params) {
    if (param.name && param.name.startsWith('...')) {
      // Variadic parameter (e.g., ...args)
      hasVariadic = true;
      maxArgs = 255; // Luckysheet's max for infinite args
    } else if (param.optional === true) {
      // Optional parameter
      maxArgs++;
    } else {
      // Required parameter
      minArgs++;
      maxArgs++;
    }
  }

  // If no variadic but has params, ensure max >= min
  if (!hasVariadic && params.length > 0) {
    maxArgs = Math.max(maxArgs, minArgs);
  }

  // Filter out variadic parameters for display
  const displayParams = params.filter((p) => !p.name?.startsWith('...'));

  return {
    n: name, // Function name
    t: 0, // Function type (0 = function)
    d: metadata.description || `WalSheetz ${metadata.category} function`,
    a: displayParams.map((param) => param.name).join(',') || '',
    m: [minArgs, hasVariadic ? 255 : maxArgs], // Correct arity calculation
    p: displayParams.map((param) => ({
      name: param.name,
      detail: param.description,
      example: param.example || '',
      require: param.optional === true ? 'o' : 'm', // Fix optional parameter handling
      repeat: 'n', // 'n' = no repeat
      type: param.type === 'number' ? 'n' : 's' // 'n' = number, 's' = string
    }))
  };
}

/**
 * Get WalSheetz functions metadata in Luckysheet format
 * This helper returns the function definitions without mutating global state
 * @returns {Object} Object with functionList (array) and functionMap (object)
 */
export function getWalSheetzFunctionsMetadata() {
  const functionList = [];
  const functionMap = {};

  Object.entries(WALSHEETZ_FUNCTION_METADATA).forEach(([name, metadata]) => {
    const luckysheetFormula = convertToLuckysheetFormula(name, metadata);
    functionList.push(luckysheetFormula);
    functionMap[name] = luckysheetFormula;
  });

  return {
    functionList, // Array format for functionlist
    functionMap // Object format for luckysheet_function
  };
}

/**
 * Register WalSheetz functions by calling the new injection system
 *
 * This is a thin wrapper that calls window.__wzInject.inject()
 * to patch the actual autocomplete source (sheet files).
 *
 * @param {Object} formulaEngine - Optional external formula engine (for backward compat)
 */
export function registerWalSheetzFunctions(formulaEngine = null) {
  console.log('[WalSheetzFormulas] Registering WalSheetz functions...');

  try {
    // Register with external formula engine if provided (backward compat)
    if (formulaEngine && typeof formulaEngine.registerFunction === 'function') {
      Object.entries(WALSHEETZ_FUNCTIONS).forEach(([name, func]) => {
        try {
          formulaEngine.registerFunction(name, func);
          console.log(`[WalSheetzFormulas] Registered ${name} with external formula engine`);
        } catch (error) {
          console.error(`[WalSheetzFormulas] Failed to register ${name} with engine:`, error);
        }
      });
    }

    // Use new injection system to patch sheet files
    if (typeof window !== 'undefined' && window.__wzInject) {
      console.log('[WalSheetzFormulas] Calling injection system to patch sheet files...');
      const injected = window.__wzInject.inject('registerWalSheetzFunctions');

      if (injected > 0) {
        console.log(`[WalSheetzFormulas] ✅ Successfully injected ${injected} WZ function entries`);
      } else {
        console.warn('[WalSheetzFormulas] ⚠️  Injection returned 0 - may need retry');

        // Schedule retry
        setTimeout(() => {
          console.log('[WalSheetzFormulas] Retrying injection...');
          window.__wzInject?.inject('registerWalSheetzFunctions retry');
        }, 500);
      }
    } else {
      console.error('[WalSheetzFormulas] ❌ Injection API not available!');
      console.error('[WalSheetzFormulas] window.__wzInject:', window.__wzInject);

      // Schedule retry
      setTimeout(() => {
        if (window.__wzInject) {
          console.log('[WalSheetzFormulas] Injection API now available, retrying...');
          window.__wzInject.inject('registerWalSheetzFunctions delayed retry');
        }
      }, 1000);
    }

  } catch (error) {
    console.error('[WalSheetzFormulas] Error during registration:', error);
  }
}

// Helper to format numeric results
export function formatDefiNumber(value, decimals = 2, prefix = '') {
  if (typeof value !== 'number' || isNaN(value)) {
    return 'N/A';
  }

  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });

  return prefix ? `${prefix}${formatted}` : formatted;
}