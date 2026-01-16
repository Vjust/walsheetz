// Blockchain configuration for WalSheetz

// Robust dev/prod detection that works in both browser and Node.js environments
const isBrowser = typeof window !== 'undefined';
const isDevRuntime = (typeof import.meta !== 'undefined' && (import.meta as unknown as Record<string, unknown>).env && ((import.meta as unknown as Record<string, unknown>).env as Record<string, unknown>).DEV) ||
                     (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development');

// Force absolute endpoints even in dev (useful for environments without proxy)
const forceAbsoluteEndpoints = (typeof process !== 'undefined' && process.env && process.env.WALRUS_USE_ABSOLUTE === 'true') || false;

// Cross-platform environment variable access with proper defaults
const env: Record<string, unknown> = (typeof import.meta !== 'undefined' && (import.meta as unknown as Record<string, unknown>).env as Record<string, unknown>) ||
            ((typeof process !== 'undefined' && process.env) || {});

export const config = {
  sui: {
    testnet: {
      rpcUrl: isDevRuntime ? '/sui-rpc' : 'https://fullnode.testnet.sui.io:443',
      graphqlUrl: 'https://sui-testnet.mystenlabs.com/graphql',
      faucetUrl: 'https://faucet.testnet.sui.io/gas',
      explorerUrl: 'https://testnet.suivision.xyz',
      packageId: '0xe7f62142b48f1b1746bd7dd7b695f0e2e5952879662ab7d755fdd9081b189fa7',
      registryObjectId: '0x9a6b94f79762fa608c5f0938d092744a8e5b69852f860eb17afa4ab11e24fe25',
      // Module version for upgrade compatibility tracking
      moduleVersion: 1,
      // Feature compatibility for deployed package ABI
      features: {
        // The deployed testnet package uses save_version(spreadsheet, walrus_blob_id, content_hash, cell_count, description, clock)
        // This must be set to true as the on-chain function expects the content_hash argument.
        contentHashInSave: true,
        // Rate limiter feature flag
        rateLimiterEnabled: ((env.RATE_LIMITER_ENABLED as string | undefined) ?? 'true') !== 'false' // Default true
      },
      // Rate limiting configuration
      rateLimits: {
        sui: {
          maxRPS: parseInt((env.SUI_MAX_RPS as string | undefined) || '3'),
          burst: parseInt((env.SUI_BURST as string | undefined) || '6'),
          maxConcurrent: parseInt((env.SUI_MAX_CONCURRENT as string | undefined) || '4')
        }
      }
    },
    mainnet: {
      rpcUrl: 'https://fullnode.mainnet.sui.io:443',
      graphqlUrl: 'https://sui-mainnet.mystenlabs.com/graphql',
      explorerUrl: 'https://suivision.xyz',
      packageId: '0x991454976a4ef8535ed3572bb1c500dcd565855d49a51f1fadc7f70a316c9631',
      registryObjectId: '0x66f68bfb639dbc7f24519bcdbbfdb376057d87c6d508ea7a8d67746a11721ca5',
      // Module version for upgrade compatibility tracking
      moduleVersion: 1,
      features: {
        contentHashInSave: true,
        rateLimiterEnabled: ((env.RATE_LIMITER_ENABLED as string | undefined) ?? 'true') !== 'false'
      },
      rateLimits: {
        sui: {
          maxRPS: parseInt((env.SUI_MAX_RPS as string | undefined) || '3'),
          burst: parseInt((env.SUI_BURST as string | undefined) || '6'),
          maxConcurrent: parseInt((env.SUI_MAX_CONCURRENT as string | undefined) || '4')
        }
      }
    }
  },
  walrus: {
    testnet: {
      // Primary endpoints - use Vercel Edge proxies to ensure proper CORS headers
      // Note: Base URLs are just the host. Code appends /v1/blobs or /v1/api as needed
      publisherUrl: '/api/walrus-publisher-testnet',
      aggregatorUrl: '/api/walrus-aggregator-testnet',
      blobUrl: '/api/walrus-aggregator-testnet/v1/blobs',

      // Multiple endpoints for redundancy (arrays) - all use proxies
      publishers: [
        '/api/walrus-publisher-testnet',
        // Add more publisher endpoints as they become available
      ],
      aggregators: [
        '/api/walrus-aggregator-testnet',
        // Add more aggregator endpoints as they become available
      ],
      
      // Redundancy settings
      redundancy: {
        enabled: (typeof process !== 'undefined' && process.env && process.env.WALRUS_REDUNDANCY === 'true') || false,
        maxEndpoints: 3, // Write to up to 3 endpoints
        minSuccessful: 1, // At least 1 must succeed
        writeTimeout: 30000, // 30 seconds per write
        healthCheckInterval: 60000 // 1 minute health checks
      },
      
      // Feature flags
      features: {
        rateLimiterEnabled: ((env.RATE_LIMITER_ENABLED as string | undefined) ?? 'true') !== 'false', // Default true
        useSdk: ((env.WALRUS_USE_SDK as string | undefined) ?? 'false') === 'true', // Default false for safe rollout
        epochsDefault: parseInt((env.WALRUS_EPOCHS_DEFAULT as string | undefined) || '50'),
        epochMax: parseInt((env.WALRUS_EPOCH_MAX as string | undefined) || '200'),
        epochRenewalWarningDays: parseInt((env.WALRUS_EPOCH_RENEWAL_WARNING as string | undefined) || '7'),
        sdkNetwork: 'testnet'
      },

      // Rate limiting configuration
      rateLimits: {
        walrusAggregator: {
          maxRPS: parseInt((env.WALRUS_AGG_MAX_RPS as string | undefined) || '3'),
          burst: parseInt((env.WALRUS_AGG_BURST as string | undefined) || '3'),
          maxConcurrent: parseInt((env.WALRUS_AGG_MAX_CONCURRENT as string | undefined) || '2')
        },
        walrusPublisher: {
          maxRPS: parseInt((env.WALRUS_PUB_MAX_RPS as string | undefined) || '1'),
          burst: parseInt((env.WALRUS_PUB_BURST as string | undefined) || '1'),
          maxConcurrent: parseInt((env.WALRUS_PUB_MAX_CONCURRENT as string | undefined) || '1')
        }
      }
    },
    mainnet: {
      // Primary endpoints - use Vercel Edge proxies to fix CORS issues
      // Proxies route to Staketab community endpoints for mainnet
      // TODO: Update proxy targets when official Mysten/Walrus mainnet endpoints become available
      // Note: Base URLs are just the host. Code appends /v1/blobs or /v1/api as needed
      publisherUrl: '/api/walrus-publisher-mainnet',
      aggregatorUrl: '/api/walrus-aggregator-mainnet',
      blobUrl: '/api/walrus-aggregator-mainnet/v1/blobs',

      // Multiple endpoints for redundancy - all use proxies
      publishers: [
        '/api/walrus-publisher-mainnet',
        // Add more publisher endpoints as they become available
      ],
      aggregators: [
        '/api/walrus-aggregator-mainnet',
        // Add more aggregator endpoints as they become available
      ],
      
      // Redundancy settings
      redundancy: {
        enabled: (typeof process !== 'undefined' && process.env && process.env.WALRUS_REDUNDANCY === 'true') || false,
        maxEndpoints: 3,
        minSuccessful: 1,
        writeTimeout: 30000,
        healthCheckInterval: 60000
      },
      
      // Feature flags
      features: {
        rateLimiterEnabled: (typeof process !== 'undefined' && process.env && process.env.RATE_LIMITER_ENABLED !== 'false') || false,
        useSdk: ((env.WALRUS_USE_SDK as string | undefined) ?? 'false') === 'true', // Default false for safe rollout
        epochsDefault: parseInt((env.WALRUS_EPOCHS_DEFAULT as string | undefined) || '50'),
        epochMax: parseInt((env.WALRUS_EPOCH_MAX as string | undefined) || '200'),
        epochRenewalWarningDays: parseInt((env.WALRUS_EPOCH_RENEWAL_WARNING as string | undefined) || '7'),
        sdkNetwork: 'mainnet'
      },

      // Rate limiting configuration
      rateLimits: {
        walrusAggregator: {
          maxRPS: parseInt((env.WALRUS_AGG_MAX_RPS as string | undefined) || '3'),
          burst: parseInt((env.WALRUS_AGG_BURST as string | undefined) || '3'),
          maxConcurrent: parseInt((env.WALRUS_AGG_MAX_CONCURRENT as string | undefined) || '2')
        },
        walrusPublisher: {
          maxRPS: parseInt((env.WALRUS_PUB_MAX_RPS as string | undefined) || '1'),
          burst: parseInt((env.WALRUS_PUB_BURST as string | undefined) || '1'),
          maxConcurrent: parseInt((env.WALRUS_PUB_MAX_CONCURRENT as string | undefined) || '1')
        }
      }
    }
  },
  // Storage settings
  storage: {
    autoSaveInterval: 5000, // 5 seconds
    editThreshold: 3, // Save after 3 edits
    maxVersionHistory: 100, // Keep last 100 versions per cell
    batchSize: 50, // Max changes per Walrus blob
    
    // Feature flags
    features: {
      compression: {
        enabled: ((env.WALRUS_COMPRESSION as string | undefined) ?? 'true') !== 'false', // Default true
        threshold: parseInt((env.COMPRESSION_THRESHOLD as string | undefined) || '16384'), // 16KB default
        algorithm: 'gzip'
      },
      deltaChain: {
        enabled: ((env.ENABLE_DELTA as string | undefined) ?? 'true') !== 'false', // Default true
        maxChainLength: parseInt((env.DELTA_MAX_CHAIN as string | undefined) || '5'), // Max 5 deltas before full snapshot
        compressionThreshold: 8192 // 8KB for delta compression
      },
      batchPersistence: {
        enabled: ((env.BATCH_PERSISTENCE as string | undefined) ?? 'true') !== 'false', // Default true
        storageKey: 'walsheetz_batch_',
        maxBatchAge: 30000 // 30 seconds max batch age
      }
    }
  },

  // UI settings
  ui: {
    showRateLimiterStatus: ((env.SHOW_RATE_LIMITER_STATUS as string | undefined) ?? 'false') === 'true'
  },
  
  // Deposit and gas management settings
  deposit: {
    minDepositAmount: 0.002,      // Minimum 2,000,000 MIST (min gas budget)
    lowBalanceThreshold: 0.01,    // Warn at 10,000,000 MIST
    gasBuffer: 1.5,               // 50% buffer for gas estimates
    
    // Sui computation buckets (in units) - based on official Sui gas model
    computationBuckets: [
      { min: 0, max: 1000, units: 1000 },
      { min: 1001, max: 5000, units: 5000 },
      { min: 5001, max: 10000, units: 10000 },
      { min: 10001, max: 20000, units: 20000 },
      { min: 20001, max: 50000, units: 50000 },
      { min: 50001, max: 200000, units: 200000 },
      { min: 200001, max: 1000000, units: 1000000 },
      { min: 1000001, max: 5000000, units: 5000000 }
    ],
    
    // Storage calculation constants
    storageUnitsPerByte: 100,     // 100 storage units per byte
    storageRebatePercentage: 99,  // 99% of storage fees are rebatable
    
    // Gas budget limits (in MIST)
    minGasBudget: 2000,           // 2,000 MIST minimum
    maxGasBudget: 50_000_000_000, // 50 billion MIST (50 SUI) maximum
    
    // Conversion constants
    mistPerSui: 1_000_000_000,    // 1 SUI = 1 billion MIST
    
    // Estimated typical operations (will be updated with real-time data)
    estimatedGasCosts: {
      singleEdit: 1000,           // Simple edit: ~1k computation units
      batchSave: 5000,            // Batch save: ~5k computation units
      versionRestore: 10000,      // Version restore: ~10k computation units
      walrusStorage: 20000,       // Walrus storage: ~20k computation units
      typicalStorageBytes: 50     // Average bytes per operation
    },
    
    // GraphQL query templates for gas information
    gasQueries: {
      referencePrice: `
        query GetReferenceGasPrice {
          epoch {
            epochId
            referenceGasPrice
            startTimestamp
            systemStateVersion
          }
        }
      `,
      protocolConfig: `
        query GetProtocolConfig {
          protocolConfig {
            protocolVersion
            configs {
              key
              value
            }
          }
        }
      `,
      transactionCosts: `
        query GetTransactionCosts($digest: String!) {
          transactionBlock(digest: $digest) {
            digest
            effects {
              status
              gasUsed {
                computationCost
                storageCost
                storageRebate
                nonRefundableStorageFee
              }
            }
          }
        }
      `
    }
  },
  // WalSheetz DeFi configuration
  walSheetz: {
    testnet: {
      // No DeFi protocols configured
    },
    mainnet: {
      // No DeFi protocols configured
    }
  },

  // Current environment - defaults to testnet, can be overridden dynamically
  environment: 'testnet' // Default environment
};

// Helper to get current network from localStorage (browser) or config (Node)
const getCurrentNetwork = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    // Browser environment - read from localStorage
    return localStorage.getItem('walsheetz_network') || config.environment;
  }
  // Node.js environment - use config or env variable
  return (typeof process !== 'undefined' && process.env && process.env.NETWORK) || config.environment;
};

// Helper functions
export const getCurrentConfig = () => {
  const env = getCurrentNetwork();
  return {
    sui: config.sui[env],
    walrus: config.walrus[env],
    walSheetz: config.walSheetz[env],
    storage: config.storage,
    deposit: config.deposit,
    ui: config.ui,
    environment: env
  };
};

export const getSuiContractConfig = (network: string) => {
  return config.walSheetz[network as keyof typeof config.walSheetz] || config.walSheetz.testnet;
};

export const isTestnet = () => config.environment === 'testnet';
export const isMainnet = () => config.environment === 'mainnet';
