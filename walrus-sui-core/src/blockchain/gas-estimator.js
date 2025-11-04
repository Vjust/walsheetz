// Gas estimation service with real-time Sui GraphQL integration
import { getCurrentConfig } from './config.js';
import { suiService } from './sui-service.js';

export class GasEstimator {
  constructor() {
    this.config = getCurrentConfig();
    this.depositConfig = this.config.deposit || {};
    this.lastGasPrice = null;
    this.lastStoragePrice = null;
    this.gasPriceCache = new Map(); // Cache gas prices with timestamps
    this.cacheExpiry = 30000; // 30 seconds cache
  }

  // Get current reference gas price from Sui network
  async getCurrentGasPrice() {
    try {
      // Check cache first
      const cached = this.gasPriceCache.get('referenceGasPrice');
      if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
        return cached.data;
      }

      // Query GraphQL for current gas price
      const response = await fetch(this.config.sui.graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: this.depositConfig.gasQueries.referencePrice
        })
      });

      const result = await response.json();
      
      if (result.errors) {
        throw new Error(`GraphQL query failed: ${result.errors[0].message}`);
      }

      const gasPrice = parseInt(result.data.epoch.referenceGasPrice);
      const epochInfo = result.data.epoch;

      // Cache the result
      this.gasPriceCache.set('referenceGasPrice', {
        data: { gasPrice, epochInfo },
        timestamp: Date.now()
      });

      this.lastGasPrice = gasPrice;
      
      return { gasPrice, epochInfo };
    } catch (error) {
      console.error('Failed to get current gas price:', error);
      
      // Fallback to RPC if GraphQL fails
      try {
        const gasPrice = await suiService.client.getReferenceGasPrice();
        this.lastGasPrice = parseInt(gasPrice);
        return { gasPrice: this.lastGasPrice, epochInfo: null };
      } catch (rpcError) {
        console.error('RPC fallback also failed:', rpcError);
        // Use last known gas price or default
        return { 
          gasPrice: this.lastGasPrice || 1000, // Default 1000 MIST
          epochInfo: null 
        };
      }
    }
  }

  // Get storage price (usually constant across epochs)
  async getStoragePrice() {
    try {
      // Check cache first
      const cached = this.gasPriceCache.get('storagePrice');
      if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry * 10) { // Longer cache
        return cached.data;
      }

      // Query protocol config for storage price
      const response = await fetch(this.config.sui.graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: this.depositConfig.gasQueries.protocolConfig
        })
      });

      const result = await response.json();
      
      if (result.errors) {
        throw new Error(`Storage price query failed: ${result.errors[0].message}`);
      }

      // Find storage price in protocol config
      let storagePrice = 75; // Default fallback
      if (result.data.protocolConfig && result.data.protocolConfig.configs) {
        const storagePriceConfig = result.data.protocolConfig.configs.find(
          config => config.key === 'storage_gas_price' || config.key === 'storage_price'
        );
        if (storagePriceConfig) {
          storagePrice = parseInt(storagePriceConfig.value);
        }
      }

      // Cache the result
      this.gasPriceCache.set('storagePrice', {
        data: storagePrice,
        timestamp: Date.now()
      });

      this.lastStoragePrice = storagePrice;
      return storagePrice;
    } catch (error) {
      console.error('Failed to get storage price:', error);
      return this.lastStoragePrice || 75; // Default 75 MIST per storage unit
    }
  }

  // Determine computation bucket based on estimated units
  getComputationBucket(estimatedUnits) {
    const buckets = this.depositConfig.computationBuckets;
    
    for (const bucket of buckets) {
      if (estimatedUnits >= bucket.min && estimatedUnits <= bucket.max) {
        return bucket;
      }
    }
    
    // If exceeds all buckets, transaction will abort
    return { min: 5000001, max: Infinity, units: 'ABORT' };
  }

  // Calculate storage units for given data size
  calculateStorageUnits(bytesStored) {
    return bytesStored * this.depositConfig.storageUnitsPerByte;
  }

  // Calculate storage rebate for deleted data
  calculateStorageRebate(bytesDeleted, originalStorageCost) {
    const rebatePercentage = this.depositConfig.storageRebatePercentage / 100;
    return Math.floor(originalStorageCost * rebatePercentage);
  }

  // Estimate transaction cost using dry run
  async estimateTransactionGas(transaction, senderAddress) {
    try {
      // Serialize transaction for dry run
      const serializedBytes = typeof transaction.serialize === 'function' 
        ? await transaction.serialize()
        : transaction;
      
      // Use Sui's dryRunTransactionBlock for accurate estimation
      const gasEstimate = await suiService.client.dryRunTransactionBlock({
        transactionBlock: serializedBytes
      });

      const gasUsed = gasEstimate.effects.gasUsed;
      const computationUnits = parseInt(gasUsed.computationCost) || 0;
      const storageUnits = parseInt(gasUsed.storageCost) || 0;
      const rebateUnits = parseInt(gasUsed.storageRebate || 0) || 0;
      // Use reference gas price if available; fallback to 1000 for tests
      let gasPrice = 1000;
      try {
        const gp = await this.getCurrentGasPrice();
        gasPrice = gp?.gasPrice || gasPrice;
      } catch {}
      // Convert units to MIST values via gas price
      const computationCost = computationUnits * gasPrice;
      const storageCost = storageUnits * gasPrice;
      const storageRebate = rebateUnits * gasPrice;
      const totalCost = computationCost + storageCost - storageRebate;
      return {
        success: true,
        gasBreakdown: {
          computationCost: String(computationCost),
          storageCost: String(storageCost),
          storageRebate: String(storageRebate),
          netStorageCost: String(storageCost - storageRebate)
        },
        transactionBytes: serializedBytes?.length || 0,
        warnings: (serializedBytes?.length || 0) > 40000 ? ['Large transaction size may increase gas costs'] : [],
        totalCost: totalCost,
        estimatedCostSUI: totalCost / 1_000_000_000
      };
    } catch (error) {
      console.error('Dry run estimation failed:', error);
      // Fallback to manual estimation
      return await this.estimateManually(transaction);
    }
  }

  // High-level full cost including buffer
  async estimateFullTransactionCost(transaction, senderAddress) {
    const gasPriceInfo = await this.getCurrentGasPrice();
    const res = await this.estimateTransactionGas(transaction, senderAddress);
    const base = res.totalCost || 0;
    const bufferMultiplier = this.depositConfig.gasBuffer || 1.2;
    const buffered = base * bufferMultiplier;
    return {
      ...res,
      estimatedCostSUI: buffered / 1_000_000_000,
      bufferApplied: true,
      bufferPercentage: Math.round((bufferMultiplier - 1) * 100),
      gasPrice: gasPriceInfo.gasPrice
    };
  }

  // Manual estimation based on transaction content
  async estimateManually(transaction) {
    try {
      const gasPrice = await this.getCurrentGasPrice();
      const storagePrice = await this.getStoragePrice();
      
      // Estimate computation based on transaction type
      let estimatedComputationUnits = this.depositConfig.estimatedGasCosts.singleEdit;
      
      // Analyze transaction commands to estimate complexity
      if (transaction && transaction.blockData) {
        const commands = transaction.blockData.transactions || [];
        estimatedComputationUnits = this.estimateComputationFromCommands(commands);
      }

      // Get computation bucket
      const bucket = this.getComputationBucket(estimatedComputationUnits);
      const computationUnits = bucket.units;
      
      if (computationUnits === 'ABORT') {
        return {
          success: false,
          error: 'Transaction too complex, will abort',
          computationUnits: estimatedComputationUnits
        };
      }

      // Estimate storage based on typical data size
      const estimatedBytes = this.depositConfig.estimatedGasCosts.typicalStorageBytes;
      const storageUnits = this.calculateStorageUnits(estimatedBytes);

      // Calculate costs
      const gp = gasPrice.gasPrice || 1000;
      const sp = storagePrice.storagePrice || storagePrice || 75;
      const computationCost = computationUnits * gp;
      const storageCost = storageUnits * sp;
      const storageRebate = 0; // No rebate for new data
      const totalCost = computationCost + storageCost - storageRebate;

      return {
        success: true,
        gasBreakdown: {
          computationCost: String(computationCost),
          storageCost: String(storageCost),
          storageRebate: String(storageRebate),
          netStorageCost: String(storageCost - storageRebate)
        },
        totalCost,
        estimatedCostSUI: totalCost / 1_000_000_000,
        computationUnits,
        storageUnits,
        bucket: bucket,
        gasPrice: gp,
        storagePrice: sp,
        estimatedBytes
      };
    } catch (error) {
      console.error('Manual estimation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Estimate computation units from transaction commands
  estimateComputationFromCommands(commands) {
    let totalUnits = 1000; // Base cost
    
    for (const command of commands) {
      switch (command.kind) {
        case 'MoveCall':
          totalUnits += 2000; // Move calls are more expensive
          break;
        case 'TransferObjects':
          totalUnits += 500;
          break;
        case 'SplitCoins':
          totalUnits += 300;
          break;
        case 'MergeCoins':
          totalUnits += 300;
          break;
        default:
          totalUnits += 200;
      }
    }
    
    return totalUnits;
  }

  // Calculate suggested gas budget
  calculateGasBudget(estimatedCost) {
    const buffer = this.depositConfig.gasBuffer;
    const suggestedBudget = Math.ceil(estimatedCost * buffer);
    
    // Ensure within limits
    const minBudget = this.depositConfig.minGasBudget;
    const maxBudget = this.depositConfig.maxGasBudget;
    
    return Math.max(minBudget, Math.min(maxBudget, suggestedBudget));
  }

  // Get estimated operations for a given SUI amount
  async getEstimatedOperations(suiAmount) {
    try {
      const gasPrice = await this.getCurrentGasPrice();
      const amountInMist = suiAmount * this.depositConfig.mistPerSui;
      
      const operations = {
        singleEdit: 0,
        batchSave: 0,
        versionRestore: 0,
        walrusStorage: 0
      };

      for (const [operation, computationUnits] of Object.entries(this.depositConfig.estimatedGasCosts)) {
        if (operation === 'typicalStorageBytes') continue;
        
        const bucket = this.getComputationBucket(computationUnits);
        const estimatedCost = bucket.units * gasPrice.gasPrice;
        operations[operation] = Math.floor(amountInMist / estimatedCost);
      }

      return {
        success: true,
        operations,
        gasPrice: gasPrice.gasPrice,
        suiAmount,
        amountInMist
      };
    } catch (error) {
      console.error('Failed to calculate estimated operations:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Convert MIST to SUI
  mistToSui(mistAmount) {
    return mistAmount / this.depositConfig.mistPerSui;
  }

  // Convert SUI to MIST
  suiToMist(suiAmount) {
    return suiAmount * this.depositConfig.mistPerSui;
  }

  // Get gas usage analytics
  getGasAnalytics(transactionHistory) {
    const analytics = {
      totalTransactions: transactionHistory.length,
      totalGasUsed: 0,
      averageGasPerTransaction: 0,
      computationCostTotal: 0,
      storageCostTotal: 0,
      storageRebateTotal: 0,
      bucketDistribution: {},
      costBreakdown: {
        computation: 0,
        storage: 0,
        rebates: 0
      }
    };

    // Initialize bucket distribution
    this.depositConfig.computationBuckets.forEach(bucket => {
      analytics.bucketDistribution[`${bucket.units}_units`] = 0;
    });

    for (const tx of transactionHistory) {
      if (tx.gasUsed) {
        analytics.totalGasUsed += tx.gasUsed.totalCost || 0;
        analytics.computationCostTotal += tx.gasUsed.computationCost || 0;
        analytics.storageCostTotal += tx.gasUsed.storageCost || 0;
        analytics.storageRebateTotal += tx.gasUsed.storageRebate || 0;
        
        // Track bucket usage
        if (tx.gasUsed.computationUnits) {
          const bucket = this.getComputationBucket(tx.gasUsed.computationUnits);
          analytics.bucketDistribution[`${bucket.units}_units`]++;
        }
      }
    }

    analytics.averageGasPerTransaction = analytics.totalTransactions > 0 
      ? analytics.totalGasUsed / analytics.totalTransactions 
      : 0;

    analytics.costBreakdown = {
      computation: analytics.computationCostTotal,
      storage: analytics.storageCostTotal,
      rebates: analytics.storageRebateTotal
    };

    return analytics;
  }

  // Clear cache
  clearCache() {
    this.gasPriceCache.clear();
  }
}

// Create singleton instance
export const gasEstimator = new GasEstimator();

// Convenience functions
export const getCurrentGasPrice = () => gasEstimator.getCurrentGasPrice();
export const estimateTransactionCost = (transaction) => gasEstimator.estimateTransactionCost(transaction);
export const getEstimatedOperations = (suiAmount) => gasEstimator.getEstimatedOperations(suiAmount);
export const calculateGasBudget = (estimatedCost) => gasEstimator.calculateGasBudget(estimatedCost);
