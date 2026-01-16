// Sui GraphQL Service for Walrus blob and PoA metadata queries
import { getCurrentConfig } from './config.js';
import { createLogger } from '@dreamlit/shared';
// Note: IGraphQLResponse type is available from '../data-integrity/interfaces/graphql/IGraphQLResponse.js'
// TypeScript consumers can import this type separately

const logger = createLogger({ prefix: 'SuiGraphQLService' });

// Stub for IGraphQLResponse when not available
const IGraphQLResponse = {
  empty: () => ({ items: [], pageInfo: {}, error: null }),
  error: (msg: string, code: string) => ({ items: [], error: msg, code }),
  success: (items: any, info: any, meta: any) => ({ items, pageInfo: info, metadata: meta })
} as any;

/**
 * Service for querying Sui blockchain data via GraphQL RPC
 * Provides presets for common Walrus blob and PoA queries
 */
export class SuiGraphQLService {
  config: any;
  graphqlUrl: string;
  cache: Map<string, any>;
  cacheTTL: number;
  maxRetries: number;
  retryDelayMs: number;

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
  async executeQuery(query: string, variables: Record<string, unknown> = {}, options: Record<string, unknown> = {}) {
    const useCache = (options.useCache ?? true) as boolean;
    const cacheTTL = (options.cacheTTL ?? this.cacheTTL) as number;
    const maxRetries = (options.maxRetries ?? this.maxRetries) as number;
    const retryDelayMs = (options.retryDelayMs ?? this.retryDelayMs) as number;

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
    let lastError: Error | null = null;
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
        const err = error as Error;
        lastError = err;
        logger.warn(`Query attempt ${attempt + 1} failed: ${err.message}`);

        if (attempt < maxRetries - 1) {
          await this._delay(retryDelayMs * Math.pow(2, attempt));
        }
      }
    }

    const err = lastError as Error;
    logger.error('Query failed after all retries', err);
    throw err;
  }

  /**
   * Query blobs owned by a specific address
   * @param {string} ownerAddress - Sui address of blob owner
   * @param {Object} options - Pagination and filter options
   * @returns {Promise<Object>} Blobs and pagination info
   */
  async getBlobsByOwner(ownerAddress: string, options: Record<string, unknown> = {}) {
    const {
      first = 20,
      after = null
    } = options as any;

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
  async getWalletHistory(address: string, options: Record<string, unknown> = {}) {
    const {
      first = 20,
      after = null
    } = options as any;

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
  async getWalrusSiteAssets(siteId: string, options: Record<string, unknown> = {}) {
    const {
      first = 50,
      after = null
    } = options as any;

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
  async getPoACertificateStatus(blobId: string) {
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
  async getBlobMetadata(blobId: string) {
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
  startPolling(queryFn: () => Promise<unknown>, intervalMs: number, callback: (error: Error | null, result: unknown) => void) {
    let active = true;
    let timeoutId: NodeJS.Timeout | undefined;

    const poll = async () => {
      if (!active) return;

      try {
        const result = await queryFn();
        if (active && callback) {
          callback(null, result);
        }
      } catch (error) {
        const err = error as Error;
        if (active && callback) {
          callback(err, null);
        }
      }

      if (active) {
        timeoutId = setTimeout(poll, intervalMs);
      }
    };

    poll();

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
  clearCache(pattern: string | null = null) {
    if (!pattern) {
      this.cache.clear();
      logger.info('Cache cleared completely');
      return;
    }

    let cleared = 0;
    for (const key of Array.from(this.cache.keys())) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        cleared++;
      }
    }

    logger.info(`Cache cleared: ${cleared} entries matching pattern "${pattern}"`);
  }

  // Helper methods (private)
  _generateCacheKey(query: string, variables: Record<string, unknown>) {
    const queryHash = this._simpleHash(query);
    const varsHash = this._simpleHash(JSON.stringify(variables));
    return `${queryHash}-${varsHash}`;
  }

  _simpleHash(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  _getFromCache(key: string) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  _setToCache(key: string, data: unknown, ttl: number) {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl
    });

    if (this.cache.size > 1000) {
      this._cleanupCache();
    }
  }

  _cleanupCache() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of Array.from(this.cache.entries())) {
      const expiresAt = (entry as Record<string, unknown>).expiresAt as number;
      if (now > expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    logger.debug(`Cache cleanup: removed ${cleaned} expired entries`);
  }

  async _delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _transformBlobsResponse(objectsData: unknown) {
    if (!objectsData) {
      return IGraphQLResponse.empty();
    }

    const data = objectsData as Record<string, unknown>;
    const blobs = ((data.nodes as unknown[]) || []).map((node: unknown) => {
      const nodeData = node as Record<string, unknown>;
      const owner = nodeData.owner as Record<string, unknown>;
      const contents = nodeData.contents as Record<string, unknown>;
      const prevTxn = nodeData.previousTransactionBlock as Record<string, unknown>;
      const contentsParsed = this._parseJSON(contents?.json);
      const ownerAddr = (owner?.owner as Record<string, unknown>)?.address;
      const contentType = (contents?.type as Record<string, unknown>)?.repr;
      return {
        blobId: nodeData.address,
        objectId: nodeData.objectId,
        version: nodeData.version,
        digest: nodeData.digest,
        owner: ownerAddr || null,
        type: contentType || null,
        contents: contentsParsed,
        size: (contentsParsed as Record<string, unknown>)?.size || 0,
        contentType: (contentsParsed as Record<string, unknown>)?.content_type || null,
        storageRebate: nodeData.storageRebate || 0,
        createdAt: (prevTxn?.effects as Record<string, unknown>)?.timestamp || null,
        timestamp: (prevTxn?.effects as Record<string, unknown>)?.timestamp || null,
        transactionDigest: prevTxn?.digest || null
      };
    });

    return IGraphQLResponse.success(blobs, data.pageInfo || { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null }, { source: 'sui_graphql', queryType: 'blobs' });
  }

  _transformTransactionsResponse(transactionBlocksData: unknown) {
    if (!transactionBlocksData) {
      return IGraphQLResponse.empty();
    }

    const data = transactionBlocksData as Record<string, unknown>;
    const transactions = ((data.nodes as unknown[]) || []).map((node: unknown) => {
      const nodeData = node as Record<string, unknown>;
      const effects = nodeData.effects as Record<string, unknown>;
      const sender = nodeData.sender as Record<string, unknown>;
      const gasEffects = effects?.gasEffects as Record<string, unknown>;
      const gasSummary = gasEffects?.gasSummary as Record<string, unknown>;
      const expiration = nodeData.expiration as Record<string, unknown>;
      return {
        digest: nodeData.digest,
        sender: sender?.address || null,
        status: effects?.status || null,
        timestamp: effects?.timestamp || null,
        gasUsed: {
          computationCost: gasSummary?.computationCost || 0,
          storageCost: gasSummary?.storageCost || 0,
          storageRebate: gasSummary?.storageRebate || 0
        },
        epoch: effects?.executedEpoch || null,
        expiration: expiration?.epochId || null,
        coins: []
      };
    });

    return IGraphQLResponse.success(transactions, data.pageInfo || { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null }, { source: 'sui_graphql', queryType: 'transactions' });
  }

  _transformSiteAssetsResponse(objectData: unknown) {
    if (!objectData) {
      return IGraphQLResponse.empty();
    }

    const data = objectData as Record<string, unknown>;
    const siteOwner = data.owner as Record<string, unknown>;
    const siteContents = data.contents as Record<string, unknown>;
    const siteOwnerAddr = (siteOwner?.owner as Record<string, unknown>)?.address;
    const site = {
      siteId: data.address,
      objectId: data.objectId,
      version: data.version,
      digest: data.digest,
      owner: siteOwnerAddr || null,
      metadata: this._parseJSON(siteContents?.json)
    };

    const dynamicFields = data.dynamicFields as Record<string, unknown>;
    const assets = ((dynamicFields?.nodes as unknown[]) || []).map((field: unknown) => {
      const fieldData = field as Record<string, unknown>;
      const fieldName = fieldData.name as Record<string, unknown>;
      const fieldValue = fieldData.value as Record<string, unknown>;
      const valueContents = fieldValue?.contents as Record<string, unknown>;
      const value = this._parseJSON(valueContents?.json);
      const nameParsed = this._parseJSON(fieldName?.json);
      const valueType = valueContents?.type as Record<string, unknown>;
      const nameType = fieldName?.type as Record<string, unknown>;
      const namePath = (nameParsed as Record<string, unknown>)?.path;
      const nameTypeRepr = nameType?.repr;
      return {
        path: (namePath as string) || (fieldName?.json as string) || 'index.html',
        name: nameParsed,
        type: nameTypeRepr || null,
        blobId: (value as Record<string, unknown>)?.blob_id || (value as Record<string, unknown>)?.blobId || null,
        size: (value as Record<string, unknown>)?.size || 0,
        contentType: (value as Record<string, unknown>)?.content_type || (value as Record<string, unknown>)?.contentType || null,
        value: value,
        valueType: valueType?.repr || null
      };
    });

    return IGraphQLResponse.success(assets, dynamicFields?.pageInfo || { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null }, { source: 'sui_graphql', queryType: 'site_assets', site });
  }

  _transformPoAResponse(objectData: unknown) {
    if (!objectData) {
      return IGraphQLResponse.error('Blob not found', 'NOT_FOUND');
    }

    const data = objectData as Record<string, unknown>;
    const dynamicFields = data.dynamicFields as Record<string, unknown>;
    const nodes = dynamicFields?.nodes as unknown[] || [];

    const poaField = nodes.find((field: unknown) => {
      const fieldData = field as Record<string, unknown>;
      const fieldName = fieldData.name as Record<string, unknown>;
      const fieldType = (fieldName?.type as Record<string, unknown>)?.repr || '';
      return (fieldType as string).includes('poa') || (fieldType as string).includes('certificate');
    });

    const poaFieldData = poaField as Record<string, unknown>;
    const poaValue = poaFieldData?.value as Record<string, unknown>;
    const poaValueContents = poaValue?.contents as Record<string, unknown>;
    const certificate = poaField ? this._parseJSON(poaValueContents?.json) : null;

    const poaData = {
      blobId: data.address,
      objectId: data.objectId,
      poaStatus: certificate ? 'certified' : 'uncertified',
      certificate: certificate ? {
        validators: (certificate as Record<string, unknown>).validators || [],
        timestamp: (certificate as Record<string, unknown>).timestamp || null,
        expiry: (certificate as Record<string, unknown>).expiry || null,
        metadata: certificate
      } : null
    };

    return IGraphQLResponse.success([poaData], {}, { source: 'sui_graphql', queryType: 'poa_status' });
  }

  _transformBlobMetadata(objectData: unknown) {
    if (!objectData) {
      return IGraphQLResponse.error('Blob not found', 'NOT_FOUND');
    }

    const data = objectData as Record<string, unknown>;
    const dataContents = data.contents as Record<string, unknown>;
    const contents = this._parseJSON(dataContents?.json);
    const dataOwner = data.owner as Record<string, unknown>;
    const dataPrevTxn = data.previousTransactionBlock as Record<string, unknown>;
    const prevTxnEffects = dataPrevTxn?.effects as Record<string, unknown>;
    const ownerAddr = (dataOwner?.owner as Record<string, unknown>)?.address;
    const contentType = (dataContents?.type as Record<string, unknown>)?.repr;

    const blob = {
      blobId: data.address,
      objectId: data.objectId,
      version: data.version,
      digest: data.digest,
      owner: ownerAddr || null,
      type: contentType || null,
      size: (contents as Record<string, unknown>)?.size || null,
      contentType: (contents as Record<string, unknown>)?.content_type || null,
      encoding: (contents as Record<string, unknown>)?.encoding || null,
      metadata: contents,
      storageRebate: data.storageRebate || 0,
      timestamp: prevTxnEffects?.timestamp || null,
      transactionDigest: dataPrevTxn?.digest || null,
      transactionStatus: prevTxnEffects?.status || null
    };

    return IGraphQLResponse.success([blob], {}, { source: 'sui_graphql', queryType: 'blob_metadata' });
  }

  _parseJSON(jsonString: unknown) {
    if (!jsonString) return null;
    if (typeof jsonString === 'object') return jsonString;

    try {
      return JSON.parse(jsonString as string);
    } catch {
      return null;
    }
  }
}

// Export singleton instance
export const suiGraphQLService = new SuiGraphQLService();
