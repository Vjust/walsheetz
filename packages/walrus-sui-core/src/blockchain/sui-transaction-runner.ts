// Transaction runner for WalSheetz DeFi operations
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { contractRegistry } from './sui-contract-registry.js';
import { getCurrentConfig } from './config.js';

class SuiTransactionRunner {
  constructor() {
    this.suiClient = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      const config = getCurrentConfig();
      this.suiClient = new SuiClient({
        url: config.sui.rpcUrl
      });

      this.initialized = true;
      console.log('[TransactionRunner] Initialized for', config.environment);
    } catch (error) {
      console.error('[TransactionRunner] Initialization failed:', error);
      throw error;
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  async prepareTransaction({ adapterId, method, args, modifiers = {} }) {
    await this.ensureInitialized();

    console.log(`[TransactionRunner] Preparing transaction for ${adapterId}.${method}`);

    try {
      // Get the adapter
      const adapter = contractRegistry.getAdapter(adapterId);

      // Validate the method and arguments
      await contractRegistry.validateAdapter(adapterId, method, args);

      // Initialize transaction
      const tx = new Transaction();

      // Apply modifiers (gas budget, etc.)
      if (modifiers.gasBudget) {
        tx.setGasBudget(modifiers.gasBudget);
      }

      if (modifiers.sender) {
        tx.setSender(modifiers.sender);
      }

      // Handle gas coins if specified
      if (modifiers.gasCoins && modifiers.gasCoins.length > 0) {
        if (modifiers.gasCoins.length > 1) {
          // Merge multiple gas coins
          const [primaryCoin, ...coinsToMerge] = modifiers.gasCoins;
          tx.mergeCoins(tx.object(primaryCoin), coinsToMerge.map(coin => tx.object(coin)));
          tx.setGasPayment([tx.object(primaryCoin)]);
        } else {
          tx.setGasPayment(modifiers.gasCoins.map(coin => tx.object(coin)));
        }
      }

      // Generic adapter transaction building
      const result = await this.prepareGenericTransaction(tx, adapter, method, args, modifiers);

      console.log(`[TransactionRunner] Transaction prepared successfully for ${adapterId}.${method}`);
      return result;

    } catch (error) {
      console.error(`[TransactionRunner] Failed to prepare transaction:`, error);
      throw new Error(`Failed to prepare transaction: ${error.message}`);
    }
  }

  async prepareGenericTransaction(tx, adapter, method, args, modifiers) {
    // Generic transaction preparation for other adapters
    if (adapter.buildWriteCall) {
      const result = await adapter.buildWriteCall(method, args, modifiers.signer);
      return {
        transaction: tx,
        method,
        args,
        result,
        estimatedGas: await this.estimateGas(tx, modifiers.sender),
        description: `Execute ${method} on ${adapter.getName()}`
      };
    }

    throw new Error(`Adapter ${adapter.getName()} does not support transaction building`);
  }

  async estimateGas(transaction, sender) {
    if (!sender) {
      console.warn('[TransactionRunner] No sender provided for gas estimation');
      return null;
    }

    try {
      const dryRunResult = await this.suiClient.dryRunTransactionBlock({
        transactionBlock: await transaction.build({ client: this.suiClient }),
        sender
      });

      if (dryRunResult.effects.status.status === 'success') {
        return {
          computationCost: dryRunResult.effects.gasUsed.computationCost,
          storageCost: dryRunResult.effects.gasUsed.storageCost,
          storageRebate: dryRunResult.effects.gasUsed.storageRebate,
          totalGasUsed: dryRunResult.effects.gasUsed.computationCost +
                       dryRunResult.effects.gasUsed.storageCost -
                       dryRunResult.effects.gasUsed.storageRebate
        };
      } else {
        console.warn('[TransactionRunner] Dry run failed:', dryRunResult.effects.status);
        return null;
      }
    } catch (error) {
      console.warn('[TransactionRunner] Gas estimation failed:', error.message);
      return null;
    }
  }

  async simulateTransaction(transaction, sender) {
    try {
      const dryRunResult = await this.suiClient.dryRunTransactionBlock({
        transactionBlock: await transaction.build({ client: this.suiClient }),
        sender
      });

      return {
        success: dryRunResult.effects.status.status === 'success',
        effects: dryRunResult.effects,
        error: dryRunResult.effects.status.error || null,
        gasUsed: dryRunResult.effects.gasUsed,
        objectChanges: dryRunResult.objectChanges || [],
        balanceChanges: dryRunResult.balanceChanges || []
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        effects: null,
        gasUsed: null
      };
    }
  }

  async getGasCoins(address, amount = null) {
    try {
      const gasCoins = await this.suiClient.getCoins({
        owner: address,
        coinType: '0x2::sui::SUI',
        limit: 10
      });

      if (gasCoins.data.length === 0) {
        throw new Error('No SUI coins found for gas payment');
      }

      // If amount specified, find sufficient coins
      if (amount) {
        let totalAmount = 0n;
        const sufficientCoins = [];

        for (const coin of gasCoins.data) {
          sufficientCoins.push(coin.coinObjectId);
          totalAmount += BigInt(coin.balance);

          if (totalAmount >= BigInt(amount)) {
            break;
          }
        }

        if (totalAmount < BigInt(amount)) {
          throw new Error(`Insufficient SUI balance. Need ${amount}, have ${totalAmount}`);
        }

        return sufficientCoins;
      }

      // Return all coins
      return gasCoins.data.map(coin => coin.coinObjectId);
    } catch (error) {
      console.error('[TransactionRunner] Failed to get gas coins:', error);
      throw error;
    }
  }

  destroy() {
    this.suiClient = null;
    this.initialized = false;
  }
}

// Create singleton instance
export const transactionRunner = new SuiTransactionRunner();
export default transactionRunner;

// Convenience functions
export const prepareTransaction = (params) => transactionRunner.prepareTransaction(params);
export const estimateGas = (transaction, sender) => transactionRunner.estimateGas(transaction, sender);
export const simulateTransaction = (transaction, sender) => transactionRunner.simulateTransaction(transaction, sender);