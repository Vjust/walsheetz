// Blockchain configuration for WalSheetz
export const config = {
  sui: {
    testnet: {
      rpcUrl: 'https://fullnode.testnet.sui.io:443',
      graphqlUrl: 'https://sui-testnet.mystenlabs.com/graphql',
      faucetUrl: 'https://faucet.testnet.sui.io/gas',
      explorerUrl: 'https://testnet.suivision.xyz'
    },
    mainnet: {
      rpcUrl: 'https://fullnode.mainnet.sui.io:443',
      graphqlUrl: 'https://sui-mainnet.mystenlabs.com/graphql',
      explorerUrl: 'https://suivision.xyz'
    }
  },
  walrus: {
    testnet: {
      publisherUrl: 'https://publisher-devnet.walrus.space',
      aggregatorUrl: 'https://aggregator-devnet.walrus.space',
      blobUrl: 'https://blobid.walrus.space'
    },
    mainnet: {
      publisherUrl: 'https://publisher.walrus.space',
      aggregatorUrl: 'https://aggregator.walrus.space',
      blobUrl: 'https://blobid.walrus.space'
    }
  },
  // Storage settings
  storage: {
    autoSaveInterval: 5000, // 5 seconds
    editThreshold: 3, // Save after 3 edits
    maxVersionHistory: 100, // Keep last 100 versions per cell
    batchSize: 50 // Max changes per Walrus blob
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
  // Current environment
  environment: 'testnet' // Change to 'mainnet' for production
};

// Helper functions
export const getCurrentConfig = () => {
  const env = config.environment;
  return {
    sui: config.sui[env],
    walrus: config.walrus[env],
    storage: config.storage,
    deposit: config.deposit
  };
};

export const isTestnet = () => config.environment === 'testnet';
export const isMainnet = () => config.environment === 'mainnet';