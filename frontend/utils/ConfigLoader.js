import { networkLock } from './NetworkLock.js';
import { transactionExperienceManager } from './TransactionExperience.js';

// Runtime configuration loader with cache-busting and ABI detection
class ConfigLoader {
  constructor() {
    this.config = null;
    this.lastFetch = null;
    this.refreshInterval = 30000; // 30 seconds
    this.isLoading = false;
    this.loadingPromise = null;
    this.abiCache = new Map();
    this.networkValidationCache = new Map();
    this.isFallback = false; // Track if we're using fallback config
    this.fallbackAttemptCount = 0; // Prevent retry spam on 404

    console.log('[ConfigLoader] Initialized with cache-busting enabled');
  }

  // Get configuration with automatic refresh
  async getConfig(forceRefresh = false) {
    const now = Date.now();
    
    // Return cached config if recent and not forcing refresh
    if (this.config && 
        this.lastFetch && 
        (now - this.lastFetch) < this.refreshInterval && 
        !forceRefresh) {
      return this.config;
    }

    // If already loading, return the existing promise
    if (this.isLoading && this.loadingPromise) {
      return this.loadingPromise;
    }

    // Start loading
    this.isLoading = true;
    this.loadingPromise = this._loadConfig();
    
    try {
      const config = await this.loadingPromise;
      return config;
    } finally {
      this.isLoading = false;
      this.loadingPromise = null;
    }
  }

  // Internal config loading with cache-busting and improved dev build support
  async _loadConfig() {
    try {
      console.log('[ConfigLoader] 🔄 Loading runtime config...');

      // Try to resolve config URL with BASE_URL support for dev builds
      let configUrl = '/app-config.json';

      // In dev/Vite, use BASE_URL to resolve correct path
      if (import.meta?.env?.BASE_URL && import.meta.env.BASE_URL !== '/') {
        const baseUrl = import.meta.env.BASE_URL;
        configUrl = `${baseUrl.replace(/\/$/, '')}/app-config.json`;
        console.log('[ConfigLoader] ℹ️ Using BASE_URL-resolved path:', configUrl);
      }

      // First attempt: without cache-busting (let server handle caching)
      console.log('[ConfigLoader] 🌐 Fetching from:', configUrl);

      const response = await fetch(configUrl, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (response.ok) {
        console.log('[ConfigLoader] ✅ Config fetched successfully:', { url: response.url, status: response.status });

        const config = await response.json();

        // Validate config structure
        this._validateConfig(config);

        // Detect current network from environment or default to testnet
        const currentNetwork = this._detectCurrentNetwork(config);
        config.currentNetwork = currentNetwork;
        config.isFallback = false; // Mark as loaded from source

        // Add runtime methods
        this._addRuntimeMethods(config);

        this.config = config;
        this.lastFetch = Date.now();
        this.isFallback = false;
        this.fallbackAttemptCount = 0; // Reset on success

        console.log('[ConfigLoader] ✅ Runtime config loaded successfully:', {
          version: config.version,
          network: currentNetwork,
          timestamp: new Date(config.timestamp).toISOString(),
          features: Object.keys(config.features)
        });

        return config;
      }

      // Handle 404 - treat as fallback trigger without retry spam
      if (response.status === 404) {
        console.debug('[ConfigLoader] ℹ️ Config file not found (404), falling back to embedded config');
        throw new Error(`Config not found: 404`);
      }

      // Handle other errors
      console.error('❌ [ConfigLoader] Config fetch failed:', {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        headers: {
          contentType: response.headers.get('content-type'),
          contentLength: response.headers.get('content-length')
        },
        timestamp: new Date().toISOString()
      });

      throw new Error(`Config fetch failed: ${response.status} ${response.statusText}`);

    } catch (error) {
      // DIAGNOSTIC: Enhanced logging for config loading errors
      const errorMsg = typeof error === 'string' ? error : error?.message || 'Unknown error';

      console.error('❌ [ConfigLoader] Config loading error:', {
        errorMessage: errorMsg,
        errorType: error?.constructor?.name,
        timestamp: new Date().toISOString()
      });

      // Return fallback config if main config fails
      const fallbackConfig = this._getFallbackConfig();

      // Mark as using fallback
      this.isFallback = true;
      this.config = fallbackConfig;
      this.lastFetch = Date.now();

      // Emit warning event for UI to display to user
      if (typeof window !== 'undefined') {
        console.warn('[ConfigLoader] ⚠️  Using fallback config - endpoints may be stale');
        transactionExperienceManager.emitTransactionEvent('config:fallback', {
          reason: errorMsg,
          isFallback: true,
          timestamp: new Date().toISOString()
        });
      }

      console.log('[ConfigLoader] ℹ️  Fallback config loaded successfully');
      return fallbackConfig;
    }
  }

  // Validate config structure
  _validateConfig(config) {
    const required = ['version', 'networks', 'features', 'ui', 'metadata'];
    const missing = required.filter(field => !(field in config));
    
    if (missing.length > 0) {
      throw new Error(`Invalid config: missing required fields: ${missing.join(', ')}`);
    }
    
    // Validate networks have required structure
    Object.entries(config.networks).forEach(([name, network]) => {
      const networkRequired = ['rpcUrl', 'packageId', 'walrus'];
      const networkMissing = networkRequired.filter(field => !(field in network));
      
      if (networkMissing.length > 0) {
        console.warn(`[ConfigLoader] ⚠️ Network '${name}' missing fields: ${networkMissing.join(', ')}`);
      }
    });
  }

  // Detect current network from various sources
  _detectCurrentNetwork(config) {
    // Detect if we're in a browser environment
    const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

    if (isBrowser) {
      // Check URL parameters first
      const urlParams = new URLSearchParams(window.location.search);
      const networkParam = urlParams.get('network');

      if (networkParam && config.networks[networkParam]) {
        console.log(`[ConfigLoader] 🌐 Network from URL: ${networkParam}`);
        return networkParam;
      }

      // Check localStorage
      // NOTE: No lock needed here - this runs during initialization before NetworkProvider starts
      const storedNetwork = localStorage.getItem('walsheetz_network');
      if (storedNetwork && config.networks[storedNetwork]) {
        console.log(`[ConfigLoader] 💾 Network from storage: ${storedNetwork}`);
        return storedNetwork;
      }

      // Check hostname for environment hints
      const hostname = window.location.hostname;
      if (hostname.includes('mainnet') && config.networks.mainnet) {
        return 'mainnet';
      }
      if (hostname.includes('devnet') && config.networks.devnet) {
        return 'devnet';
      }
    } else {
      // Node.js environment: check environment variables
      const nodeEnv = process.env.SUI_NETWORK || process.env.NETWORK;
      if (nodeEnv && config.networks[nodeEnv]) {
        console.log(`[ConfigLoader] 🖥️  Network from Node.js env: ${nodeEnv}`);
        return nodeEnv;
      }
    }

    // Default to testnet
    console.log('[ConfigLoader] 🏗️ Using default network: testnet');
    return 'testnet';
  }

  // Add runtime helper methods to config
  _addRuntimeMethods(config) {
    const self = this;
    
    // Get current network configuration
    config.getCurrentNetwork = function() {
      return this.networks[this.currentNetwork];
    };
    
    // Switch networks
    config.switchNetwork = async function(networkName) {
      if (!this.networks[networkName]) {
        throw new Error(`Unknown network: ${networkName}`);
      }

      this.currentNetwork = networkName;

      // Only persist to localStorage in browser environment
      // Use lock to prevent race conditions with NetworkProvider
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        await networkLock.withLock(async () => {
          try {
            localStorage.setItem('walsheetz_network', networkName);
          } catch (e) {
            console.warn('[ConfigLoader] Failed to write network preference with lock:', e);
          }
        });
      }

      // Clear caches when switching networks
      self.abiCache.clear();
      self.networkValidationCache.clear();

      console.log(`[ConfigLoader] 🔄 Switched to network: ${networkName}`);
      return this.getCurrentNetwork();
    };
    
    // Get feature flag
    config.getFeature = function(featurePath, defaultValue = false) {
      const parts = featurePath.split('.');
      let current = this.features;
      
      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = current[part];
        } else {
          return defaultValue;
        }
      }
      
      return current;
    };
    
    // Update feature flag
    config.setFeature = function(featurePath, value) {
      const parts = featurePath.split('.');
      let current = this.features;
      
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current) || typeof current[part] !== 'object') {
          current[part] = {};
        }
        current = current[part];
      }
      
      const lastPart = parts[parts.length - 1];
      current[lastPart] = value;
      
      console.log(`[ConfigLoader] ⚙️ Feature updated: ${featurePath} = ${value}`);
    };

    // Get proxy URL for development
    config.getProxyUrl = function(service) {
      if (typeof window === 'undefined') return null;
      
      const isDev = window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1' ||
                   window.location.hostname.includes('.local');
      
      if (!isDev) return null;
      
      const proxyMap = {
        'sui-rpc': '/sui-rpc',
        'walrus-publisher': '/walrus-publisher', 
        'walrus-aggregator': '/walrus-aggregator'
      };
      
      return proxyMap[service] || null;
    };

    // Get full service URL with proxy support
    config.getServiceUrl = function(service, path = '') {
      const network = this.getCurrentNetwork();
      const proxyUrl = this.getProxyUrl(service);
      
      let baseUrl;
      
      switch (service) {
        case 'sui-rpc':
          baseUrl = proxyUrl || network.rpcUrl;
          break;
        case 'walrus-publisher':
          baseUrl = proxyUrl || network.walrus.publisherUrl;
          break;
        case 'walrus-aggregator':
          baseUrl = proxyUrl || network.walrus.aggregatorUrl;
          break;
        default:
          throw new Error(`Unknown service: ${service}`);
      }
      
      return baseUrl + (path ? (path.startsWith('/') ? path : '/' + path) : '');
    };

    // Get Walrus service base URL (publisher or aggregator)
    // Returns just the base URL for appending /v1/blobs or /v1/api as needed
    config.getWalrusServiceBase = function(service) {
      const network = this.getCurrentNetwork();
      const proxyUrl = this.getProxyUrl(service);
      let result;

      if (service === 'publisher') {
        result = proxyUrl || network.walrus.publisherUrl;
      } else if (service === 'aggregator') {
        result = proxyUrl || network.walrus.aggregatorUrl;
      } else {
        throw new Error(`Unknown Walrus service: ${service}`);
      }

      // Diagnostic logging to help debug proxy vs absolute URL issues
      const isDev = typeof window !== 'undefined' && (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('.local')
      );

      if (isDev) {
        const isProxy = result.startsWith('/');
        console.log(`[ConfigLoader] getWalrusServiceBase: service=${service}, using=${isProxy ? 'PROXY' : 'ABSOLUTE'}, url=${result}`);
        if (!isProxy) {
          console.warn(`[ConfigLoader] ⚠️ Expected proxy URL in dev but got absolute URL. This may cause CORS issues. URL: ${result}`);
        }
      }

      return result;
    };

    // Resolve healthy service URL with proxy→absolute fallback
    config.resolveHealthyServiceUrl = async function(service, path = '/v1/api', opts = {}) {
      const base = this.getServiceUrl(service, ''); // proxy or absolute base, no path
      // Remove trailing slash from base to prevent double slashes
      const cleanBase = base.replace(/\/$/, '');

      // For health checks, always use the default /v1/api path if empty path provided
      const healthCheckPath = path || '/v1/api';
      const url = cleanBase + (healthCheckPath.startsWith('/') ? healthCheckPath : '/' + healthCheckPath);

      const tryFetch = async (u) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), opts.timeout || 8000);
        try {
          const res = await fetch(u, { method: 'GET', signal: controller.signal });
          return { ok: res.ok, status: res.status };
        } catch (e) {
          // Suppress 404 errors for health checks to reduce console noise
          if (opts.suppressErrors !== false && (e.name === 'AbortError' || e.message.includes('404'))) {
            // Return failure without logging
            return { ok: false, status: 404 };
          }
          return { ok: false, status: 0 };
        } finally {
          clearTimeout(timeout);
        }
      };

      // Probe proxy candidate first in dev
      const isDev = typeof window !== 'undefined' && (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('.local')
      );

      if (isDev) {
        // For proxy health checks, suppress 404 errors since they're expected during startup
        const probe = await tryFetch(url);
        if (probe.ok) return cleanBase;
        // Continue to absolute fallback for 404s or connection errors
      }

      // Absolute fallback
      let absoluteBase;
      const net = this.getCurrentNetwork();
      if (service === 'sui-rpc') absoluteBase = net.rpcUrl;
      if (service === 'walrus-publisher') absoluteBase = net.walrus.publisherUrl;
      if (service === 'walrus-aggregator') absoluteBase = net.walrus.aggregatorUrl;

      // If proxy already equals absolute, just return it
      if (!absoluteBase || absoluteBase === base) return cleanBase;

      // Clean absolute base as well
      const cleanAbsoluteBase = absoluteBase.replace(/\/$/, '');
      const absoluteUrl = cleanAbsoluteBase + (healthCheckPath.startsWith('/') ? healthCheckPath : '/' + healthCheckPath);
      const absProbe = await tryFetch(absoluteUrl);
      return absProbe.ok ? cleanAbsoluteBase : cleanBase;
    };
  }

  // Fallback config for when main config fails
  _getFallbackConfig() {
    console.log('[ConfigLoader] 🚨 Using fallback config');

    const fallbackConfig = {
      version: '1.0.0-fallback',
      timestamp: new Date().toISOString(),
      currentNetwork: 'testnet',
      isFallback: true, // Mark as fallback config
      networks: {
        testnet: {
          rpcUrl: 'https://fullnode.testnet.sui.io:443',
          packageId: '0xe7f62142b48f1b1746bd7dd7b695f0e2e5952879662ab7d755fdd9081b189fa7',
          registryObjectId: '0x9a6b94f79762fa608c5f0938d092744a8e5b69852f860eb17afa4ab11e24fe25',
          walrus: {
            aggregatorUrl: 'https://aggregator.walrus-testnet.walrus.space',
            publisherUrl: 'https://publisher.walrus-testnet.walrus.space',
            maxRetries: 3,
            retryDelay: 1000,
            // Epochs feature config
            features: {
              epochsDefault: 12
            }
          }
        },
        mainnet: {
          rpcUrl: 'https://fullnode.mainnet.sui.io:443',
          packageId: '0x991454976a4ef8535ed3572bb1c500dcd565855d49a51f1fadc7f70a316c9631',
          registryObjectId: '0x66f68bfb639dbc7f24519bcdbbfdb376057d87c6d508ea7a8d67746a11721ca5',
          walrus: {
            aggregatorUrl: 'https://aggregator.walrus-mainnet.walrus.space',
            publisherUrl: 'https://publisher.walrus-mainnet.walrus.space',
            maxRetries: 3,
            retryDelay: 1000
          }
        }
      },
      features: {
        // ABI compatibility flags - mainnet requires both content_hash and clock
        contentHashInSave: true,
        clockInSave: true,
        autoSave: { enabled: true, intervalMs: 5000 },
        collaboration: { enabled: true },
        gasManagement: { bufferPercent: 20 },
        storage: { preferWalrus: true, fallbackToLocal: true },
        // Wallet and transaction features
        walletFeatures: {
          supportsTransactionBlock: true, // Support for TransactionBlock from @mysten/sui/transactions
          supportsSignAndExecute: true
        }
      },
      ui: {
        theme: 'light',
        debugMode: false
      },
      metadata: {
        appName: 'WalSheetz',
        appVersion: '1.0.0-fallback'
      }
    };

    // Add all runtime methods to fallback config
    this._addRuntimeMethods(fallbackConfig);

    return fallbackConfig;
  }

  // Validate network connectivity and package existence
  async validateNetwork(networkName) {
    const cacheKey = `network_${networkName}`;
    const cached = this.networkValidationCache.get(cacheKey);
    
    // Return cached result if recent (5 minutes)
    if (cached && (Date.now() - cached.timestamp) < 300000) {
      return cached.result;
    }

    try {
      const config = await this.getConfig();
      const network = config.networks[networkName];
      
      if (!network) {
        throw new Error(`Network ${networkName} not found in config`);
      }

      console.log(`[ConfigLoader] 🔍 Validating network: ${networkName}`);

      // Check RPC connectivity
      const rpcResponse = await fetch(network.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sui_getLatestSuiSystemState',
          params: []
        })
      });

      if (!rpcResponse.ok) {
        throw new Error(`RPC endpoint ${network.rpcUrl} returned ${rpcResponse.status}`);
      }

      // Check package existence
      const packageResponse = await fetch(network.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'sui_getObject',
          params: [network.packageId, { showContent: true }]
        })
      });

      if (!packageResponse.ok) {
        throw new Error(`Package check failed for ${network.packageId}`);
      }

      const packageData = await packageResponse.json();
      if (packageData.error) {
        throw new Error(`Package ${network.packageId} not found: ${packageData.error.message}`);
      }

      const result = {
        valid: true,
        rpcConnected: true,
        packageExists: true,
        packageId: network.packageId,
        registryObjectId: network.registryObjectId
      };

      // Cache successful validation
      this.networkValidationCache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });

      console.log(`[ConfigLoader] ✅ Network ${networkName} validated successfully`);
      return result;

    } catch (error) {
      const result = {
        valid: false,
        error: error.message
      };

      console.error(`[ConfigLoader] ❌ Network ${networkName} validation failed:`, error);
      
      // Cache failed validation for shorter period (30 seconds)
      this.networkValidationCache.set(cacheKey, {
        result,
        timestamp: Date.now() - 270000 // Expire in 30 seconds instead of 5 minutes
      });

      return result;
    }
  }

  // Detect ABI from on-chain package
  async detectABI(packageId, networkName = null) {
    const config = await this.getConfig();
    const network = networkName ? config.networks[networkName] : config.getCurrentNetwork();
    const cacheKey = `abi_${packageId}_${network.rpcUrl}`;
    
    // Check cache first (30 minutes)
    const cached = this.abiCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < 1800000) {
      return cached.abi;
    }

    try {
      console.log(`[ConfigLoader] 🔍 Detecting ABI for package: ${packageId}`);

      const response = await fetch(network.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sui_getNormalizedMoveModulesByPackage',
          params: [packageId]
        })
      });

      if (!response.ok) {
        throw new Error(`ABI fetch failed: ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(`ABI error: ${data.error.message}`);
      }

      // Extract function signatures
      const abi = this._extractABIFromModules(data.result);

      // Cache the ABI
      this.abiCache.set(cacheKey, {
        abi,
        timestamp: Date.now()
      });

      console.log(`[ConfigLoader] ✅ ABI detected for ${packageId}:`, {
        modules: Object.keys(abi.modules),
        functions: Object.keys(abi.functions).length
      });

      return abi;

    } catch (error) {
      console.error(`[ConfigLoader] ❌ ABI detection failed for ${packageId}:`, error);
      
      // Return minimal ABI structure on failure
      return {
        modules: {},
        functions: {},
        structs: {},
        error: error.message
      };
    }
  }

  // Extract ABI information from Move modules
  _extractABIFromModules(modules) {
    const abi = {
      modules: {},
      functions: {},
      structs: {}
    };

    Object.entries(modules).forEach(([moduleName, moduleData]) => {
      abi.modules[moduleName] = {
        name: moduleName,
        functions: Object.keys(moduleData.exposedFunctions || {}),
        structs: Object.keys(moduleData.structs || {})
      };

      // Extract function signatures
      Object.entries(moduleData.exposedFunctions || {}).forEach(([funcName, funcData]) => {
        const fullName = `${moduleName}::${funcName}`;
        abi.functions[fullName] = {
          module: moduleName,
          name: funcName,
          visibility: funcData.visibility,
          isEntry: funcData.isEntry || false,
          parameters: funcData.parameters || [],
          returnType: funcData.return_ || [],
          typeParameters: funcData.typeParameters || []
        };
      });

      // Extract struct definitions
      Object.entries(moduleData.structs || {}).forEach(([structName, structData]) => {
        const fullName = `${moduleName}::${structName}`;
        abi.structs[fullName] = {
          module: moduleName,
          name: structName,
          abilities: structData.abilities || [],
          fields: structData.fields || [],
          typeParameters: structData.typeParameters || []
        };
      });
    });

    return abi;
  }

  // Check if function signature matches expected pattern
  checkFunctionCompatibility(abi, moduleName, functionName, expectedParams) {
    const fullName = `${moduleName}::${functionName}`;
    const func = abi.functions[fullName];
    
    if (!func) {
      return {
        compatible: false,
        reason: `Function ${fullName} not found`
      };
    }

    if (!func.isEntry) {
      return {
        compatible: false,
        reason: `Function ${fullName} is not an entry function`
      };
    }

    // Basic parameter count check
    if (expectedParams && func.parameters.length !== expectedParams.length) {
      return {
        compatible: false,
        reason: `Parameter count mismatch: expected ${expectedParams.length}, got ${func.parameters.length}`,
        expected: expectedParams,
        actual: func.parameters
      };
    }

    return {
      compatible: true,
      function: func
    };
  }

  // Refresh config manually
  async refresh() {
    return this.getConfig(true);
  }

  // Clear all caches
  clearCaches() {
    this.config = null;
    this.lastFetch = null;
    this.abiCache.clear();
    this.networkValidationCache.clear();
    console.log('[ConfigLoader] 🧹 All caches cleared');
  }

  // Get cache status for debugging
  getCacheStatus() {
    return {
      config: {
        loaded: !!this.config,
        age: this.lastFetch ? Date.now() - this.lastFetch : null,
        isLoading: this.isLoading
      },
      abi: {
        entries: this.abiCache.size,
        keys: Array.from(this.abiCache.keys())
      },
      networkValidation: {
        entries: this.networkValidationCache.size,
        keys: Array.from(this.networkValidationCache.keys())
      }
    };
  }

  // Persist forced feature flag to localStorage to prevent re-toggling
  persistForcedFeature(featurePath, value) {
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        const key = `walsheetz_forced_feature_${featurePath}`;
        localStorage.setItem(key, JSON.stringify({ value, timestamp: Date.now() }));
        console.log(`[ConfigLoader] ✅ Persisted forced feature: ${featurePath} = ${value}`);
      }
    } catch (e) {
      console.warn(`[ConfigLoader] Failed to persist forced feature ${featurePath}:`, e);
    }
  }

  // Get persisted forced feature from localStorage
  getForcedFeature(featurePath) {
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        const key = `walsheetz_forced_feature_${featurePath}`;
        const stored = localStorage.getItem(key);
        if (stored) {
          const { value } = JSON.parse(stored);
          console.log(`[ConfigLoader] ℹ️ Retrieved forced feature from storage: ${featurePath} = ${value}`);
          return value;
        }
      }
    } catch (e) {
      console.warn(`[ConfigLoader] Failed to retrieve forced feature ${featurePath}:`, e);
    }
    return null;
  }

  // Clear all persisted forced features
  clearForcedFeatures() {
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('walsheetz_forced_feature_')) {
            localStorage.removeItem(key);
          }
        });
        console.log('[ConfigLoader] 🧹 Cleared all persisted forced features');
      }
    } catch (e) {
      console.warn('[ConfigLoader] Failed to clear forced features:', e);
    }
  }
}

// Create singleton instance
export const configLoader = new ConfigLoader();
export default configLoader;