// Custom Sui blockchain functions for spreadsheet formulas
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { getCurrentConfig } from '@blockchain/config.js';
import { configLoader } from '@utils/config/ConfigLoader.js';

// In-memory cache with TTL
const cache = new Map();
const TTL = 15000; // 15 seconds TTL for balance caching

// Rate limiting to prevent API abuse
const rateLimiter = {
  requests: new Map(),
  maxRequestsPerMinute: 30,

  isAllowed(key) {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const requestKey = `${key}:${minute}`;

    const currentCount = this.requests.get(requestKey) || 0;
    if (currentCount >= this.maxRequestsPerMinute) {
      return false;
    }

    this.requests.set(requestKey, currentCount + 1);

    // Cleanup old entries
    const cutoff = minute - 2; // Keep last 2 minutes
    for (const [key] of this.requests) {
      if (key.endsWith(`:${cutoff}`) || key.endsWith(`:${cutoff - 1}`)) {
        this.requests.delete(key);
      }
    }

    return true;
  }
};

/**
 * Get SUI balance for an address with caching and rate limiting
 * @param {string} address - Sui address to query
 * @param {string} rpcUrl - Optional RPC URL, defaults to config
 * @returns {Promise<string>} - Balance in SUI (not MIST)
 */
export async function getSuiBalance(address, rpcUrl) {
  // Validate address format
  if (!address || typeof address !== 'string') {
    throw new Error('Invalid address: must be a non-empty string');
  }

  // Basic address validation (Sui addresses start with 0x and are 64 chars)
  if (!address.startsWith('0x') || address.length !== 66) {
    throw new Error('Invalid Sui address format');
  }

  const cacheKey = `balance:${address}`;
  const now = Date.now();

  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached && (now - cached.timestamp) < TTL) {
    console.log(`[SuiFunctions] Cache hit for ${address.substring(0, 8)}...`);
    return cached.value;
  }

  // Rate limiting check
  if (!rateLimiter.isAllowed(address)) {
    // Return cached value if available, even if expired
    if (cached) {
      console.log(`[SuiFunctions] Rate limited, returning cached value for ${address.substring(0, 8)}...`);
      return cached.value;
    }
    throw new Error('Rate limit exceeded. Please try again later.');
  }

  // Get RPC URL from config if not provided
  let finalRpcUrl = rpcUrl;
  if (!finalRpcUrl) {
    try {
      // Use proxy-aware RPC URL (dev: /sui-rpc, prod: /api/sui-rpc-proxy)
      const config = await configLoader.getConfig();
      finalRpcUrl = config.getServiceUrl('sui-rpc');
    } catch (error) {
      // Fallback to testnet if config fails
      finalRpcUrl = getFullnodeUrl('testnet');
    }
  }

  console.log(`[SuiFunctions] Fetching balance for ${address.substring(0, 8)}... from ${finalRpcUrl}`);

  try {
    const client = new SuiClient({ url: finalRpcUrl });

    // Get SUI balance (coin type 0x2::sui::SUI)
    const response = await client.getBalance({
      owner: address,
      coinType: '0x2::sui::SUI'
    });

    if (!response || typeof response.totalBalance !== 'string') {
      throw new Error('Invalid response from Sui RPC');
    }

    // Convert from MIST to SUI (1 SUI = 1,000,000,000 MIST)
    const balanceInMist = BigInt(response.totalBalance);
    const balanceInSui = balanceInMist / BigInt(1_000_000_000);
    const balanceString = balanceInSui.toString();

    // Cache the result
    cache.set(cacheKey, {
      value: balanceString,
      timestamp: now
    });

    console.log(`[SuiFunctions] Balance fetched for ${address.substring(0, 8)}...: ${balanceString} SUI`);
    return balanceString;

  } catch (error) {
    console.error(`[SuiFunctions] Failed to fetch balance for ${address.substring(0, 8)}...:`, error.message);

    // Return cached value if available, even if expired
    if (cached) {
      console.log(`[SuiFunctions] Error occurred, returning cached value for ${address.substring(0, 8)}...`);
      return cached.value;
    }

    throw new Error(`Failed to fetch SUI balance: ${error.message}`);
  }
}

/**
 * Get gas price from the network
 * @param {string} rpcUrl - Optional RPC URL
 * @returns {Promise<string>} - Gas price in MIST
 */
export async function getSuiGasPrice(rpcUrl) {
  const cacheKey = 'gas_price';
  const now = Date.now();

  // Check cache (shorter TTL for gas price as it changes more frequently)
  const cached = cache.get(cacheKey);
  if (cached && (now - cached.timestamp) < 5000) { // 5 second TTL
    return cached.value;
  }

  // Get RPC URL from config if not provided
  let finalRpcUrl = rpcUrl;
  if (!finalRpcUrl) {
    try {
      // Use proxy-aware RPC URL (dev: /sui-rpc, prod: /api/sui-rpc-proxy)
      const config = await configLoader.getConfig();
      finalRpcUrl = config.getServiceUrl('sui-rpc');
    } catch (error) {
      finalRpcUrl = getFullnodeUrl('testnet');
    }
  }

  try {
    const client = new SuiClient({ url: finalRpcUrl });
    const gasPrice = await client.getReferenceGasPrice();

    const gasPriceString = gasPrice.toString();

    // Cache the result
    cache.set(cacheKey, {
      value: gasPriceString,
      timestamp: now
    });

    return gasPriceString;

  } catch (error) {
    console.error('[SuiFunctions] Failed to fetch gas price:', error.message);

    // Return cached value if available
    if (cached) {
      return cached.value;
    }

    throw new Error(`Failed to fetch gas price: ${error.message}`);
  }
}

/**
 * Get network epoch information
 * @param {string} rpcUrl - Optional RPC URL
 * @returns {Promise<string>} - Current epoch number
 */
export async function getSuiEpoch(rpcUrl) {
  const cacheKey = 'current_epoch';
  const now = Date.now();

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && (now - cached.timestamp) < 10000) { // 10 second TTL
    return cached.value;
  }

  // Get RPC URL from config if not provided
  let finalRpcUrl = rpcUrl;
  if (!finalRpcUrl) {
    try {
      // Use proxy-aware RPC URL (dev: /sui-rpc, prod: /api/sui-rpc-proxy)
      const config = await configLoader.getConfig();
      finalRpcUrl = config.getServiceUrl('sui-rpc');
    } catch (error) {
      finalRpcUrl = getFullnodeUrl('testnet');
    }
  }

  try {
    const client = new SuiClient({ url: finalRpcUrl });
    const epoch = await client.getLatestSuiSystemState();

    const epochString = epoch.epoch;

    // Cache the result
    cache.set(cacheKey, {
      value: epochString,
      timestamp: now
    });

    return epochString;

  } catch (error) {
    console.error('[SuiFunctions] Failed to fetch epoch:', error.message);

    // Return cached value if available
    if (cached) {
      return cached.value;
    }

    throw new Error(`Failed to fetch epoch: ${error.message}`);
  }
}

/**
 * Clear cache for testing or manual refresh
 */
export function clearCache() {
  cache.clear();
  console.log('[SuiFunctions] Cache cleared');
}

/**
 * Get cache statistics
 * @returns {Object} - Cache statistics
 */
export function getCacheStats() {
  const stats = {
    size: cache.size,
    entries: [],
    rateLimiter: {
      activeMinutes: rateLimiter.requests.size,
      maxRequestsPerMinute: rateLimiter.maxRequestsPerMinute
    }
  };

  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    stats.entries.push({
      key,
      age: now - value.timestamp,
      expired: (now - value.timestamp) > TTL
    });
  }

  return stats;
}