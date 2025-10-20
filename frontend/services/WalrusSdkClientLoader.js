/**
 * Dynamic loader for WalrusSdkClient
 *
 * This module guards against importing @mysten/walrus in environments where it's not needed,
 * preventing Node-only dependencies from leaking into the browser bundle.
 *
 * The SDK is only loaded if:
 * 1. We're in a browser environment (window exists)
 * 2. Walrus SDK feature flag is enabled in config
 */

let cachedClient = null;
let loadingPromise = null;

/**
 * Dynamically load and initialize WalrusSdkClient
 * @param {Object} options - Options for initialization
 * @param {Object} options.suiClient - Pre-configured SuiClient instance
 * @param {string} options.network - Walrus network (testnet, mainnet, etc)
 * @returns {Promise<WalrusSdkClient | null>} - WalrusClient instance or null if disabled
 */
export async function loadWalrusSdkClient(options = {}) {
  // Return cached instance if already loaded
  if (cachedClient !== null) {
    return cachedClient;
  }

  // Return in-progress promise if already loading
  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    try {
      // Only load in browser environment
      if (typeof window === 'undefined') {
        console.debug('[WalrusSdkClientLoader] Not in browser environment, skipping WalrusClient load');
        cachedClient = null;
        return null;
      }

      // Check if SDK is enabled in config
      let config;
      try {
        // Dynamically import config to avoid circular dependencies
        const { configLoader } = await import('../utils/ConfigLoader.js');
        config = await configLoader.getConfig();
      } catch (error) {
        console.warn('[WalrusSdkClientLoader] Failed to load config, disabling Walrus SDK:',
          typeof error === 'string' ? error : error?.message || 'Unknown error'
        );
        cachedClient = null;
        return null;
      }

      // Check if Walrus SDK is enabled
      // SDK is disabled by default to avoid unnecessary dependency loading
      // Set config.walrus.features.useSdk = true to enable
      const sdkEnabled = config.walrus?.features?.useSdk === true;
      if (!sdkEnabled) {
        console.debug('[WalrusSdkClientLoader] Walrus SDK disabled (default). Set walrus.features.useSdk=true to enable.');
        cachedClient = null;
        return null;
      }

      // Only now import the SDK module (this imports @mysten/walrus)
      let WalrusSdkClient;
      try {
        const module = await import('./WalrusSdkClient.js');
        WalrusSdkClient = module.WalrusSdkClient;
      } catch (error) {
        console.error('[WalrusSdkClientLoader] Failed to dynamically import WalrusSdkClient:',
          typeof error === 'string' ? error : error?.message || 'Unknown error'
        );
        throw new Error(`Failed to load Walrus SDK: ${typeof error === 'string' ? error : error?.message}`);
      }

      // Initialize and cache the client
      cachedClient = new WalrusSdkClient(options);
      console.info('[WalrusSdkClientLoader] ✅ WalrusSdkClient initialized and cached');

      return cachedClient;
    } catch (error) {
      console.error('[WalrusSdkClientLoader] Error loading Walrus SDK:', error);
      cachedClient = null;
      throw error;
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

/**
 * Get cached WalrusSdkClient if already loaded
 * @returns {WalrusSdkClient | null}
 */
export function getCachedWalrusSdkClient() {
  return cachedClient;
}

/**
 * Clear the cached client (useful for testing)
 */
export function clearCachedClient() {
  cachedClient = null;
  loadingPromise = null;
}

/**
 * Check if Walrus SDK is available and ready
 * @returns {boolean}
 */
export function isWalrusSdkReady() {
  return cachedClient !== null;
}

export default {
  loadWalrusSdkClient,
  getCachedWalrusSdkClient,
  clearCachedClient,
  isWalrusSdkReady
};
