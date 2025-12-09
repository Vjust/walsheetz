// Runtime validation guards for network connectivity and package existence
import { configLoader } from "./ConfigLoader.js";

type ValidationStatus = 'passed' | 'failed' | 'warning' | 'error';

interface ValidationCheck {
  status: ValidationStatus;
  error?: string;
  errorDetails?: Record<string, string>;
  details?: Record<string, unknown>;
}

interface ValidationResults {
  network: string;
  timestamp: number;
  overall: {
    status: ValidationStatus;
    passed?: number;
    total?: number;
    error?: string;
  };
  checks: Record<string, ValidationCheck>;
}

interface ValidationEvent {
  event: string;
  data: Record<string, unknown>;
  timestamp: number;
}

type ValidationListener = (event: ValidationEvent) => void;

class ValidationGuards {
  private validationResults: Map<string, ValidationResults>;
  private validationPromises: Map<string, Promise<ValidationResults>>;
  private listeners: Set<ValidationListener>;
  private autoValidationInterval: ReturnType<typeof setInterval> | null;

  constructor() {
    this.validationResults = new Map();
    this.validationPromises = new Map();
    this.listeners = new Set();
    this.autoValidationInterval = null;

    console.log('[ValidationGuards] Initialized with runtime validation system');
  }

  addListener(callback: ValidationListener): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private _emitEvent(event: string, data: Record<string, unknown>): void {
    this.listeners.forEach((callback) => {
      try {
        callback({ event, data, timestamp: Date.now() });
      } catch (error) {
        console.error('[ValidationGuards] Event listener error:', error);
      }
    });
  }

  async runPreflightChecks(networkName: string | null = null): Promise<ValidationResults> {
    try {
      console.log('[ValidationGuards] Running preflight checks...');

      const config = await configLoader.getConfig();
      const targetNetwork = networkName || config.currentNetwork;

      this._emitEvent('preflight_started', { network: targetNetwork });

      const results: ValidationResults = {
        network: targetNetwork,
        timestamp: Date.now(),
        overall: { status: 'passed' },
        checks: {}
      };

      console.log('[ValidationGuards] Checking configuration validity...');
      results.checks.config = await this._validateConfiguration(config as unknown as Record<string, unknown>, targetNetwork);

      console.log('[ValidationGuards] Checking network connectivity...');
      results.checks.connectivity = await this._validateNetworkConnectivity(targetNetwork);

      console.log('[ValidationGuards] Checking package existence...');
      results.checks.package = await this._validatePackageExistence(targetNetwork);

      console.log('[ValidationGuards] Checking ABI compatibility...');
      results.checks.abi = await this._validateABICompatibility(targetNetwork);

      console.log('[ValidationGuards] Checking Walrus connectivity...');
      results.checks.walrus = await this._validateWalrusConnectivity(targetNetwork);

      const allPassed = Object.values(results.checks).every((check) => check.status === 'passed');
      results.overall = {
        status: allPassed ? 'passed' : 'failed',
        passed: Object.values(results.checks).filter((c) => c.status === 'passed').length,
        total: Object.keys(results.checks).length
      };

      this.validationResults.set(targetNetwork, results);

      this._emitEvent('preflight_completed', {
        network: targetNetwork,
        results,
        success: allPassed
      });

      console.log(`[ValidationGuards] ${allPassed ? 'PASS' : 'FAIL'} Preflight checks completed for ${targetNetwork}:`, {
        passed: results.overall.passed,
        total: results.overall.total,
        status: results.overall.status
      });

      return results;

    } catch (error) {
      console.error('[ValidationGuards] Preflight checks failed:', error);
      const err = error as Error;

      const errorResult: ValidationResults = {
        network: networkName || 'unknown',
        timestamp: Date.now(),
        overall: { status: 'error', error: err.message || 'Unknown error' },
        checks: {}
      };

      this._emitEvent('preflight_error', { error: err.message || 'Unknown error' });
      return errorResult;
    }
  }

  private async _validateConfiguration(config: Record<string, unknown>, networkName: string): Promise<ValidationCheck> {
    try {
      const networks = config.networks as Record<string, Record<string, unknown>>;
      const network = networks?.[networkName];

      if (!network) {
        return {
          status: 'failed',
          error: `Network '${networkName}' not found in configuration`
        };
      }

      const requiredFields = ['rpcUrl', 'packageId', 'walrus'];
      const missing = requiredFields.filter((field) => !network[field]);

      if (missing.length > 0) {
        return {
          status: 'failed',
          error: `Missing required fields: ${missing.join(', ')}`
        };
      }

      const walrus = network.walrus as Record<string, unknown>;
      const requiredWalrusFields = ['aggregatorUrl', 'publisherUrl'];
      const missingWalrus = requiredWalrusFields.filter((field) => !walrus[field]);

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
      const err = error as Error;
      return {
        status: 'error',
        error: err.message || 'Unknown error'
      };
    }
  }

  private async _validateNetworkConnectivity(networkName: string): Promise<ValidationCheck> {
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
          rpcConnected: validation.rpcConnected
        }
      };

    } catch (error) {
      const err = error as Error;
      return {
        status: 'error',
        error: err.message || 'Unknown error'
      };
    }
  }

  private async _validatePackageExistence(networkName: string): Promise<ValidationCheck> {
    try {
      const config = await configLoader.getConfig();
      const networks = (config.networks as unknown) as Record<string, Record<string, unknown>>;
      const network = networks[networkName];

      const response = await fetch(network.rpcUrl as string, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sui_getObject',
          params: [
            network.packageId,
            { showType: true, showContent: true, showOwner: true }
          ]
        })
      });

      if (!response.ok) {
        return {
          status: 'failed',
          error: `Package check HTTP ${response.status}: ${response.statusText}`
        };
      }

      const data = await response.json() as { error?: { message?: string }; result?: { data?: Record<string, unknown> } };

      if (data.error) {
        return {
          status: 'failed',
          error: `Package not found: ${data.error.message || 'Unknown error'}`
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
      const err = error as Error;
      return {
        status: 'error',
        error: err.message || 'Unknown error'
      };
    }
  }

  private async _validateABICompatibility(networkName: string): Promise<ValidationCheck> {
    try {
      const config = await configLoader.getConfig();
      const networks = (config.networks as unknown) as Record<string, Record<string, unknown>>;
      const network = networks[networkName];

      const abi = await configLoader.detectABI(network.packageId as string, networkName);

      if (abi.error) {
        return {
          status: 'failed',
          error: `ABI detection failed: ${abi.error}`
        };
      }

      const requiredFunctions = [
        { module: 'spreadsheet', name: 'create_spreadsheet', params: [] },
        { module: 'spreadsheet', name: 'save_version', params: [] }
      ];

      const compatibilityResults = requiredFunctions.map((func) => {
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

      const allCompatible = compatibilityResults.every((r) => r.compatible);

      if (!allCompatible) {
        const incompatible = compatibilityResults.filter((r) => !r.compatible);
        return {
          status: 'failed',
          error: `Function compatibility issues: ${incompatible.map((r) => r.reason).join('; ')}`,
          details: {
            results: compatibilityResults,
            modulesFound: Object.keys(abi.modules || {}),
            functionsFound: Object.keys(abi.functions || {}).length
          }
        };
      }

      return {
        status: 'passed',
        details: {
          modulesFound: Object.keys(abi.modules || {}),
          functionsFound: Object.keys(abi.functions || {}).length,
          structsFound: Object.keys(abi.structs || {}).length,
          compatibility: compatibilityResults
        }
      };

    } catch (error) {
      const err = error as Error;
      return {
        status: 'error',
        error: err.message || 'Unknown error'
      };
    }
  }

  private async _validateWalrusConnectivity(networkName: string): Promise<ValidationCheck> {
    try {
      const config = await configLoader.getConfig();
      const networks = (config.networks as unknown) as Record<string, Record<string, unknown>>;
      const network = networks[networkName];
      const walrus = network.walrus as Record<string, string>;

      interface ConnectivityResult {
        connected: boolean;
        status?: number;
        error?: string;
        url: string;
      }

      const results: { aggregator: ConnectivityResult | null; publisher: ConnectivityResult | null } = {
        aggregator: null,
        publisher: null
      };

      // Test aggregator
      try {
        const getProxyUrl = (config as { getProxyUrl?: (name: string) => string | null }).getProxyUrl;
        const aggBase = getProxyUrl?.('walrus-aggregator') || walrus.aggregatorUrl;
        const aggApiUrl = `${aggBase}/v1/api`;
        const aggInfoUrl = `${aggBase}/v1/info`;

        let aggConnected = false;
        let aggStatus = 0;

        try {
          const resp = await fetch(aggApiUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000)
          });
          aggStatus = resp.status;
          aggConnected = resp.ok;
        } catch {
          // swallow and try fallback
        }

        if (!aggConnected) {
          try {
            const resp2 = await fetch(aggInfoUrl, {
              method: 'GET',
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(10000)
            });
            aggStatus = resp2.status;
            aggConnected = resp2.ok || resp2.status === 404;
          } catch {
            aggConnected = false;
          }
        }

        results.aggregator = {
          connected: aggConnected,
          status: aggStatus,
          url: aggBase
        };
      } catch (error) {
        const err = error as Error;
        results.aggregator = {
          connected: false,
          error: err.message || 'Unknown error',
          url: walrus.aggregatorUrl
        };
      }

      // Test publisher
      try {
        const getProxyUrl = (config as { getProxyUrl?: (name: string) => string | null }).getProxyUrl;
        const pubBase = getProxyUrl?.('walrus-publisher') || walrus.publisherUrl;
        const pubApiUrl = `${pubBase}/v1/api`;
        const pubInfoUrl = `${pubBase}/v1/info`;

        let pubConnected = false;
        let pubStatus = 0;

        try {
          const resp = await fetch(pubApiUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000)
          });
          pubStatus = resp.status;
          pubConnected = resp.ok;
        } catch {
          // swallow and try fallback
        }

        if (!pubConnected) {
          try {
            const resp2 = await fetch(pubInfoUrl, {
              method: 'GET',
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(10000)
            });
            pubStatus = resp2.status;
            pubConnected = resp2.ok || resp2.status === 404;
          } catch {
            pubConnected = false;
          }
        }

        results.publisher = {
          connected: pubConnected,
          status: pubStatus,
          url: pubBase
        };
      } catch (error) {
        const err = error as Error;
        results.publisher = {
          connected: false,
          error: err.message || 'Unknown error',
          url: walrus.publisherUrl
        };
      }

      const bothConnected = results.aggregator?.connected && results.publisher?.connected;
      const anyConnected = results.aggregator?.connected || results.publisher?.connected;

      const aggregatorError = results.aggregator?.error || (results.aggregator?.connected ? 'OK' : `HTTP ${results.aggregator?.status}`);
      const publisherError = results.publisher?.error || (results.publisher?.connected ? 'OK' : `HTTP ${results.publisher?.status}`);

      if (!anyConnected) {
        return {
          status: 'failed',
          error: 'Neither Walrus aggregator nor publisher are reachable',
          errorDetails: {
            aggregator: aggregatorError,
            publisher: publisherError
          },
          details: results as unknown as Record<string, unknown>
        };
      }

      if (!bothConnected) {
        const failed = !results.aggregator?.connected ? 'aggregator' : 'publisher';
        return {
          status: 'warning',
          error: `Walrus ${failed} is not reachable but ${failed === 'aggregator' ? 'publisher' : 'aggregator'} works`,
          errorDetails: {
            aggregator: aggregatorError,
            publisher: publisherError
          },
          details: results as unknown as Record<string, unknown>
        };
      }

      return {
        status: 'passed',
        details: results as unknown as Record<string, unknown>,
        errorDetails: { aggregator: 'OK', publisher: 'OK' }
      };

    } catch (error) {
      const err = error as Error;
      return {
        status: 'error',
        error: err.message || 'Unknown error'
      };
    }
  }

  async validateForSave(networkName: string | null = null): Promise<{ valid: boolean; error?: string; results?: ValidationResults; checks?: ValidationCheck[] }> {
    const config = await configLoader.getConfig();
    const targetNetwork = networkName || config.currentNetwork;

    console.log(`[ValidationGuards] Validating for save operation on ${targetNetwork}...`);

    const recent = this.validationResults.get(targetNetwork);
    const isRecent = recent && Date.now() - recent.timestamp < 60000;

    if (isRecent && recent.overall.status === 'passed') {
      console.log('[ValidationGuards] Using recent validation results for save');
      return { valid: true, results: recent };
    }

    const saveChecks = await Promise.all([
      this._validateNetworkConnectivity(targetNetwork),
      this._validateWalrusConnectivity(targetNetwork)
    ]);

    const allPassed = saveChecks.every((check) => check.status === 'passed' || check.status === 'warning');

    if (!allPassed) {
      const failures = saveChecks.filter((check) => check.status === 'failed');
      console.log('[ValidationGuards] Save validation failed:', failures);

      return {
        valid: false,
        error: failures.map((f) => f.error).join('; '),
        checks: saveChecks
      };
    }

    console.log('[ValidationGuards] Save validation passed');
    return { valid: true, checks: saveChecks };
  }

  getValidationStatus(networkName: string): ValidationResults | null {
    return this.validationResults.get(networkName) || null;
  }

  clearValidationCache(networkName: string | null = null): void {
    if (networkName) {
      this.validationResults.delete(networkName);
      console.log(`[ValidationGuards] Cleared validation cache for ${networkName}`);
    } else {
      this.validationResults.clear();
      console.log('[ValidationGuards] Cleared all validation cache');
    }
  }

  getValidationSummary(): Record<string, { overall: ValidationResults['overall']; timestamp: number; age: number; checksCount: number }> {
    const summary: Record<string, { overall: ValidationResults['overall']; timestamp: number; age: number; checksCount: number }> = {};

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

  async startAutoValidation(intervalMs: number = 300000): Promise<void> {
    console.log(`[ValidationGuards] Starting auto-validation (interval: ${intervalMs}ms)`);

    this.autoValidationInterval = setInterval(async () => {
      try {
        const config = await configLoader.getConfig();
        console.log(`[ValidationGuards] Auto-validating ${config.currentNetwork}...`);

        await this.runPreflightChecks(config.currentNetwork);
      } catch (error) {
        console.error('[ValidationGuards] Auto-validation error:', error);
      }
    }, intervalMs);

    setTimeout(() => this.runPreflightChecks(), 1000);
  }

  stopAutoValidation(): void {
    if (this.autoValidationInterval) {
      clearInterval(this.autoValidationInterval);
      this.autoValidationInterval = null;
      console.log('[ValidationGuards] Auto-validation stopped');
    }
  }
}

export const validationGuards = new ValidationGuards();
export default validationGuards;
