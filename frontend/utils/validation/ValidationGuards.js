// Runtime validation guards for network connectivity and package existence
import { configLoader } from '@utils/config/ConfigLoader.js';

class ValidationGuards {
  constructor() {
    this.validationResults = new Map();
    this.validationPromises = new Map();
    this.listeners = new Set();
    
    console.log('[ValidationGuards] Initialized with runtime validation system');
  }

  // Add listener for validation events
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // Emit validation events to listeners
  _emitEvent(event, data) {
    this.listeners.forEach(callback => {
      try {
        callback({ event, data, timestamp: Date.now() });
      } catch (error) {
        console.error('[ValidationGuards] Event listener error:', error);
      }
    });
  }

  // Comprehensive preflight validation
  async runPreflightChecks(networkName = null) {
    try {
      console.log('[ValidationGuards] 🚀 Running preflight checks...');
      
      const config = await configLoader.getConfig();
      const targetNetwork = networkName || config.currentNetwork;
      
      this._emitEvent('preflight_started', { network: targetNetwork });

      const results = {
        network: targetNetwork,
        timestamp: Date.now(),
        checks: {}
      };

      // Check 1: Configuration validity
      console.log('[ValidationGuards] ✓ Checking configuration validity...');
      results.checks.config = await this._validateConfiguration(config, targetNetwork);
      
      // Check 2: Network connectivity
      console.log('[ValidationGuards] ✓ Checking network connectivity...');
      results.checks.connectivity = await this._validateNetworkConnectivity(targetNetwork);
      
      // Check 3: Package existence
      console.log('[ValidationGuards] ✓ Checking package existence...');
      results.checks.package = await this._validatePackageExistence(targetNetwork);
      
      // Check 4: ABI compatibility
      console.log('[ValidationGuards] ✓ Checking ABI compatibility...');
      results.checks.abi = await this._validateABICompatibility(targetNetwork);
      
      // Check 5: Walrus connectivity
      console.log('[ValidationGuards] ✓ Checking Walrus connectivity...');
      results.checks.walrus = await this._validateWalrusConnectivity(targetNetwork);

      // Calculate overall status
      const allPassed = Object.values(results.checks).every(check => check.status === 'passed');
      results.overall = {
        status: allPassed ? 'passed' : 'failed',
        passed: Object.values(results.checks).filter(c => c.status === 'passed').length,
        total: Object.keys(results.checks).length
      };

      this.validationResults.set(targetNetwork, results);
      
      this._emitEvent('preflight_completed', { 
        network: targetNetwork, 
        results,
        success: allPassed 
      });

      console.log(`[ValidationGuards] ${allPassed ? '✅' : '❌'} Preflight checks completed for ${targetNetwork}:`, {
        passed: results.overall.passed,
        total: results.overall.total,
        status: results.overall.status
      });

      return results;

    } catch (error) {
      console.error('[ValidationGuards] ❌ Preflight checks failed:', error);
      
      const errorResult = {
        network: networkName || 'unknown',
        timestamp: Date.now(),
        overall: { status: 'error', error: typeof error === 'string' ? error : error.message || 'Unknown error' },
        checks: {}
      };

      this._emitEvent('preflight_error', { error: typeof error === 'string' ? error : error.message || 'Unknown error' });
      return errorResult;
    }
  }

  // Validate configuration structure and completeness
  async _validateConfiguration(config, networkName) {
    try {
      const network = config.networks[networkName];
      
      if (!network) {
        return {
          status: 'failed',
          error: `Network '${networkName}' not found in configuration`
        };
      }

      const requiredFields = ['rpcUrl', 'packageId', 'walrus'];
      const missing = requiredFields.filter(field => !network[field]);
      
      if (missing.length > 0) {
        return {
          status: 'failed',
          error: `Missing required fields: ${missing.join(', ')}`
        };
      }

      const requiredWalrusFields = ['aggregatorUrl', 'publisherUrl'];
      const missingWalrus = requiredWalrusFields.filter(field => !network.walrus[field]);
      
      if (missingWalrus.length > 0) {
        return {
          status: 'failed',
          error: `Missing Walrus fields: ${missingWalrus.join(', ')}`
        };
      }

      return {
        status: 'passed',
        details: {
          networkName,
          hasPackageId: !!network.packageId,
          hasRegistryObjectId: !!network.registryObjectId,
          hasWalrusConfig: !!network.walrus,
          configVersion: config.version
        }
      };

    } catch (error) {
      return {
        status: 'error',
        error: typeof error === 'string' ? error : error.message || 'Unknown error'
      };
    }
  }

  // Validate network connectivity (RPC)
  async _validateNetworkConnectivity(networkName) {
    try {
      const validation = await configLoader.validateNetwork(networkName);
      
      if (!validation.valid) {
        return {
          status: 'failed',
          error: validation.error
        };
      }

      return {
        status: 'passed',
        details: {
          rpcConnected: validation.rpcConnected,
          responseTime: validation.responseTime || 'unknown'
        }
      };

    } catch (error) {
      return {
        status: 'error',
        error: typeof error === 'string' ? error : error.message || 'Unknown error'
      };
    }
  }

  // Validate package existence and accessibility
  async _validatePackageExistence(networkName) {
    try {
      const config = await configLoader.getConfig();
      const network = config.networks[networkName];
      
      const response = await fetch(network.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sui_getObject',
          params: [
            network.packageId,
            {
              showType: true,
              showContent: true,
              showOwner: true
            }
          ]
        })
      });

      if (!response.ok) {
        return {
          status: 'failed',
          error: `Package check HTTP ${response.status}: ${response.statusText}`
        };
      }

      const data = await response.json();
      
      if (data.error) {
        return {
          status: 'failed',
          error: `Package not found: ${typeof data.error === 'string' ? data.error : data.error.message || 'Unknown error'}`
        };
      }

      const packageData = data.result?.data;
      if (!packageData) {
        return {
          status: 'failed',
          error: 'Package data not available'
        };
      }

      return {
        status: 'passed',
        details: {
          packageId: network.packageId,
          version: packageData.version || 'unknown',
          type: packageData.type || 'package',
          owner: packageData.owner || 'unknown'
        }
      };

    } catch (error) {
      return {
        status: 'error',
        error: typeof error === 'string' ? error : error.message || 'Unknown error'
      };
    }
  }

  // Validate ABI compatibility with expected functions
  async _validateABICompatibility(networkName) {
    try {
      const config = await configLoader.getConfig();
      const network = config.networks[networkName];
      
      const abi = await configLoader.detectABI(network.packageId, networkName);
      
      if (abi.error) {
        return {
          status: 'failed',
          error: `ABI detection failed: ${abi.error}`
        };
      }

      // Check for required functions
      const requiredFunctions = [
        { module: 'spreadsheet', name: 'create_spreadsheet', params: [] },
        { module: 'spreadsheet', name: 'save_version', params: [] }
      ];

      const compatibilityResults = requiredFunctions.map(func => {
        const result = configLoader.checkFunctionCompatibility(
          abi, 
          func.module, 
          func.name, 
          func.params
        );
        
        return {
          function: `${func.module}::${func.name}`,
          compatible: result.compatible,
          reason: result.reason || 'Compatible'
        };
      });

      const allCompatible = compatibilityResults.every(r => r.compatible);

      if (!allCompatible) {
        const incompatible = compatibilityResults.filter(r => !r.compatible);
        return {
          status: 'failed',
          error: `Function compatibility issues: ${incompatible.map(r => r.reason).join('; ')}`,
          details: {
            results: compatibilityResults,
            modulesFound: Object.keys(abi.modules),
            functionsFound: Object.keys(abi.functions).length
          }
        };
      }

      return {
        status: 'passed',
        details: {
          modulesFound: Object.keys(abi.modules),
          functionsFound: Object.keys(abi.functions).length,
          structsFound: Object.keys(abi.structs).length,
          compatibility: compatibilityResults
        }
      };

    } catch (error) {
      return {
        status: 'error',
        error: typeof error === 'string' ? error : error.message || 'Unknown error'
      };
    }
  }

  // Validate Walrus connectivity
  async _validateWalrusConnectivity(networkName) {
    try {
      const config = await configLoader.getConfig();
      const network = config.networks[networkName];
      const walrus = network.walrus;

      const results = {
        aggregator: null,
        publisher: null
      };

      // Test aggregator
      try {
        // Prefer Vite proxy in dev; fall back to absolute endpoint
        const aggBase = config.getProxyUrl('walrus-aggregator') || walrus.aggregatorUrl
        const aggApiUrl = `${aggBase}/v1/api`
        const aggInfoUrl = `${aggBase}/v1/info`
        
        let aggConnected = false
        let aggStatus = 0
        
        // Try /v1/api first (should be 200)
        try {
          const resp = await fetch(aggApiUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000)
          })
          aggStatus = resp.status
          aggConnected = resp.ok
        } catch (e) {
          // swallow and try fallback
        }
        
        // Fallback to /v1/info (treat 200 or 404 as reachable for dev robustness)
        if (!aggConnected) {
          try {
            const resp2 = await fetch(aggInfoUrl, {
              method: 'GET',
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(10000)
            })
            aggStatus = resp2.status
            aggConnected = resp2.ok || resp2.status === 404
          } catch (e2) {
            aggConnected = false
          }
        }
        
        results.aggregator = {
          connected: aggConnected,
          status: aggStatus,
          url: aggBase
        };
      } catch (error) {
        results.aggregator = {
          connected: false,
          error: typeof error === 'string' ? error : error.message || 'Unknown error',
          url: walrus.aggregatorUrl
        };
      }

      // Test publisher  
      try {
        // Prefer Vite proxy in dev; fall back to absolute endpoint
        const pubBase = config.getProxyUrl('walrus-publisher') || walrus.publisherUrl
        const pubApiUrl = `${pubBase}/v1/api`
        const pubInfoUrl = `${pubBase}/v1/info`
        
        let pubConnected = false
        let pubStatus = 0
        
        // Try /v1/api first (expect 200)
        try {
          const resp = await fetch(pubApiUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000)
          })
          pubStatus = resp.status
          pubConnected = resp.ok
        } catch (e) {
          // swallow and try fallback
        }
        
        // Fallback to /v1/info (treat 200 or 404 as reachable in dev)
        if (!pubConnected) {
          try {
            const resp2 = await fetch(pubInfoUrl, {
              method: 'GET',
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(10000)
            })
            pubStatus = resp2.status
            pubConnected = resp2.ok || resp2.status === 404
          } catch (e2) {
            pubConnected = false
          }
        }
        
        results.publisher = {
          connected: pubConnected,
          status: pubStatus,
          url: pubBase
        };
      } catch (error) {
        results.publisher = {
          connected: false,
          error: typeof error === 'string' ? error : error.message || 'Unknown error',
          url: walrus.publisherUrl
        };
      }

      const bothConnected = results.aggregator.connected && results.publisher.connected;
      const anyConnected = results.aggregator.connected || results.publisher.connected;

      // Capture specific errors for better diagnostics
      const aggregatorError = results.aggregator.error || (results.aggregator.connected ? 'OK' : `HTTP ${results.aggregator.status}`);
      const publisherError = results.publisher.error || (results.publisher.connected ? 'OK' : `HTTP ${results.publisher.status}`);

      if (!anyConnected) {
        return {
          status: 'failed',
          error: 'Neither Walrus aggregator nor publisher are reachable',
          errorDetails: {
            aggregator: aggregatorError,
            publisher: publisherError
          },
          details: results
        };
      }

      if (!bothConnected) {
        const failed = !results.aggregator.connected ? 'aggregator' : 'publisher';
        return {
          status: 'warning',
          error: `Walrus ${failed} is not reachable but ${failed === 'aggregator' ? 'publisher' : 'aggregator'} works`,
          errorDetails: {
            aggregator: aggregatorError,
            publisher: publisherError
          },
          details: results
        };
      }

      return {
        status: 'passed',
        details: results,
        errorDetails: { aggregator: 'OK', publisher: 'OK' }
      };

    } catch (error) {
      return {
        status: 'error',
        error: typeof error === 'string' ? error : error.message || 'Unknown error'
      };
    }
  }

  // Quick validation for specific components
  async validateForSave(networkName = null) {
    const config = await configLoader.getConfig();
    const targetNetwork = networkName || config.currentNetwork;
    
    console.log(`[ValidationGuards] 💾 Validating for save operation on ${targetNetwork}...`);

    // Get recent validation results if available
    const recent = this.validationResults.get(targetNetwork);
    const isRecent = recent && (Date.now() - recent.timestamp) < 60000; // 1 minute

    if (isRecent && recent.overall.status === 'passed') {
      console.log('[ValidationGuards] ✅ Using recent validation results for save');
      return { valid: true, results: recent };
    }

    // Run focused validation for save
    const saveChecks = await Promise.all([
      this._validateNetworkConnectivity(targetNetwork),
      this._validateWalrusConnectivity(targetNetwork)
    ]);

    const allPassed = saveChecks.every(check => check.status === 'passed' || check.status === 'warning');
    
    if (!allPassed) {
      const failures = saveChecks.filter(check => check.status === 'failed');
      console.log('[ValidationGuards] ❌ Save validation failed:', failures);
      
      return {
        valid: false,
        error: failures.map(f => f.error).join('; '),
        checks: saveChecks
      };
    }

    console.log('[ValidationGuards] ✅ Save validation passed');
    return { valid: true, checks: saveChecks };
  }

  // Get validation status for a network
  getValidationStatus(networkName) {
    return this.validationResults.get(networkName) || null;
  }

  // Clear validation cache
  clearValidationCache(networkName = null) {
    if (networkName) {
      this.validationResults.delete(networkName);
      console.log(`[ValidationGuards] 🧹 Cleared validation cache for ${networkName}`);
    } else {
      this.validationResults.clear();
      console.log('[ValidationGuards] 🧹 Cleared all validation cache');
    }
  }

  // Get summary of all validation states
  getValidationSummary() {
    const summary = {};
    
    this.validationResults.forEach((results, networkName) => {
      summary[networkName] = {
        overall: results.overall,
        timestamp: results.timestamp,
        age: Date.now() - results.timestamp,
        checksCount: Object.keys(results.checks).length
      };
    });

    return summary;
  }

  // Auto-validation with intelligent scheduling  
  async startAutoValidation(intervalMs = 300000) { // 5 minutes default
    console.log(`[ValidationGuards] 🔄 Starting auto-validation (interval: ${intervalMs}ms)`);
    
    this.autoValidationInterval = setInterval(async () => {
      try {
        const config = await configLoader.getConfig();
        console.log(`[ValidationGuards] 🔄 Auto-validating ${config.currentNetwork}...`);
        
        await this.runPreflightChecks(config.currentNetwork);
      } catch (error) {
        console.error('[ValidationGuards] Auto-validation error:', error);
      }
    }, intervalMs);

    // Run initial validation
    setTimeout(() => this.runPreflightChecks(), 1000);
  }

  // Stop auto-validation
  stopAutoValidation() {
    if (this.autoValidationInterval) {
      clearInterval(this.autoValidationInterval);
      this.autoValidationInterval = null;
      console.log('[ValidationGuards] ⏹️ Auto-validation stopped');
    }
  }
}

// Create singleton instance
export const validationGuards = new ValidationGuards();
export default validationGuards;