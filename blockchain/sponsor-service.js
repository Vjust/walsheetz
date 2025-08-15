// Sponsored transaction service for WalSheetz
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { getCurrentConfig } from './config.js';
import { suiService } from './sui-service.js';
import { depositManager } from './deposit-manager.js';
import { gasEstimator, estimateTransactionCost, calculateGasBudget } from './gas-estimator.js';
import { walletManager } from './wallet-manager.js';

class SponsorService {
  constructor() {
    this.config = getCurrentConfig();
    this.depositConfig = this.config.deposit;
    this.sponsorAddress = null; // Will be set when sponsor wallet is configured
    this.gasCoins = new Map(); // Track available gas coins
    this.pendingTransactions = new Map(); // Track pending sponsored transactions
  }

  // Initialize sponsor service with a dedicated sponsor wallet
  async initialize(sponsorPrivateKey = null) {
    try {
      // For now, we'll use the connected wallet as both user and sponsor
      // In production, you'd want a dedicated sponsor wallet
      if (walletManager.isConnected) {
        this.sponsorAddress = walletManager.getWalletInfo().address;
        console.log('Sponsor service initialized with address:', this.sponsorAddress);
        return { success: true, sponsorAddress: this.sponsorAddress };
      } else {
        console.warn('No wallet connected for sponsor service');
        return { success: false, error: 'No wallet connected' };
      }
    } catch (error) {
      console.error('Failed to initialize sponsor service:', error);
      return { success: false, error: error.message };
    }
  }

  // Create a sponsored transaction
  async createSponsoredTransaction(userAddress, transactionBuilder) {
    try {
      if (!this.sponsorAddress) {
        throw new Error('Sponsor service not initialized');
      }

      // Build the transaction
      const transaction = new TransactionBlock();
      
      // Let the builder add its operations
      if (typeof transactionBuilder === 'function') {
        transactionBuilder(transaction);
      } else {
        // Assume it's already a transaction block
        return transactionBuilder;
      }

      // Set sender to user address
      transaction.setSender(userAddress);

      // Estimate gas cost first
      const gasEstimate = await estimateTransactionCost(transaction);
      
      if (!gasEstimate.success) {
        throw new Error(`Gas estimation failed: ${gasEstimate.error}`);
      }

      // Check if user has sufficient deposit
      const balanceCheck = await depositManager.checkBalance(userAddress, gasEstimate.totalCost);
      
      if (!balanceCheck.sufficient) {
        throw new Error(`Insufficient deposit balance. Required: ${depositManager.mistToSui(balanceCheck.requiredBalance)} SUI, Available: ${depositManager.mistToSui(balanceCheck.currentBalance)} SUI`);
      }

      // Calculate gas budget
      const gasBudget = calculateGasBudget(gasEstimate.totalCost);
      transaction.setGasBudget(gasBudget);

      // Get gas coins for sponsorship
      const gasCoins = await this.getGasCoins(gasBudget);
      
      if (!gasCoins || gasCoins.length === 0) {
        throw new Error('No gas coins available for sponsorship');
      }

      // Set sponsor gas payment
      transaction.setGasPayment(gasCoins);
      transaction.setGasOwner(this.sponsorAddress);

      return {
        success: true,
        transaction,
        gasEstimate,
        gasBudget,
        gasCoins: gasCoins.map(coin => coin.objectId)
      };
    } catch (error) {
      console.error('Failed to create sponsored transaction:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Execute a sponsored transaction
  async executeSponsoredTransaction(userAddress, transactionBuilder, options = {}) {
    try {
      // Create sponsored transaction
      const sponsoredTx = await this.createSponsoredTransaction(userAddress, transactionBuilder);
      
      if (!sponsoredTx.success) {
        throw new Error(sponsoredTx.error);
      }

      const { transaction, gasEstimate } = sponsoredTx;

      // Get user signature first
      console.log('Requesting user signature for sponsored transaction...');
      
      // Since we're using the same wallet for both user and sponsor in this demo,
      // we'll sign as the sponsor. In production, you'd get user signature first.
      const result = await walletManager.signAndExecuteTransaction(transaction);

      // Deduct gas cost from user's deposit
      await depositManager.deductGas(userAddress, result);

      console.log('Sponsored transaction executed successfully:', {
        digest: result.digest,
        gasUsed: result.effects?.gasUsed,
        userAddress
      });

      return {
        success: true,
        result,
        gasUsed: result.effects?.gasUsed,
        gasCost: gasEstimate.totalCost
      };
    } catch (error) {
      console.error('Sponsored transaction execution failed:', error);
      throw error;
    }
  }

  // Get available gas coins for sponsorship
  async getGasCoins(requiredAmount) {
    try {
      if (!this.sponsorAddress) {
        throw new Error('Sponsor address not set');
      }

      // Get SUI coins owned by sponsor
      const coins = await suiService.client.getCoins({
        owner: this.sponsorAddress,
        coinType: '0x2::sui::SUI'
      });

      if (!coins.data || coins.data.length === 0) {
        throw new Error('No SUI coins available for gas sponsorship');
      }

      // Sort coins by balance (largest first)
      const sortedCoins = coins.data.sort((a, b) => 
        parseInt(b.balance) - parseInt(a.balance)
      );

      // Select coins that can cover the gas budget
      const selectedCoins = [];
      let totalBalance = 0;

      for (const coin of sortedCoins) {
        selectedCoins.push({
          objectId: coin.coinObjectId,
          version: coin.version,
          digest: coin.digest,
          balance: parseInt(coin.balance)
        });
        
        totalBalance += parseInt(coin.balance);
        
        // Stop when we have enough
        if (totalBalance >= requiredAmount) {
          break;
        }
      }

      if (totalBalance < requiredAmount) {
        throw new Error(`Insufficient SUI balance for gas sponsorship. Required: ${requiredAmount}, Available: ${totalBalance}`);
      }

      return selectedCoins.map(coin => ({
        objectId: coin.objectId,
        version: coin.version,
        digest: coin.digest
      }));
    } catch (error) {
      console.error('Failed to get gas coins:', error);
      throw error;
    }
  }

  // Create sponsored transaction for storage operations
  async sponsorStorageTransaction(userAddress, data) {
    return this.executeSponsoredTransaction(userAddress, (tx) => {
      // Create storage transaction
      const storageData = {
        spreadsheetId: data.spreadsheetId,
        version: data.version,
        walrusBlobId: data.walrusBlobId,
        timestamp: Date.now(),
        cellChanges: data.cellChanges || [],
        metadata: data.metadata || {}
      };

      // This is a placeholder - in a real implementation, you'd call
      // a Move smart contract to record the storage metadata
      tx.moveCall({
        target: '0x2::event::emit',
        arguments: [
          tx.pure({
            type: 'WalSheetzStorageEvent',
            data: storageData
          })
        ]
      });
    });
  }

  // Create sponsored transaction for simple operations
  async sponsorSimpleTransaction(userAddress, operationType, operationData) {
    return this.executeSponsoredTransaction(userAddress, (tx) => {
      // Emit a simple event for tracking
      tx.moveCall({
        target: '0x2::event::emit',
        arguments: [
          tx.pure({
            type: 'WalSheetzOperationEvent',
            operation: operationType,
            data: operationData,
            timestamp: Date.now(),
            user: userAddress
          })
        ]
      });
    });
  }

  // Get sponsor service status
  getStatus() {
    return {
      initialized: !!this.sponsorAddress,
      sponsorAddress: this.sponsorAddress,
      pendingTransactions: this.pendingTransactions.size,
      gasCoinsAvailable: this.gasCoins.size
    };
  }

  // Estimate cost for a sponsored operation
  async estimateOperationCost(operationType, data = {}) {
    try {
      // Create a dummy transaction to estimate costs
      const dummyTx = new TransactionBlock();
      
      switch (operationType) {
        case 'storage':
          dummyTx.moveCall({
            target: '0x2::event::emit',
            arguments: [
              dummyTx.pure({
                type: 'WalSheetzStorageEvent',
                data: data
              })
            ]
          });
          break;
        
        case 'simple':
          dummyTx.moveCall({
            target: '0x2::event::emit',
            arguments: [
              dummyTx.pure({
                type: 'WalSheetzOperationEvent',
                operation: data.operation || 'edit',
                data: data
              })
            ]
          });
          break;
        
        default:
          throw new Error(`Unknown operation type: ${operationType}`);
      }

      // Set dummy sender for estimation
      dummyTx.setSender(this.sponsorAddress || '0x0000000000000000000000000000000000000000000000000000000000000001');

      return await estimateTransactionCost(dummyTx);
    } catch (error) {
      console.error('Cost estimation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Batch multiple operations for gas efficiency
  async sponsorBatchTransaction(userAddress, operations) {
    return this.executeSponsoredTransaction(userAddress, (tx) => {
      // Add all operations to a single transaction
      for (const operation of operations) {
        switch (operation.type) {
          case 'storage':
            tx.moveCall({
              target: '0x2::event::emit',
              arguments: [
                tx.pure({
                  type: 'WalSheetzStorageEvent',
                  data: operation.data
                })
              ]
            });
            break;
          
          case 'edit':
            tx.moveCall({
              target: '0x2::event::emit',
              arguments: [
                tx.pure({
                  type: 'WalSheetzEditEvent',
                  data: operation.data
                })
              ]
            });
            break;
        }
      }
    });
  }

  // Monitor sponsor wallet balance
  async checkSponsorBalance() {
    try {
      if (!this.sponsorAddress) {
        return { success: false, error: 'Sponsor not initialized' };
      }

      const balance = await suiService.getBalance(this.sponsorAddress);
      const balanceInSui = parseInt(balance.totalBalance) / this.depositConfig.mistPerSui;

      // Warn if sponsor balance is low
      const lowThreshold = 1.0; // 1 SUI minimum
      const isLow = balanceInSui < lowThreshold;

      return {
        success: true,
        balance: balanceInSui,
        mistBalance: parseInt(balance.totalBalance),
        isLow,
        threshold: lowThreshold,
        coinCount: balance.coinObjectCount
      };
    } catch (error) {
      console.error('Failed to check sponsor balance:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Clean up completed transactions
  cleanupCompletedTransactions() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [txId, txData] of this.pendingTransactions.entries()) {
      if (now - txData.timestamp > maxAge) {
        this.pendingTransactions.delete(txId);
      }
    }
  }
}

// Create singleton instance
export const sponsorService = new SponsorService();

// Convenience functions
export const initializeSponsor = (privateKey) => sponsorService.initialize(privateKey);
export const sponsorTransaction = (userAddress, builder, options) => 
  sponsorService.executeSponsoredTransaction(userAddress, builder, options);
export const sponsorStorageTransaction = (userAddress, data) =>
  sponsorService.sponsorStorageTransaction(userAddress, data);
export const estimateOperationCost = (type, data) =>
  sponsorService.estimateOperationCost(type, data);