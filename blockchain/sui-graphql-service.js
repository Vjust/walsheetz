// Sui GraphQL Service for Walrus blob and PoA metadata queries
import { getCurrentConfig } from './config.js';
import { createLogger } from '../scripts/utils/logger.js';
import { IGraphQLResponse } from '../frontend/interfaces/graphql/IGraphQLResponse.js';

const logger = createLogger('SuiGraphQLService');

/**
 * Service for querying Sui blockchain data via GraphQL RPC
 * Provides presets for common Walrus blob and PoA queries
 */
export class SuiGraphQLService {
  constructor() {
    this.config = getCurrentConfig();
    this.graphqlUrl = this.config.sui.graphqlUrl;
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes default
    this.maxRetries = 3;
    this.retryDelayMs = 1000;

    logger.info(`Initialized with GraphQL URL: ${this.graphqlUrl}`);
  }

  /**
   * Execute a GraphQL query with retry logic
   * @param {string} query - GraphQL query string
   * @param {Object} variables - Query variables
   * @param {Object} options - Query options (cache, retry)
   * @returns {Promise<Object>} Query result
   */
  async executeQuery(query, variables = {}, options = {}) {
    const {
      useCache = true,
      cacheTTL = this.cacheTTL,
      maxRetries = this.maxRetries,
      retryDelayMs = this.retryDelayMs
    } = options;

    // Generate cache key
    const cacheKey = this._generateCacheKey(query, variables);

    // Check cache if enabled
    if (useCache) {
      const cached = this._getFromCache(cacheKey);
      if (cached) {
        logger.debug('Cache hit', { cacheKey: cacheKey.substring(0, 32) });
        return cached;
      }
    }

    // Execute query with retry logic
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(this.graphqlUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query, variables })
        });

        if (!response.ok) {
          throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();

        if (result.errors) {
          throw new Error(`GraphQL errors: ${result.errors.map(e => e.message).join(', ')}`);
        }

        // Cache successful result
        if (useCache && result.data) {
          this._setToCache(cacheKey, result.data, cacheTTL);
        }

        logger.debug('Query executed successfully', {
          attempt: attempt + 1,
          hasData: !!result.data
        });

        return result.data;
      } catch (error) {
        lastError = error;
        logger.warn(`Query attempt ${attempt + 1} failed: ${error.message}`);

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries - 1) {
          await this._delay(retryDelayMs * Math.pow(2, attempt));
        }
      }
    }

    logger.error('Query failed after all retries', { error: lastError.message });
    throw lastError;
  }

  /**
   * Query blobs owned by a specific address
   * @param {string} ownerAddress - Sui address of blob owner
   * @param {Object} options - Pagination and filter options
   * @returns {Promise<Object>} Blobs and pagination info
   */
  async getBlobsByOwner(ownerAddress, options = {}) {
    const {
      first = 20,
      after = null,
      sortBy = 'timestamp',
      sortOrder = 'DESC'
    } = options;

    const query = `
      query GetBlobsByOwner($owner: SuiAddress!, $first: Int, $after: String) {
        objects(
          first: $first
          after: $after
          filter: {
            owner: $owner
            type: "0x::walrus::Blob"
          }
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            address
            objectId
            version
            digest
            owner {
              ... on AddressOwner {
                owner {
                  address
                }
              }
            }
            contents {
              type {
                repr
              }
              json
            }
            storageRebate
            previousTransactionBlock {
              digest
              effects {
                timestamp
              }
            }
          }
        }
      }
    `;

    const variables = {
      owner: ownerAddress,
      first,
      after
    };

    const data = await this.executeQuery(query, variables, {
      cacheTTL: 2 * 60 * 1000 // 2 minutes for blob lists
    });

    return this._transformBlobsResponse(data.objects);
  }

  /**
   * Query wallet transaction history
   * @param {string} address - Wallet address
   * @param {Object} options - Pagination and filter options
   * @returns {Promise<Object>} Transactions and pagination info
   */
  async getWalletHistory(address, options = {}) {
    const {
      first = 20,
      after = null,
      filter = {}
    } = options;

    const query = `
      query GetWalletHistory($address: SuiAddress!, $first: Int, $after: String) {
        transactionBlocks(
          first: $first
          after: $after
          filter: {
            signAddress: $address
          }
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            digest
            sender {
              address
            }
            effects {
              status
              timestamp
              gasEffects {
                gasObject {
                  owner {
                    ... on AddressOwner {
                      owner {
                        address
                      }
                    }
                  }
                }
                gasSummary {
                  computationCost
                  storageCost
                  storageRebate
                }
              }
              executedEpoch
            }
            expiration {
              epochId
            }
          }
        }
      }
    `;

    const variables = {
      address,
      first,
      after
    };

    const data = await this.executeQuery(query, variables, {
      cacheTTL: 1 * 60 * 1000 // 1 minute for transaction history
    });

    return this._transformTransactionsResponse(data.transactionBlocks);
  }

  /**
   * Query Walrus Site assets
   * @param {string} siteId - Walrus Site ID
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} Site assets and metadata
   */
  async getWalrusSiteAssets(siteId, options = {}) {
    const {
      first = 50,
      after = null
    } = options;

    const query = `
      query GetWalrusSiteAssets($siteId: SuiAddress!, $first: Int, $after: String) {
        object(address: $siteId) {
          address
          objectId
          version
          digest
          owner {
            ... on AddressOwner {
              owner {
                address
              }
            }
          }
          contents {
            type {
              repr
            }
            json
          }
          dynamicFields(first: $first, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              name {
                type {
                  repr
                }
                json
              }
              value {
                ... on MoveObject {
                  contents {
                    type {
                      repr
                    }
                    json
                  }
                }
              }
            }
          }
        }
      }
    `;

    const variables = {
      siteId,
      first,
      after
    };

    const data = await this.executeQuery(query, variables);

    return this._transformSiteAssetsResponse(data.object);
  }

  /**
   * Query PoA (Proof of Availability) certificate status for a blob
   * @param {string} blobId - Blob ID or object ID
   * @returns {Promise<Object>} PoA certificate status
   */
  async getPoACertificateStatus(blobId) {
    const query = `
      query GetPoAStatus($blobId: SuiAddress!) {
        object(address: $blobId) {
          address
          objectId
          version
          contents {
            type {
              repr
            }
            json
          }
          dynamicFields(first: 10) {
            nodes {
              name {
                type {
                  repr
                }
                json
              }
              value {
                ... on MoveObject {
                  contents {
                    type {
                      repr
                    }
                    json
                  }
                }
              }
            }
          }
        }
      }
    `;

    const variables = {
      blobId
    };

    const data = await this.executeQuery(query, variables, {
      cacheTTL: 10 * 60 * 1000 // 10 minutes for PoA certificates
    });

    return this._transformPoAResponse(data.object);
  }

  /**
   * Query blob metadata by ID
   * @param {string} blobId - Blob ID or object ID
   * @returns {Promise<Object>} Blob metadata
   */
  async getBlobMetadata(blobId) {
    const query = `
      query GetBlobMetadata($blobId: SuiAddress!) {
        object(address: $blobId) {
          address
          objectId
          version
          digest
          owner {
            ... on AddressOwner {
              owner {
                address
              }
            }
          }
          contents {
            type {
              repr
            }
            json
          }
          storageRebate
          previousTransactionBlock {
            digest
            effects {
              timestamp
              status
            }
          }
        }
      }
    `;

    const variables = {
      blobId
    };

    const data = await this.executeQuery(query, variables);

    return this._transformBlobMetadata(data.object);
  }

  /**
   * Poll for updates to a query at specified intervals
   * @param {Function} queryFn - Query function to execute
   * @param {number} intervalMs - Polling interval in milliseconds
   * @param {Function} callback - Callback for results
   * @returns {Function} Stop function to cancel polling
   */
  startPolling(queryFn, intervalMs, callback) {
    let active = true;
    let timeoutId;

    const poll = async () => {
      if (!active) return;

      try {
        const result = await queryFn();
        if (active && callback) {
          callback(null, result);
        }
      } catch (error) {
        if (active && callback) {
          callback(error, null);
        }
      }

      if (active) {
        timeoutId = setTimeout(poll, intervalMs);
      }
    };

    // Start polling
    poll();

    // Return stop function
    return () => {
      active = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      logger.debug('Polling stopped');
    };
  }

  /**
   * Clear cache entries
   * @param {string} pattern - Optional pattern to match cache keys
   */
  clearCache(pattern = null) {
    if (!pattern) {
      this.cache.clear();
      logger.info('Cache cleared completely');
      return;
    }

    let cleared = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        cleared++;
      }
    }

    logger.info(`Cache cleared: ${cleared} entries matching pattern "${pattern}"`);
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  _generateCacheKey(query, variables) {
    const queryHash = this._simpleHash(query);
    const varsHash = this._simpleHash(JSON.stringify(variables));
    return `${queryHash}-${varsHash}`;
  }

  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  _getFromCache(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  _setToCache(key, data, ttl) {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl
    });

    // Periodic cache cleanup
    if (this.cache.size > 1000) {
      this._cleanupCache();
    }
  }

  _cleanupCache() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    logger.debug(`Cache cleanup: removed ${cleaned} expired entries`);
  }

  async _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _transformBlobsResponse(objectsData) {
    if (!objectsData) {
      return IGraphQLResponse.empty();
    }

    const blobs = objectsData.nodes.map(node => ({
      blobId: node.address,
      objectId: node.objectId,
      version: node.version,
      digest: node.digest,
      owner: node.owner?.owner?.address || null,
      type: node.contents?.type?.repr || null,
      contents: this._parseJSON(node.contents?.json),
      size: this._parseJSON(node.contents?.json)?.size || 0,
      contentType: this._parseJSON(node.contents?.json)?.content_type || null,
      storageRebate: node.storageRebate || 0,
      createdAt: node.previousTransactionBlock?.effects?.timestamp || null,
      timestamp: node.previousTransactionBlock?.effects?.timestamp || null,
      transactionDigest: node.previousTransactionBlock?.digest || null
    }));

    return new IGraphQLResponse({
      items: blobs,
      pageInfo: objectsData.pageInfo || { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
      totalCount: blobs.length,
      error: null,
      metadata: { source: 'sui_graphql', queryType: 'blobs' }
    });
  }

  _transformTransactionsResponse(transactionBlocksData) {
    if (!transactionBlocksData) {
      return IGraphQLResponse.empty();
    }

    const transactions = transactionBlocksData.nodes.map(node => ({
      digest: node.digest,
      sender: node.sender?.address || null,
      status: node.effects?.status || null,
      timestamp: node.effects?.timestamp || null,
      gasUsed: {
        computationCost: node.effects?.gasEffects?.gasSummary?.computationCost || 0,
        storageCost: node.effects?.gasEffects?.gasSummary?.storageCost || 0,
        storageRebate: node.effects?.gasEffects?.gasSummary?.storageRebate || 0
      },
      epoch: node.effects?.executedEpoch || null,
      expiration: node.expiration?.epochId || null,
      // Add coins field for WalletAssetTable compatibility
      coins: [] // Note: actual coins need to be extracted from effects.balanceChanges
    }));

    return new IGraphQLResponse({
      items: transactions,
      pageInfo: transactionBlocksData.pageInfo || { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
      totalCount: transactions.length,
      error: null,
      metadata: { source: 'sui_graphql', queryType: 'transactions' }
    });
  }

  _transformSiteAssetsResponse(objectData) {
    if (!objectData) {
      return IGraphQLResponse.empty();
    }

    const site = {
      siteId: objectData.address,
      objectId: objectData.objectId,
      version: objectData.version,
      digest: objectData.digest,
      owner: objectData.owner?.owner?.address || null,
      metadata: this._parseJSON(objectData.contents?.json)
    };

    const assets = objectData.dynamicFields?.nodes?.map(field => {
      const value = this._parseJSON(field.value?.contents?.json);
      return {
        path: this._parseJSON(field.name?.json)?.path || field.name?.json || 'index.html',
        name: this._parseJSON(field.name?.json),
        type: field.name?.type?.repr || null,
        // Map blob fields for WalrusSiteViewer
        blobId: value?.blob_id || value?.blobId || null,
        size: value?.size || 0,
        contentType: value?.content_type || value?.contentType || null,
        value: value,
        valueType: field.value?.contents?.type?.repr || null
      };
    }) || [];

    return new IGraphQLResponse({
      items: assets,
      pageInfo: objectData.dynamicFields?.pageInfo || { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
      totalCount: assets.length,
      error: null,
      metadata: { source: 'sui_graphql', queryType: 'site_assets', site }
    });
  }

  _transformPoAResponse(objectData) {
    if (!objectData) {
      return IGraphQLResponse.error('Blob not found', 'NOT_FOUND');
    }

    // Look for PoA certificate in dynamic fields
    const poaField = objectData.dynamicFields?.nodes?.find(field => {
      const fieldType = field.name?.type?.repr || '';
      return fieldType.includes('poa') || fieldType.includes('certificate');
    });

    const certificate = poaField ? this._parseJSON(poaField.value?.contents?.json) : null;

    const poaData = {
      blobId: objectData.address,
      objectId: objectData.objectId,
      poaStatus: certificate ? 'certified' : 'uncertified',
      certificate: certificate ? {
        validators: certificate.validators || [],
        timestamp: certificate.timestamp || null,
        expiry: certificate.expiry || null,
        metadata: certificate
      } : null
    };

    return IGraphQLResponse.success([poaData], {}, { source: 'sui_graphql', queryType: 'poa_status' });
  }

  _transformBlobMetadata(objectData) {
    if (!objectData) {
      return IGraphQLResponse.error('Blob not found', 'NOT_FOUND');
    }

    const contents = this._parseJSON(objectData.contents?.json);

    const blob = {
      blobId: objectData.address,
      objectId: objectData.objectId,
      version: objectData.version,
      digest: objectData.digest,
      owner: objectData.owner?.owner?.address || null,
      type: objectData.contents?.type?.repr || null,
      size: contents?.size || null,
      contentType: contents?.content_type || null,
      encoding: contents?.encoding || null,
      metadata: contents,
      storageRebate: objectData.storageRebate || 0,
      timestamp: objectData.previousTransactionBlock?.effects?.timestamp || null,
      transactionDigest: objectData.previousTransactionBlock?.digest || null,
      transactionStatus: objectData.previousTransactionBlock?.effects?.status || null
    };

    return IGraphQLResponse.success([blob], {}, { source: 'sui_graphql', queryType: 'blob_metadata' });
  }

  _parseJSON(jsonString) {
    if (!jsonString) return null;
    if (typeof jsonString === 'object') return jsonString;

    try {
      return JSON.parse(jsonString);
    } catch {
      return null;
    }
  }
}

// Export singleton instance
export const suiGraphQLService = new SuiGraphQLService();
