// NOTE: Node/server/CLI usage only. The React UI must use frontend/services/* (Browser*Service).
// Sui blockchain service for WalSheetz
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { getCurrentConfig, isTestnet } from './config.js';
import { walletManager } from './wallet-manager.js';
import { ResilientExecutor } from '../frontend/utils/CircuitBreaker.js';
import RateLimiter from './utils/rateLimiter.js';
import { configLoader } from '../frontend/utils/ConfigLoader.js';
import { detectSaveVersionSignature } from '../frontend/utils/AbiHelpers.js';

class SuiService {
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
  isRateLimitError(err) {
    const m = (err?.message || '').toLowerCase();
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
      console.error('Failed to get network info:', error);
      throw error;
    }
  }

  // Get account balance
  async getBalance(address) {
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
  
  async _getBalanceInternal(address) {
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
      console.error('Failed to get balance:', error);
      throw error;
    }
  }

  // Get owned objects
  async getOwnedObjects(address, options = {}) {
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
  
  async _getOwnedObjectsInternal(address, options = {}) {
    try {
      // Extract filter separately to avoid duplication
      const { filter, ...otherOptions } = options;
      
      const result = await this.client.getOwnedObjects({
        owner: address,
        filter: filter,
        options: {
          showContent: true,
          showOwner: true,
          showType: true,
          ...otherOptions
        }
      });
      
      return result;
    } catch (error) {
      console.error('Failed to get owned objects:', error);
      throw error;
    }
  }

  // Create a transaction for storing spreadsheet metadata with ABI-driven signature detection
  async createStorageTransaction(data) {
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
    const args = includeContentHash
      ? [
          tx.object(data.spreadsheetObjectId),
          tx.pure.string(data.walrusBlobId),
          tx.pure.string(data.contentHash || ''),
          tx.pure.u64(data.cellCount || 0),
          tx.pure.string(data.description || `Version ${data.version}`),
          tx.object('0x6')
        ]
      : [
          tx.object(data.spreadsheetObjectId),
          tx.pure.string(data.walrusBlobId),
          tx.pure.u64(data.cellCount || 0),
          tx.pure.string(data.description || `Version ${data.version}`),
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
  createEnhancedStorageTransaction(data) {
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
      primaryBlobId: data.walrusBlobId,
      redundantBlobIds: data.redundantBlobIds || [],
      hasRedundancy: !!(data.redundantBlobIds && data.redundantBlobIds.length > 0),
      isDelta: data.isDelta || false,
      compressionRatio: data.compressionRatio || 1.0,
      integrityVerified: data.integrityVerified || false
    };

    console.log('🔗 Creating storage transaction with enhanced metadata (tracked off-chain):', {
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
    const args = includeContentHash
      ? [
          tx.object(data.spreadsheetObjectId),
          tx.pure.string(metadata.primaryBlobId),
          tx.pure.string(data.contentHash || ''),
          tx.pure.u64(data.cellCount || 0),
          tx.pure.string(enhancedDescription.substring(0, 500)),
          tx.object('0x6')
        ]
      : [
          tx.object(data.spreadsheetObjectId),
          tx.pure.string(metadata.primaryBlobId),
          tx.pure.u64(data.cellCount || 0),
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
  createSpreadsheetTransaction(title = 'Untitled Spreadsheet') {
    return this.createSpreadsheet(title);
  }

  // Create a new spreadsheet on-chain
  createSpreadsheet(title = 'Untitled Spreadsheet') {
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
  async createSpreadsheetWithInitialVersion(title, walrusBlobId, contentHash, cellCount = 0, description = 'Initial version') {
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

    console.log('[ABI] createSpreadsheetWithInitialVersion built with signature:', sig.debug || sig);

    return tx;
  }

  // Validate if spreadsheet object exists on blockchain
  async validateSpreadsheetObjectExists(spreadsheetObjectId) {
    try {
      if (!spreadsheetObjectId) {
        return { exists: false, error: 'No spreadsheet object ID provided' };
      }

      const config = getCurrentConfig();
      if (!config.sui.packageId) {
        return { exists: false, error: 'Package ID not configured for current network' };
      }

      // Use resilient executor for object validation
      const result = await this.queryExecutor.execute(async () => {
        return await this.client.getObject({
          id: spreadsheetObjectId,
          options: {
            showContent: true,
            showType: true,
            showOwner: true
          }
        });
      });

      if (!result.data) {
        return {
          exists: false,
          error: 'Object not found on blockchain',
          objectId: spreadsheetObjectId
        };
      }

      // Verify it's actually a spreadsheet object
      const expectedType = `${config.sui.packageId}::spreadsheet::Spreadsheet`;
      if (result.data.type !== expectedType) {
        return {
          exists: false,
          error: `Object exists but is not a spreadsheet (type: ${result.data.type})`,
          objectId: spreadsheetObjectId
        };
      }

      return {
        exists: true,
        objectId: spreadsheetObjectId,
        data: result.data
      };
    } catch (error) {
      console.error('Failed to validate spreadsheet object:', error);
      return {
        exists: false,
        error: `Validation failed: ${typeof error === 'string' ? error : (error && error.message) || 'Unknown error'}`,
        objectId: spreadsheetObjectId
      };
    }
  }

  // Get user's owned spreadsheets
  async getUserSpreadsheets(address) {
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
  
  async _getUserSpreadsheetsInternal(address) {
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
      const spreadsheets = result.data
        .filter(item => item.data?.content)
        .map(item => {
          const content = item.data.content;
          return {
            objectId: item.data.objectId,
            title: content.fields?.title || 'Untitled Spreadsheet',
            owner: content.fields?.owner || address,
            created_at: content.fields?.created_at || Date.now(),
            last_modified: content.fields?.last_modified || Date.now(),
            version_count: content.fields?.version_count || 0,
            current_version: content.fields?.current_version,
            is_public: content.fields?.is_public || false
          };
        })
        .sort((a, b) => b.last_modified - a.last_modified); // Sort by most recent

      console.log(`[SuiService] Found ${spreadsheets.length} spreadsheets for address ${address}`);
      return spreadsheets;
    } catch (error) {
      console.error('Failed to get user spreadsheets:', error);
      throw error;
    }
  }

  // Get spreadsheet versions for a specific spreadsheet
  async getSpreadsheetVersions(spreadsheetId) {
    try {
      const config = getCurrentConfig();
      if (!config.sui.packageId) {
        throw new Error('Package ID not configured for current network');
      }

      // Query for Version objects that belong to this spreadsheet
      const result = await this.client.queryObjects({
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

      // Parse version metadata including content hash
      const versions = result.data
        .filter(item => item.data?.content)
        .map(item => {
          const content = item.data.content;
          return {
            objectId: item.data.objectId,
            spreadsheet_id: content.fields?.spreadsheet_id || spreadsheetId,
            version_number: content.fields?.version_number || 1,
            parent_version: content.fields?.parent_version,
            walrus_blob_id: content.fields?.walrus_blob_id,
            content_hash: content.fields?.content_hash, // Include content hash for integrity verification
            cell_count: content.fields?.cell_count || 0,
            created_at: content.fields?.created_at || Date.now(),
            created_by: content.fields?.created_by,
            description: content.fields?.description || 'Version'
          };
        })
        .sort((a, b) => b.version_number - a.version_number); // Sort by version number desc

      console.log(`[SuiService] Found ${versions.length} versions for spreadsheet ${spreadsheetId}`);
      return versions;
    } catch (error) {
      console.error('Failed to get spreadsheet versions:', error);
      throw error;
    }
  }

  // Get latest version data for a spreadsheet
  async getSpreadsheetData(spreadsheetId, walrusService) {
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
      const blobData = await walrusService.retrieveBlob(
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
      console.error('Failed to get spreadsheet data:', error);
      throw error;
    }
  }

  // Enhanced data retrieval with redundancy support
  async getSpreadsheetDataWithRedundancy(spreadsheetId, walrusService) {
    try {
      console.log(`🛡️ Loading spreadsheet data with redundancy support: ${spreadsheetId}`);
      
      const versions = await this.getEnhancedSpreadsheetVersions(spreadsheetId);
      
      if (versions.length === 0) {
        throw new Error(`No versions found for spreadsheet ${spreadsheetId}`);
      }

      const latestVersion = versions[0];
      
      // Prepare blob IDs for redundant retrieval
      const blobIds = [latestVersion.walrus_blob_id];
      if (latestVersion.redundant_blob_ids && latestVersion.redundant_blob_ids.length > 0) {
        blobIds.push(...latestVersion.redundant_blob_ids);
      }

      console.log(`🛡️ Attempting retrieval from ${blobIds.length} blob sources`);
      
      // Retrieve with redundancy fallback
      let blobData;
      if (blobIds.length > 1) {
        blobData = await walrusService.retrieveWithRedundancy(
          blobIds,
          latestVersion.content_hash
        );
      } else {
        blobData = await walrusService.retrieveBlob(
          latestVersion.walrus_blob_id,
          latestVersion.content_hash
        );
      }
      
      // Enhanced integrity verification logging
      if (blobData.success && blobData.verificationPerformed) {
        if (blobData.integrityVerified) {
          console.log('✅ Content integrity verified with redundancy support');
          
          if (blobData.usedFallback) {
            console.warn('⚠️ Primary blob failed, used redundant copy:', {
              primaryBlobId: latestVersion.walrus_blob_id,
              successfulBlobId: blobData.redundancyInfo?.successfulBlobId
            });
          }
        } else {
          console.error('❌ CRITICAL SECURITY: Content integrity verification FAILED even with redundancy!', {
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
        fallbackUsed: blobData.usedFallback || false
      };
    } catch (error) {
      console.error('Failed to get spreadsheet data with redundancy:', error);
      throw error;
    }
  }

  // Get enhanced version history with metadata
  // Since VersionEnhanced doesn't exist, we parse enhanced metadata from description field
  async getEnhancedSpreadsheetVersions(spreadsheetId) {
    try {
      const config = getCurrentConfig();
      if (!config.sui.packageId) {
        throw new Error('Package ID not configured for current network');
      }

      console.log(`[SuiService] Querying versions for spreadsheet: ${spreadsheetId}`);

      // Query for regular Version objects (VersionEnhanced doesn't exist)
      const result = await this.client.queryObjects({
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

      // Parse version metadata and extract enhanced data from description if available
      const versions = result.data
        .filter(item => item.data?.content)
        .map(item => {
          const content = item.data.content;
          const description = content.fields?.description || 'Version';
          
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
          
          return {
            objectId: item.data.objectId,
            spreadsheet_id: content.fields?.spreadsheet_id || spreadsheetId,
            version_number: content.fields?.version_number || 1,
            parent_version: content.fields?.parent_version,
            walrus_blob_id: content.fields?.walrus_blob_id,
            redundant_blob_ids: enhancedMetadata.redundant_blob_ids,
            content_hash: content.fields?.content_hash,
            cell_count: content.fields?.cell_count || 0,
            created_at: content.fields?.created_at || Date.now(),
            created_by: content.fields?.created_by,
            description: description,
            // Enhanced metadata parsed from description
            has_redundancy: enhancedMetadata.has_redundancy,
            is_delta: enhancedMetadata.is_delta,
            compression_ratio: enhancedMetadata.compression_ratio,
            integrity_verified: enhancedMetadata.integrity_verified
          };
        })
        .sort((a, b) => b.version_number - a.version_number);

      console.log(`[SuiService] Found ${versions.length} versions for spreadsheet ${spreadsheetId}`);
      return versions;
    } catch (error) {
      console.warn('Error querying versions, falling back to standard versions');
      return this.getSpreadsheetVersions(spreadsheetId);
    }
  }

  // Verify integrity of a specific version on-chain
  async verifyVersionIntegrity(versionObjectId, walrusService) {
    try {
      console.log(`🔍 Verifying integrity of version: ${versionObjectId}`);
      
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

      const content = versionObject.data.content;
      const versionData = {
        walrus_blob_id: content.fields?.walrus_blob_id,
        redundant_blob_ids: content.fields?.redundant_blob_ids || [],
        content_hash: content.fields?.content_hash,
        has_redundancy: content.fields?.has_redundancy || false
      };

      // Verify integrity using Walrus service
      let integrityResult;
      const allBlobIds = [versionData.walrus_blob_id, ...versionData.redundant_blob_ids];
      
      if (versionData.has_redundancy && allBlobIds.length > 1) {
        console.log('🛡️ Performing redundancy health check');
        integrityResult = await walrusService.checkRedundancyHealth(
          allBlobIds,
          versionData.content_hash
        );
      } else {
        console.log('🔍 Performing single blob integrity check');
        integrityResult = await walrusService.verifyBlobIntegrity(
          versionData.walrus_blob_id,
          versionData.content_hash
        );
      }

      console.log('🔍 Version integrity verification completed:', {
        versionObjectId,
        blobId: versionData.walrus_blob_id,
        hasRedundancy: versionData.has_redundancy,
        integrityPassed: integrityResult.success && integrityResult.integrityVerified !== false
      });

      return {
        success: true,
        versionObjectId,
        blobIds: allBlobIds,
        hasRedundancy: versionData.has_redundancy,
        integrityResult,
        overallIntegrity: integrityResult.success && integrityResult.integrityVerified !== false
      };
      
    } catch (error) {
      console.error(`Failed to verify version integrity: ${typeof error === 'string' ? error : (error && error.message) || 'Unknown error'}`);
      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        versionObjectId
      };
    }
  }

  // Lock a cell for editing
  createCellLockTransaction(spreadsheetId, cellRef) {
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
  createCellUnlockTransaction(spreadsheetId, cellRef) {
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
  async executeTransaction(transaction) {
    return this.transactionExecutor.execute(async () => {
      if (!walletManager.isConnected) {
        throw new Error('Wallet not connected');
      }

      console.log('🔗 Executing transaction with wallet...');
      const result = await walletManager.signAndExecuteTransaction(transaction);
      
      console.log('✅ Transaction executed successfully:', result.digest);
      return {
        success: true,
        digest: result.digest,
        effects: result.effects,
        events: result.events,
        objectChanges: result.objectChanges,
        balanceChanges: result.balanceChanges
      };
    }, async (error) => {
      // Fallback: provide meaningful error response
      console.error('❌ Transaction execution failed after retries:', typeof error === 'string' ? error : (error && error.message) || 'Unknown error');
      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        fallback: 'transaction_failed_with_retries'
      };
    });
  }

  // Get resilience statistics
  getTransactionStats() {
    return this.transactionExecutor.getStats();
  }

  getQueryStats() {
    return this.queryExecutor.getStats();
  }

  // Store spreadsheet version metadata on blockchain
  async storeSpreadsheetVersion(versionData) {
    try {
      const transaction = await this.createStorageTransaction(versionData);
      const result = await this.executeTransaction(transaction);
      
      return {
        success: true,
        transactionDigest: result.digest,
        version: versionData.version,
        walrusBlobId: versionData.walrusBlobId
      };
    } catch (error) {
      console.error('Failed to store spreadsheet version:', error);
      throw error;
    }
  }

  // Query transaction history via GraphQL
  async queryTransactionHistory(address, limit = 10) {
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

      const result = await response.json();
      
      if (result.errors) {
        throw new Error(`GraphQL query failed: ${typeof result.errors[0] === 'string' ? result.errors[0] : result.errors[0].message || 'Unknown error'}`);
      }

      return result.data.transactionBlocks.nodes;
    } catch (error) {
      console.error('Failed to query transaction history:', error);
      throw error;
    }
  }

  // Query events for spreadsheet storage
  async querySpreadsheetEvents(spreadsheetId, limit = 50) {
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
          console.warn(`Failed to query event type ${eventType}:`, typeof err === 'string' ? err : err.message || 'Unknown error');
        }
      }

      // Filter events for specific spreadsheet
      const filteredEvents = allEvents.filter(event => {
        try {
          const eventData = event.parsedJson;
          // Check if this event is related to our spreadsheet
          return eventData.spreadsheet_id === spreadsheetId || 
                 eventData.spreadsheetId === spreadsheetId;
        } catch {
          return false;
        }
      });

      // Sort by timestamp descending and limit
      filteredEvents.sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
      const limitedEvents = filteredEvents.slice(0, limit);

      return limitedEvents.map(event => ({
        id: event.id,
        timestamp: event.timestampMs,
        sender: event.sender,
        data: event.parsedJson,
        eventType: event.type.split('::').pop(), // Extract just the event name
        transactionDigest: event.transactionDigest
      }));
    } catch (error) {
      console.error('Failed to query spreadsheet events:', error);
      throw error;
    }
  }

  // Generic query events method for testing
  async queryEvents(options) {
    try {
      const query = {};
      
      if (options.type) {
        query.MoveEventType = options.type;
      }
      if (options.sender) {
        query.Sender = options.sender;
      }
      
      const queryParams = { query };
      
      // Only add limit and order if explicitly provided
      if (options.limit !== undefined) {
        queryParams.limit = options.limit;
      }
      if (options.order !== undefined) {
        queryParams.order = options.order;
      }
      
      const result = await this.client.queryEvents(queryParams);
      
      return result;
    } catch (error) {
      console.error('Failed to query events:', error);
      throw error;
    }
  }

  // Get transaction block (alias for getTransactionDetails for consistency)
  async getTransactionBlock(digest, options = {}) {
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
      console.error('Failed to get transaction block:', error);
      throw error;
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

      return transaction;
    } catch (error) {
      console.error('Failed to get transaction details:', error);
      throw error;
    }
  }

  // Estimate gas for transaction
  async estimateGas(transaction, address) {
    try {
      if (!walletManager.currentAccount) {
        throw new Error('No wallet account available');
      }

      const gasEstimate = await this.client.dryRunTransactionBlock({
        transactionBlock: transaction.serialize()
      });

      const computationCost = parseInt(gasEstimate.effects.gasUsed.computationCost);
      const storageCost = parseInt(gasEstimate.effects.gasUsed.storageCost);
      const storageRebate = parseInt(gasEstimate.effects.gasUsed.storageRebate);
      const totalCost = computationCost + storageCost - storageRebate;
      
      const gasPrice = 1000; // Current reference gas price
      const estimatedUnits = Math.ceil(totalCost / gasPrice);
      
      const result = {
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
      console.error('Failed to estimate gas:', error);
      throw error; // Propagate error instead of returning defaults
    }
  }

  // Check if wallet has sufficient balance for transaction
  async checkSufficientBalance(estimatedGas) {
    try {
      if (!walletManager.currentAccount) {
        return { sufficient: false, error: 'No wallet connected' };
      }

      const balance = await this.getBalance(walletManager.currentAccount.address);
      const totalBalanceMIST = parseInt(balance.totalBalance);
      const requiredGasMIST = parseInt(estimatedGas.totalGasUsed);
      
      // Add 20% buffer for gas price fluctuations
      const requiredWithBuffer = Math.floor(requiredGasMIST * 1.2);

      return {
        sufficient: totalBalanceMIST >= requiredWithBuffer,
        currentBalance: balance.totalBalance,
        currentBalanceSUI: (totalBalanceMIST / 1_000_000_000).toFixed(6),
        requiredGas: requiredGasMIST.toString(),
        requiredGasSUI: (requiredGasMIST / 1_000_000_000).toFixed(6),
        requiredWithBufferSUI: (requiredWithBuffer / 1_000_000_000).toFixed(6)
      };
    } catch (error) {
      console.error('Failed to check balance:', error);
      return { sufficient: false, error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error' };
    }
  }

  // Helper to check if address is valid
  isValidAddress(address) {
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
      console.error('Failed to get epoch info:', error);
      throw error;
    }
  }

  // Update spreadsheet title
  createUpdateTitleTransaction(spreadsheetId, newTitle) {
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

  async updateSpreadsheetTitle(spreadsheetId, newTitle) {
    try {
      console.log(`[SuiService] Updating spreadsheet title: ${spreadsheetId} -> "${newTitle}"`);
      
      const transaction = this.createUpdateTitleTransaction(spreadsheetId, newTitle);
      const result = await this.executeTransaction(transaction);
      
      if (result.success) {
        console.log('[SuiService] ✅ Spreadsheet title updated successfully');
        return {
          success: true,
          transactionDigest: result.digest,
          newTitle
        };
      } else {
        return result;
      }
    } catch (error) {
      console.error('Failed to update spreadsheet title:', error);
      return { success: false, error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error' };
    }
  }

  // Make spreadsheet public/private
  createMakePublicTransaction(spreadsheetId) {
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

  createMakePrivateTransaction(spreadsheetId) {
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

  async makeSpreadsheetPublic(spreadsheetId) {
    try {
      console.log(`[SuiService] Making spreadsheet public: ${spreadsheetId}`);
      
      const transaction = this.createMakePublicTransaction(spreadsheetId);
      const result = await this.executeTransaction(transaction);
      
      if (result.success) {
        console.log('[SuiService] ✅ Spreadsheet made public successfully');
        return {
          success: true,
          transactionDigest: result.digest,
          isPublic: true
        };
      } else {
        return result;
      }
    } catch (error) {
      console.error('Failed to make spreadsheet public:', error);
      return { success: false, error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error' };
    }
  }

  async makeSpreadsheetPrivate(spreadsheetId) {
    try {
      console.log(`[SuiService] Making spreadsheet private: ${spreadsheetId}`);
      
      const transaction = this.createMakePrivateTransaction(spreadsheetId);
      const result = await this.executeTransaction(transaction);
      
      if (result.success) {
        console.log('[SuiService] ✅ Spreadsheet made private successfully');
        return {
          success: true,
          transactionDigest: result.digest,
          isPublic: false
        };
      } else {
        return result;
      }
    } catch (error) {
      console.error('Failed to make spreadsheet private:', error);
      return { success: false, error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error' };
    }
  }

  // Transfer ownership
  createTransferOwnershipTransaction(spreadsheetId, newOwnerAddress) {
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

  async transferSpreadsheetOwnership(spreadsheetId, newOwnerAddress) {
    try {
      console.log(`[SuiService] Transferring spreadsheet ownership: ${spreadsheetId} -> ${newOwnerAddress}`);
      
      // Validate address format
      if (!this.isValidAddress(newOwnerAddress)) {
        return { success: false, error: 'Invalid recipient address format' };
      }
      
      const transaction = this.createTransferOwnershipTransaction(spreadsheetId, newOwnerAddress);
      const result = await this.executeTransaction(transaction);
      
      if (result.success) {
        console.log('[SuiService] ✅ Spreadsheet ownership transferred successfully');
        return {
          success: true,
          transactionDigest: result.digest,
          newOwner: newOwnerAddress
        };
      } else {
        return result;
      }
    } catch (error) {
      console.error('Failed to transfer spreadsheet ownership:', error);
      return { success: false, error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error' };
    }
  }

  // Prune old versions
  createPruneVersionsTransaction(spreadsheetId, keepCount) {
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

  async pruneOldVersions(spreadsheetId, keepCount = 10) {
    try {
      console.log(`[SuiService] Pruning old versions for spreadsheet: ${spreadsheetId}, keeping ${keepCount} versions`);
      
      const transaction = this.createPruneVersionsTransaction(spreadsheetId, keepCount);
      const result = await this.executeTransaction(transaction);
      
      if (result.success) {
        console.log('[SuiService] ✅ Old versions pruned successfully');
        return {
          success: true,
          transactionDigest: result.digest,
          keptVersions: keepCount
        };
      } else {
        return result;
      }
    } catch (error) {
      console.error('Failed to prune old versions:', error);
      return { success: false, error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error' };
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
