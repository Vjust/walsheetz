/**
 * WalSheetz DeFi Formula Functions for Spreadsheet Integration
 *
 * MULTI-LAYER INJECTION STRATEGY:
 *
 * Layer 1 (PRE-INIT):  frontend/services/luckysheet/injectWZLocalePatch.js
 *                      Patches window.luckysheet_function and window.luckysheet_configsetting
 *                      BEFORE luckysheet.create() is called
 *
 * Layer 2 (HOOK):      frontend/services/luckysheet/injectWzIntoSheets.js
 *                      Wraps luckysheet.create() to inject into sheet.luckysheet_function
 *                      DURING/AFTER luckysheet initialization
 *
 * Layer 3 (CONFIG):    frontend/presentation/components/Spreadsheet.jsx
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
import { contractRegistry } from '../../../blockchain/sui-contract-registry.js';
import { defiStateManager } from '../DeFiStateManager.js';
import { EventBus } from '../../utils/EventBus.js';

class WalSheetzFormulaEngine {
  constructor() {
    this.initialized = false;
    this.rateLimiter = new Map();
    this.maxCallsPerMinute = 60;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Initialize the contract registry
      await contractRegistry.initialize();
      this.initialized = true;

      console.log('[WalSheetzFormulas] Initialized formula engine');
    } catch (error) {
      console.error('[WalSheetzFormulas] Failed to initialize:', error);
      throw error;
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
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
    return args.map(arg => {
      if (typeof arg === 'string') {
        // Try to parse as JSON if it looks like an object/array
        if ((arg.startsWith('[') && arg.endsWith(']')) || (arg.startsWith('{') && arg.endsWith('}'))) {
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
 * WZ.CONTRACT.LIST() - List available contracts and their methods
 * Usage: =WZ.CONTRACT.LIST()
 * Returns: JSON array of available contracts
 */
export async function WZ_CONTRACT_LIST(cellRef = 'A1') {
  try {
    await formulaEngine.ensureInitialized();
    formulaEngine.checkRateLimit(cellRef);

    return await defiStateManager.cacheAsyncCall(
      cellRef,
      'registry',
      'listAdapters',
      [],
      async () => {
        const adapters = contractRegistry.listAdapters();
        return adapters.map(adapter => ({
          id: adapter.id,
          name: adapter.name,
          description: adapter.description,
          version: adapter.version,
          methodCount: adapter.methods?.length || 0
        }));
      }
    );
  } catch (error) {
    console.error('[WZ.CONTRACT.LIST] Error:', error);
    return { status: 'error', message: error.message };
  }
}

/**
 * WZ.CONTRACT.CALL() - Call a read-only contract method
 * Usage: =WZ.CONTRACT.CALL("suilend", "getReserves", "marketId")
 * Usage: =WZ.CONTRACT.CALL("suilend", "getUserPosition", "0x123...")
 * Returns: Method result
 */
export async function WZ_CONTRACT_CALL(adapterId, method, ...args) {
  const cellRef = this?.cellRef || 'A1'; // Get cell reference from spreadsheet context

  try {
    await formulaEngine.ensureInitialized();
    formulaEngine.checkRateLimit(cellRef);

    // Parse arguments
    const parsedArgs = formulaEngine.parseArgs(args);

    // Validate inputs
    if (!adapterId || !method) {
      throw new Error('Adapter ID and method are required');
    }

    return await defiStateManager.cacheAsyncCall(
      cellRef,
      adapterId,
      method,
      parsedArgs,
      async () => {
        return await contractRegistry.buildReadCall(adapterId, method, parsedArgs);
      },
      30000 // 30 second cache timeout for read operations
    );
  } catch (error) {
    console.error(`[WZ.CONTRACT.CALL] Error calling ${adapterId}.${method}:`, error);
    return { status: 'error', message: error.message };
  }
}

/**
 * WZ.CONTRACT.EXEC() - Execute a write transaction (requires wallet)
 * Usage: =WZ.CONTRACT.EXEC("suilend", "deposit", "marketId", "coinType", "amount")
 * Returns: Transaction hash or error
 */
export async function WZ_CONTRACT_EXEC(adapterId, method, ...args) {
  const cellRef = this?.cellRef || 'A1';

  try {
    await formulaEngine.ensureInitialized();
    formulaEngine.checkRateLimit(cellRef);

    // Parse arguments
    const parsedArgs = formulaEngine.parseArgs(args);

    // Validate inputs
    if (!adapterId || !method) {
      throw new Error('Adapter ID and method are required');
    }

    // For security, executive operations should not be cached
    console.log(`[WZ.CONTRACT.EXEC] Executing ${adapterId}.${method} with args:`, parsedArgs);

    // Set loading state
    defiStateManager.setLoading(cellRef, adapterId, method, parsedArgs);

    try {
      // Import wallet manager dynamically
      const { browserWalletManager } = await import('../BrowserWalletManager.js');

      // Check if wallet is connected
      if (!browserWalletManager.isConnected) {
        throw new Error('Wallet not connected. Please connect your wallet to execute transactions.');
      }

      // Execute the contract method
      console.log(`[WZ.CONTRACT.EXEC] 🚀 Executing transaction via wallet manager...`);
      const executionResult = await browserWalletManager.executeContractMethod(
        adapterId,
        method,
        parsedArgs,
        {
          modifiers: {
            // Add any execution modifiers here
          },
          executeOptions: {
            showEffects: true,
            showEvents: true,
            showObjectChanges: true
          }
        }
      );

      defiStateManager.clearLoading(cellRef, adapterId, method, parsedArgs);

      if (executionResult.success) {
        const result = {
          status: 'success',
          transactionDigest: executionResult.transactionDigest,
          adapterId,
          method,
          args: parsedArgs,
          effects: executionResult.effects,
          objectChanges: executionResult.objectChanges,
          timestamp: Date.now()
        };

        // Emit success event
        EventBus.emit('defi:transaction:completed', {
          cellRef,
          ...result
        });

        return result;
      } else {
        throw new Error(executionResult.error || 'Transaction execution failed');
      }

    } catch (error) {
      defiStateManager.setError(cellRef, adapterId, method, parsedArgs, error);

      // Emit error event
      EventBus.emit('defi:transaction:failed', {
        cellRef,
        adapterId,
        method,
        args: parsedArgs,
        error: error.message,
        timestamp: Date.now()
      });

      throw error;
    }
  } catch (error) {
    console.error(`[WZ.CONTRACT.EXEC] Error executing ${adapterId}.${method}:`, error);
    return { status: 'error', message: error.message };
  }
}

/**
 * WZ.CONTRACT.LIVE() - Subscribe to live updates from a contract
 * Usage: =WZ.CONTRACT.LIVE("suilend", "ReserveEvents", "coinType")
 * Returns: Latest event data
 */
export async function WZ_CONTRACT_LIVE(adapterId, eventType, ...args) {
  const cellRef = this?.cellRef || 'A1';

  try {
    await formulaEngine.ensureInitialized();
    formulaEngine.checkRateLimit(cellRef);

    const parsedArgs = formulaEngine.parseArgs(args);

    // Check if we have a cached subscription result
    const cached = defiStateManager.getCachedResult(cellRef, adapterId, `live:${eventType}`, parsedArgs);
    if (cached) {
      return cached.result;
    }

    // Set up live subscription
    const unsubscribe = defiStateManager.subscribeToUpdates(
      `${adapterId}:${eventType}`,
      parsedArgs[0] || 'global',
      (data) => {
        // Update cache with new data
        defiStateManager.setCachedResult(
          cellRef,
          adapterId,
          `live:${eventType}`,
          parsedArgs,
          data,
          5000 // 5 second timeout for live data
        );
      }
    );

    // Store unsubscribe function for cleanup
    EventBus.on('spreadsheet:cell:removed', (removedCellRef) => {
      if (removedCellRef === cellRef) {
        unsubscribe();
      }
    });

    // Try to get initial data from adapter
    try {
      const result = await contractRegistry.subscribeEvents(adapterId, {
        eventType,
        args: parsedArgs
      });

      return result || { status: 'subscribed', message: 'Waiting for events...' };
    } catch (error) {
      console.warn(`[WZ.CONTRACT.LIVE] Failed to subscribe to ${adapterId}:${eventType}:`, error);
      return { status: 'error', message: 'Live updates not available' };
    }
  } catch (error) {
    console.error(`[WZ.CONTRACT.LIVE] Error:`, error);
    return { status: 'error', message: error.message };
  }
}

/**
 * WZ.BALANCE() - Get token balance for an address
 * Usage: =WZ.BALANCE("0x123...", "SUI")
 * Usage: =WZ.BALANCE("0x123...", "0x2::sui::SUI")
 */
export async function WZ_BALANCE(address, tokenType = 'SUI') {
  const cellRef = this?.cellRef || 'A1';

  try {
    await formulaEngine.ensureInitialized();
    formulaEngine.checkRateLimit(cellRef);

    return await defiStateManager.cacheAsyncCall(
      cellRef,
      'sui',
      'getBalance',
      [address, tokenType],
      async () => {
        // This would use SuiFunctions or a balance service
        // For now, return placeholder
        return { balance: '0', tokenType, address };
      },
      15000 // 15 second cache for balance queries
    );
  } catch (error) {
    console.error('[WZ.BALANCE] Error:', error);
    return { status: 'error', message: error.message };
  }
}

/**
 * WZ.APY() - Get APY for a specific protocol and asset
 * Usage: =WZ.APY("suilend", "supply", "SUI")
 * Usage: =WZ.APY("suilend", "borrow", "USDC")
 */
export async function WZ_APY(protocol, type, asset) {
  const cellRef = this?.cellRef || 'A1';

  try {
    await formulaEngine.ensureInitialized();
    formulaEngine.checkRateLimit(cellRef);

    const method = type === 'supply' ? 'getSupplyApy' : 'getBorrowApy';

    return await defiStateManager.cacheAsyncCall(
      cellRef,
      protocol,
      method,
      [asset],
      async () => {
        return await contractRegistry.buildReadCall(protocol, method, [asset]);
      },
      60000 // 1 minute cache for APY data
    );
  } catch (error) {
    console.error('[WZ.APY] Error:', error);
    return { status: 'error', message: error.message };
  }
}

/**
 * WZ.SUILEND.MARKETS() - List all Suilend lending markets
 * Usage: =WZ.SUILEND.MARKETS()
 * Returns: Array of market information
 */
export async function WZ_SUILEND_MARKETS() {
  const cellRef = this?.cellRef || 'A1';

  try {
    await formulaEngine.ensureInitialized();
    formulaEngine.checkRateLimit(cellRef);

    return await defiStateManager.cacheAsyncCall(
      cellRef,
      'suilend',
      'listMarkets',
      [],
      async () => {
        return await contractRegistry.buildReadCall('suilend', 'listMarkets', []);
      },
      60000 // 1 minute cache for market data
    );
  } catch (error) {
    console.error('[WZ.SUILEND.MARKETS] Error:', error);
    return { status: 'error', message: error.message };
  }
}

/**
 * WZ.SUILEND.RESERVES() - Get reserve information for all assets or specific market
 * Usage: =WZ.SUILEND.RESERVES()
 * Usage: =WZ.SUILEND.RESERVES("marketId")
 * Returns: Array of reserve objects with APY, utilization, etc.
 */
export async function WZ_SUILEND_RESERVES(marketId) {
  const cellRef = this?.cellRef || 'A1';

  try {
    await formulaEngine.ensureInitialized();
    formulaEngine.checkRateLimit(cellRef);

    const args = marketId ? [marketId] : [];

    return await defiStateManager.cacheAsyncCall(
      cellRef,
      'suilend',
      'getReserves',
      args,
      async () => {
        return await contractRegistry.buildReadCall('suilend', 'getReserves', args);
      },
      30000 // 30 second cache for reserve data
    );
  } catch (error) {
    console.error('[WZ.SUILEND.RESERVES] Error:', error);
    return { status: 'error', message: error.message };
  }
}

/**
 * WZ.SUILEND.POSITION() - Get comprehensive user position across all markets
 * Usage: =WZ.SUILEND.POSITION("0x123...")
 * Returns: User position with total deposited/borrowed, health factor
 */
export async function WZ_SUILEND_POSITION(userAddress) {
  const cellRef = this?.cellRef || 'A1';

  try {
    await formulaEngine.ensureInitialized();
    formulaEngine.checkRateLimit(cellRef);

    if (!userAddress || !userAddress.startsWith('0x')) {
      throw new Error('Valid user address required (must start with 0x)');
    }

    return await defiStateManager.cacheAsyncCall(
      cellRef,
      'suilend',
      'getUserPosition',
      [userAddress],
      async () => {
        return await contractRegistry.buildReadCall('suilend', 'getUserPosition', [userAddress]);
      },
      15000 // 15 second cache for user position
    );
  } catch (error) {
    console.error('[WZ.SUILEND.POSITION] Error:', error);
    return { status: 'error', message: error.message };
  }
}

/**
 * WZ.SUILEND.SUPPLY_APY() - Get supply APY for a specific asset
 * Usage: =WZ.SUILEND.SUPPLY_APY("0x2::sui::SUI")
 * Usage: =WZ.SUILEND.SUPPLY_APY("USDC")
 * Returns: Supply APY percentage
 */
export async function WZ_SUILEND_SUPPLY_APY(coinType) {
  const cellRef = this?.cellRef || 'A1';

  try {
    await formulaEngine.ensureInitialized();
    formulaEngine.checkRateLimit(cellRef);

    if (!coinType) {
      throw new Error('Coin type required');
    }

    return await defiStateManager.cacheAsyncCall(
      cellRef,
      'suilend',
      'getSupplyApy',
      [coinType],
      async () => {
        return await contractRegistry.buildReadCall('suilend', 'getSupplyApy', [coinType]);
      },
      60000 // 1 minute cache for APY data
    );
  } catch (error) {
    console.error('[WZ.SUILEND.SUPPLY_APY] Error:', error);
    return { status: 'error', message: error.message };
  }
}

/**
 * WZ.SUILEND.BORROW_APY() - Get borrow APY for a specific asset
 * Usage: =WZ.SUILEND.BORROW_APY("0x2::sui::SUI")
 * Usage: =WZ.SUILEND.BORROW_APY("USDC")
 * Returns: Borrow APY percentage
 */
export async function WZ_SUILEND_BORROW_APY(coinType) {
  const cellRef = this?.cellRef || 'A1';

  try {
    await formulaEngine.ensureInitialized();
    formulaEngine.checkRateLimit(cellRef);

    if (!coinType) {
      throw new Error('Coin type required');
    }

    return await defiStateManager.cacheAsyncCall(
      cellRef,
      'suilend',
      'getBorrowApy',
      [coinType],
      async () => {
        return await contractRegistry.buildReadCall('suilend', 'getBorrowApy', [coinType]);
      },
      60000 // 1 minute cache for APY data
    );
  } catch (error) {
    console.error('[WZ.SUILEND.BORROW_APY] Error:', error);
    return { status: 'error', message: error.message };
  }
}

/**
 * WZ.SUILEND.HEALTH() - Get user's health factor (liquidation risk indicator)
 * Usage: =WZ.SUILEND.HEALTH("0x123...")
 * Returns: Health factor (>1.0 = safe, <1.0 = liquidation risk)
 */
export async function WZ_SUILEND_HEALTH(userAddress) {
  const cellRef = this?.cellRef || 'A1';

  try {
    await formulaEngine.ensureInitialized();
    formulaEngine.checkRateLimit(cellRef);

    if (!userAddress || !userAddress.startsWith('0x')) {
      throw new Error('Valid user address required (must start with 0x)');
    }

    return await defiStateManager.cacheAsyncCall(
      cellRef,
      'suilend',
      'getUserPosition',
      [userAddress],
      async () => {
        const position = await contractRegistry.buildReadCall('suilend', 'getUserPosition', [userAddress]);
        return position?.overallHealthFactor || 0;
      },
      15000 // 15 second cache for health factor
    );
  } catch (error) {
    console.error('[WZ.SUILEND.HEALTH] Error:', error);
    return { status: 'error', message: error.message };
  }
}

/**
 * WZ.SUILEND.OBLIGATIONS() - Get user's debt positions across all markets
 * Usage: =WZ.SUILEND.OBLIGATIONS("0x123...")
 * Returns: Array of obligation objects with deposits and borrows
 */
export async function WZ_SUILEND_OBLIGATIONS(userAddress) {
  const cellRef = this?.cellRef || 'A1';

  try {
    await formulaEngine.ensureInitialized();
    formulaEngine.checkRateLimit(cellRef);

    if (!userAddress || !userAddress.startsWith('0x')) {
      throw new Error('Valid user address required (must start with 0x)');
    }

    return await defiStateManager.cacheAsyncCall(
      cellRef,
      'suilend',
      'getObligations',
      [userAddress],
      async () => {
        return await contractRegistry.buildReadCall('suilend', 'getObligations', [userAddress]);
      },
      15000 // 15 second cache for obligations
    );
  } catch (error) {
    console.error('[WZ.SUILEND.OBLIGATIONS] Error:', error);
    return { status: 'error', message: error.message };
  }
}

// Export all functions for registration with spreadsheet engine
export const WALSHEETZ_FUNCTIONS = {
  'WZ.CONTRACT.LIST': WZ_CONTRACT_LIST,
  'WZ.CONTRACT.CALL': WZ_CONTRACT_CALL,
  'WZ.CONTRACT.EXEC': WZ_CONTRACT_EXEC,
  'WZ.CONTRACT.LIVE': WZ_CONTRACT_LIVE,
  // 'WZ.BALANCE': WZ_BALANCE, // Temporarily hidden until real implementation
  'WZ.APY': WZ_APY,
  'WZ.SUILEND.MARKETS': WZ_SUILEND_MARKETS,
  'WZ.SUILEND.RESERVES': WZ_SUILEND_RESERVES,
  'WZ.SUILEND.POSITION': WZ_SUILEND_POSITION,
  'WZ.SUILEND.SUPPLY_APY': WZ_SUILEND_SUPPLY_APY,
  'WZ.SUILEND.BORROW_APY': WZ_SUILEND_BORROW_APY,
  'WZ.SUILEND.HEALTH': WZ_SUILEND_HEALTH,
  'WZ.SUILEND.OBLIGATIONS': WZ_SUILEND_OBLIGATIONS
};

// Function metadata for UI discovery and autocomplete
export const WALSHEETZ_FUNCTION_METADATA = {
  'WZ.CONTRACT.LIST': {
    signature: 'WZ.CONTRACT.LIST()',
    description: 'List available DeFi protocols and their methods',
    category: 'discovery',
    icon: '📋',
    example: '=WZ.CONTRACT.LIST()',
    returns: 'Array of protocol information',
    parameters: []
  },
  'WZ.CONTRACT.CALL': {
    signature: 'WZ.CONTRACT.CALL(adapterId, method, ...args)',
    description: 'Call a read-only contract method',
    category: 'read',
    icon: '📖',
    example: '=WZ.CONTRACT.CALL("suilend", "getReserves", "marketId")',
    returns: 'Method execution result',
    parameters: [
      { name: 'adapterId', type: 'string', description: 'Protocol identifier (e.g., "suilend")' },
      { name: 'method', type: 'string', description: 'Method name to call' },
      { name: '...args', type: 'any', description: 'Method arguments', optional: true }
    ]
  },
  'WZ.CONTRACT.EXEC': {
    signature: 'WZ.CONTRACT.EXEC(adapterId, method, ...args)',
    description: 'Execute a write transaction (requires wallet)',
    category: 'write',
    icon: '✍️',
    example: '=WZ.CONTRACT.EXEC("suilend", "deposit", "marketId", "coinType", "amount")',
    returns: 'Transaction hash and result',
    parameters: [
      { name: 'adapterId', type: 'string', description: 'Protocol identifier (e.g., "suilend")' },
      { name: 'method', type: 'string', description: 'Method name to execute' },
      { name: '...args', type: 'any', description: 'Method arguments', optional: true }
    ]
  },
  'WZ.CONTRACT.LIVE': {
    signature: 'WZ.CONTRACT.LIVE(adapterId, eventType, ...args)',
    description: 'Subscribe to live updates from a contract',
    category: 'live',
    icon: '📡',
    example: '=WZ.CONTRACT.LIVE("suilend", "ReserveEvents", "coinType")',
    returns: 'Latest event data (auto-updating)',
    parameters: [
      { name: 'adapterId', type: 'string', description: 'Protocol identifier (e.g., "suilend")' },
      { name: 'eventType', type: 'string', description: 'Event type to subscribe to' },
      { name: '...args', type: 'any', description: 'Event filter arguments', optional: true }
    ]
  },
  // 'WZ.BALANCE': {  // Temporarily hidden until real implementation
  //   signature: 'WZ.BALANCE(address, tokenType)',
  //   description: 'Get token balance for an address',
  //   category: 'read',
  //   icon: '💰',
  //   example: '=WZ.BALANCE("0x123...", "SUI")',
  //   returns: 'Token balance information',
  //   parameters: [
  //     { name: 'address', type: 'string', description: 'Wallet address to check' },
  //     { name: 'tokenType', type: 'string', description: 'Token type (default: "SUI")', optional: true }
  //   ]
  // },
  'WZ.APY': {
    signature: 'WZ.APY(protocol, type, asset)',
    description: 'Get APY for a specific protocol and asset',
    category: 'read',
    icon: '📈',
    example: '=WZ.APY("suilend", "supply", "SUI")',
    returns: 'Annual percentage yield',
    parameters: [
      { name: 'protocol', type: 'string', description: 'Protocol identifier (e.g., "suilend")' },
      { name: 'type', type: 'string', description: '"supply" or "borrow"' },
      { name: 'asset', type: 'string', description: 'Asset symbol (e.g., "SUI", "USDC")' }
    ]
  },
  'WZ.SUILEND.MARKETS': {
    signature: 'WZ.SUILEND.MARKETS()',
    description: 'List all available Suilend lending markets',
    category: 'suilend',
    icon: '🏪',
    example: '=WZ.SUILEND.MARKETS()',
    returns: 'Array of market information with IDs, names, and stats',
    parameters: []
  },
  'WZ.SUILEND.RESERVES': {
    signature: 'WZ.SUILEND.RESERVES(marketId?)',
    description: 'Get reserve information for all assets or specific market',
    category: 'suilend',
    icon: '🏦',
    example: '=WZ.SUILEND.RESERVES()',
    returns: 'Array of reserve objects with APY, utilization, liquidity',
    parameters: [
      { name: 'marketId', type: 'string', description: 'Market ID to filter by (optional)', optional: true }
    ]
  },
  'WZ.SUILEND.POSITION': {
    signature: 'WZ.SUILEND.POSITION(userAddress)',
    description: 'Get comprehensive user position across all markets',
    category: 'suilend',
    icon: '👤',
    example: '=WZ.SUILEND.POSITION("0x123...")',
    returns: 'User position with total deposited/borrowed, health factor',
    parameters: [
      { name: 'userAddress', type: 'string', description: 'User wallet address (0x format)' }
    ]
  },
  'WZ.SUILEND.SUPPLY_APY': {
    signature: 'WZ.SUILEND.SUPPLY_APY(coinType)',
    description: 'Get supply APY for a specific asset on Suilend',
    category: 'suilend',
    icon: '💰',
    example: '=WZ.SUILEND.SUPPLY_APY("0x2::sui::SUI")',
    returns: 'Supply APY percentage for the asset',
    parameters: [
      { name: 'coinType', type: 'string', description: 'Coin type identifier or symbol' }
    ]
  },
  'WZ.SUILEND.BORROW_APY': {
    signature: 'WZ.SUILEND.BORROW_APY(coinType)',
    description: 'Get borrow APY for a specific asset on Suilend',
    category: 'suilend',
    icon: '💸',
    example: '=WZ.SUILEND.BORROW_APY("0x2::sui::SUI")',
    returns: 'Borrow APY percentage for the asset',
    parameters: [
      { name: 'coinType', type: 'string', description: 'Coin type identifier or symbol' }
    ]
  },
  'WZ.SUILEND.HEALTH': {
    signature: 'WZ.SUILEND.HEALTH(userAddress)',
    description: 'Get user health factor (liquidation risk indicator)',
    category: 'suilend',
    icon: '❤️',
    example: '=WZ.SUILEND.HEALTH("0x123...")',
    returns: 'Health factor (>1.0 = safe, <1.0 = liquidation risk)',
    parameters: [
      { name: 'userAddress', type: 'string', description: 'User wallet address (0x format)' }
    ]
  },
  'WZ.SUILEND.OBLIGATIONS': {
    signature: 'WZ.SUILEND.OBLIGATIONS(userAddress)',
    description: 'Get user debt positions across all markets',
    category: 'suilend',
    icon: '📊',
    example: '=WZ.SUILEND.OBLIGATIONS("0x123...")',
    returns: 'Array of obligation objects with deposits and borrows',
    parameters: [
      { name: 'userAddress', type: 'string', description: 'User wallet address (0x format)' }
    ]
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
  const displayParams = params.filter(p => !p.name?.startsWith('...'));

  return {
    n: name, // Function name
    t: 0, // Function type (0 = function)
    d: metadata.description || `WalSheetz ${metadata.category} function`,
    a: displayParams.map(param => param.name).join(',') || '',
    m: [minArgs, hasVariadic ? 255 : maxArgs], // Correct arity calculation
    p: displayParams.map(param => ({
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
    functionList,  // Array format for functionlist
    functionMap    // Object format for luckysheet_function
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
