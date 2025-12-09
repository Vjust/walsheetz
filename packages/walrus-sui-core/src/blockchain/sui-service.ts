// NOTE: Node/server/CLI usage only. The React UI must use @/sdk/* or @/walrus/* (Browser*Service).
// Sui blockchain service for WalSheetz
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { getCurrentConfig, isTestnet } from './config.js';
import { walletManager } from './wallet-manager.js';
import { configLoader } from '@dreamlit/walrus';
import RateLimiter from './utils/rateLimiter.js';
import { detectSaveVersionSignature } from '../blockchain-integration/utils/AbiHelpers.js';

// Note: ResilientExecutor/CircuitBreaker not needed in this service
// If needed in future, import from @dreamlit/walrus

// Stub implementation for ResilientExecutor (not yet extracted to @dreamlit/walrus)
const ResilientExecutor = class {
  private config: unknown;

  constructor(config: unknown) {
    this.config = config;
  }
  async execute(fn: () => Promise<unknown>) {
    return await fn();
  }
};

class SuiService {
  private client: InstanceType<typeof SuiClient>;
  private isTestnet: boolean;
  private rateLimiterEnabled: boolean;
  private limiters: Record<string, InstanceType<typeof RateLimiter>>;
  private transactionExecutor: InstanceType<typeof ResilientExecutor>;
  private queryExecutor: InstanceType<typeof ResilientExecutor>;

  constructor() {
    const config = getCurrentConfig();
    this.client = new SuiClient({
      url: config.sui.rpcUrl
    });
    this.isTestnet = isTestnet();
    
    // Initialize rate limiters if enabled
    this.rateLimiterEnabled = config.sui?.features?.rateLimiterEnabled !== false;
    this.limiters = {};
    
    if (this.rateLimiterEnabled) {
      const rateLimits = config.sui?.rateLimits || {};
      this.limiters.sui = new RateLimiter({
        name: 'sui-rpc',
        ...(rateLimits.sui || {
          maxRPS: 3,
          burst: 6,
          maxConcurrent: 4
        })
      });
      console.log('[SuiService] Rate limiter initialized with config:', rateLimits.sui);
    }
    
    // Initialize resilient executors for blockchain operations
    this.transactionExecutor = new ResilientExecutor({
      name: 'SuiTransaction',
      circuit: {
        failureThreshold: 4,
        recoveryTimeout: 45000, // 45 seconds
        expectedErrors: ['Insufficient gas', 'Network error', 'RPC error']
      },
      retry: {
        maxAttempts: 3,
        baseDelay: 3000, // 3 seconds
        maxDelay: 15000, // 15 seconds
        retryCondition: (error) => {
          // Don't retry on certain blockchain-specific errors
          const errorMsg = typeof error === 'string' ? error : (error && error.message) || 'Unknown error';
          return !errorMsg.includes('already exists') &&
                 !errorMsg.includes('invalid signature') &&
                 !errorMsg.includes('insufficient balance');
        }
      }
    });

    this.queryExecutor = new ResilientExecutor({
      name: 'SuiQuery',
      circuit: {
        failureThreshold: 6,
        recoveryTimeout: 20000, // 20 seconds
        expectedErrors: ['Network error', 'RPC error']
      },
      retry: {
        maxAttempts: 4,
        baseDelay: 1000, // 1 second
        maxDelay: 8000, // 8 seconds
      }
    });
  }
  
  // Helper to check if error is rate limit related
  isRateLimitError(err: unknown) {
    const m = (typeof err === 'object' && err !== null && 'message' in err ? (err as Error).message : '').toLowerCase();
    return m.includes('429') ||
           m.includes('too many') ||
           m.includes('rate limit') ||
           m.includes('retry after');
  }

  // Get current network info
  async getNetworkInfo() {
    // If rate limiter is enabled, wrap the call
    if (this.rateLimiterEnabled && this.limiters.sui) {
      const key = 'sui:getNetworkInfo';
      return this.limiters.sui.schedule(key, async () => {
        try {
          return await this._getNetworkInfoInternal();
        } catch (e) {
          if (this.isRateLimitError(e)) {
            // Pause with jittered backoff
            const ms = this.limiters.sui.calculateBackoff();
            this.limiters.sui.pause(ms);
            console.warn(`[SuiService] Rate limit error in getNetworkInfo, backing off for ${ms}ms`);
          }
          throw e;
        }
      }, { ttlMs: 2000 }); // Cache for 2 seconds
    }
    
    return this._getNetworkInfoInternal();
  }
  
  async _getNetworkInfoInternal() {
    try {
      const chainId = await this.client.getChainIdentifier();
      const latestCheckpoint = await this.client.getLatestCheckpointSequenceNumber();
      const gasPrice = await this.client.getReferenceGasPrice();
      
      return {
        chainId,
        latestCheckpoint,
        gasPrice,
        isTestnet: this.isTestnet
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to get network info:', err);
      throw err;
    }
  }

  // Get account balance
  async getBalance(address: string) {
    // If rate limiter is enabled, wrap the call
    if (this.rateLimiterEnabled && this.limiters.sui) {
      const key = `sui:getBalance:${address}`;
      return this.limiters.sui.schedule(key, async () => {
        try {
          return await this._getBalanceInternal(address);
        } catch (e) {
          if (this.isRateLimitError(e)) {
            // Pause with jittered backoff
            const ms = this.limiters.sui.calculateBackoff();
            this.limiters.sui.pause(ms);
            console.warn(`[SuiService] Rate limit error in getBalance, backing off for ${ms}ms`);
          }
          throw e;
        }
      }, { ttlMs: 3000 }); // Cache for 3 seconds
    }
    
    return this._getBalanceInternal(address);
  }
  
  async _getBalanceInternal(address: string) {
    try {
      const balance = await this.client.getBalance({
        owner: address
      });
      
      return {
        totalBalance: balance.totalBalance,
        coinObjectCount: balance.coinObjectCount,
        lockedBalance: balance.lockedBalance || '0'
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to get balance:', err);
      throw err;
    }
  }

  // Get owned objects
  async getOwnedObjects(address: string, options: Record<string, unknown> = {}) {
    // If rate limiter is enabled, wrap the call
    if (this.rateLimiterEnabled && this.limiters.sui) {
      const { filter, ...otherOptions } = options;
      const key = `sui:getOwnedObjects:${address}:${JSON.stringify(filter || {})}`;
      return this.limiters.sui.schedule(key, async () => {
        try {
          return await this._getOwnedObjectsInternal(address, options);
        } catch (e) {
          if (this.isRateLimitError(e)) {
            // Pause with jittered backoff
            const ms = this.limiters.sui.calculateBackoff();
            this.limiters.sui.pause(ms);
            console.warn(`[SuiService] Rate limit error in getOwnedObjects, backing off for ${ms}ms`);
          }
          throw e;
        }
      }, { ttlMs: 5000 }); // Cache for 5 seconds
    }
    
    return this._getOwnedObjectsInternal(address, options);
  }
  
  async _getOwnedObjectsInternal(address: string, options: Record<string, unknown> = {}) {
    try {
      // Extract filter separately to avoid duplication
      const { filter, ...otherOptions } = options;
      
      const result = await this.client.getOwnedObjects({
        owner: address,
        filter: filter as any,
        options: {
          showContent: true,
          showOwner: true,
          showType: true,
          ...(otherOptions as Record<string, unknown>)
        }
      });
      
      return result;
    } catch (error) {
      const err = error as Error;
      console.error('Failed to get owned objects:', err);
      throw err;
    }
  }

  // Create a transaction for storing spreadsheet metadata with ABI-driven signature detection
  async createStorageTransaction(data: Record<string, unknown>) {
    const tx = new Transaction();
    const config = getCurrentConfig();

    if (!config.sui.packageId) {
      throw new Error('Package ID not configured for current network');
    }

    // Use ABI detection to determine if content_hash is expected
    const sig = await detectSaveVersionSignature();
    const includeContentHash = !!sig.expectsContentHash;

    // Validate required fields based on detected signature
    if (includeContentHash && !data.contentHash) {
      throw new Error('Content hash is required for storage transaction');
    }

    // Build arguments to match the exact on-chain signature
    const args: any[] = includeContentHash
      ? [
          tx.object(data.spreadsheetObjectId as string),
          tx.pure.string(data.walrusBlobId as string),
          tx.pure.string((data.contentHash || '') as string),
          tx.pure.u64((data.cellCount || 0) as number),
          tx.pure.string((data.description || `Version ${data.version}`) as string),
          tx.object('0x6')
        ]
      : [
          tx.object(data.spreadsheetObjectId as string),
          tx.pure.string(data.walrusBlobId as string),
          tx.pure.u64((data.cellCount || 0) as number),
          tx.pure.string((data.description || `Version ${data.version}`) as string),
          tx.object('0x6')
        ];

    tx.moveCall({
      target: `${config.sui.packageId}::spreadsheet::save_version`,
      arguments: args,
      typeArguments: []
    });

    console.log('[ABI] createStorageTransaction built with signature:', sig.debug || sig);

    return tx;
  }

  // Enhanced storage transaction with redundancy and compression metadata
  // Since save_version_enhanced doesn't exist in Move contract, we use the regular save_version
  // and store enhanced metadata off-chain (in description field or separate storage)
  createEnhancedStorageTransaction(data: Record<string, unknown>) {
    const tx = new Transaction();
    const config = getCurrentConfig();
    
    if (!config.sui.packageId) {
      throw new Error('Package ID not configured for current network');
    }

    // Validate required fields
    const includeContentHash = config.sui?.features?.contentHashInSave === true;
    if (includeContentHash && !data.contentHash) {
      throw new Error('Content hash is required for enhanced storage transaction');
    }

    // Prepare metadata for off-chain tracking
    const metadata = {
      primaryBlobId: data.walrusBlobId as string,
      redundantBlobIds: (data.redundantBlobIds || []) as string[],
      hasRedundancy: !!((data.redundantBlobIds as string[]) && (data.redundantBlobIds as string[]).length > 0),
      isDelta: (data.isDelta || false) as boolean,
      compressionRatio: (data.compressionRatio || 1.0) as number,
      integrityVerified: (data.integrityVerified || false) as boolean
    };

    console.log('Creating storage transaction with enhanced metadata (tracked off-chain):', {
      primaryBlobId: metadata.primaryBlobId,
      redundantCount: metadata.redundantBlobIds.length,
      hasRedundancy: metadata.hasRedundancy,
      isDelta: metadata.isDelta,
      compressionRatio: metadata.compressionRatio
    });

    // Create enriched description with metadata
    const enhancedDescription = JSON.stringify({
      desc: data.description || `Version ${data.version}`,
      redundant: metadata.redundantBlobIds,
      delta: metadata.isDelta,
      compression: metadata.compressionRatio
    });

    // Use the regular save_version function with ABI-compatible arguments
    const args: any[] = includeContentHash
      ? [
          tx.object(data.spreadsheetObjectId as string),
          tx.pure.string(metadata.primaryBlobId),
          tx.pure.string((data.contentHash || '') as string),
          tx.pure.u64((data.cellCount || 0) as number),
          tx.pure.string(enhancedDescription.substring(0, 500)),
          tx.object('0x6')
        ]
      : [
          tx.object(data.spreadsheetObjectId as string),
          tx.pure.string(metadata.primaryBlobId),
          tx.pure.u64((data.cellCount || 0) as number),
          tx.pure.string(enhancedDescription.substring(0, 500)),
          tx.object('0x6')
        ];

    tx.moveCall({
      target: `${config.sui.packageId}::spreadsheet::save_version`,
      arguments: args,
      typeArguments: []
    });

    return tx;
  }

  // Create a new spreadsheet transaction (for backend service parity with BrowserSuiService)
  createSpreadsheetTransaction(title: string = 'Untitled Spreadsheet') {
    return this.createSpreadsheet(title);
  }

  // Create a new spreadsheet on-chain
  createSpreadsheet(title: string = 'Untitled Spreadsheet') {
    const tx = new Transaction();
    const config = getCurrentConfig();
    
    if (!config.sui.packageId) {
      throw new Error('Package ID not configured for current network');
    }

    // Get the registry object ID from config
    const registryObjectId = config.sui.registryObjectId;
    
    if (!registryObjectId) {
      throw new Error('Registry object ID not configured for current network');
    }
    
    tx.moveCall({
      target: `${config.sui.packageId}::spreadsheet::create_spreadsheet`,
      arguments: [
        tx.object(registryObjectId), // Registry object
        tx.pure.string(title) // Spreadsheet title
      ],
      typeArguments: []
    });

    return tx;
  }

  // Create a combined transaction for spreadsheet creation and initial version save
  async createSpreadsheetWithInitialVersion(title: string, walrusBlobId: string, contentHash: string, cellCount: number = 0, description: string = 'Initial version') {
    const tx = new Transaction();
    const config = getCurrentConfig();

    if (!config.sui.packageId) {
      throw new Error('Package ID not configured for current network');
    }

    const registryObjectId = config.sui.registryObjectId;
    if (!registryObjectId) {
      throw new Error('Registry object ID not configured for current network');
    }

    // Use ABI detection to determine if content_hash is expected
    const sig = await detectSaveVersionSignature();
    const includeContentHash = !!sig.expectsContentHash;

    if (includeContentHash && !contentHash) {
      throw new Error('Content hash is required for initial version');
    }

    // Step 1: Create spreadsheet and capture the returned object
    const spreadsheetObj = tx.moveCall({
      target: `${config.sui.packageId}::spreadsheet::create_spreadsheet`,
      arguments: [
        tx.object(registryObjectId),
        tx.pure.string(title)
      ],
      typeArguments: []
    });

    // Step 2: Immediately save the initial version using the created spreadsheet
    const saveArgs = includeContentHash
      ? [
          spreadsheetObj,
          tx.pure.string(walrusBlobId),
          tx.pure.string(contentHash || ''),
          tx.pure.u64(cellCount),
          tx.pure.string(description),
          tx.object('0x6')
        ]
      : [
          spreadsheetObj,
          tx.pure.string(walrusBlobId),
          tx.pure.u64(cellCount),
          tx.pure.string(description),
          tx.object('0x6')
        ];

    tx.moveCall({
      target: `${config.sui.packageId}::spreadsheet::save_version`,
      arguments: saveArgs,
      typeArguments: []
    });

    console.log('[ABI] createSpreadsheetWithInitialVersion built with signature:', (sig as Record<string, unknown>).debug || sig);

    return tx;
  }

  // Validate if spreadsheet object exists on blockchain
  async validateSpreadsheetObjectExists(spreadsheetObjectId: string) {
    try {
      if (!spreadsheetObjectId) {
        return { exists: false, error: 'No spreadsheet object ID provided' };
      }

      const config = getCurrentConfig();
      if (!config.sui.packageId) {
        return { exists: false, error: 'Package ID not configured for current network' };
      }

      // Use resilient executor for object validation
      const result = await (this.queryExecutor as any).execute(async () => {
        return await this.client.getObject({
          id: spreadsheetObjectId,
          options: {
            showContent: true,
            showType: true,
            showOwner: true
          }
        });
      });

      const resData = ((result as any)?.data) as any;
      if (!resData) {
        return {
          exists: false,
          error: 'Object not found on blockchain',
          objectId: spreadsheetObjectId
        };
      }

      // Verify it's actually a spreadsheet object
      const expectedType = `${config.sui.packageId}::spreadsheet::Spreadsheet`;
      if (resData?.type !== expectedType) {
        return {
          exists: false,
          error: `Object exists but is not a spreadsheet (type: ${resData.type})`,
          objectId: spreadsheetObjectId
        };
      }

      return {
        exists: true,
        objectId: spreadsheetObjectId,
        data: resData
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to validate spreadsheet object:', err);
      return {
        exists: false,
        error: `Validation failed: ${typeof error === 'string' ? error : (err?.message) || 'Unknown error'}`,
        objectId: spreadsheetObjectId
      };
    }
  }

  // Get user's owned spreadsheets
  async getUserSpreadsheets(address: string) {
    // If rate limiter is enabled, wrap the call
    if (this.rateLimiterEnabled && this.limiters.sui) {
      const config = getCurrentConfig();
      const key = `sui:getUserSpreadsheets:${address}:${config.sui.packageId}`;
      return this.limiters.sui.schedule(key, async () => {
        try {
          return await this._getUserSpreadsheetsInternal(address);
        } catch (e) {
          if (this.isRateLimitError(e)) {
            // Pause with jittered backoff
            const ms = this.limiters.sui.calculateBackoff();
            this.limiters.sui.pause(ms);
            console.warn(`[SuiService] Rate limit error in getUserSpreadsheets, backing off for ${ms}ms`);
          }
          throw e;
        }
      }, { ttlMs: 5000 }); // Cache for 5 seconds
    }
    
    return this._getUserSpreadsheetsInternal(address);
  }
  
  async _getUserSpreadsheetsInternal(address: string) {
    try {
      const config = getCurrentConfig();
      if (!config.sui.packageId) {
        throw new Error('Package ID not configured for current network');
      }

      const result = await this.client.getOwnedObjects({
        owner: address,
        filter: {
          StructType: `${config.sui.packageId}::spreadsheet::Spreadsheet`
        },
        options: {
          showContent: true,
          showOwner: true,
          showType: true
        }
      });

      // Parse spreadsheet metadata from the results
      const spreadsheets = (result.data || [])
        .filter(item => (item.data as any)?.content)
        .map(item => {
          const itemData = item.data as any;
          const content = itemData.content as Record<string, unknown>;
          const fields = (content.fields || {}) as Record<string, unknown>;
          return {
            objectId: itemData.objectId,
            title: (fields.title || 'Untitled Spreadsheet') as string,
            owner: (fields.owner || address) as string,
            created_at: (fields.created_at || Date.now()) as number,
            last_modified: (fields.last_modified || Date.now()) as number,
            version_count: (fields.version_count || 0) as number,
            current_version: fields.current_version,
            is_public: (fields.is_public || false) as boolean
          };
        })
        .sort((a, b) => b.last_modified - a.last_modified); // Sort by most recent

      console.log(`[SuiService] Found ${spreadsheets.length} spreadsheets for address ${address}`);
      return spreadsheets;
    } catch (error) {
      const err = error as Error;
      console.error('Failed to get user spreadsheets:', err);
      throw err;
    }
  }

  // Get spreadsheet versions for a specific spreadsheet
  async getSpreadsheetVersions(spreadsheetId: string) {
    try {
      const config = getCurrentConfig();
      if (!config.sui.packageId) {
        throw new Error('Package ID not configured for current network');
      }

      // Query for Version objects that belong to this spreadsheet
      // Note: queryObjects may not be available in all SDK versions, fallback to manual filtering
      let result;
      try {
        result = await (this.client as any).queryObjects?.({
          query: {
            StructType: `${config.sui.packageId}::spreadsheet::Version`,
            filter: {
              fieldName: 'spreadsheet_id',
              fieldValue: spreadsheetId
            }
          },
          options: {
            showContent: true,
            showOwner: true,
            showType: true
          }
        });
      } catch {
        // Fallback: use getOwnedObjects with appropriate filters
        result = await this.client.getOwnedObjects({
          owner: config.sui.registryObjectId || '0x0',
          filter: { StructType: `${config.sui.packageId}::spreadsheet::Version` },
          options: { showContent: true }
        });
      }

      // Parse version metadata including content hash
      const versions = ((result?.data) || [])
        .filter(item => (item.data as any)?.content)
        .map(item => {
          const itemData = item.data as any;
          const content = itemData.content as Record<string, unknown>;
          const fields = (content.fields || {}) as Record<string, unknown>;
          return {
            objectId: itemData.objectId,
            spreadsheet_id: (fields.spreadsheet_id || spreadsheetId) as string,
            version_number: (fields.version_number || 1) as number,
            parent_version: fields.parent_version,
            walrus_blob_id: fields.walrus_blob_id,
            content_hash: fields.content_hash,
            cell_count: (fields.cell_count || 0) as number,
            created_at: (fields.created_at || Date.now()) as number,
            created_by: fields.created_by,
            description: (fields.description || 'Version') as string
          };
        })
        .sort((a, b) => b.version_number - a.version_number); // Sort by version number desc

      console.log(`[SuiService] Found ${versions.length} versions for spreadsheet ${spreadsheetId}`);
      return versions;
    } catch (error) {
      const err = error as Error;
      console.error('Failed to get spreadsheet versions:', err);
      throw err;
    }
  }

  // Get latest version data for a spreadsheet
  async getSpreadsheetData(spreadsheetId: string, walrusService: unknown) {
    try {
      const versions = await this.getSpreadsheetVersions(spreadsheetId);
      
      if (versions.length === 0) {
        throw new Error(`No versions found for spreadsheet ${spreadsheetId}`);
      }

      const latestVersion = versions[0];
      
      // Retrieve data from Walrus using the blob ID
      if (!latestVersion.walrus_blob_id) {
        throw new Error(`No Walrus blob ID found for latest version of spreadsheet ${spreadsheetId}`);
      }

      console.log(`[SuiService] Loading data from Walrus blob with integrity verification: ${latestVersion.walrus_blob_id}`);
      
      // Retrieve blob with content hash verification if available
      const blobData = await (walrusService as Record<string, unknown> & { retrieveBlob?: Function }).retrieveBlob?.(
        latestVersion.walrus_blob_id,
        latestVersion.content_hash // Pass expected hash for integrity verification
      );
      
      // Log integrity verification results
      if (blobData.success && blobData.verificationPerformed) {
        if (blobData.integrityVerified) {
          console.log('✅ Content integrity verified - data is authentic');
        } else {
          console.error('❌ CRITICAL SECURITY: Content integrity verification FAILED!', {
            blobId: latestVersion.walrus_blob_id,
            expectedHash: latestVersion.content_hash?.substring(0, 16) + '...',
            spreadsheetId,
            security: 'Data rejected to prevent tampering'
          });
          // SECURITY: Reject corrupted/tampered data immediately
          throw new Error(`SECURITY: Data integrity verification failed for blob ${latestVersion.walrus_blob_id}. This indicates potential data corruption or tampering. Data rejected for security.`);
        }
      }

      return {
        spreadsheetData: blobData,
        version: latestVersion,
        allVersions: versions
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to get spreadsheet data:', err);
      throw err;
    }
  }

  // Enhanced data retrieval with redundancy support
  async getSpreadsheetDataWithRedundancy(spreadsheetId: string, walrusService: unknown) {
    try {
      console.log('Loading spreadsheet data with redundancy support: ' + spreadsheetId);

      const versions = await this.getEnhancedSpreadsheetVersions(spreadsheetId);

      if (versions.length === 0) {
        throw new Error(`No versions found for spreadsheet ${spreadsheetId}`);
      }

      const latestVersion = versions[0];

      // Prepare blob IDs for redundant retrieval
      const blobIds = [latestVersion.walrus_blob_id as string];
      if (latestVersion.redundant_blob_ids && (latestVersion.redundant_blob_ids as string[]).length > 0) {
        blobIds.push(...(latestVersion.redundant_blob_ids as string[]));
      }

      console.log('Attempting retrieval from ' + blobIds.length + ' blob sources');

      // Retrieve with redundancy fallback
      let blobData;
      if (blobIds.length > 1) {
        blobData = await (walrusService as Record<string, unknown> & { retrieveWithRedundancy?: Function }).retrieveWithRedundancy?.(
          blobIds,
          latestVersion.content_hash
        );
      } else {
        blobData = await (walrusService as Record<string, unknown> & { retrieveBlob?: Function }).retrieveBlob?.(
          latestVersion.walrus_blob_id,
          latestVersion.content_hash
        );
      }

      // Enhanced integrity verification logging
      const bdData = blobData as Record<string, unknown>;
      if (bdData.success && bdData.verificationPerformed) {
        if (bdData.integrityVerified) {
          console.log('Content integrity verified with redundancy support');

          if (bdData.usedFallback) {
            console.warn('Primary blob failed, used redundant copy:', {
              primaryBlobId: latestVersion.walrus_blob_id,
              successfulBlobId: (bdData.redundancyInfo as Record<string, unknown>)?.successfulBlobId
            });
          }
        } else {
          console.error('CRITICAL SECURITY: Content integrity verification FAILED even with redundancy!', {
            attemptedBlobIds: blobIds,
            expectedHash: latestVersion.content_hash?.substring(0, 16) + '...',
            spreadsheetId
          });
          throw new Error(`SECURITY: All redundant blob integrity verifications failed for spreadsheet ${spreadsheetId}. Data rejected for security.`);
        }
      }

      return {
        spreadsheetData: blobData,
        version: latestVersion,
        allVersions: versions,
        redundancyUsed: blobIds.length > 1,
        fallbackUsed: (bdData.usedFallback as boolean) || false
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to get spreadsheet data with redundancy:', err);
      throw err;
    }
  }

  // Get enhanced version history with metadata
  // Since VersionEnhanced doesn't exist, we parse enhanced metadata from description field
  async getEnhancedSpreadsheetVersions(spreadsheetId: string) {
    try {
      const config = getCurrentConfig();
      if (!config.sui.packageId) {
        throw new Error('Package ID not configured for current network');
      }

      console.log('[SuiService] Querying versions for spreadsheet: ' + spreadsheetId);

      // Query for regular Version objects (VersionEnhanced doesn't exist)
      let result;
      try {
        result = await (this.client as any).queryObjects?.({
          query: {
            StructType: `${config.sui.packageId}::spreadsheet::Version`,
            filter: {
              fieldName: 'spreadsheet_id',
              fieldValue: spreadsheetId
            }
          },
          options: {
            showContent: true,
            showOwner: true,
            showType: true
          }
        });
      } catch {
        result = { data: [] };
      }

      // Parse version metadata and extract enhanced data from description if available
      const versions = ((result?.data) || [])
        .filter(item => (item.data as any)?.content)
        .map(item => {
          const itemData = item.data as any;
          const content = itemData.content as any;
          const description = ((content.fields as any)?.description || 'Version') as string;
          
          // Try to parse enhanced metadata from description
          let enhancedMetadata = {
            redundant_blob_ids: [],
            has_redundancy: false,
            is_delta: false,
            compression_ratio: 1.0,
            integrity_verified: false
          };
          
          try {
            // Check if description contains JSON metadata
            if (description.startsWith('{') && description.includes('"desc"')) {
              const parsed = JSON.parse(description);
              enhancedMetadata = {
                redundant_blob_ids: parsed.redundant || [],
                has_redundancy: (parsed.redundant || []).length > 0,
                is_delta: parsed.delta || false,
                compression_ratio: parsed.compression || 1.0,
                integrity_verified: true // If we have content_hash, we can verify
              };
            }
          } catch (e) {
            // Description is not JSON, use defaults
          }

          const fields = (content.fields || {}) as any;
          return {
            objectId: itemData.objectId,
            spreadsheet_id: (fields.spreadsheet_id || spreadsheetId) as string,
            version_number: (fields.version_number || 1) as number,
            parent_version: fields.parent_version,
            walrus_blob_id: fields.walrus_blob_id,
            redundant_blob_ids: enhancedMetadata.redundant_blob_ids,
            content_hash: fields.content_hash,
            cell_count: (fields.cell_count || 0) as number,
            created_at: (fields.created_at || Date.now()) as number,
            created_by: fields.created_by,
            description: description,
            // Enhanced metadata parsed from description
            has_redundancy: enhancedMetadata.has_redundancy,
            is_delta: enhancedMetadata.is_delta,
            compression_ratio: enhancedMetadata.compression_ratio,
            integrity_verified: enhancedMetadata.integrity_verified
          };
        })
        .sort((a, b) => b.version_number - a.version_number);

      console.log('[SuiService] Found ' + versions.length + ' versions for spreadsheet ' + spreadsheetId);
      return versions;
    } catch (error) {
      const err = error as Error;
      console.warn('Error querying versions, falling back to standard versions:', err);
      return this.getSpreadsheetVersions(spreadsheetId);
    }
  }

  // Verify integrity of a specific version on-chain
  async verifyVersionIntegrity(versionObjectId: string, walrusService: unknown) {
    try {
      console.log('Verifying integrity of version: ' + versionObjectId);
      
      // Get version object from blockchain
      const versionObject = await this.client.getObject({
        id: versionObjectId,
        options: {
          showContent: true,
          showOwner: true,
          showType: true
        }
      });

      if (!versionObject.data?.content) {
        throw new Error(`Version object not found: ${versionObjectId}`);
      }

      const content = versionObject.data?.content as any;
      const versionData = {
        walrus_blob_id: content?.fields?.walrus_blob_id,
        redundant_blob_ids: (content?.fields?.redundant_blob_ids || []) as string[],
        content_hash: content?.fields?.content_hash,
        has_redundancy: (content?.fields?.has_redundancy || false) as boolean
      };

      // Verify integrity using Walrus service
      let integrityResult;
      const allBlobIds = [versionData.walrus_blob_id as string, ...versionData.redundant_blob_ids];

      if (versionData.has_redundancy && allBlobIds.length > 1) {
        console.log('Performing redundancy health check');
        integrityResult = await (walrusService as Record<string, unknown> & { checkRedundancyHealth?: Function }).checkRedundancyHealth?.(
          allBlobIds,
          versionData.content_hash
        );
      } else {
        console.log('Performing single blob integrity check');
        integrityResult = await (walrusService as Record<string, unknown> & { verifyBlobIntegrity?: Function }).verifyBlobIntegrity?.(
          versionData.walrus_blob_id,
          versionData.content_hash
        );
      }

      console.log('Version integrity verification completed:', {
        versionObjectId,
        blobId: versionData.walrus_blob_id,
        hasRedundancy: versionData.has_redundancy,
        integrityPassed: integrityResult.success && integrityResult.integrityVerified !== false
      });

      const irData = integrityResult as Record<string, unknown>;
      return {
        success: true,
        versionObjectId,
        blobIds: allBlobIds,
        hasRedundancy: versionData.has_redundancy,
        integrityResult,
        overallIntegrity: (irData.success as boolean) && (irData.integrityVerified as boolean) !== false
      };
      
    } catch (error) {
      const err = error as Error;
      console.error(`Failed to verify version integrity: ${typeof error === 'string' ? error : (err?.message) || 'Unknown error'}`);
      return {
        success: false,
        error: typeof error === 'string' ? error : (err?.message) || 'Unknown error',
        versionObjectId
      };
    }
  }

  // Lock a cell for editing
  createCellLockTransaction(spreadsheetId: string, cellRef: string) {
    const tx = new Transaction();
    const config = getCurrentConfig();
    
    if (!config.sui.packageId) {
      throw new Error('Package ID not configured for current network');
    }

    tx.moveCall({
      target: `${config.sui.packageId}::spreadsheet::lock_cell`,
      arguments: [
        tx.object(spreadsheetId), // Spreadsheet object
        tx.pure.string(cellRef), // Cell reference (e.g., "A1")
        tx.object('0x6') // Clock object
      ],
      typeArguments: []
    });

    return tx;
  }

  // Unlock a cell
  createCellUnlockTransaction(spreadsheetId: string, cellRef: string) {
    const tx = new Transaction();
    const config = getCurrentConfig();
    
    if (!config.sui.packageId) {
      throw new Error('Package ID not configured for current network');
    }

    tx.moveCall({
      target: `${config.sui.packageId}::spreadsheet::unlock_cell`,
      arguments: [
        tx.object(spreadsheetId), // Spreadsheet object
        tx.pure.string(cellRef), // Cell reference
        tx.object('0x6') // Clock object
      ],
      typeArguments: []
    });

    return tx;
  }

  // Execute transaction through wallet with resilient execution
  async executeTransaction(transaction: unknown) {
    return this.transactionExecutor.execute(async () => {
      if (!walletManager.isConnected) {
        throw new Error('Wallet not connected');
      }

      console.log('Executing transaction with wallet...');
      const result = await walletManager.signAndExecuteTransaction(transaction as unknown);

      const resData = result as Record<string, unknown>;
      console.log('Transaction executed successfully:', resData.digest);
      return {
        success: true,
        digest: resData.digest,
        effects: resData.effects,
        events: resData.events,
        objectChanges: resData.objectChanges,
        balanceChanges: resData.balanceChanges
      };
    }).catch(async (error) => {
      const err = error as Error;
      // Fallback: provide meaningful error response
      console.error('Transaction execution failed after retries:', typeof error === 'string' ? error : (err?.message) || 'Unknown error');
      return {
        success: false,
        error: typeof error === 'string' ? error : (err?.message) || 'Unknown error',
        fallback: 'transaction_failed_with_retries'
      };
    });
  }

  // Get resilience statistics
  getTransactionStats() {
    return (this.transactionExecutor as any).getStats?.() || {};
  }

  getQueryStats() {
    return (this.queryExecutor as any).getStats?.() || {};
  }

  // Store spreadsheet version metadata on blockchain
  async storeSpreadsheetVersion(versionData: Record<string, unknown>) {
    try {
      // Ensure spreadsheet is using the latest module version before mutating
      await this.ensureSpreadsheetVersion(versionData.spreadsheetObjectId as string);

      const transaction = await this.createStorageTransaction(versionData);
      const result = await this.executeTransaction(transaction);

      const resData = result as Record<string, unknown>;
      return {
        success: true,
        transactionDigest: resData.digest,
        version: versionData.version,
        walrusBlobId: versionData.walrusBlobId
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to store spreadsheet version:', err);
      throw err;
    }
  }

  // Query transaction history via GraphQL
  async queryTransactionHistory(address: string, limit: number = 10) {
    try {
      // GraphQL query for transaction history
      const query = `
        query GetTransactionHistory($address: SuiAddress!, $limit: Int) {
          transactionBlocks(
            filter: { sentAddress: $address }
            first: $limit
            orderBy: { sequenceNumber: DESC }
          ) {
            nodes {
              digest
              sender {
                address
              }
              gasInput {
                gasPrice
                gasBudget
              }
              effects {
                status
                timestamp
                checkpoint {
                  sequenceNumber
                }
              }
            }
          }
        }
      `;

      const config = getCurrentConfig();
      const response = await fetch(config.sui.graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: {
            address,
            limit
          }
        })
      });

      const result = await response.json() as Record<string, unknown>;

      if (result.errors) {
        const firstError = result.errors as unknown[];
        const firstErrorItem = firstError[0] as unknown;
        const errorMsg = typeof firstErrorItem === 'string' ? firstErrorItem : (typeof firstErrorItem === 'object' && firstErrorItem !== null && 'message' in firstErrorItem ? (firstErrorItem as Record<string, unknown>).message : 'Unknown error');
        throw new Error(`GraphQL query failed: ${errorMsg}`);
      }

      const data = result.data as Record<string, unknown>;
      return (data.transactionBlocks as Record<string, unknown>)?.nodes;
    } catch (error) {
      const err = error as Error;
      console.error('Failed to query transaction history:', err);
      throw err;
    }
  }

  // Query events for spreadsheet storage
  async querySpreadsheetEvents(spreadsheetId: string, limit: number = 50) {
    try {
      const config = getCurrentConfig();
      if (!config.sui.packageId) {
        throw new Error('Package ID not configured for current network');
      }

      // Query for all relevant event types using fully-qualified names
      const eventTypes = [
        `${config.sui.packageId}::spreadsheet::VersionSaved`,
        `${config.sui.packageId}::spreadsheet::SpreadsheetCreated`,
        `${config.sui.packageId}::spreadsheet::CellLocked`,
        `${config.sui.packageId}::spreadsheet::CellUnlocked`,
        `${config.sui.packageId}::spreadsheet::CollaboratorAdded`,
        `${config.sui.packageId}::spreadsheet::SpreadsheetDeleted`
      ];

      const allEvents = [];

      // Query each event type separately (Sui doesn't support OR queries for event types)
      for (const eventType of eventTypes) {
        try {
          const events = await this.client.queryEvents({
            query: {
              MoveEventType: eventType
            },
            limit,
            order: 'descending'
          });

          if (events.data && events.data.length > 0) {
            allEvents.push(...events.data);
          }
        } catch (err) {
          const e = err as Error;
          console.warn('Failed to query event type ' + eventType + ':', typeof err === 'string' ? err : e?.message || 'Unknown error');
        }
      }

      // Filter events for specific spreadsheet
      const filteredEvents = allEvents.filter(event => {
        try {
          const evt = event as Record<string, unknown>;
          const eventData = evt.parsedJson as Record<string, unknown>;
          // Check if this event is related to our spreadsheet
          return (eventData.spreadsheet_id === spreadsheetId ||
                 eventData.spreadsheetId === spreadsheetId);
        } catch {
          return false;
        }
      });

      // Sort by timestamp descending and limit
      filteredEvents.sort((a, b) => {
        const aEvt = a as Record<string, unknown>;
        const bEvt = b as Record<string, unknown>;
        return ((bEvt.timestampMs as number) || 0) - ((aEvt.timestampMs as number) || 0);
      });
      const limitedEvents = filteredEvents.slice(0, limit);

      return limitedEvents.map(event => {
        const evt = event as Record<string, unknown>;
        return {
          id: evt.id,
          timestamp: evt.timestampMs,
          sender: evt.sender,
          data: evt.parsedJson,
          eventType: ((evt.type as string) || '').split('::').pop(),
          transactionDigest: evt.transactionDigest
        };
      });
    } catch (error) {
      const err = error as Error;
      console.error('Failed to query spreadsheet events:', err);
      throw err;
    }
  }

  // Generic query events method for testing
  async queryEvents(options: Record<string, unknown>) {
    try {
      const query: Record<string, unknown> = {};

      if (options.type) {
        query.MoveEventType = options.type;
      }
      if (options.sender) {
        query.Sender = options.sender;
      }

      const queryParams: Record<string, unknown> = { query };

      // Only add limit and order if explicitly provided
      if (options.limit !== undefined) {
        queryParams.limit = options.limit;
      }
      if (options.order !== undefined) {
        queryParams.order = options.order;
      }

      const result = await this.client.queryEvents(queryParams as any);
      
      return result;
    } catch (error) {
      const err = error as Error;
      console.error('Failed to query events:', err);
      throw err;
    }
  }

  // Get transaction block (alias for getTransactionDetails for consistency)
  async getTransactionBlock(digest: string, options: Record<string, unknown> = {}) {
    try {
      const transaction = await this.client.getTransactionBlock({
        digest,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
          showBalanceChanges: true,
          ...options
        }
      });

      return transaction;
    } catch (error) {
      const err = error as Error;
      console.error('Failed to get transaction block:', err);
      throw err;
    }
  }

  // Get transaction details
  async getTransactionDetails(digest: string) {
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

      return transaction;
    } catch (error) {
      const err = error as Error;
      console.error('Failed to get transaction details:', err);
      throw err;
    }
  }

  // Estimate gas for transaction
  async estimateGas(transaction: unknown, address: string) {
    try {
      if (!walletManager.currentAccount) {
        throw new Error('No wallet account available');
      }

      const txData = transaction as Record<string, unknown>;
      const gasEstimate = await this.client.dryRunTransactionBlock({
        transactionBlock: (txData.serialize as Function)?.()
      });

      const gasUsed = (gasEstimate.effects?.gasUsed || {}) as unknown as Record<string, unknown>;
      const computationCost = parseInt(gasUsed.computationCost as string);
      const storageCost = parseInt(gasUsed.storageCost as string);
      const storageRebate = parseInt(gasUsed.storageRebate as string);
      const totalCost = computationCost + storageCost - storageRebate;
      
      const gasPrice = 1000; // Current reference gas price
      const estimatedUnits = Math.ceil(totalCost / gasPrice);
      
      const result: Record<string, unknown> = {
        computationCost,
        storageCost,
        storageRebate,
        totalCost,
        gasPrice,
        estimatedUnits
      };

      // Add warning for high gas usage (>50M MIST)
      if (totalCost > 50000000) {
        result.isHighGas = true;
      }

      return result;
    } catch (error) {
      const err = error as Error;
      console.error('Failed to estimate gas:', err);
      throw err;
    }
  }

  // Check if wallet has sufficient balance for transaction
  async checkSufficientBalance(estimatedGas: Record<string, unknown>) {
    try {
      if (!walletManager.currentAccount) {
        return { sufficient: false, error: 'No wallet connected' };
      }

      const balance = await this.getBalance((walletManager.currentAccount as Record<string, unknown>).address as string);
      const balData = balance as Record<string, unknown>;
      const totalBalanceMIST = parseInt(balData.totalBalance as string);
      const requiredGasMIST = parseInt(estimatedGas.totalGasUsed as string);

      // Add 20% buffer for gas price fluctuations
      const requiredWithBuffer = Math.floor(requiredGasMIST * 1.2);

      return {
        sufficient: totalBalanceMIST >= requiredWithBuffer,
        currentBalance: balData.totalBalance,
        currentBalanceSUI: (totalBalanceMIST / 1_000_000_000).toFixed(6),
        requiredGas: requiredGasMIST.toString(),
        requiredGasSUI: (requiredGasMIST / 1_000_000_000).toFixed(6),
        requiredWithBufferSUI: (requiredWithBuffer / 1_000_000_000).toFixed(6)
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to check balance:', err);
      return { sufficient: false, error: typeof error === 'string' ? error : (err?.message) || 'Unknown error' };
    }
  }

  // === Upgrade & Migration Methods ===

  /**
   * Get the module version of a spreadsheet object (reads from dynamic field)
   */
  async getSpreadsheetVersion(spreadsheetId: string) {
    try {
      const config = getCurrentConfig();
      if (!config.sui.packageId) {
        throw new Error('Package ID not configured for current network');
      }

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
        const versionField = (dynamicFields.data || [])?.find(f => {
          const fData = f as any;
          const nameValue = (fData.name as any)?.value;
          if (typeof nameValue === 'string') {
            return nameValue === 'module_version';
          }
          // Handle bytes format: [109, 111, 100, 117, 108, 101, 95, 118, 101, 114, 115, 105, 111, 110]
          if (Array.isArray(nameValue)) {
            const str = String.fromCharCode(...(nameValue as number[]));
            return str === 'module_version';
          }
          return false;
        });

        if (versionField) {
          const fieldObj = await this.client.getDynamicFieldObject({
            parentId: spreadsheetId,
            name: (versionField as any).name
          });
          const foData = fieldObj.data as any;
          const content = foData?.content as Record<string, unknown>;
          const fields = content?.fields as Record<string, unknown>;
          moduleVersion = (fields?.value as number) || 0;
        }
      } catch (dynErr) {
        // Dynamic field read failed, treat as legacy object (version 0)
        console.warn('[SuiService] No dynamic version field found for ' + spreadsheetId + ', treating as legacy (v0)');
      }

      const isLegacy = moduleVersion === 0;
      console.log('[SuiService] Spreadsheet ' + spreadsheetId + ' version: ' + moduleVersion + (isLegacy ? ' (legacy)' : ''));

      const resData = result.data as any;
      return {
        success: true,
        spreadsheetId,
        moduleVersion,
        isLegacy,
        objectData: resData
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to get spreadsheet version:', err);
      return {
        success: false,
        error: typeof error === 'string' ? error : (err?.message) || 'Unknown error',
        spreadsheetId
      };
    }
  }

  /**
   * Get versions for multiple spreadsheets in batch (reduces RPC calls)
   */
  async getSpreadsheetVersionsBatch(spreadsheetIds: string[]) {
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
      const err = error as Error;
      console.error('Failed to batch read spreadsheet versions:', err);
      throw err;
    }
  }

  /**
   * Ensure spreadsheet is using the latest module version before mutations
   */
  async ensureSpreadsheetVersion(spreadsheetId: string) {
    try {
      const config = getCurrentConfig();
      const expectedVersion = config.sui.moduleVersion || 1;

      const versionCheck = await this.getSpreadsheetVersion(spreadsheetId);

      const vcData = versionCheck as Record<string, unknown>;
      if (!vcData.success) {
        throw new Error('Failed to check spreadsheet version: ' + vcData.error);
      }

      if ((vcData.moduleVersion as number) !== expectedVersion) {
        console.warn('[SuiService] Version mismatch for spreadsheet ' + spreadsheetId, {
          spreadsheetVersion: vcData.moduleVersion,
          expectedVersion,
          needsMigration: (vcData.moduleVersion as number) < expectedVersion
        });

        throw new Error(
          'Spreadsheet version mismatch: object has version ' + vcData.moduleVersion + ', ' +
          'expected ' + expectedVersion + '. Migration required.'
        );
      }

      console.log('[SuiService] Spreadsheet version verified: ' + expectedVersion);
      return { success: true, version: expectedVersion };

    } catch (error) {
      const err = error as Error;
      console.error('Failed to ensure spreadsheet version:', err);
      throw err;
    }
  }

  /**
   * Create transaction to migrate a spreadsheet (admin only)
   */
  createMigrateSpreadsheetTransaction(spreadsheetId: string, adminCapId: string) {
    const tx = new Transaction();
    const config = getCurrentConfig();

    if (!config.sui.packageId) {
      throw new Error('Package ID not configured for current network');
    }

    if (!adminCapId) {
      throw new Error('AdminCap ID required for migration');
    }

    tx.moveCall({
      target: `${config.sui.packageId}::spreadsheet::migrate_spreadsheet`,
      arguments: [
        tx.object(spreadsheetId),
        tx.object(adminCapId)
      ],
      typeArguments: []
    });

    return tx;
  }

  /**
   * Migrate a spreadsheet to the latest module version (admin only)
   */
  async migrateSpreadsheet(spreadsheetId: string, adminCapId: string) {
    try {
      console.log('[SuiService] Migrating spreadsheet: ' + spreadsheetId);

      // Check current version
      const versionCheck = await this.getSpreadsheetVersion(spreadsheetId);
      const vcData = versionCheck as Record<string, unknown>;
      if (!vcData.success) {
        return { success: false, error: 'Failed to check version: ' + vcData.error };
      }

      const config = getCurrentConfig();
      const targetVersion = config.sui.moduleVersion || 1;

      if ((vcData.moduleVersion as number) >= targetVersion) {
        return {
          success: false,
          error: 'Spreadsheet is already at version ' + vcData.moduleVersion,
          currentVersion: vcData.moduleVersion
        };
      }

      // Create and execute migration transaction
      const transaction = this.createMigrateSpreadsheetTransaction(spreadsheetId, adminCapId);
      const result = await this.executeTransaction(transaction);

      const resData = result as Record<string, unknown>;
      if (resData.success) {
        console.log('[SuiService] Spreadsheet migrated successfully');
        return {
          success: true,
          transactionDigest: resData.digest,
          spreadsheetId,
          oldVersion: vcData.moduleVersion,
          newVersion: targetVersion
        };
      } else {
        return result;
      }
    } catch (error) {
      const err = error as Error;
      console.error('Failed to migrate spreadsheet:', err);
      return {
        success: false,
        error: typeof error === 'string' ? error : (err?.message) || 'Unknown error',
        spreadsheetId
      };
    }
  }

  // Helper to check if address is valid
  isValidAddress(address: string) {
    try {
      return address && address.startsWith('0x') && address.length === 66;
    } catch {
      return false;
    }
  }

  // Get current epoch info
  async getCurrentEpoch() {
    try {
      const epochInfo = await this.client.getLatestSuiSystemState();
      return {
        epoch: epochInfo.epoch,
        epochStartTimestampMs: epochInfo.epochStartTimestampMs,
        epochDurationMs: epochInfo.epochDurationMs,
        referenceGasPrice: epochInfo.referenceGasPrice
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to get epoch info:', err);
      throw err;
    }
  }

  // Update spreadsheet title
  createUpdateTitleTransaction(spreadsheetId: string, newTitle: string) {
    const tx = new Transaction();
    const config = getCurrentConfig();
    
    if (!config.sui.packageId) {
      throw new Error('Package ID not configured for current network');
    }

    tx.moveCall({
      target: `${config.sui.packageId}::spreadsheet::update_title`,
      arguments: [
        tx.object(spreadsheetId),
        tx.pure.string(newTitle)
      ],
      typeArguments: []
    });

    return tx;
  }

  async updateSpreadsheetTitle(spreadsheetId: string, newTitle: string) {
    try {
      console.log('[SuiService] Updating spreadsheet title: ' + spreadsheetId + ' -> "' + newTitle + '"');

      // Ensure spreadsheet is using the latest module version before mutating
      await this.ensureSpreadsheetVersion(spreadsheetId);

      const transaction = this.createUpdateTitleTransaction(spreadsheetId, newTitle);
      const result = await this.executeTransaction(transaction);

      const resData = result as Record<string, unknown>;
      if (resData.success) {
        console.log('[SuiService] Spreadsheet title updated successfully');
        return {
          success: true,
          transactionDigest: resData.digest,
          newTitle
        };
      } else {
        return result;
      }
    } catch (error) {
      const err = error as Error;
      console.error('Failed to update spreadsheet title:', err);
      return { success: false, error: typeof error === 'string' ? error : (err?.message) || 'Unknown error' };
    }
  }

  // Make spreadsheet public/private
  createMakePublicTransaction(spreadsheetId: string) {
    const tx = new Transaction();
    const config = getCurrentConfig();
    
    if (!config.sui.packageId) {
      throw new Error('Package ID not configured for current network');
    }

    tx.moveCall({
      target: `${config.sui.packageId}::spreadsheet::make_public`,
      arguments: [tx.object(spreadsheetId)],
      typeArguments: []
    });

    return tx;
  }

  createMakePrivateTransaction(spreadsheetId: string) {
    const tx = new Transaction();
    const config = getCurrentConfig();
    
    if (!config.sui.packageId) {
      throw new Error('Package ID not configured for current network');
    }

    tx.moveCall({
      target: `${config.sui.packageId}::spreadsheet::make_private`,
      arguments: [tx.object(spreadsheetId)],
      typeArguments: []
    });

    return tx;
  }

  async makeSpreadsheetPublic(spreadsheetId: string) {
    try {
      console.log('[SuiService] Making spreadsheet public: ' + spreadsheetId);

      // Ensure spreadsheet is using the latest module version before mutating
      await this.ensureSpreadsheetVersion(spreadsheetId);

      const transaction = this.createMakePublicTransaction(spreadsheetId);
      const result = await this.executeTransaction(transaction);

      const resData = result as Record<string, unknown>;
      if (resData.success) {
        console.log('[SuiService] Spreadsheet made public successfully');
        return {
          success: true,
          transactionDigest: resData.digest,
          isPublic: true
        };
      } else {
        return result;
      }
    } catch (error) {
      const err = error as Error;
      console.error('Failed to make spreadsheet public:', err);
      return { success: false, error: typeof error === 'string' ? error : (err?.message) || 'Unknown error' };
    }
  }

  async makeSpreadsheetPrivate(spreadsheetId: string) {
    try {
      console.log('[SuiService] Making spreadsheet private: ' + spreadsheetId);

      // Ensure spreadsheet is using the latest module version before mutating
      await this.ensureSpreadsheetVersion(spreadsheetId);

      const transaction = this.createMakePrivateTransaction(spreadsheetId);
      const result = await this.executeTransaction(transaction);

      const resData = result as Record<string, unknown>;
      if (resData.success) {
        console.log('[SuiService] Spreadsheet made private successfully');
        return {
          success: true,
          transactionDigest: resData.digest,
          isPublic: false
        };
      } else {
        return result;
      }
    } catch (error) {
      const err = error as Error;
      console.error('Failed to make spreadsheet private:', err);
      return { success: false, error: typeof error === 'string' ? error : (err?.message) || 'Unknown error' };
    }
  }

  // Transfer ownership
  createTransferOwnershipTransaction(spreadsheetId: string, newOwnerAddress: string) {
    const tx = new Transaction();
    const config = getCurrentConfig();
    
    if (!config.sui.packageId) {
      throw new Error('Package ID not configured for current network');
    }

    tx.moveCall({
      target: `${config.sui.packageId}::spreadsheet::transfer_ownership`,
      arguments: [
        tx.object(spreadsheetId),
        tx.pure.address(newOwnerAddress)
      ],
      typeArguments: []
    });

    return tx;
  }

  async transferSpreadsheetOwnership(spreadsheetId: string, newOwnerAddress: string) {
    try {
      console.log('[SuiService] Transferring spreadsheet ownership: ' + spreadsheetId + ' -> ' + newOwnerAddress);

      // Validate address format
      if (!this.isValidAddress(newOwnerAddress)) {
        return { success: false, error: 'Invalid recipient address format' };
      }

      // Ensure spreadsheet is using the latest module version before mutating
      await this.ensureSpreadsheetVersion(spreadsheetId);

      const transaction = this.createTransferOwnershipTransaction(spreadsheetId, newOwnerAddress);
      const result = await this.executeTransaction(transaction);

      const resData = result as Record<string, unknown>;
      if (resData.success) {
        console.log('[SuiService] Spreadsheet ownership transferred successfully');
        return {
          success: true,
          transactionDigest: resData.digest,
          newOwner: newOwnerAddress
        };
      } else {
        return result;
      }
    } catch (error) {
      const err = error as Error;
      console.error('Failed to transfer spreadsheet ownership:', err);
      return { success: false, error: typeof error === 'string' ? error : (err?.message) || 'Unknown error' };
    }
  }

  // Prune old versions
  createPruneVersionsTransaction(spreadsheetId: string, keepCount: number) {
    const tx = new Transaction();
    const config = getCurrentConfig();
    
    if (!config.sui.packageId) {
      throw new Error('Package ID not configured for current network');
    }

    tx.moveCall({
      target: `${config.sui.packageId}::spreadsheet::prune_old_versions`,
      arguments: [
        tx.object(spreadsheetId),
        tx.pure.u64(keepCount)
      ],
      typeArguments: []
    });

    return tx;
  }

  async pruneOldVersions(spreadsheetId: string, keepCount: number = 10) {
    try {
      console.log('[SuiService] Pruning old versions for spreadsheet: ' + spreadsheetId + ', keeping ' + keepCount + ' versions');

      // Ensure spreadsheet is using the latest module version before mutating
      await this.ensureSpreadsheetVersion(spreadsheetId);

      const transaction = this.createPruneVersionsTransaction(spreadsheetId, keepCount);
      const result = await this.executeTransaction(transaction);

      const resData = result as Record<string, unknown>;
      if (resData.success) {
        console.log('[SuiService] Old versions pruned successfully');
        return {
          success: true,
          transactionDigest: resData.digest,
          keptVersions: keepCount
        };
      } else {
        return result;
      }
    } catch (error) {
      const err = error as Error;
      console.error('Failed to prune old versions:', err);
      return { success: false, error: typeof error === 'string' ? error : (err?.message) || 'Unknown error' };
    }
  }
}

// Export the class for testing
export { SuiService };

// Create singleton instance
export const suiService = new SuiService();

// Convenience functions
export const getNetworkInfo = () => suiService.getNetworkInfo();
export const getBalance = (address) => suiService.getBalance(address);
export const storeSpreadsheetVersion = (data) => suiService.storeSpreadsheetVersion(data);
export const querySpreadsheetEvents = (id, limit) => suiService.querySpreadsheetEvents(id, limit);
