// Contract registry for managing DeFi protocol adapters in WalSheetz
import { getCurrentConfig } from './config.js';

class SuiContractRegistry {
  private adapters: Map<string, any>;
  private metadata: Map<string, any>;
  private initialized: boolean;

  constructor() {
    this.adapters = new Map();
    this.metadata = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    console.log('[ContractRegistry] Initializing Sui contract registry...');

    try {
      // Register available adapters
      await this.registerDefaultAdapters();
      this.initialized = true;
      console.log('[ContractRegistry] Registry initialized with adapters:', Array.from(this.adapters.keys()));
    } catch (error) {
      const err = error as Error;
      console.error('[ContractRegistry] Failed to initialize registry:', err);
      throw err;
    }
  }

  async registerDefaultAdapters() {
    // Dynamically import adapters to avoid circular dependencies
    // No default adapters registered currently
  }

  registerAdapter(adapterId: string, AdapterClass: any) {
    if (this.adapters.has(adapterId)) {
      console.warn(`[ContractRegistry] Adapter ${adapterId} already registered, replacing...`);
    }

    try {
      // Instantiate the adapter
      const adapter = new AdapterClass();
      this.adapters.set(adapterId, adapter);

      // Store metadata
      this.metadata.set(adapterId, {
        id: adapterId,
        name: adapter.getName?.() || adapterId,
        description: adapter.getDescription?.() || `${adapterId} protocol adapter`,
        version: adapter.getVersion?.() || '1.0.0',
        supportedNetworks: adapter.getSupportedNetworks?.() || ['testnet', 'mainnet'],
        methods: adapter.getMethods?.() || [],
        registeredAt: Date.now()
      });

      console.log(`[ContractRegistry] Registered adapter: ${adapterId}`);
    } catch (error) {
      const err = error as Error;
      console.error(`[ContractRegistry] Failed to register adapter ${adapterId}:`, err);
      throw new Error(`Failed to register adapter ${adapterId}: ${err.message}`);
    }
  }

  getAdapter(adapterId: string) {
    if (!this.initialized) {
      throw new Error('Contract registry not initialized. Call initialize() first.');
    }

    const adapter = this.adapters.get(adapterId);
    if (!adapter) {
      throw new Error(`Adapter not found: ${adapterId}. Available adapters: ${Array.from(this.adapters.keys()).join(', ')}`);
    }

    return adapter;
  }

  hasAdapter(adapterId: string) {
    return this.adapters.has(adapterId);
  }

  listAdapters() {
    return Array.from(this.metadata.values());
  }

  getAdapterMetadata(adapterId: string) {
    const metadata = this.metadata.get(adapterId);
    if (!metadata) {
      throw new Error(`Adapter metadata not found: ${adapterId}`);
    }
    return metadata;
  }

  async validateAdapter(adapterId: string, method: string, args: any[]) {
    const adapter = this.getAdapter(adapterId);

    // Check if adapter supports the method
    if (typeof adapter[method] !== 'function') {
      throw new Error(`Method ${method} not supported by adapter ${adapterId}`);
    }

    // Let the adapter validate arguments
    if (adapter.validateArgs) {
      try {
        await adapter.validateArgs(method, args);
      } catch (error) {
        const err = error as Error;
        throw new Error(`Invalid arguments for ${adapterId}.${method}: ${err.message}`);
      }
    }

    return true;
  }

  async callAdapter(adapterId: string, method: string, args: any[], options: any = {}) {
    await this.validateAdapter(adapterId, method, args);
    const adapter = this.getAdapter(adapterId);

    console.log(`[ContractRegistry] Calling ${adapterId}.${method} with args:`, args);

    try {
      const result = await adapter[method](...args, options);
      console.log(`[ContractRegistry] ${adapterId}.${method} completed successfully`);
      return result;
    } catch (error) {
      const err = error as Error;
      console.error(`[ContractRegistry] ${adapterId}.${method} failed:`, err);
      throw new Error(`${adapterId}.${method} failed: ${err.message}`);
    }
  }

  async describeSchema(adapterId: string) {
    const adapter = this.getAdapter(adapterId);

    if (adapter.describeSchema) {
      return await adapter.describeSchema();
    }

    // Default schema from metadata
    const metadata = this.getAdapterMetadata(adapterId);
    return {
      adapterId,
      name: metadata.name,
      description: metadata.description,
      version: metadata.version,
      methods: metadata.methods || []
    };
  }

  async buildReadCall(adapterId: string, method: string, params: any) {
    const adapter = this.getAdapter(adapterId);

    if (adapter.buildReadCall) {
      return await adapter.buildReadCall(method, params);
    }

    // Default implementation for read operations
    return await this.callAdapter(adapterId, method, params, { readOnly: true });
  }

  async buildWriteCall(adapterId: string, method: string, params: any, signer: any) {
    const adapter = this.getAdapter(adapterId);

    if (!signer) {
      throw new Error('Signer required for write operations');
    }

    if (adapter.buildWriteCall) {
      return await adapter.buildWriteCall(method, params, signer);
    }

    // Default implementation for write operations
    return await this.callAdapter(adapterId, method, params, { signer, readOnly: false });
  }

  async subscribeEvents(adapterId: string, params: any, callback: any) {
    const adapter = this.getAdapter(adapterId);

    if (adapter.subscribeEvents) {
      return await adapter.subscribeEvents(params, callback);
    }

    console.warn(`[ContractRegistry] Event subscription not supported by adapter: ${adapterId}`);
    return null;
  }

  getNetworkConfig() {
    try {
      return getCurrentConfig();
    } catch (error) {
      const err = error as Error;
      console.error('[ContractRegistry] Failed to get network config:', err);
      throw new Error('Failed to get network configuration');
    }
  }

  isNetworkSupported(adapterId: string, network: string) {
    const metadata = this.getAdapterMetadata(adapterId);
    return metadata.supportedNetworks.includes(network);
  }

  async healthCheck(adapterId: string | null = null) {
    const results = new Map();

    if (adapterId) {
      // Check specific adapter
      const adapter = this.getAdapter(adapterId);
      try {
        const health = adapter.healthCheck ? await adapter.healthCheck() : { status: 'unknown' };
        results.set(adapterId, health);
      } catch (error) {
        const err = error as Error;
        results.set(adapterId, { status: 'error', error: err.message });
      }
    } else {
      // Check all adapters
      for (const [id, adapter] of this.adapters) {
        try {
          const health = adapter.healthCheck ? await adapter.healthCheck() : { status: 'unknown' };
          results.set(id, health);
        } catch (error) {
          const err = error as Error;
          results.set(id, { status: 'error', error: err.message });
        }
      }
    }

    return Object.fromEntries(results);
  }

  destroy() {
    console.log('[ContractRegistry] Destroying contract registry...');

    // Clean up adapters
    for (const [id, adapter] of this.adapters) {
      if (adapter.destroy) {
        try {
          adapter.destroy();
        } catch (error) {
          const err = error as Error;
          console.error(`[ContractRegistry] Error destroying adapter ${id}:`, err);
        }
      }
    }

    this.adapters.clear();
    this.metadata.clear();
    this.initialized = false;
  }
}

// Create singleton instance
export const contractRegistry = new SuiContractRegistry();
export default contractRegistry;

// Convenience functions
export const initializeRegistry = () => contractRegistry.initialize();
export const getAdapter = (adapterId: string) => contractRegistry.getAdapter(adapterId);
export const listAdapters = () => contractRegistry.listAdapters();
export const callContract = (adapterId: string, method: string, args: any[], options: any) =>
  contractRegistry.callAdapter(adapterId, method, args, options);