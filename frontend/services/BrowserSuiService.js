// Browser-compatible Sui service using real testnet integration
import { configLoader } from '../utils/ConfigLoader.js';
import { browserWalletManager } from './BrowserWalletManager.js';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { detectSaveVersionSignature } from '../utils/AbiHelpers.js';
import { logger, LogComponent, LogLevel } from '../utils/Logger.js';

class BrowserSuiService {
  constructor() {
    this.config = null; // Will be loaded asynchronously
    this.client = null; // Will be initialized after config load
    this.configLoader = configLoader;
    this.walletManager = browserWalletManager;
    this.currentSpreadsheetId = null;
    this.eventListeners = new Map();

    // Prevent multiple initializations
    this.initialized = false;
    this.initializing = false;

    // Transaction queue to prevent concurrent wallet operations
    this.transactionQueue = [];
    this.isProcessingTransaction = false;

    logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'constructor', 'BrowserSuiService constructor completed');
  }

  // Initialize the service
  async initialize() {
    // Prevent multiple initializations
    if (this.initialized) {
      logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'initialize', 'Already initialized, skipping');
      return true;
    }

    if (this.initializing) {
      logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'initialize', 'Initialization already in progress, waiting');
      // Wait for existing initialization to complete
      while (this.initializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return this.initialized;
    }

    this.initializing = true;

    try {
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'initialize', 'Starting BrowserSuiService initialization');

      // Load runtime configuration
      this.config = await this.configLoader.getConfig();
      const networkConfig = this.config.getCurrentNetwork();

      // Initialize SuiClient with ABSOLUTE URL (GraphQL client needs direct access, not proxy)
      // The @mysten/sui v1.38.0 uses GraphQL internally, which doesn't work through the /sui-rpc proxy
      this.client = new SuiClient({
        url: networkConfig.rpcUrl
      });

      logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'config_loaded', 'Configuration loaded', {
        network: this.config.currentNetwork,
        packageId: networkConfig.packageId,
        registryObjectId: networkConfig.registryObjectId
      });

      // Test connection to Sui RPC
      const chainId = await this.client.getChainIdentifier();
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'connection_success', `Connected to Sui network, chain ID: ${chainId}`);

      // Best-effort network consistency check
      try {
        await this.checkNetworkAgainstConfig?.(chainId);
      } catch (e) {
        logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'network_check', 'Network consistency check skipped/failed', {
          error: typeof e === 'string' ? e : e?.message || 'Unknown error'
        });
      }

      this.initialized = true;
      return true;
    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'init_failed', 'Failed to connect to Sui testnet', {
        error: error.message,
        stack: error.stack
      });
      this.initialized = false;
      return false;
    } finally {
      this.initializing = false;
    }
  }

  // Runtime config helper methods
  async getRuntimeConfig() {
    if (!this.config) {
      this.config = await this.configLoader.getConfig();
    }
    return this.config;
  }

  async getCurrentNetworkConfig() {
    const config = await this.getRuntimeConfig();
    return config.getCurrentNetwork();
  }

  async getPackageId() {
    const networkConfig = await this.getCurrentNetworkConfig();
    return networkConfig.packageId;
  }

  async getRegistryObjectId() {
    const networkConfig = await this.getCurrentNetworkConfig();
    return networkConfig.registryObjectId;
  }

  // Validate that a spreadsheet object exists and matches expected type
  async validateSpreadsheetObjectExists(spreadsheetObjectId) {
    try {
      if (!spreadsheetObjectId) {
        return { exists: false, error: 'No spreadsheet object ID provided' };
      }

      const packageId = await this.getPackageId();

      const result = await this.client.getObject({
        id: spreadsheetObjectId,
        options: {
          showContent: true,
          showType: true,
          showOwner: true
        }
      });

      if (!result?.data) {
        return {
          exists: false,
          error: 'Object not found on blockchain',
          objectId: spreadsheetObjectId
        };
      }

      const expectedType = `${packageId}\:\:spreadsheet\:\:Spreadsheet`;
      const objType = result.data.type || result.data.content?.type || '';
      if (objType && objType !== expectedType && !objType.endsWith('::spreadsheet::Spreadsheet')) {
        return {
          exists: false,
          error: `Object exists but is not a spreadsheet (type: ${objType})`,
          objectId: spreadsheetObjectId
        };
      }

      return { exists: true, objectId: spreadsheetObjectId, data: result.data };
    } catch (error) {
      console.error('[BrowserSuiService] Failed to validate spreadsheet object:', error);
      return {
        exists: false,
        error: `Validation failed: ${typeof error === 'string' ? error : (error && error.message) || 'Unknown error'}`,
        objectId: spreadsheetObjectId
      };
    }
  }

  // Validate that the configured registry object exists and is the correct shared type
  async validateRegistryObjectExists() {
    try {
      const packageId = await this.getPackageId();
      const registryObjectId = await this.getRegistryObjectId();

      if (!registryObjectId) {
        return { exists: false, error: 'Registry object ID not configured' };
      }

      const result = await this.client.getObject({
        id: registryObjectId,
        options: {
          showContent: true,
          showType: true,
          showOwner: true
        }
      });

      if (!result?.data) {
        return {
          exists: false,
          error: 'Registry object not found on blockchain',
          objectId: registryObjectId
        };
      }

      const expectedType = `${packageId}\:\:spreadsheet\:\:SpreadsheetRegistry`;
      const objType = result.data.type || result.data.content?.type || '';
      const isShared = !!result.data.owner?.Shared;

      if (objType && objType !== expectedType && !objType.endsWith('::spreadsheet::SpreadsheetRegistry')) {
        return {
          exists: false,
          error: `Registry object type mismatch (type: ${objType})`,
          objectId: registryObjectId
        };
      }

      if (!isShared) {
        return {
          exists: false,
          error: 'Registry object is not shared',
          objectId: registryObjectId
        };
      }

      return { exists: true, objectId: registryObjectId, data: result.data };
    } catch (error) {
      console.error('[BrowserSuiService] Failed to validate registry object:', error);
      return {
        exists: false,
        error: `Registry validation failed: ${typeof error === 'string' ? error : (error && error.message) || 'Unknown error'}`
      };
    }
  }

  // Best-effort network consistency check between configured environment and connected RPC
  async checkNetworkAgainstConfig(chainIdentifier) {
    try {
      const config = await this.getRuntimeConfig();
      const env = config.currentNetwork?.name || config.currentNetwork?.id || 'unknown';
      const rpcUrl = config.getServiceUrl('sui-rpc') || '';
      const cid = chainIdentifier || (await this.client.getChainIdentifier());

      const expectsTestnet = (rpcUrl.includes('testnet') || env.toLowerCase().includes('test'));
      const looksLikeTestnet = typeof cid === 'string' && cid.toLowerCase().includes('test');

      const mismatch = expectsTestnet !== looksLikeTestnet;
      if (mismatch) {
        console.warn('[BrowserSuiService] ⚠️ Network mismatch detected', {
          configuredRpcUrl: rpcUrl,
          environment: env,
          chainIdentifier: cid
        });
      } else {
        console.log('[BrowserSuiService] ✅ Network appears consistent with configuration', {
          configuredRpcUrl: rpcUrl,
          environment: env,
          chainIdentifier: cid
        });
      }
      return { mismatch, chainIdentifier: cid, environment: env, rpcUrl };
    } catch (error) {
      console.warn('[BrowserSuiService] Network consistency check failed:', typeof error === 'string' ? error : (error && error.message) || 'Unknown error');
      return { mismatch: false, error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error' };
    }
  }

  async hasContentHashFeature() {
    const config = await this.getRuntimeConfig();
    return config.getFeature('contentHashInSave', true); // Default true for existing deployments
  }

  // Validate ABI compatibility between client and deployed contract
  async validateAbiCompatibility() {
    try {
      const config = await this.getRuntimeConfig()
      const networkConfig = config.getCurrentNetwork()
 
      // Baseline from config (app-config.json)
      let deployedExpectsContentHash = networkConfig.features?.contentHashInSave ?? true
      const clientExpectsContentHash = await this.hasContentHashFeature()
 
      // Probe on-chain ABI to override misconfigurations
      let detectedExpects = null
      try {
        const sig = await (await import('../utils/AbiHelpers.js')).detectSaveVersionSignature()
        detectedExpects = !!sig.expectsContentHash
      } catch (e) {
        console.warn('[BrowserSuiService] ABI detection failed, using config flags only:', (typeof e === 'string' ? e : e?.message || 'Unknown error'))
      }
 
      // If detection succeeded and contradicts config, prefer detection
      if (detectedExpects !== null && detectedExpects !== deployedExpectsContentHash) {
        console.warn('[BrowserSuiService] ABI mismatch between config and detection, preferring on-chain detection', {
          configExpects: deployedExpectsContentHash,
          detectedExpects
        })
        deployedExpectsContentHash = detectedExpects
        // Align runtime feature to true only (never flip to false at runtime)
        if (detectedExpects === true && config.setFeature) {
          try {
            config.setFeature('contentHashInSave', true)
          } catch (e) {
            console.warn('[BrowserSuiService] Could not set runtime feature contentHashInSave:', (typeof e === 'string' ? e : e?.message || 'Unknown error'))
          }
        }
      }
 
      if (deployedExpectsContentHash !== clientExpectsContentHash) {
        const deployedArgs = deployedExpectsContentHash ? 6 : 5
        const clientArgs = clientExpectsContentHash ? 6 : 5
        console.warn('[BrowserSuiService] ⚠️ ABI compatibility warning - continuing with detected ABI', {
          deployedArgs,
          clientArgs,
          deployedExpectsContentHash,
          clientExpectsContentHash
        })
        // If chain expects hash but client flag says otherwise, force client to true
        if (deployedExpectsContentHash === true && config.setFeature) {
          try {
            config.setFeature('contentHashInSave', true)
            console.log('[BrowserSuiService] contentHashInSave forced ON at runtime to match deployed ABI')
          } catch (e) {
            console.warn('[BrowserSuiService] Failed to force contentHashInSave ON:', (typeof e === 'string' ? e : e?.message || 'Unknown error'))
          }
        }
      }
 
      console.log('[BrowserSuiService] ✅ ABI compatibility verified/normalized:', {
        expectsContentHash: deployedExpectsContentHash,
        argumentCount: deployedExpectsContentHash ? 6 : 5
      })
      return true
    } catch (error) {
      console.error('[BrowserSuiService] ❌ ABI compatibility validation failed:', error)
      // Do not hard fail; allow downstream builders to use detection-based args
      return true
    }
  }

  // Create a new spreadsheet transaction
  async createSpreadsheetTransaction(title) {
    try {
      console.log('[BrowserSuiService] 📝 Creating spreadsheet transaction with title:', title);

      // Get wallet info for sender address
      const walletInfo = this.walletManager.getWalletInfo();
      if (!walletInfo || !walletInfo.connected || !walletInfo.address) {
        throw new Error('Wallet not connected - cannot create transaction');
      }

      console.log('[BrowserSuiService] Using sender address:', walletInfo.address);

      // Create Transaction for spreadsheet creation
      const tx = new Transaction();
      console.log('[BrowserSuiService] ✅ Transaction created successfully');

      // Set sender
      tx.setSender(walletInfo.address);
      console.log('[BrowserSuiService] ✅ Sender set:', walletInfo.address);

      // Call create_spreadsheet function
      const packageId = await this.getPackageId();
      const registryObjectId = await this.getRegistryObjectId();
      
      console.log('[BrowserSuiService] 🔨 Building moveCall...');
      console.log('[BrowserSuiService] Target:', `${packageId}::spreadsheet::create_spreadsheet`);
      console.log('[BrowserSuiService] Registry Object ID:', registryObjectId);
      
      // Validate registry exists before building the call to fail fast if misconfigured
      const registryValidation = await this.validateRegistryObjectExists();
      if (!registryValidation.exists) {
        throw new Error(`Registry validation failed: ${registryValidation.error || 'Unknown error'}`);
      }

      tx.moveCall({
        target: `${packageId}::spreadsheet::create_spreadsheet`,
        arguments: [
          tx.object(registryObjectId), // Registry object
          tx.pure.string(title) // Spreadsheet title
        ],
        typeArguments: []
      });

      // Set dynamic gas budget based on transaction complexity
      await this.setDynamicGasBudget(tx, 'create_spreadsheet');

      console.log('[BrowserSuiService] ✅ Transaction created successfully:', {
        packageId: packageId,
        registryObjectId: registryObjectId,
        title: title
      });

      return tx;
    } catch (error) {
      console.error('[BrowserSuiService] ❌ Failed to create spreadsheet transaction:', error);
      console.error('[BrowserSuiService] Error details:', {
        message: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack,
        name: error.name
      });
      throw error;
    }
  }

  // Dynamically estimate and set gas budget for a transaction with safety buffer
  async setDynamicGasBudget(transaction, operationType = 'unknown') {
    try {
      console.log(`[BrowserSuiService] 💰 Calculating dynamic gas budget for ${operationType}...`);
      
      // Estimate gas for the transaction
      const gasEstimate = await this.estimateGas(transaction);
      
      // Add 25% safety buffer to handle gas price fluctuations and ensure success
      const safetyMultiplier = 1.25;
      const bufferedGas = Math.ceil(gasEstimate.totalGasUsed * safetyMultiplier);
      
      // Set minimum gas budget to prevent failures (5M MIST minimum)
      const minGasBudget = 5_000_000;
      const finalGasBudget = Math.max(bufferedGas, minGasBudget);
      
      // Set the calculated gas budget
      transaction.setGasBudget(finalGasBudget);
      
      const finalCostSUI = (finalGasBudget / 1_000_000_000).toFixed(6);
      
      console.log(`[BrowserSuiService] ✅ Dynamic gas budget set for ${operationType}:`, {
        estimatedGas: gasEstimate.totalGasUsed,
        bufferedGas,
        finalGasBudget,
        finalCostSUI,
        safetyBuffer: '25%',
        operationType
      });
      
      // Warn if this is a high-gas operation
      if (finalGasBudget > 50_000_000) {
        console.warn(`[BrowserSuiService] ⚠️ High gas operation detected (${finalCostSUI} SUI)`, {
          operationType,
          gasEstimate: finalGasBudget
        });
      }
      
      return {
        estimatedGas: gasEstimate.totalGasUsed,
        finalGasBudget,
        finalCostSUI,
        isHighGas: finalGasBudget > 50_000_000
      };
    } catch (error) {
      console.error(`[BrowserSuiService] ❌ Failed to set dynamic gas budget for ${operationType}:`, error);
      
      // Fallback to conservative static gas budget based on operation type
      const fallbackGas = operationType.includes('combined') ? 15_000_000 : 10_000_000;
      transaction.setGasBudget(fallbackGas);
      
      console.log(`[BrowserSuiService] 🔄 Using fallback gas budget: ${fallbackGas} MIST (${(fallbackGas / 1_000_000_000).toFixed(6)} SUI)`);
      
      return {
        estimatedGas: fallbackGas,
        finalGasBudget: fallbackGas,
        finalCostSUI: (fallbackGas / 1_000_000_000).toFixed(6),
        isHighGas: fallbackGas > 50_000_000,
        fallback: true
      };
    }
  }

  // Create a transaction for storing spreadsheet metadata with Walrus blob reference
  async createStorageTransaction(data) {
    try {
      // Validate ABI compatibility before creating transaction
      await this.validateAbiCompatibility();

      console.log('[BrowserSuiService] 💾 Creating storage transaction for blob:', data.walrusBlobId);

      // Validate required data
      if (!data) {
        throw new Error('Storage transaction data is required');
      }

      if (!data.spreadsheetObjectId) {
        throw new Error('Spreadsheet Object ID is required for storage transaction');
      }

      if (!data.walrusBlobId) {
        throw new Error('Walrus Blob ID is required for storage transaction');
      }

      // Only enforce contentHash when ABI indicates it's expected
      const { detectSaveVersionSignature } = await import('../utils/AbiHelpers.js');
      const abiCheck = await detectSaveVersionSignature();
      if (abiCheck.expectsContentHash && !data.contentHash) {
        throw new Error('Content hash is required by the deployed contract signature');
      }

      // Get wallet info for sender address
      const walletInfo = this.walletManager.getWalletInfo();
      if (!walletInfo || !walletInfo.connected || !walletInfo.address) {
        throw new Error('Wallet not connected - cannot create storage transaction');
      }

      console.log('[BrowserSuiService] Using sender address for storage:', walletInfo.address);

      // Create Transaction for version save
      const tx = new Transaction();
      console.log('[BrowserSuiService] ✅ Transaction created successfully for storage');

      // Set sender
      tx.setSender(walletInfo.address);
      console.log('[BrowserSuiService] ✅ Storage sender set:', walletInfo.address);

      // Call save_version function
      const packageId = await this.getPackageId();

      console.log('[BrowserSuiService] 🔨 Building storage moveCall...');
      console.log('[BrowserSuiService] Target:', `${packageId}::spreadsheet::save_version`);
      console.log('[BrowserSuiService] Spreadsheet Object ID:', data.spreadsheetObjectId);
      console.log('[BrowserSuiService] Walrus Blob ID:', data.walrusBlobId);
      console.log('[BrowserSuiService] Content Hash:', data.contentHash);

      // Import and use buildSaveVersionArgs to construct arguments based on ABI detection
      const { buildSaveVersionArgs } = await import('../utils/AbiHelpers.js');
      const { args, signature: sig } = await buildSaveVersionArgs(tx, {
        spreadsheetObjectId: data.spreadsheetObjectId,
        walrusBlobId: data.walrusBlobId,
        contentHash: data.contentHash,
        cellCount: data.cellCount || 0,
        description: data.description || `Version ${data.version}`,
        version: data.version
      });

      console.log('[BrowserSuiService] 🔍 Building save_version arguments:', {
        abiDetection: sig.debug || sig,
        expectsContentHash: sig.expectsContentHash,
        expectsClock: sig.expectsClock,
        expectedArgs: args.length,
        functionSignature: sig.expectsContentHash && sig.expectsClock
          ? 'save_version(spreadsheet, walrus_blob_id, content_hash, cell_count, description, clock)'
          : sig.expectsContentHash && !sig.expectsClock
          ? 'save_version(spreadsheet, walrus_blob_id, content_hash, cell_count, description)'
          : !sig.expectsContentHash && sig.expectsClock
          ? 'save_version(spreadsheet, walrus_blob_id, cell_count, description, clock)'
          : 'save_version(spreadsheet, walrus_blob_id, cell_count, description)'
      });

      console.log('[BrowserSuiService] 📦 Arguments prepared:', {
        argCount: args.length,
        expectsContentHash: sig.expectsContentHash,
        expectsClock: sig.expectsClock,
        argTypes: args.map((arg, idx) => {
          if (idx === 0) return 'object(spreadsheet)';
          if (idx === 1) return 'string(walrus_blob_id)';
          if (sig.expectsContentHash && idx === 2) return 'string(content_hash)';
          if (idx === args.length - 1 && sig.expectsClock) return 'object(clock)';
          if (idx === args.length - 2 && !sig.expectsClock) return 'string(description)';
          if (idx === args.length - 1 && !sig.expectsClock) return 'string(description)';
          if (idx === args.length - 2 && sig.expectsClock) return 'string(description)';
          if (args.length === 5 && idx === 2 && !sig.expectsContentHash) return 'u64(cell_count)';
          if (args.length === 6 && idx === 3) return 'u64(cell_count)';
          if (args.length === 4 && idx === 2) return 'u64(cell_count)';
          return 'u64(cell_count)';
        })
      });

      tx.moveCall({
        target: `${packageId}::spreadsheet::save_version`,
        arguments: args,
        typeArguments: []
      });

      // Set dynamic gas budget based on transaction complexity
      await this.setDynamicGasBudget(tx, 'save_version');

      console.log('[BrowserSuiService] ✅ Storage transaction created successfully:', {
        spreadsheetObjectId: data.spreadsheetObjectId,
        walrusBlobId: data.walrusBlobId,
        contentHash: sig.expectsContentHash ? data.contentHash : '[omitted by ABI]',
        cellCount: data.cellCount,
        description: data.description,
        abiMode: sig.expectsContentHash && sig.expectsClock
          ? 'with_content_hash_and_clock'
          : sig.expectsContentHash && !sig.expectsClock
          ? 'with_content_hash_no_clock'
          : !sig.expectsContentHash && sig.expectsClock
          ? 'no_content_hash_with_clock'
          : 'no_content_hash_no_clock',
        argumentCount: args.length
      });

      return tx;
    } catch (error) {
      console.error('[BrowserSuiService] ❌ Failed to create storage transaction:', error);
      console.error('[BrowserSuiService] Storage error details:', {
        message: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack,
        name: error.name
      });
      throw error;
    }
  }

  // Create spreadsheet in two separate transactions (due to Sui shared object limitations)
  async createSpreadsheetWithInitialVersion(title, walrusBlobId, contentHash, cellCount = 0, description = 'Initial version') {
    try {
      // Validate ABI compatibility before creating transactions
      await this.validateAbiCompatibility();

      console.log('[BrowserSuiService] 🚀 Creating spreadsheet with two separate transactions', {
        title, 
        walrusBlobId, 
        cellCount,
        description
      });

      // Validate required parameters
      if (!walrusBlobId) {
        throw new Error('Walrus Blob ID is required');
      }
      // Note: contentHash validation will be done based on ABI detection result

      // Get wallet info for sender address
      const walletInfo = this.walletManager.getWalletInfo();
      if (!walletInfo || !walletInfo.connected || !walletInfo.address) {
        throw new Error('Wallet not connected');
      }

      // Step 1: Create spreadsheet transaction
      console.log('[BrowserSuiService] 🔨 Step 1: Creating spreadsheet...');
      const createTx = new Transaction();
      createTx.setSender(walletInfo.address);

      const packageId = await this.getPackageId();
      const registryObjectId = await this.getRegistryObjectId();

      // Validate registry exists before building the call to fail fast if misconfigured
      const registryValidation2 = await this.validateRegistryObjectExists();
      if (!registryValidation2.exists) {
        throw new Error(`Registry validation failed: ${registryValidation2.error || 'Unknown error'}`);
      }

      createTx.moveCall({
        target: `${packageId}::spreadsheet::create_spreadsheet`,
        arguments: [
          createTx.object(registryObjectId), // Registry object
          createTx.pure.string(title) // Spreadsheet title
        ],
        typeArguments: []
      });

      await this.setDynamicGasBudget(createTx, 'create_spreadsheet');
      
      // Execute first transaction
      const createResult = await this.executeTransaction(createTx);
      console.log('[BrowserSuiService] ✅ Spreadsheet created successfully:', createResult.digest);

      // Extract created spreadsheet object ID from the transaction result
      let spreadsheetObjectId;
      if (createResult.objectChanges) {
        const createdSpreadsheet = createResult.objectChanges.find(change => 
          change.type === 'created' && 
          change.objectType && 
          change.objectType.includes('::spreadsheet::Spreadsheet')
        );
        if (createdSpreadsheet) {
          spreadsheetObjectId = createdSpreadsheet.objectId;
        }
      }

      if (!spreadsheetObjectId) {
        // Fallback: query the transaction to get object changes
        const txBlock = await this.client.getTransactionBlock({
          digest: createResult.digest,
          options: { showObjectChanges: true, showEvents: true }
        });

        const createdSpreadsheet = txBlock.objectChanges?.find(change => 
          change.type === 'created' && 
          change.objectType && 
          change.objectType.includes('::spreadsheet::Spreadsheet')
        );
        
        if (createdSpreadsheet) {
          spreadsheetObjectId = createdSpreadsheet.objectId;
        }
      }

      if (!spreadsheetObjectId) {
        throw new Error('Failed to get created spreadsheet object ID');
      }

      console.log('[BrowserSuiService] 📍 Found created spreadsheet object ID:', spreadsheetObjectId);

      // Step 2: Save initial version transaction
      console.log('[BrowserSuiService] 🔨 Step 2: Saving initial version...');
      const saveTx = new Transaction();
      saveTx.setSender(walletInfo.address);
      
      // Use ABI detection to build arguments dynamically
      const { buildSaveVersionArgs } = await import('../utils/AbiHelpers.js');
      const { args: saveArgs, signature: sig } = await buildSaveVersionArgs(saveTx, {
        spreadsheetObjectId,
        walrusBlobId,
        contentHash,
        cellCount,
        description,
        version: 'initial'
      });

      console.log('[BrowserSuiService] ABI detection result:', sig.debug || sig);

      // Validate contentHash if required by ABI
      if (sig.expectsContentHash && !contentHash) {
        throw new Error('Content hash is required by the deployed contract signature');
      }

      saveTx.moveCall({
        target: `${packageId}::spreadsheet::save_version`,
        arguments: saveArgs,
        typeArguments: []
      });

      await this.setDynamicGasBudget(saveTx, 'save_version');
      
      // Execute second transaction
      const saveResult = await this.executeTransaction(saveTx);
      console.log('[BrowserSuiService] ✅ Initial version saved successfully:', saveResult.digest);

      // Return combined results
      return {
        success: true,
        spreadsheetObjectId,
        createTransactionDigest: createResult.digest,
        saveTransactionDigest: saveResult.digest,
        objectChanges: [
          ...(createResult.objectChanges || []),
          ...(saveResult.objectChanges || [])
        ]
      };
    } catch (error) {
      console.error('[BrowserSuiService] ❌ Failed to create spreadsheet with initial version:', error);
      console.error('[BrowserSuiService] Error details:', {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack,
        walletConnected: this.walletManager.isConnected,
        config: this.config
      });
      throw error;
    }
  }

  // Create a transaction for locking a cell
  createLockCellTransaction(spreadsheetId, cellRef) {
    try {
      console.log('[BrowserSuiService] 🔒 Creating lock cell transaction:', spreadsheetId, cellRef);

      // Get wallet info for sender address
      const walletInfo = this.walletManager.getWalletInfo();
      if (!walletInfo || !walletInfo.connected || !walletInfo.address) {
        throw new Error('Wallet not connected - cannot create lock cell transaction');
      }

      console.log('[BrowserSuiService] Using sender address for lock:', walletInfo.address);

      // Create Transaction for cell locking
      const tx = new Transaction();
      console.log('[BrowserSuiService] ✅ Transaction created successfully for cell lock');

      // Set sender
      tx.setSender(walletInfo.address);
      console.log('[BrowserSuiService] ✅ Lock sender set:', walletInfo.address);

      // Set gas budget
      tx.setGasBudget(5_000_000); // 0.005 SUI
      console.log('[BrowserSuiService] ✅ Lock gas budget set: 5,000,000 MIST');

      // Call lock_cell function
      const { packageId } = this.config.getCurrentNetwork();

      console.log('[BrowserSuiService] 🔨 Building lock moveCall...');
      console.log('[BrowserSuiService] Target:', `${packageId}::spreadsheet::lock_cell`);
      console.log('[BrowserSuiService] Spreadsheet Object ID:', spreadsheetId);
      console.log('[BrowserSuiService] Cell Reference:', cellRef);

      tx.moveCall({
        target: `${packageId}::spreadsheet::lock_cell`,
        arguments: [
          tx.object(spreadsheetId), // Spreadsheet object ID
          tx.pure.string(cellRef), // Cell reference (e.g., "A1")
          tx.object('0x6') // Clock object - shared object at 0x6
        ],
        typeArguments: []
      });

      console.log('[BrowserSuiService] ✅ Lock cell transaction created successfully:', {
        spreadsheetId,
        cellRef
      });

      return tx;
    } catch (error) {
      console.error('[BrowserSuiService] ❌ Failed to create lock cell transaction:', error);
      console.error('[BrowserSuiService] Lock error details:', {
        message: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack,
        name: error.name
      });
      throw error;
    }
  }

  // Create a transaction for unlocking a cell
  createUnlockCellTransaction(spreadsheetId, cellRef) {
    try {
      console.log('[BrowserSuiService] 🔓 Creating unlock cell transaction:', spreadsheetId, cellRef);

      // Get wallet info for sender address
      const walletInfo = this.walletManager.getWalletInfo();
      if (!walletInfo || !walletInfo.connected || !walletInfo.address) {
        throw new Error('Wallet not connected - cannot create unlock cell transaction');
      }

      console.log('[BrowserSuiService] Using sender address for unlock:', walletInfo.address);

      // Create Transaction for cell unlocking
      const tx = new Transaction();
      console.log('[BrowserSuiService] ✅ Transaction created successfully for cell unlock');

      // Set sender
      tx.setSender(walletInfo.address);
      console.log('[BrowserSuiService] ✅ Unlock sender set:', walletInfo.address);

      // Set gas budget
      tx.setGasBudget(5_000_000); // 0.005 SUI
      console.log('[BrowserSuiService] ✅ Unlock gas budget set: 5,000,000 MIST');

      // Call unlock_cell function
      const { packageId } = this.config.getCurrentNetwork();

      console.log('[BrowserSuiService] 🔨 Building unlock moveCall...');
      console.log('[BrowserSuiService] Target:', `${packageId}::spreadsheet::unlock_cell`);
      console.log('[BrowserSuiService] Spreadsheet Object ID:', spreadsheetId);
      console.log('[BrowserSuiService] Cell Reference:', cellRef);

      tx.moveCall({
        target: `${packageId}::spreadsheet::unlock_cell`,
        arguments: [
          tx.object(spreadsheetId), // Spreadsheet object ID
          tx.pure.string(cellRef), // Cell reference (e.g., "A1")
          tx.object('0x6') // Clock object - shared object at 0x6
        ],
        typeArguments: []
      });

      console.log('[BrowserSuiService] ✅ Unlock cell transaction created successfully:', {
        spreadsheetId,
        cellRef
      });

      return tx;
    } catch (error) {
      console.error('[BrowserSuiService] ❌ Failed to create unlock cell transaction:', error);
      console.error('[BrowserSuiService] Unlock error details:', {
        message: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack,
        name: error.name
      });
      throw error;
    }
  }

  // Execute a transaction using the connected wallet with queue management
  async executeTransaction(transaction) {
    logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'tx_queue', 'Queuing transaction execution');

    return new Promise((resolve, reject) => {
      // Add to queue with a unique identifier and promise resolvers
      const queueItem = {
        id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        transaction,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.transactionQueue.push(queueItem);
      logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'tx_queued', `Transaction added to queue`, {
        queuePosition: this.transactionQueue.length,
        txId: queueItem.id
      });

      // Start processing if not already running
      this._processTransactionQueue();
    });
  }

  // Process the transaction queue one at a time
  async _processTransactionQueue() {
    if (this.isProcessingTransaction) {
      logger.throttleDebug('tx-queue-wait', LogComponent.BLOCKCHAIN_ADAPTER, 'tx_queue_wait',
        'Transaction already in progress, waiting', {}, 30000);
      return;
    }

    if (this.transactionQueue.length === 0) {
      logger.throttleDebug('tx-queue-empty', LogComponent.BLOCKCHAIN_ADAPTER, 'tx_queue_empty',
        'Transaction queue is empty', {}, 60000);
      return;
    }

    this.isProcessingTransaction = true;
    const queueItem = this.transactionQueue.shift();

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'tx_processing', `Processing transaction ${queueItem.id}`, {
      queueRemaining: this.transactionQueue.length
    });

    try {
      const result = await this._executeTransactionInternal(queueItem.transaction);
      queueItem.resolve(result);
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'tx_success', `Transaction completed successfully`, {
        txId: queueItem.id
      });
    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'tx_failed', `Transaction failed`, {
        txId: queueItem.id,
        error: error.message
      });
      queueItem.reject(error);
    } finally {
      this.isProcessingTransaction = false;

      // Process next transaction in queue if any
      if (this.transactionQueue.length > 0) {
        logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'tx_queue_next', `Processing next transaction in queue`, {
          queueRemaining: this.transactionQueue.length
        });
        setTimeout(() => this._processTransactionQueue(), 100); // Small delay to prevent tight loops
      }
    }
  }

  // Internal transaction execution (the original executeTransaction logic)
  async _executeTransactionInternal(transaction) {
    try {
      logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'tx_execute', 'Starting transaction execution');

      const walletInfo = this.walletManager.getWalletInfo();
      if (!walletInfo.connected) {
        console.error('[BrowserSuiService] ❌ Transaction failed: wallet not connected');
        throw new Error('Wallet not connected');
      }

      console.log('[BrowserSuiService] ✅ Wallet verified, passing Transaction to wallet...');
      
      // Pass Transaction object directly to wallet (do NOT build/serialize)
      // The wallet will handle building internally per Sui documentation
      console.log('[BrowserSuiService] 📝 Requesting wallet signature for Transaction...');
      console.error('🚀 DEBUG: About to call wallet signAndExecuteTransaction', {
        hasWalletManager: !!this.walletManager,
        walletConnected: walletInfo.connected,
        transactionType: transaction.constructor.name
      });
      
      // Use wallet to sign and execute the transaction object directly
      const result = await this.walletManager.signAndExecuteTransaction({
        transaction: transaction,  // Use standardized 'transaction' property name
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
          showBalanceChanges: true
        }
      });
      
      console.log('[BrowserSuiService] ✅ Transaction executed successfully:', {
        digest: result.digest,
        hasObjectChanges: !!result.objectChanges,
        hasEffects: !!result.effects,
        hasEvents: !!result.events,
        eventCount: result.events?.length || 0,
        events: result.events
      });
      
      // If objectChanges is missing, query the transaction block directly with retry
      let finalObjectChanges = result.objectChanges;
      let finalEffects = result.effects;
      
      if (!result.objectChanges || result.objectChanges.length === 0) {
        console.log('[BrowserSuiService] 🔍 ObjectChanges missing, querying transaction block...');
        
        // Retry logic for transaction queries
        let attempts = 0;
        const maxAttempts = 3;
        const retryDelay = 1000; // 1 second
        
        while (attempts < maxAttempts && (!finalObjectChanges || finalObjectChanges.length === 0)) {
          try {
            if (attempts > 0) {
              console.log(`[BrowserSuiService] 🔄 Retry ${attempts}/${maxAttempts} - waiting ${retryDelay}ms...`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
            
            const transactionBlock = await this.client.getTransactionBlock({
              digest: result.digest,
              options: {
                showEffects: true,
                showEvents: true,
                showObjectChanges: true,
                showBalanceChanges: true,
                showInput: true
              }
            });
            
            console.log('[BrowserSuiService] 📋 Transaction block details:', {
              digest: transactionBlock.digest,
              hasObjectChanges: !!transactionBlock.objectChanges,
              objectChangesLength: transactionBlock.objectChanges?.length || 0,
              hasEffects: !!transactionBlock.effects,
              attempt: attempts + 1
            });
            
            finalObjectChanges = transactionBlock.objectChanges || result.objectChanges;
            finalEffects = transactionBlock.effects || result.effects;
            
            // Also get events
            if (transactionBlock.events) {
              result.events = transactionBlock.events;
              console.log('[BrowserSuiService] 📋 Found events in transaction block:', {
                eventCount: transactionBlock.events.length,
                eventTypes: transactionBlock.events.map(e => e.type)
              });
            }
            
            if (finalObjectChanges && finalObjectChanges.length > 0) {
              console.log('[BrowserSuiService] ✅ Successfully retrieved objectChanges on attempt', attempts + 1);
              break;
            }
            
          } catch (error) {
            console.error(`[BrowserSuiService] ❌ Failed to query transaction block (attempt ${attempts + 1}):`, typeof error === 'string' ? error : (error && error.message) || 'Unknown error');
          }
          
          attempts++;
        }
        
        // If we still don't have object changes, try to extract from effects
        if (!finalObjectChanges || finalObjectChanges.length === 0) {
          console.log('[BrowserSuiService] 🔍 Attempting to extract object changes from effects...');
          try {
            if (finalEffects?.created && finalEffects.created.length > 0) {
              finalObjectChanges = finalEffects.created.map(created => ({
                type: 'created',
                sender: finalEffects.gasObject?.owner || result.sender,
                owner: created.owner,
                objectType: created.reference?.objectType || 'unknown',
                objectId: created.reference?.objectId,
                version: created.reference?.version,
                digest: created.reference?.digest
              }));
              console.log('[BrowserSuiService] ✅ Extracted objectChanges from effects:', finalObjectChanges);
            }
          } catch (effectsError) {
            console.warn('[BrowserSuiService] ⚠️ Could not extract from effects:', typeof effectsError === 'string' ? effectsError : effectsError.message || 'Unknown error');
          }
        }
      }
      
      return {
        success: true,
        digest: result.digest,
        objectChanges: finalObjectChanges,
        effects: finalEffects,
        balanceChanges: result.balanceChanges,
        events: result.events || []
      };
      
    } catch (error) {
      console.error('[BrowserSuiService] ❌ Transaction execution failed:', {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack,
        walletConnected: this.walletManager.getWalletInfo()?.connected || false
      });
      
      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        details: {
          walletConnected: this.walletManager.getWalletInfo()?.connected || false,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  // Estimate gas for a transaction
  async estimateGas(transaction) {
    try {
      console.log('[BrowserSuiService] 💰 Estimating gas for transaction...');

      // For Sui SDK v1.0, use the transaction object directly
      // Check if we need to build the transaction first
      let transactionBlock;

      if (typeof transaction.build === 'function') {
        try {
          transactionBlock = await transaction.build({ client: this.client });
        } catch (buildError) {
          console.warn('[BrowserSuiService] Transaction build failed, using transaction directly:', typeof buildError === 'string' ? buildError : buildError.message || 'Unknown error');
          transactionBlock = transaction;
        }
      } else {
        transactionBlock = transaction;
      }

      // Dry run the transaction to get gas estimate
      const dryRunResult = await this.client.dryRunTransactionBlock({
        transactionBlock: transactionBlock
      });

      if (!dryRunResult || !dryRunResult.effects) {
        throw new Error('Dry run failed: Invalid response from Sui client');
      }

      const gasUsed = dryRunResult.effects.gasUsed;
      if (!gasUsed) {
        throw new Error('Gas estimation failed: No gas usage data in dry run result');
      }

      const computationCost = parseInt(gasUsed.computationCost || '0');
      const storageCost = parseInt(gasUsed.storageCost || '0');
      const storageRebate = parseInt(gasUsed.storageRebate || '0');

      const totalGasUsed = computationCost + storageCost - storageRebate;
      const estimatedCostSUI = (totalGasUsed / 1_000_000_000).toFixed(6);

      console.log('[BrowserSuiService] Gas estimation completed:', {
        computationCost,
        storageCost,
        storageRebate,
        totalGasUsed,
        estimatedCostSUI
      });

      return {
        computationCost,
        storageCost,
        storageRebate,
        totalCost: totalGasUsed,
        totalGasUsed,
        gasPrice: 1000, // Standard gas price
        estimatedCostSUI,
        isHighGas: totalGasUsed > 50_000_000 // Flag if over 50M MIST
      };
    } catch (error) {
      console.error('[BrowserSuiService] Gas estimation failed:', error);

      // Check if this is a "notExists" error indicating stale object references
      const errorMessage = typeof error === 'string' ? error : (error && error.message) || 'Unknown error';
      if (errorMessage.includes('notExists') || errorMessage.includes('object does not exist')) {
        console.warn('[BrowserSuiService] Gas estimation failed due to invalid objects, clearing cache...');

        // Clear any cached object references that might be stale
        this.clearInvalidObjectCache();

        // Notify error recovery service about the invalid object
        if (typeof window !== 'undefined' && window.walSheetzErrorRecovery) {
          window.walSheetzErrorRecovery.handleError(error, {
            component: 'gas_estimation',
            action: 'estimate_gas',
            operation: 'gas_estimation'
          });
        }
      }

      // Return conservative estimate on failure
      const defaultGas = 5_000_000;
      return {
        computationCost: 3_000_000,
        storageCost: 2_000_000,
        storageRebate: 0,
        totalCost: defaultGas,
        totalGasUsed: defaultGas,
        gasPrice: 1000,
        estimatedCostSUI: (defaultGas / 1_000_000_000).toFixed(6),
        isHighGas: false,
        isEstimate: true,
        cacheCleared: errorMessage.includes('notExists')
      };
    }
  }

  // Check if wallet has sufficient balance for transaction
  async checkSufficientBalance(estimatedGas) {
    try {
      console.log('[BrowserSuiService] 💰 Checking sufficient balance for gas...');
      const walletInfo = this.walletManager.getWalletInfo();
      
      if (!walletInfo || !walletInfo.connected || !walletInfo.address) {
        console.log('[BrowserSuiService] ❌ No wallet connected for balance check');
        return { sufficient: false, error: 'No wallet connected' };
      }

      console.log('[BrowserSuiService] Wallet info for balance check:', {
        connected: walletInfo.connected,
        address: walletInfo.address?.slice(0, 8) + '...'
      });

      // Get current balance using Sui client
      const balance = await this.client.getBalance({
        owner: walletInfo.address
      });
      
      const totalBalanceMIST = parseInt(balance.totalBalance || '0');
      const requiredGasMIST = parseInt(estimatedGas.totalGasUsed || estimatedGas.totalCost || 5_000_000);
      
      // Add 20% buffer for gas price fluctuations
      const requiredWithBuffer = Math.floor(requiredGasMIST * 1.2);

      const sufficient = totalBalanceMIST >= requiredWithBuffer;

      const result = {
        sufficient,
        currentBalance: totalBalanceMIST.toString(),
        currentBalanceSUI: (totalBalanceMIST / 1_000_000_000).toFixed(6),
        requiredGas: requiredGasMIST.toString(),
        requiredGasSUI: (requiredGasMIST / 1_000_000_000).toFixed(6),
        requiredWithBufferSUI: (requiredWithBuffer / 1_000_000_000).toFixed(6)
      };

      // Add reason and message for insufficient balance
      if (!sufficient) {
        result.reason = 'insufficient_balance';
        result.message = `Insufficient SUI balance. Need ${result.requiredWithBufferSUI} SUI but only have ${result.currentBalanceSUI} SUI.`;
        result.needed = result.requiredWithBufferSUI;
        result.available = result.currentBalanceSUI;
      }

      console.log('[BrowserSuiService] Balance check completed:', {
        sufficient: result.sufficient,
        currentBalanceSUI: result.currentBalanceSUI,
        requiredWithBufferSUI: result.requiredWithBufferSUI
      });

      return result;
    } catch (error) {
      console.error('[BrowserSuiService] Failed to check balance:', error);
      return {
        sufficient: false, // Fail closed - do not allow transaction when balance cannot be determined
        reason: 'balance_check_failed',
        error: `Balance check failed: ${typeof error === 'string' ? error : (error && error.message) || 'Unknown error'}`,
        currentBalance: '0',
        currentBalanceSUI: '0.000000',
        message: 'Unable to verify wallet balance. Please check your connection and try again.'
      };
    }
  }

  // Get wallet balance
  async getBalance(address) {
    try {
      const balance = await this.client.getBalance({
        owner: address,
        coinType: '0x2::sui::SUI'
      });
      
      return {
        success: true,
        totalBalance: balance.totalBalance,
        coinObjectCount: balance.coinObjectCount
      };
    } catch (error) {
      console.error('[BrowserSuiService] Failed to get balance:', error);
      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        totalBalance: '0',
        coinObjectCount: 0
      };
    }
  }

  // Get transaction details
  async getTransactionDetails(digest) {
    try {
      const transaction = await this.client.getTransactionBlock({
        digest,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
          showBalanceChanges: true,
          showInput: true
        }
      });

      return {
        success: true,
        data: transaction
      };
    } catch (error) {
      console.error('[BrowserSuiService] Failed to get transaction details:', error);
      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      };
    }
  }

  // Subscribe to blockchain events
  subscribeToEvents(callback) {
    console.log('[BrowserSuiService] Setting up event subscription...');
    
    // Note: For browser-based event subscription, we'd need to implement
    // polling or WebSocket connection to Sui RPC endpoint
    // For now, we'll store the callback for manual event triggering
    this.eventListeners.set('default', callback);
    
    console.log('[BrowserSuiService] Event subscription configured');
  }

  // Trigger event for testing (would normally come from blockchain)
  triggerEvent(eventType, data) {
    const callback = this.eventListeners.get('default');
    if (callback) {
      callback({
        type: eventType,
        data: data
      });
    }
  }

  // Get owned objects for an address
  async getOwnedObjects(address, options = {}) {
    try {
      const result = await this.client.getOwnedObjects({
        owner: address,
        filter: options.filter,
        options: {
          showContent: true,
          showOwner: true,
          showType: true,
          ...options
        }
      });
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('[BrowserSuiService] Failed to get owned objects:', error);
      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      };
    }
  }

  // Get current epoch info
  async getCurrentEpoch() {
    try {
      const epochInfo = await this.client.getLatestSuiSystemState();
      return {
        success: true,
        epoch: epochInfo.epoch,
        epochStartTimestampMs: epochInfo.epochStartTimestampMs,
        epochDurationMs: epochInfo.epochDurationMs,
        referenceGasPrice: epochInfo.referenceGasPrice
      };
    } catch (error) {
      console.error('[BrowserSuiService] Failed to get epoch info:', error);
      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      };
    }
  }

  // Check if connected
  isConnected() {
    // Since we're using HTTP client, connection is based on successful RPC calls
    return true;
  }

  // Get status of the service
  getStatus() {
    const walletInfo = this.walletManager.getWalletInfo();
    const network = this.config ? this.config.getCurrentNetwork() : null;
    const status = {
      connected: true, // HTTP client is always "connected"
      rpcUrl: this.config ? this.config.getServiceUrl('sui-rpc') : null,
      packageId: network ? network.packageId : null,
      registryObjectId: network ? network.registryObjectId : null,
      walletConnected: walletInfo.connected,
      walletAddress: walletInfo.address?.slice(0, 8) + '...' || null,
      currentSpreadsheetId: this.currentSpreadsheetId,
      timestamp: new Date().toISOString()
    };

    console.log('[BrowserSuiService] 📊 Service status requested:', status);
    return status;
  }

  // Get user's owned spreadsheets
  async getUserSpreadsheets(address) {
    try {
      console.log('[BrowserSuiService] 📋 Fetching spreadsheets for address:', address);
      
      const packageId = await this.getPackageId();
      const packageIdNormalized = packageId.startsWith('0x')
        ? packageId
        : `0x${packageId}`;
      
      console.log('[BrowserSuiService] Using package ID:', packageIdNormalized);

      // Since spreadsheets are shared objects, we need to query transaction history
      // to find spreadsheets created or modified by this user
      let spreadsheetObjects = [];
      
      try {
        // Query the user's transaction history to find spreadsheet creation/modification events
        const txResponse = await this.client.queryTransactionBlocks({
          filter: {
            FromAddress: address,
          },
          options: {
            showEvents: true,
            showEffects: true,
            showObjectChanges: true,
          },
          limit: 50, // Get recent transactions
        });

        const spreadsheetIds = new Set();
        
        // Extract spreadsheet IDs from events and object changes
        for (const tx of txResponse.data) {
          // Check events for SpreadsheetCreated and VersionSaved
          if (tx.events) {
            for (const event of tx.events) {
              if (event.packageId === packageIdNormalized && 
                  (event.type.includes('::SpreadsheetCreated') || 
                   event.type.includes('::VersionSaved'))) {
                if (event.parsedJson?.spreadsheet_id) {
                  spreadsheetIds.add(event.parsedJson.spreadsheet_id);
                }
              }
            }
          }
          
          // Check object changes for spreadsheet mutations/creations
          if (tx.objectChanges) {
            for (const change of tx.objectChanges) {
              if (change.objectType && 
                  change.objectType.includes(`${packageIdNormalized}::spreadsheet::Spreadsheet`)) {
                spreadsheetIds.add(change.objectId);
              }
            }
          }
        }

        console.log('[BrowserSuiService] Found spreadsheet IDs from transactions:', Array.from(spreadsheetIds));

        // Now fetch the actual spreadsheet objects
        for (const spreadsheetId of spreadsheetIds) {
          try {
            const obj = await this.client.getObject({
              id: spreadsheetId,
              options: {
                showContent: true,
                showOwner: true,
                showType: true
              }
            });
            
            if (obj.data && obj.data.content) {
              spreadsheetObjects.push(obj.data);
            }
          } catch (objError) {
            console.warn('[BrowserSuiService] Failed to fetch spreadsheet object:', spreadsheetId, typeof objError === 'string' ? objError : objError.message || 'Unknown error');
          }
        }

        console.log('[BrowserSuiService] Successfully fetched', spreadsheetObjects.length, 'spreadsheet objects');

      } catch (queryError) {
        console.warn('[BrowserSuiService] Transaction query failed:', typeof queryError === 'string' ? queryError : queryError.message || 'Unknown error');
        
        // Fallback: try owned objects (shouldn't work for shared objects, but let's keep it)
        try {
          const result = await this.client.getOwnedObjects({
            owner: address,
            filter: {
              StructType: `${packageIdNormalized}::spreadsheet::Spreadsheet`
            },
            options: {
              showContent: true,
              showOwner: true,
              showType: true
            }
          });
          
          if (result.data && result.data.length > 0) {
            spreadsheetObjects = result.data.map(item => item.data);
          }
        } catch (ownedError) {
          console.warn('[BrowserSuiService] Owned objects fallback failed:', typeof ownedError === 'string' ? ownedError : ownedError.message || 'Unknown error');
        }
      }

      // Parse spreadsheet metadata from the fetched objects  
      const spreadsheets = spreadsheetObjects
        .filter(item => {
          // Ensure we have content and basic required fields
          const content = item.content;
          const fields = content?.fields;
          
          // Validate this is actually a spreadsheet object
          const hasRequiredFields = fields && (
            fields.title !== undefined ||
            fields.version_count !== undefined ||
            fields.cell_locks !== undefined
          );
          
          if (!hasRequiredFields) {
            console.log('[BrowserSuiService] Skipping invalid object:', {
              objectId: item.objectId?.slice(0, 16) + '...',
              type: item.type?.slice(-30),
              hasContent: !!content,
              fields: fields ? Object.keys(fields) : []
            });
          }
          
          return hasRequiredFields;
        })
        .map(item => {
          const content = item.content;
          const spreadsheet = {
            objectId: item.objectId,
            title: content.fields?.title || 'Untitled Spreadsheet',
            owner: content.fields?.owner || address,
            created_at: content.fields?.created_at ? parseInt(content.fields.created_at) : Date.now(),
            last_modified: content.fields?.last_modified ? parseInt(content.fields.last_modified) : Date.now(),
            version_count: content.fields?.version_count ? parseInt(content.fields.version_count) : 0,
            current_version: content.fields?.current_version,
            version_history: content.fields?.version_history || [], // Include version history array
            is_public: content.fields?.is_public || false,
            type: item.type // Include type for debugging
          };
          
          console.log('[BrowserSuiService] Valid spreadsheet found:', {
            objectId: spreadsheet.objectId?.slice(0, 16) + '...',
            title: spreadsheet.title,
            version_count: spreadsheet.version_count,
            type: item.type?.slice(-40)
          });
          
          return spreadsheet;
        })
        .sort((a, b) => b.last_modified - a.last_modified); // Sort by most recent

      console.log(`[BrowserSuiService] ✅ Found ${spreadsheets.length} spreadsheets`);
      return spreadsheets;
    } catch (error) {
      console.error('[BrowserSuiService] ❌ Failed to get user spreadsheets:', error);
      throw error;
    }
  }

  // Enhanced version retrieval that queries Version objects directly (fallback method)
  async getEnhancedSpreadsheetVersions(spreadsheetId) {
    try {
      const packageId = await this.getPackageId()
      console.log('[BrowserSuiService] 🔍 Using enhanced version retrieval for spreadsheet:', spreadsheetId)

      // Query all Version objects and filter client-side by spreadsheet_id
      const result = await this.client.queryObjects({
        query: { StructType: `${packageId}::spreadsheet::Version` },
        options: { showContent: true, showOwner: true, showType: true }
      })

      const versions = (result?.data || [])
        .filter(item => item?.data?.content?.fields)
        .map(item => {
          const content = item.data.content
          const fields = content.fields
          return {
            objectId: item.data.objectId,
            spreadsheet_id: fields?.spreadsheet_id || spreadsheetId,
            version_number: fields?.version_number ? parseInt(fields.version_number) : 1,
            parent_version: fields?.parent_version,
            walrus_blob_id: fields?.walrus_blob_id,
            content_hash: fields?.content_hash,
            cell_count: fields?.cell_count ? parseInt(fields.cell_count) : 0,
            created_at: fields?.created_at ? parseInt(fields.created_at) : Date.now(),
            created_by: fields?.created_by,
            description: fields?.description || 'Version'
          }
        })
        .filter(v => v.spreadsheet_id === spreadsheetId)
        .sort((a, b) => b.version_number - a.version_number)

      console.log(`[BrowserSuiService] ✅ Enhanced query found ${versions.length} versions for spreadsheet ${spreadsheetId}`)
      return versions
    } catch (error) {
      console.warn('[BrowserSuiService] Enhanced versions query failed, falling back to none:', error?.message)
      return []
    }
  }

  // Get spreadsheet versions for a specific spreadsheet using version_history from the spreadsheet object
  async getSpreadsheetVersions(spreadsheetId) {
    try {
      console.log('[BrowserSuiService] 📝 Fetching versions for spreadsheet:', spreadsheetId);

      // First, get the spreadsheet object to access its version_history field
      console.log('[BrowserSuiService] Getting spreadsheet object to access version_history...');
      
      const spreadsheetResult = await this.client.getObject({
        id: spreadsheetId,
        options: {
          showContent: true,
          showOwner: true,
          showType: true
        }
      });

      if (!spreadsheetResult.data) {
        throw new Error('Spreadsheet object not found');
      }

      const rawHistory = spreadsheetResult.data.content?.fields?.version_history
      const versionHistory = Array.isArray(rawHistory) ? rawHistory : []

      console.log('[BrowserSuiService] Found version history:', {
        type: typeof rawHistory,
        isArray: Array.isArray(rawHistory),
        count: versionHistory.length,
        versionIds: versionHistory.slice(0, 3) // Show first 3 for debugging
      });

      if (!Array.isArray(rawHistory) || versionHistory.length === 0) {
        // Fallback: use current_version if history is empty/malformed
        const currentVersion = spreadsheetResult.data.content?.fields?.current_version
        if (currentVersion && currentVersion !== '0x0') {
          console.warn('[BrowserSuiService] version_history empty; using current_version fallback:', currentVersion)

          const vObj = await this.client.getObject({
            id: currentVersion,
            options: { showContent: true, showOwner: true, showType: true }
          })

          const vf = vObj?.data?.content?.fields
          if (vf) {
            const v = {
              objectId: vObj.data.objectId,
              spreadsheet_id: vf.spreadsheet_id || spreadsheetId,
              version_number: vf.version_number ? parseInt(vf.version_number) : 1,
              parent_version: vf.parent_version,
              walrus_blob_id: vf.walrus_blob_id,
              content_hash: vf.content_hash,
              cell_count: vf.cell_count ? parseInt(vf.cell_count) : 0,
              created_at: vf.created_at ? parseInt(vf.created_at) : Date.now(),
              created_by: vf.created_by,
              description: vf.description || 'Version'
            }
            return [v]
          }
        }

        console.log('[BrowserSuiService] No versions found in object fields')
        return []
      }

      // Fetch all version objects by their IDs
      console.log('[BrowserSuiService] Fetching version objects...');
      const versionObjects = await this.client.multiGetObjects({
        ids: versionHistory,
        options: {
          showContent: true,
          showOwner: true,
          showType: true
        }
      });

      // Process the version objects
      const versions = versionObjects
        ?.filter(result => result.data && result.data.content?.fields)
        .map(result => {
          const content = result.data.content;
          const fields = content.fields;
          
          return {
            objectId: result.data.objectId,
            spreadsheet_id: fields?.spreadsheet_id || spreadsheetId,
            version_number: fields?.version_number ? parseInt(fields.version_number) : 1,
            parent_version: fields?.parent_version,
            walrus_blob_id: fields?.walrus_blob_id,
            content_hash: fields?.content_hash,
            cell_count: fields?.cell_count ? parseInt(fields.cell_count) : 0,
            created_at: fields?.created_at ? parseInt(fields.created_at) : Date.now(),
            created_by: fields?.created_by,
            description: fields?.description || 'Version'
          };
        })
        .sort((a, b) => b.version_number - a.version_number) || []; // Sort by version number desc

      console.log(`[BrowserSuiService] ✅ Found ${versions.length} versions for spreadsheet ${spreadsheetId}`);
      
      if (versions.length > 0) {
        console.log('[BrowserSuiService] Latest version details:', {
          version_number: versions[0].version_number,
          walrus_blob_id: versions[0].walrus_blob_id,
          description: versions[0].description
        });
      }
      
      return versions;
    } catch (error) {
      console.error('[BrowserSuiService] ❌ Failed to get spreadsheet versions:', error);
      return []
    }
  }

  // Get latest version data for a spreadsheet
  async getSpreadsheetData(spreadsheetId, walrusService, onProgress = null) {
    const loadId = `sui-load-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    try {
      console.log(`[BrowserSuiService:${loadId}] 📊 Loading spreadsheet data`, {
        spreadsheetId,
        hasProgress: !!onProgress,
        timestamp: new Date().toISOString()
      });

      if (onProgress) onProgress('Loading spreadsheet...', 'Getting version information...');
      
      const versionFetchStart = Date.now();
      let versions = await this.getSpreadsheetVersions(spreadsheetId);
      const versionFetchDuration = Date.now() - versionFetchStart;

      console.log(`[BrowserSuiService:${loadId}] 📝 Version fetch complete`, {
        versionCount: versions.length,
        fetchDuration: `${versionFetchDuration}ms`,
        hasVersions: versions.length > 0,
        latestVersion: versions[0]?.version_number
      });


      if (!versions || versions.length === 0) {
        console.warn(`[BrowserSuiService:${loadId}] ⚠️ No versions found for spreadsheet, returning empty spreadsheet data`);
        // Handle spreadsheets that were created but never had data saved
        // This can happen if initial version save failed
        return {
          spreadsheetData: {
            success: true,
            data: {
              cells: {},
              metadata: {
                title: 'Empty Spreadsheet',
                cellCount: 0,
                created: new Date().toISOString(),
                lastModified: new Date().toISOString()
              }
            }
          },
          version: null,
          allVersions: [],
          isEmptySpreadsheet: true // Flag to indicate this is an empty spreadsheet
        };
      }

      const latestVersion = versions[0];
      
      // Retrieve data from Walrus using the blob ID
      if (!latestVersion.walrus_blob_id) {
        console.warn('[BrowserSuiService] ⚠️ No Walrus blob ID found, returning empty spreadsheet data');
        // Return empty spreadsheet structure for new spreadsheets
        return {
          spreadsheetData: {
            success: true,
            data: {
              cells: {},
              metadata: {
                title: 'Empty Spreadsheet',
                cellCount: 0
              }
            }
          },
          version: latestVersion,
          allVersions: versions
        };
      }

      console.log(`[BrowserSuiService:${loadId}] 🗃️ Loading data from Walrus blob`, {
        walrusBlobId: latestVersion.walrus_blob_id,
        versionNumber: latestVersion.version_number,
        cellCount: latestVersion.cell_count,
        createdAt: new Date(latestVersion.created_at).toISOString()
      });
      
      // Connect to Walrus first if needed
      if (onProgress) onProgress('Loading spreadsheet...', 'Downloading from Walrus storage...');
      
      const walrusConnectStart = Date.now();
      await walrusService.connect();
      const walrusConnectDuration = Date.now() - walrusConnectStart;
      
      console.log(`[BrowserSuiService:${loadId}] 🌊 Walrus connected`, {
        connectDuration: `${walrusConnectDuration}ms`
      });
      
      const blobRetrieveStart = Date.now();
      const blobResult = await walrusService.retrieveBlob(
        latestVersion.walrus_blob_id,
        latestVersion.content_hash || null
      );
      const blobRetrieveDuration = Date.now() - blobRetrieveStart;
      
      if (!blobResult.success) {
        console.error(`[BrowserSuiService:${loadId}] ❌ Blob retrieval failed`, {
          error: blobResult.error,
          blobId: latestVersion.walrus_blob_id,
          duration: `${blobRetrieveDuration}ms`
        });
        throw new Error(`Failed to retrieve blob from Walrus: ${blobResult.error}`);
      }

      const totalDuration = Date.now() - startTime;
      console.log(`[BrowserSuiService:${loadId}] ✅ Spreadsheet data loaded successfully from Walrus`, {
        blobId: latestVersion.walrus_blob_id,
        size: blobResult.metadata?.size,
        version: latestVersion.version_number,
        blobRetrieveDuration: `${blobRetrieveDuration}ms`,
        totalDuration: `${totalDuration}ms`,
        celldata: blobResult.data?.celldata?.length || 0
      });
      
      return {
        spreadsheetData: blobResult,
        version: latestVersion,
        allVersions: versions
      };
    } catch (error) {
      console.error('[BrowserSuiService] ❌ Failed to get spreadsheet data:', error);
      throw error;
    }
  }

  // Delete a spreadsheet completely (WARNING: This is permanent!)
  async deleteSpreadsheet(spreadsheetId) {
    try {
      console.log('[BrowserSuiService] 🗑️ Starting permanent deletion of spreadsheet:', spreadsheetId);
      
      // Get wallet info for sender address
      const walletInfo = this.walletManager.getWalletInfo();
      if (!walletInfo || !walletInfo.connected || !walletInfo.address) {
        throw new Error('Wallet not connected - cannot delete spreadsheet');
      }

      console.log('[BrowserSuiService] 📋 Fetching spreadsheet and versions for deletion...');
      
      // First, get the spreadsheet object
      const spreadsheetResult = await this.client.getObject({
        id: spreadsheetId,
        options: { showContent: true, showOwner: true, showType: true }
      });

      if (!spreadsheetResult.data) {
        throw new Error('Spreadsheet not found');
      }

      // Verify ownership - handle shared objects correctly
      const isSharedObject = spreadsheetResult.data.owner?.Shared !== undefined;
      let owner;

      if (isSharedObject) {
        // For shared objects, owner is stored in the object's fields
        owner = spreadsheetResult.data.content?.fields?.owner;
      } else {
        // For owned objects (shouldn't happen with spreadsheets, but handle it)
        owner = spreadsheetResult.data.owner?.AddressOwner;
      }

      if (!owner) {
        console.error('[BrowserSuiService] Could not determine spreadsheet owner', {
          ownerField: spreadsheetResult.data.owner,
          contentFields: spreadsheetResult.data.content?.fields
        });
        throw new Error('Could not verify spreadsheet ownership');
      }

      if (owner !== walletInfo.address) {
        console.error('[BrowserSuiService] Ownership verification failed', {
          expectedOwner: walletInfo.address,
          actualOwner: owner
        });
        throw new Error('You can only delete spreadsheets you own');
      }

      // Get all version objects that need to be deleted
      const versionHistory = spreadsheetResult.data.content?.fields?.version_history || [];
      
      console.log(`[BrowserSuiService] 📚 Found ${versionHistory.length} versions to delete`);
      
      if (versionHistory.length === 0) {
        console.warn('[BrowserSuiService] ⚠️ No versions found, proceeding with spreadsheet-only deletion');
      }

      // Fetch all version objects with enhanced error handling
      let versionObjects = [];
      if (versionHistory.length > 0) {
        try {
          console.log(`[BrowserSuiService] 🔍 Fetching ${versionHistory.length} version objects...`, versionHistory);
          
          const versionResults = await this.client.multiGetObjects({
            ids: versionHistory,
            options: { showContent: true, showOwner: true, showType: true }
          });

          console.log(`[BrowserSuiService] 📦 Raw version results:`, versionResults.map((result, index) => ({
            index,
            id: versionHistory[index],
            hasData: !!result.data,
            error: result.error || null
          })));

          versionObjects = versionResults
            .filter((result, index) => {
              if (!result.data) {
                console.warn(`[BrowserSuiService] ⚠️ Version object not found: ${versionHistory[index]}`, result.error);
                return false;
              }
              return true;
            })
            .map(result => result.data);
          
          console.log(`[BrowserSuiService] ✅ Successfully retrieved ${versionObjects.length}/${versionHistory.length} version objects`);
          
          // If we couldn't fetch all versions, log this as a warning but continue
          if (versionObjects.length !== versionHistory.length) {
            console.warn(`[BrowserSuiService] ⚠️ Some version objects could not be fetched - this might indicate deleted or inaccessible versions`);
          }
        } catch (error) {
          console.error('[BrowserSuiService] ❌ Failed to fetch version objects:', error);
          // Continue with deletion attempt anyway - the Move contract might handle missing versions gracefully
          console.log('[BrowserSuiService] 🔄 Continuing with deletion despite version fetching error...');
        }
      }

      // Create Transaction for deletion
      const tx = new Transaction();
      console.log('[BrowserSuiService] ✅ Transaction created successfully for deletion');

      tx.setSender(walletInfo.address);
      console.log('[BrowserSuiService] ✅ Deletion sender set:', walletInfo.address);

      console.log('[BrowserSuiService] 🔨 Building deletion transaction...');

      const packageId = await this.getPackageId();
      const registryObjectId = await this.getRegistryObjectId();

      // Choose the correct deletion function based on whether versions exist
      if (versionHistory.length === 0) {
        console.log('[BrowserSuiService] 📄 Using simple deletion (no versions)');
        // Use simple delete_spreadsheet for spreadsheets with no versions
        tx.moveCall({
          target: `${packageId}::spreadsheet::delete_spreadsheet`,
          arguments: [
            tx.object(registryObjectId), // Registry object
            tx.object(spreadsheetId), // Spreadsheet object to delete
          ],
          typeArguments: []
        });
      } else {
        console.log(`[BrowserSuiService] 📚 Using comprehensive deletion (${versionHistory.length} versions)`);
        // Check if we have more versions than the batch size limit (50)
        if (versionHistory.length > 50) {
          throw new Error(`Too many versions to delete in one transaction: ${versionHistory.length}. Maximum is 50. Consider implementing batch deletion.`);
        }

        // Use delete_spreadsheet_with_versions for complete deletion
        tx.moveCall({
          target: `${packageId}::spreadsheet::delete_spreadsheet_with_versions`,
          arguments: [
            tx.object(registryObjectId), // Registry object
            tx.object(spreadsheetId), // Spreadsheet object to delete
            tx.makeMoveVec({
              type: `${packageId}::spreadsheet::Version`,
              elements: versionHistory.map(versionId => tx.object(versionId))
            }) // All version objects
          ],
          typeArguments: []
        });
      }

      console.log('[BrowserSuiService] 💸 Estimating gas for deletion...');
      
      // Estimate gas
      const estimatedGas = await this.estimateGas(tx);
      console.log(`[BrowserSuiService] ⛽ Estimated gas for deletion: ${estimatedGas.totalGasUsed} MIST`);

      // Check balance
      const hasBalance = await this.checkSufficientBalance(estimatedGas);
      if (!hasBalance) {
        throw new Error('Insufficient SUI balance for deletion transaction');
      }

      // Log transaction details for debugging
      console.log('[BrowserSuiService] 📋 Transaction summary:', {
        deletionType: versionHistory.length === 0 ? 'simple' : 'with_versions',
        spreadsheetId: spreadsheetId,
        versionCount: versionHistory.length,
        versionIds: versionHistory,
        registryId: registryObjectId,
        packageId: packageId
      });

      console.log('[BrowserSuiService] 🚀 Executing deletion transaction...');
      
      // Execute the transaction
      const result = await this.executeTransaction(tx);

      // Check if transaction actually succeeded
      if (!result.success) {
        console.error('[BrowserSuiService] ❌ Deletion transaction failed:', result.error);
        return {
          success: false,
          error: result.error || 'Transaction execution failed',
          details: result.details
        };
      }

      console.log('[BrowserSuiService] ✅ Spreadsheet deleted successfully!', {
        digest: result.digest,
        spreadsheetId: spreadsheetId,
        versionsDeleted: versionHistory.length
      });

      return {
        success: true,
        transactionDigest: result.digest,
        deletedSpreadsheetId: spreadsheetId,
        deletedVersionCount: versionHistory.length,
        gasUsed: result.effects?.gasUsed
      };

    } catch (error) {
      console.error('[BrowserSuiService] ❌ Failed to delete spreadsheet:', error);
      return {
        success: false,
        error: typeof error === 'string' ? error : error.message || 'Unknown error during deletion'
      };
    }
  }

  // Update spreadsheet title
  async updateSpreadsheetTitle(spreadsheetId, newTitle) {
    try {
      console.log('[BrowserSuiService] ✏️ Updating spreadsheet title:', spreadsheetId, 'to:', newTitle);
      
      // Get wallet info for sender address
      const walletInfo = this.walletManager.getWalletInfo();
      if (!walletInfo || !walletInfo.connected || !walletInfo.address) {
        throw new Error('Wallet not connected - cannot update spreadsheet title');
      }

      console.log('[BrowserSuiService] 📋 Verifying spreadsheet ownership...');
      
      // First, get the spreadsheet object to verify ownership
      const spreadsheetResult = await this.client.getObject({
        id: spreadsheetId,
        options: { showContent: true, showOwner: true, showType: true }
      });

      if (!spreadsheetResult.data) {
        throw new Error('Spreadsheet not found');
      }

      // Verify ownership - handle shared objects correctly
      const isSharedObject = spreadsheetResult.data.owner?.Shared !== undefined;
      let owner;

      if (isSharedObject) {
        // For shared objects, owner is stored in the object's fields
        owner = spreadsheetResult.data.content?.fields?.owner;
      } else {
        // For owned objects (shouldn't happen with spreadsheets, but handle it)
        owner = spreadsheetResult.data.owner?.AddressOwner;
      }

      if (!owner) {
        console.error('[BrowserSuiService] Could not determine spreadsheet owner', {
          ownerField: spreadsheetResult.data.owner,
          contentFields: spreadsheetResult.data.content?.fields
        });
        throw new Error('Could not verify spreadsheet ownership');
      }

      if (owner !== walletInfo.address) {
        console.error('[BrowserSuiService] Ownership verification failed', {
          expectedOwner: walletInfo.address,
          actualOwner: owner
        });
        throw new Error('You can only update spreadsheets you own');
      }

      // Create Transaction for title update (using Sui SDK v1.0)
      let tx;
      try {
        tx = new Transaction();
        console.log('[BrowserSuiService] ✅ Transaction created successfully for title update');
      } catch (txError) {
        console.error('[BrowserSuiService] ❌ Failed to create Transaction for title update:', txError);
        throw new Error('Unable to create transaction object - Sui SDK may not be properly loaded');
      }

      tx.setSender(walletInfo.address);
      console.log('[BrowserSuiService] ✅ Title update sender set:', walletInfo.address);

      console.log('[BrowserSuiService] 🔨 Building title update transaction...');

      // Call the update_title function
      const packageId = await this.getPackageId();

      tx.moveCall({
        target: `${packageId}::spreadsheet::update_title`,
        arguments: [
          tx.object(spreadsheetId),
          tx.pure.string(newTitle),
        ],
      });

      console.log('[BrowserSuiService] 💸 Estimating gas for title update...');
 
      // Estimate gas and set budget with buffer
      let gasEstimation
      let gasBudget
      try {
        gasEstimation = await this.estimateGas(tx)
        console.log('[BrowserSuiService] Gas estimation completed:', gasEstimation)
 
        // 20% safety buffer
        gasBudget = Math.ceil((gasEstimation.totalGasUsed || gasEstimation.totalCost || 5_000_000) * 1.2)
        console.log(`[BrowserSuiService] ⛽ Setting gas budget: ${gasBudget} MIST`)
        tx.setGasBudget(gasBudget)
      } catch (gasError) {
        console.error('[BrowserSuiService] Gas estimation failed:', gasError)
        throw new Error(`Gas estimation failed: ${typeof gasError === 'string' ? gasError : gasError.message || 'Unknown error'}`)
      }
 
      console.log('[BrowserSuiService] 💰 Checking sufficient balance for gas...')
 
      // Check balance using the final budget as requirement
      const balanceCheck = await this.checkSufficientBalance({ totalGasUsed: gasBudget })
      console.log('[BrowserSuiService] Balance check completed:', balanceCheck)
 
      if (!balanceCheck.sufficient) {
        throw new Error(
          `Insufficient balance. Need ~${balanceCheck.requiredWithBufferSUI} SUI, have ${balanceCheck.currentBalanceSUI} SUI`
        )
      }

      console.log('[BrowserSuiService] 🚀 Executing title update transaction...');

      // Execute the transaction
      const result = await this.executeTransaction(tx);

      if (!result.success) {
        throw new Error(`Transaction failed: ${result.error}`);
      }

      console.log('[BrowserSuiService] ✅ Spreadsheet title updated successfully!', {
        spreadsheetId,
        newTitle,
        transactionDigest: result.digest,
        gasUsed: result.effects?.gasUsed
      });

      return {
        success: true,
        transactionDigest: result.digest,
        spreadsheetId,
        newTitle,
        gasUsed: result.effects?.gasUsed
      };

    } catch (error) {
      console.error('[BrowserSuiService] ❌ Failed to update spreadsheet title:', error);
      return {
        success: false,
        error: typeof error === 'string' ? error : error.message || 'Unknown error during title update'
      };
    }
  }

  // Create a transaction for updating spreadsheet title
  createUpdateTitleTransaction(spreadsheetId, newTitle) {
    try {
      console.log('[BrowserSuiService] ✏️ Creating title update transaction:', spreadsheetId, '->', newTitle);

      // Get wallet info for sender address
      const walletInfo = this.walletManager.getWalletInfo();
      if (!walletInfo || !walletInfo.connected || !walletInfo.address) {
        throw new Error('Wallet not connected - cannot create title update transaction');
      }

      console.log('[BrowserSuiService] Using sender address for title update:', walletInfo.address);

      // Create Transaction for title update
      const tx = new Transaction();
      console.log('[BrowserSuiService] ✅ Transaction created successfully for title update');

      // Set sender
      tx.setSender(walletInfo.address);
      console.log('[BrowserSuiService] ✅ Title update sender set:', walletInfo.address);

      // Call the update_title function
      const { packageId } = this.config.getCurrentNetwork();

      tx.moveCall({
        target: `${packageId}::spreadsheet::update_title`,
        arguments: [
          tx.object(spreadsheetId),
          tx.pure.string(newTitle),
        ],
        typeArguments: []
      });

      console.log('[BrowserSuiService] ✅ Title update transaction created successfully:', {
        spreadsheetId,
        newTitle
      });

      return tx;
    } catch (error) {
      console.error('[BrowserSuiService] ❌ Failed to create title update transaction:', error);
      console.error('[BrowserSuiService] Title update error details:', {
        message: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack,
        name: error.name
      });
      throw error;
    }
  }

  // Create a transaction for making spreadsheet public
  createMakePublicTransaction(spreadsheetId) {
    try {
      console.log('[BrowserSuiService] 📢 Creating make public transaction:', spreadsheetId);

      // Get wallet info for sender address
      const walletInfo = this.walletManager.getWalletInfo();
      if (!walletInfo || !walletInfo.connected || !walletInfo.address) {
        throw new Error('Wallet not connected - cannot create make public transaction');
      }

      console.log('[BrowserSuiService] Using sender address for make public:', walletInfo.address);

      // Create Transaction for making spreadsheet public
      const tx = new Transaction();
      console.log('[BrowserSuiService] ✅ Transaction created successfully for make public');

      // Set sender
      tx.setSender(walletInfo.address);
      console.log('[BrowserSuiService] ✅ Make public sender set:', walletInfo.address);

      // Call the make_public function
      const { packageId } = this.config.getCurrentNetwork();

      tx.moveCall({
        target: `${packageId}::spreadsheet::make_public`,
        arguments: [tx.object(spreadsheetId)],
        typeArguments: []
      });

      console.log('[BrowserSuiService] ✅ Make public transaction created successfully:', {
        spreadsheetId
      });

      return tx;
    } catch (error) {
      console.error('[BrowserSuiService] ❌ Failed to create make public transaction:', error);
      console.error('[BrowserSuiService] Make public error details:', {
        message: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack,
        name: error.name
      });
      throw error;
    }
  }

  // Create a transaction for making spreadsheet private
  createMakePrivateTransaction(spreadsheetId) {
    try {
      console.log('[BrowserSuiService] 🔒 Creating make private transaction:', spreadsheetId);

      // Get wallet info for sender address
      const walletInfo = this.walletManager.getWalletInfo();
      if (!walletInfo || !walletInfo.connected || !walletInfo.address) {
        throw new Error('Wallet not connected - cannot create make private transaction');
      }

      console.log('[BrowserSuiService] Using sender address for make private:', walletInfo.address);

      // Create Transaction for making spreadsheet private
      const tx = new Transaction();
      console.log('[BrowserSuiService] ✅ Transaction created successfully for make private');

      // Set sender
      tx.setSender(walletInfo.address);
      console.log('[BrowserSuiService] ✅ Make private sender set:', walletInfo.address);

      // Call the make_private function
      const { packageId } = this.config.getCurrentNetwork();

      tx.moveCall({
        target: `${packageId}::spreadsheet::make_private`,
        arguments: [tx.object(spreadsheetId)],
        typeArguments: []
      });

      console.log('[BrowserSuiService] ✅ Make private transaction created successfully:', {
        spreadsheetId
      });

      return tx;
    } catch (error) {
      console.error('[BrowserSuiService] ❌ Failed to create make private transaction:', error);
      console.error('[BrowserSuiService] Make private error details:', {
        message: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack,
        name: error.name
      });
      throw error;
    }
  }

  // Create a transaction for transferring spreadsheet ownership
  createTransferOwnershipTransaction(spreadsheetId, newOwnerAddress) {
    try {
      console.log('[BrowserSuiService] 🔄 Creating ownership transfer transaction:', spreadsheetId, '->', newOwnerAddress);

      // Get wallet info for sender address
      const walletInfo = this.walletManager.getWalletInfo();
      if (!walletInfo || !walletInfo.connected || !walletInfo.address) {
        throw new Error('Wallet not connected - cannot create ownership transfer transaction');
      }

      console.log('[BrowserSuiService] Using sender address for ownership transfer:', walletInfo.address);

      // Create Transaction for ownership transfer
      const tx = new Transaction();
      console.log('[BrowserSuiService] ✅ Transaction created successfully for ownership transfer');

      // Set sender
      tx.setSender(walletInfo.address);
      console.log('[BrowserSuiService] ✅ Ownership transfer sender set:', walletInfo.address);

      // Call the transfer_ownership function
      const { packageId } = this.config.getCurrentNetwork();

      tx.moveCall({
        target: `${packageId}::spreadsheet::transfer_ownership`,
        arguments: [
          tx.object(spreadsheetId),
          tx.pure.address(newOwnerAddress),
        ],
        typeArguments: []
      });

      console.log('[BrowserSuiService] ✅ Ownership transfer transaction created successfully:', {
        spreadsheetId,
        newOwnerAddress
      });

      return tx;
    } catch (error) {
      console.error('[BrowserSuiService] ❌ Failed to create ownership transfer transaction:', error);
      console.error('[BrowserSuiService] Ownership transfer error details:', {
        message: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack,
        name: error.name
      });
      throw error;
    }
  }

  // Create a transaction for pruning old versions
  createPruneVersionsTransaction(spreadsheetId, keepCount) {
    try {
      console.log('[BrowserSuiService] ✂️ Creating prune versions transaction:', spreadsheetId, 'keeping', keepCount);

      // Get wallet info for sender address
      const walletInfo = this.walletManager.getWalletInfo();
      if (!walletInfo || !walletInfo.connected || !walletInfo.address) {
        throw new Error('Wallet not connected - cannot create prune versions transaction');
      }

      console.log('[BrowserSuiService] Using sender address for prune versions:', walletInfo.address);

      // Create Transaction for pruning old versions
      const tx = new Transaction();
      console.log('[BrowserSuiService] ✅ Transaction created successfully for prune versions');

      // Set sender
      tx.setSender(walletInfo.address);
      console.log('[BrowserSuiService] ✅ Prune versions sender set:', walletInfo.address);

      // Call the prune_old_versions function
      const { packageId } = this.config.getCurrentNetwork();

      tx.moveCall({
        target: `${packageId}::spreadsheet::prune_old_versions`,
        arguments: [
          tx.object(spreadsheetId),
          tx.pure.u64(keepCount)
        ],
        typeArguments: []
      });

      console.log('[BrowserSuiService] ✅ Prune versions transaction created successfully:', {
        spreadsheetId,
        keepCount
      });

      return tx;
    } catch (error) {
      console.error('[BrowserSuiService] ❌ Failed to create prune versions transaction:', error);
      console.error('[BrowserSuiService] Prune versions error details:', {
        message: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack,
        name: error.name
      });
      throw error;
    }
  }

  // Make spreadsheet public
  async makeSpreadsheetPublic(spreadsheetId) {
    try {
      console.log('[BrowserSuiService] 📢 Making spreadsheet public:', spreadsheetId);

      // Ensure spreadsheet is using the latest module version before mutating
      await this.ensureSpreadsheetVersion(spreadsheetId);

      const transaction = this.createMakePublicTransaction(spreadsheetId);
      const result = await this.executeTransaction(transaction);

      if (result.success) {
        console.log('[BrowserSuiService] ✅ Spreadsheet made public successfully');
        return {
          success: true,
          transactionDigest: result.digest,
          isPublic: true
        };
      } else {
        return result;
      }
    } catch (error) {
      console.error('[BrowserSuiService] ❌ Failed to make spreadsheet public:', error);
      return { success: false, error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error' };
    }
  }

  // Make spreadsheet private
  async makeSpreadsheetPrivate(spreadsheetId) {
    try {
      console.log('[BrowserSuiService] 🔒 Making spreadsheet private:', spreadsheetId);

      // Ensure spreadsheet is using the latest module version before mutating
      await this.ensureSpreadsheetVersion(spreadsheetId);

      const transaction = this.createMakePrivateTransaction(spreadsheetId);
      const result = await this.executeTransaction(transaction);

      if (result.success) {
        console.log('[BrowserSuiService] ✅ Spreadsheet made private successfully');
        return {
          success: true,
          transactionDigest: result.digest,
          isPublic: false
        };
      } else {
        return result;
      }
    } catch (error) {
      console.error('[BrowserSuiService] ❌ Failed to make spreadsheet private:', error);
      return { success: false, error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error' };
    }
  }

  // Transfer ownership
  async transferSpreadsheetOwnership(spreadsheetId, newOwnerAddress) {
    try {
      console.log('[BrowserSuiService] 🔄 Transferring spreadsheet ownership:', spreadsheetId, '->', newOwnerAddress);

      // Validate address format
      if (!this.isValidAddress(newOwnerAddress)) {
        return { success: false, error: 'Invalid recipient address format' };
      }

      // Ensure spreadsheet is using the latest module version before mutating
      await this.ensureSpreadsheetVersion(spreadsheetId);

      const transaction = this.createTransferOwnershipTransaction(spreadsheetId, newOwnerAddress);
      const result = await this.executeTransaction(transaction);

      if (result.success) {
        console.log('[BrowserSuiService] ✅ Spreadsheet ownership transferred successfully');
        return {
          success: true,
          transactionDigest: result.digest,
          newOwner: newOwnerAddress
        };
      } else {
        return result;
      }
    } catch (error) {
      console.error('[BrowserSuiService] ❌ Failed to transfer spreadsheet ownership:', error);
      return { success: false, error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error' };
    }
  }

  // Prune old versions
  async pruneOldVersions(spreadsheetId, keepCount = 10) {
    try {
      console.log('[BrowserSuiService] ✂️ Pruning old versions for spreadsheet:', spreadsheetId, 'keeping', keepCount, 'versions');

      // Ensure spreadsheet is using the latest module version before mutating
      await this.ensureSpreadsheetVersion(spreadsheetId);

      const transaction = this.createPruneVersionsTransaction(spreadsheetId, keepCount);
      const result = await this.executeTransaction(transaction);

      if (result.success) {
        console.log('[BrowserSuiService] ✅ Old versions pruned successfully');
        return {
          success: true,
          transactionDigest: result.digest,
          keptVersions: keepCount
        };
      } else {
        return result;
      }
    } catch (error) {
      console.error('[BrowserSuiService] ❌ Failed to prune old versions:', error);
      return { success: false, error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error' };
    }
  }

  /**
   * Get the latest version metadata for verification after save
   * @param {string} spreadsheetId - The spreadsheet object ID
   * @returns {Promise<{success: boolean, latestVersion?: object, error?: string}>}
   */
  async getLatestVersionMetadata(spreadsheetId) {
    try {
      console.log('[BrowserSuiService] 🔍 Fetching latest version metadata for verification:', spreadsheetId?.slice(0, 8) + '...');

      const versions = await this.getSpreadsheetVersions(spreadsheetId);

      if (!versions || versions.length === 0) {
        return {
          success: false,
          error: 'No versions found'
        };
      }

      // Get the most recent version (last in array)
      const latestVersion = versions[versions.length - 1];

      console.log('[BrowserSuiService] ✅ Latest version metadata:', {
        versionNumber: latestVersion.version_number,
        timestamp: latestVersion.timestamp,
        blobId: latestVersion.walrus_blob_id?.slice(0, 16) + '...',
        cellCount: latestVersion.cell_count
      });

      return {
        success: true,
        latestVersion: {
          versionNumber: latestVersion.version_number,
          timestamp: latestVersion.timestamp,
          walrusBlobId: latestVersion.walrus_blob_id,
          cellCount: latestVersion.cell_count,
          description: latestVersion.description,
          timestampFormatted: new Date(latestVersion.timestamp).toLocaleString()
        }
      };

    } catch (error) {
      console.error('[BrowserSuiService] ❌ Failed to get latest version metadata:', error);
      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      };
    }
  }

  /**
   * Clear invalid object cache when "notExists" errors occur
   */
  clearInvalidObjectCache() {
    console.warn('[BrowserSuiService] 🧹 Clearing invalid object cache...');

    try {
      // Reset current spreadsheet ID if it's invalid
      if (this.currentSpreadsheetId) {
        console.warn('[BrowserSuiService] Clearing cached spreadsheet ID:', this.currentSpreadsheetId);
        this.currentSpreadsheetId = null;
      }

      // Clear any cached gas coins or transaction objects
      // These would be stored in the wallet manager or other services
      if (this.walletManager && typeof this.walletManager.clearInvalidObjects === 'function') {
        this.walletManager.clearInvalidObjects();
      }

      // Clear any cached transaction digests or object references
      // that might be stored in memory

      console.log('[BrowserSuiService] ✅ Invalid object cache cleared');
    } catch (error) {
      console.error('[BrowserSuiService] Error clearing invalid object cache:', error);
    }
  }

  // === Upgrade & Migration Methods ===

  /**
   * Get the module version of a spreadsheet object (reads from dynamic field)
   */
  async getSpreadsheetVersion(spreadsheetId) {
    try {
      const packageId = await this.getPackageId();

      // First verify the object exists
      const result = await this.client.getObject({
        id: spreadsheetId,
        options: {
          showContent: true,
          showType: true
        }
      });

      if (!result.data || !result.data.content) {
        throw new Error(`Spreadsheet object not found: ${spreadsheetId}`);
      }

      // Fetch dynamic fields to read version
      let moduleVersion = 0; // Default for legacy objects

      try {
        const dynamicFields = await this.client.getDynamicFields({
          parentId: spreadsheetId
        });

        // Find version field (key is b"module_version")
        const versionField = dynamicFields.data?.find(f => {
          const nameValue = f.name?.value;
          if (typeof nameValue === 'string') {
            return nameValue === 'module_version';
          }
          // Handle bytes format: [109, 111, 100, 117, 108, 101, 95, 118, 101, 114, 115, 105, 111, 110]
          if (Array.isArray(nameValue)) {
            const str = String.fromCharCode(...nameValue);
            return str === 'module_version';
          }
          return false;
        });

        if (versionField) {
          const fieldObj = await this.client.getDynamicFieldObject({
            parentId: spreadsheetId,
            name: versionField.name
          });
          moduleVersion = fieldObj.data?.content?.fields?.value || 0;
        }
      } catch (dynErr) {
        // Dynamic field read failed, treat as legacy object (version 0)
        console.warn(`[BrowserSuiService] No dynamic version field found for ${spreadsheetId}, treating as legacy (v0)`);
      }

      const isLegacy = moduleVersion === 0;
      console.log(`[BrowserSuiService] Spreadsheet ${spreadsheetId} version: ${moduleVersion}${isLegacy ? ' (legacy)' : ''}`);

      return {
        success: true,
        spreadsheetId,
        moduleVersion,
        isLegacy,
        objectData: result.data
      };
    } catch (error) {
      console.error('[BrowserSuiService] Failed to get spreadsheet version:', error);
      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        spreadsheetId
      };
    }
  }

  /**
   * Get versions for multiple spreadsheets in batch (reduces RPC calls)
   */
  async getSpreadsheetVersionsBatch(spreadsheetIds) {
    try {
      const results = await Promise.allSettled(
        spreadsheetIds.map(id => this.getSpreadsheetVersion(id))
      );

      return spreadsheetIds.map((id, index) => {
        const result = results[index];
        if (result.status === 'fulfilled' && result.value.success) {
          return result.value;
        } else {
          return {
            success: false,
            spreadsheetId: id,
            error: result.status === 'rejected' ? result.reason : result.value.error,
            moduleVersion: 0,
            isLegacy: true
          };
        }
      });
    } catch (error) {
      console.error('[BrowserSuiService] Failed to batch read spreadsheet versions:', error);
      throw error;
    }
  }

  /**
   * Ensure spreadsheet is using the latest module version before mutations
   */
  async ensureSpreadsheetVersion(spreadsheetId) {
    try {
      const config = await this.getRuntimeConfig();
      const net = config.getCurrentNetwork();
      const expectedVersion = net.moduleVersion || 1;

      const versionCheck = await this.getSpreadsheetVersion(spreadsheetId);

      if (!versionCheck.success) {
        throw new Error(`Failed to check spreadsheet version: ${versionCheck.error}`);
      }

      if (versionCheck.moduleVersion !== expectedVersion) {
        console.warn(`[BrowserSuiService] ⚠️ Version mismatch for spreadsheet ${spreadsheetId}`, {
          spreadsheetVersion: versionCheck.moduleVersion,
          expectedVersion,
          needsMigration: versionCheck.moduleVersion < expectedVersion
        });

        throw new Error(
          `Spreadsheet version mismatch: object has version ${versionCheck.moduleVersion}, ` +
          `expected ${expectedVersion}. Migration required.`
        );
      }

      console.log(`[BrowserSuiService] ✅ Spreadsheet version verified: ${expectedVersion}`);
      return { success: true, version: expectedVersion };

    } catch (error) {
      console.error('[BrowserSuiService] Failed to ensure spreadsheet version:', error);
      throw error;
    }
  }

  /**
   * Validate spreadsheet version and return compatibility info
   */
  async validateSpreadsheetVersion(spreadsheetId) {
    try {
      const { detectModuleVersion, checkSpreadsheetVersionCompatibility } = await import('../utils/AbiHelpers.js');

      const versionCheck = await this.getSpreadsheetVersion(spreadsheetId);
      if (!versionCheck.success) {
        return {
          compatible: false,
          error: versionCheck.error,
          canWrite: false,
          canRead: false
        };
      }

      // Use ABI helpers to check compatibility
      const compatibility = await checkSpreadsheetVersionCompatibility(versionCheck.objectData);

      console.log('[BrowserSuiService] Spreadsheet version validation:', compatibility);
      return compatibility;

    } catch (error) {
      console.error('[BrowserSuiService] Version validation failed:', error);
      return {
        compatible: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        canWrite: false,
        canRead: true // Allow reads even if validation fails
      };
    }
  }

  /**
   * Create transaction to migrate a spreadsheet (admin only)
   */
  async createMigrateSpreadsheetTransaction(spreadsheetId, adminCapId) {
    try {
      const packageId = await this.getPackageId();

      if (!adminCapId) {
        throw new Error('AdminCap ID required for migration');
      }

      const walletInfo = this.walletManager.getWalletInfo();
      if (!walletInfo || !walletInfo.connected || !walletInfo.address) {
        throw new Error('Wallet not connected - cannot create migration transaction');
      }

      const tx = new Transaction();
      tx.setSender(walletInfo.address);

      tx.moveCall({
        target: `${packageId}::spreadsheet::migrate_spreadsheet`,
        arguments: [
          tx.object(spreadsheetId),
          tx.object(adminCapId)
        ],
        typeArguments: []
      });

      // Set dynamic gas budget
      await this.setDynamicGasBudget(tx, 'migrate_spreadsheet');

      console.log('[BrowserSuiService] ✅ Migration transaction created');
      return tx;

    } catch (error) {
      console.error('[BrowserSuiService] Failed to create migration transaction:', error);
      throw error;
    }
  }

  /**
   * Create a transaction to certify a Walrus blob with PoA (Proof of Availability)
   * @param {string} blobId - Walrus blob ID to certify
   * @param {Object} options - Certification options
   * @returns {Promise<Transaction>} Transaction object ready to be executed
   */
  async createCertifyBlobTransaction(blobId, options = {}) {
    try {
      console.log('[BrowserSuiService] 🎫 Creating blob certification transaction for:', blobId);

      // Validate blob ID
      if (!blobId || typeof blobId !== 'string') {
        throw new Error('Valid blob ID is required for certification');
      }

      // Get wallet info for sender address
      const walletInfo = this.walletManager.getWalletInfo();
      if (!walletInfo || !walletInfo.connected || !walletInfo.address) {
        throw new Error('Wallet not connected - cannot create certification transaction');
      }

      console.log('[BrowserSuiService] Using sender address for certification:', walletInfo.address);

      // Create Transaction for PoA certification
      const tx = new Transaction();
      tx.setSender(walletInfo.address);

      // Get Walrus system package ID from config
      // In production, this would be the deployed Walrus system package
      const config = await this.getRuntimeConfig();
      const walrusSystemPackage = config.walrus?.systemPackageId || '0x0'; // Placeholder

      console.log('[BrowserSuiService] 🔨 Building certification moveCall...');
      console.log('[BrowserSuiService] Walrus System Package:', walrusSystemPackage);
      console.log('[BrowserSuiService] Blob ID to certify:', blobId);

      // Call the Walrus system's certify_blob function
      // This is a placeholder - actual implementation depends on Walrus contract ABI
      tx.moveCall({
        target: `${walrusSystemPackage}::walrus::certify_blob`,
        arguments: [
          tx.pure.string(blobId),
          // Add duration argument if provided (default 30 days)
          tx.pure.u64(options.durationDays ? options.durationDays * 86400 : 30 * 86400)
        ],
        typeArguments: []
      });

      // Set dynamic gas budget for certification
      await this.setDynamicGasBudget(tx, 'certify_blob');

      console.log('[BrowserSuiService] ✅ Certification transaction created successfully');
      return tx;

    } catch (error) {
      console.error('[BrowserSuiService] Failed to create certification transaction:', error);
      throw error;
    }
  }

  /**
   * Certify a Walrus blob with PoA (Proof of Availability)
   * @param {string} blobId - Walrus blob ID to certify
   * @param {Object} options - Certification options
   * @returns {Promise<Object>} Certification result with transaction digest and status
   */
  async certifyBlob(blobId, options = {}) {
    try {
      console.log('[BrowserSuiService] 🎫 Starting blob certification for:', blobId);

      // Create certification transaction
      const transaction = await this.createCertifyBlobTransaction(blobId, options);

      // Execute transaction through wallet
      const result = await this.executeTransaction(transaction);

      if (result.success) {
        console.log('[BrowserSuiService] ✅ Blob certified successfully:', {
          blobId,
          digest: result.digest
        });

        return {
          success: true,
          blobId,
          transactionDigest: result.digest,
          effects: result.effects,
          events: result.events,
          timestamp: Date.now(),
          durationDays: options.durationDays || 30
        };
      } else {
        console.error('[BrowserSuiService] ❌ Blob certification failed:', result.error);
        return {
          success: false,
          blobId,
          error: result.error || 'Certification transaction failed'
        };
      }

    } catch (error) {
      console.error('[BrowserSuiService] Failed to certify blob:', error);
      return {
        success: false,
        blobId,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown certification error'
      };
    }
  }

  /**
   * Migrate a spreadsheet to the latest module version (admin only)
   */
  async requestSpreadsheetMigration(spreadsheetId, adminCapId) {
    try {
      console.log(`[BrowserSuiService] Requesting migration for spreadsheet: ${spreadsheetId}`);

      // Check current version
      const versionCheck = await this.getSpreadsheetVersion(spreadsheetId);
      if (!versionCheck.success) {
        return { success: false, error: `Failed to check version: ${versionCheck.error}` };
      }

      const config = await this.getRuntimeConfig();
      const net = config.getCurrentNetwork();
      const targetVersion = net.moduleVersion || 1;

      if (versionCheck.moduleVersion >= targetVersion) {
        return {
          success: false,
          error: `Spreadsheet is already at version ${versionCheck.moduleVersion}`,
          currentVersion: versionCheck.moduleVersion
        };
      }

      // Create and execute migration transaction
      const transaction = await this.createMigrateSpreadsheetTransaction(spreadsheetId, adminCapId);
      const result = await this.executeTransaction(transaction);

      if (result.success) {
        console.log('[BrowserSuiService] ✅ Spreadsheet migrated successfully');
        return {
          success: true,
          digest: result.digest,
          spreadsheetId,
          oldVersion: versionCheck.moduleVersion,
          newVersion: targetVersion
        };
      } else {
        return result;
      }
    } catch (error) {
      console.error('[BrowserSuiService] Failed to migrate spreadsheet:', error);
      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        spreadsheetId
      };
    }
  }
}

// Export singleton instance
export const browserSuiService = new BrowserSuiService();

// Global access for error recovery
if (typeof window !== 'undefined') {
  window.browserSuiService = browserSuiService;
}
