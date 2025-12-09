// Transaction runner for WalSheetz DeFi operations
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { contractRegistry } from './sui-contract-registry.js';
import { getCurrentConfig } from './config.js';

class SuiTransactionRunner {
  suiClient: SuiClient | null;
  initialized: boolean;

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
      const err = error as Error;
      console.error('[TransactionRunner] Initialization failed:', err);
      throw err;
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  async prepareTransaction({ adapterId, method, args, modifiers = {} }: { adapterId: string; method: string; args: unknown[]; modifiers?: Record<string, unknown> }) {
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
      const gasBudget = modifiers.gasBudget as number | undefined;
      if (gasBudget) {
        tx.setGasBudget(gasBudget);
      }

      const sender = modifiers.sender as string | undefined;
      if (sender) {
        tx.setSender(sender);
      }

      // Handle gas coins if specified
      const gasCoins = modifiers.gasCoins as unknown[];
      if (gasCoins && Array.isArray(gasCoins) && gasCoins.length > 0) {
        if (gasCoins.length > 1) {
          // Merge multiple gas coins
          const [primaryCoin, ...coinsToMerge] = gasCoins as string[];
          tx.mergeCoins(tx.object(primaryCoin), (coinsToMerge as string[]).map(coin => tx.object(coin)) as any);
          tx.setGasPayment([tx.object(primaryCoin)] as any);
        } else {
          tx.setGasPayment((gasCoins as string[]).map(coin => tx.object(coin)) as any);
        }
      }

      // Generic adapter transaction building
      const result = await this.prepareGenericTransaction(tx, adapter, method, args, modifiers);

      console.log(`[TransactionRunner] Transaction prepared successfully for ${adapterId}.${method}`);
      return result;

    } catch (error) {
      const err = error as Error;
      console.error(`[TransactionRunner] Failed to prepare transaction:`, err);
      throw new Error(`Failed to prepare transaction: ${err.message}`);
    }
  }

  async prepareGenericTransaction(tx: Transaction, adapter: unknown, method: string, args: unknown[], modifiers: Record<string, unknown>) {
    // Generic transaction preparation for other adapters
    const adapterObj = adapter as { buildWriteCall?: (method: string, args: unknown[], signer?: unknown) => Promise<unknown>; getName?: () => string };
    if (adapterObj.buildWriteCall) {
      const result = await adapterObj.buildWriteCall(method, args, modifiers.signer);
      const sender = typeof modifiers.sender === 'string' ? modifiers.sender : null;
      return {
        transaction: tx,
        method,
        args,
        result,
        estimatedGas: await this.estimateGas(tx, sender),
        description: `Execute ${method} on ${adapterObj.getName?.()}`
      };
    }

    throw new Error(`Adapter ${adapterObj.getName?.()} does not support transaction building`);
  }

  async estimateGas(transaction: Transaction, sender: string | null) {
    if (!sender) {
      console.warn('[TransactionRunner] No sender provided for gas estimation');
      return null;
    }

    try {
      const dryRunResult = await this.suiClient!.dryRunTransactionBlock({
        transactionBlock: await transaction.build({ client: this.suiClient! }) as any
      } as any);

      if (dryRunResult.effects?.status.status === 'success') {
        const computationCost = BigInt(dryRunResult.effects.gasUsed.computationCost);
        const storageCost = BigInt(dryRunResult.effects.gasUsed.storageCost);
        const storageRebate = BigInt(dryRunResult.effects.gasUsed.storageRebate);
        return {
          computationCost: dryRunResult.effects.gasUsed.computationCost,
          storageCost: dryRunResult.effects.gasUsed.storageCost,
          storageRebate: dryRunResult.effects.gasUsed.storageRebate,
          totalGasUsed: (computationCost + storageCost - storageRebate).toString()
        };
      } else {
        console.warn('[TransactionRunner] Dry run failed:', dryRunResult.effects?.status);
        return null;
      }
    } catch (error) {
      const err = error as Error;
      console.warn('[TransactionRunner] Gas estimation failed:', err.message);
      return null;
    }
  }

  async simulateTransaction(transaction: Transaction, sender: string) {
    try {
      const dryRunResult = await this.suiClient!.dryRunTransactionBlock({
        transactionBlock: await transaction.build({ client: this.suiClient! }) as any
      } as any);

      return {
        success: dryRunResult.effects?.status.status === 'success',
        effects: dryRunResult.effects,
        error: dryRunResult.effects?.status.error || null,
        gasUsed: dryRunResult.effects?.gasUsed,
        objectChanges: dryRunResult.objectChanges || [],
        balanceChanges: dryRunResult.balanceChanges || []
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: err.message,
        effects: null,
        gasUsed: null
      };
    }
  }

  async getGasCoins(address: string, amount: string | null = null) {
    try {
      const gasCoins = await this.suiClient!.getCoins({
        owner: address,
        coinType: '0x2::sui::SUI',
        limit: 10
      });

      if (gasCoins.data.length === 0) {
        throw new Error('No SUI coins found for gas payment');
      }

      // If amount specified, find sufficient coins
      if (amount && typeof amount === 'string') {
        let totalAmount = 0n;
        const sufficientCoins: string[] = [];

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
      const err = error as Error;
      console.error('[TransactionRunner] Failed to get gas coins:', err);
      throw err;
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