/**
 * SubWalletManager - orchestrates balance checking, funding, and sweeping operations
 * Ports logic from walrus-wallet-manager.sh and wallet-batch-ops.sh
 */

import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import type { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import pLimit from 'p-limit';
import type {
  SubWalletConfig,
  WalletBalance,
  WalletMetadata,
  FundOptions,
  SweepOptions,
  TransferResult,
} from '../../types.js';

export class SubWalletManager {
  private client: SuiClient;
  private config: SubWalletConfig;
  private concurrencyLimit: ReturnType<typeof pLimit>;

  constructor(config: SubWalletConfig) {
    this.config = config;
    this.client = new SuiClient({ url: config.rpcUrl });
    this.concurrencyLimit = pLimit(config.concurrency || 8);
  }

  /**
   * Get the Sui client instance
   */
  getClient(): SuiClient {
    return this.client;
  }

  /**
   * Load all wallets from storage
   */
  async loadWallets(): Promise<WalletMetadata[]> {
    return this.config.storage.loadWallets();
  }

  /**
   * Save wallets to storage
   */
  async saveWallets(wallets: WalletMetadata[]): Promise<void> {
    return this.config.storage.saveWallets(wallets);
  }

  /**
   * Check balance for a single wallet
   */
  async getBalance(address: string): Promise<{ sui: bigint; wal: bigint }> {
    try {
      const balance = await this.client.getBalance({ owner: address });
      const sui = BigInt(balance.totalBalance || '0');

      // Try to get WAL balance (coin type contains "WAL")
      let wal = BigInt(0);
      try {
        const allBalances = await this.client.getAllBalances({ owner: address });
        const walBalance = allBalances.find((b) => b.coinType.includes('WAL'));
        if (walBalance) {
          wal = BigInt(walBalance.totalBalance || '0');
        }
      } catch (err) {
        // WAL balance unavailable
      }

      return { sui, wal };
    } catch (err) {
      console.warn(`Failed to get balance for ${address}:`, err);
      return { sui: BigInt(0), wal: BigInt(0) };
    }
  }

  /**
   * Check balances for all wallets
   * Mirrors check_all_balances from walrus-wallet-manager.sh
   */
  async checkAllBalances(): Promise<WalletBalance[]> {
    const wallets = await this.loadWallets();
    const results: WalletBalance[] = [];

    const tasks = wallets.map((wallet) =>
      this.concurrencyLimit(async () => {
        const { sui, wal } = await this.getBalance(wallet.address);
        return {
          walletId: wallet.id,
          address: wallet.address,
          sui,
          wal,
        };
      })
    );

    const balances = await Promise.all(tasks);
    results.push(...balances);

    return results;
  }

  /**
   * Get aggregate balance across all wallets
   */
  async getAggregateBalance(): Promise<{ totalSui: bigint; totalWal: bigint; count: number }> {
    const balances = await this.checkAllBalances();
    let totalSui = BigInt(0);
    let totalWal = BigInt(0);

    for (const balance of balances) {
      totalSui += balance.sui;
      totalWal += balance.wal;
    }

    return { totalSui, totalWal, count: balances.length };
  }

  /**
   * Fund wallets with SUI from a sponsor keypair
   * Mirrors distribute_funds from walrus-wallet-manager.sh
   */
  async fundWallets(
    sponsorKeypair: Ed25519Keypair,
    options: FundOptions
  ): Promise<TransferResult[]> {
    // Validate inputs
    if (options.amount <= BigInt(0)) {
      throw new Error(`Invalid funding amount: ${options.amount}. Amount must be positive.`);
    }

    const wallets = await this.loadWallets();
    if (wallets.length === 0) {
      throw new Error('No wallets available to fund. Create wallets first.');
    }

    const results: TransferResult[] = [];
    const limit = pLimit(options.concurrency || this.config.concurrency || 8);

    const tasks = wallets.map((wallet) =>
      limit(async () => {
        try {
          const tx = new TransactionBlock();
          tx.setSender(sponsorKeypair.getPublicKey().toSuiAddress());

          // Transfer SUI
          const [coin] = tx.splitCoins(tx.gas, [options.amount]);
          tx.transferObjects([coin], wallet.address);

          const result = await this.client.signAndExecuteTransactionBlock({
            transactionBlock: tx,
            signer: sponsorKeypair,
            options: {
              showEffects: true,
            },
          });

          return {
            walletId: wallet.id,
            to: wallet.address,
            digest: result.digest,
          };
        } catch (err) {
          return {
            walletId: wallet.id,
            to: wallet.address,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })
    );

    const txResults = await Promise.all(tasks);
    results.push(...txResults);

    return results;
  }

  /**
   * Sweep funds from all wallets to a target address
   * Mirrors sweep_all_to_main from walrus-wallet-manager.sh
   */
  async sweepWallets(options: SweepOptions): Promise<TransferResult[]> {
    const wallets = await this.loadWallets();
    const results: TransferResult[] = [];
    const limit = pLimit(options.concurrency || this.config.concurrency || 8);

    const includeWal = options.includeWal ?? true;
    const includeSui = options.includeSui ?? true;
    const gasReserve = options.gasReserve ?? BigInt(10_000_000); // 0.01 SUI

    const tasks = wallets.map((wallet) =>
      limit(async () => {
        try {
          // Load keypair for this wallet
          const keypair = await this.config.storage.loadKeypair(wallet.id);
          if (!keypair) {
            return {
              walletId: wallet.id,
              to: options.to,
              error: 'No keypair available for this wallet',
            };
          }

          // Get balance
          const { sui, wal } = await this.getBalance(wallet.address);

          // Sweep WAL first (if any and requested)
          if (includeWal && wal > BigInt(0)) {
            try {
              // Get WAL coin objects
              const allBalances = await this.client.getAllBalances({ owner: wallet.address });
              const walCoinType = allBalances.find((b) => b.coinType.includes('WAL'))?.coinType;

              if (walCoinType) {
                const coins = await this.client.getCoins({
                  owner: wallet.address,
                  coinType: walCoinType,
                });

                for (const coin of coins.data) {
                  const tx = new TransactionBlock();
                  tx.setSender(wallet.address);
                  tx.transferObjects([coin.coinObjectId], options.to);

                  await this.client.signAndExecuteTransactionBlock({
                    transactionBlock: tx,
                    signer: keypair,
                  });
                }
              }
            } catch (err) {
              console.warn(`Failed to sweep WAL from wallet ${wallet.id}:`, err);
            }
          }

          // Sweep SUI (leave gas reserve)
          if (includeSui && sui > gasReserve) {
            const amount = sui - gasReserve;
            const tx = new TransactionBlock();
            tx.setSender(wallet.address);

            const [coin] = tx.splitCoins(tx.gas, [amount]);
            tx.transferObjects([coin], options.to);

            const result = await this.client.signAndExecuteTransactionBlock({
              transactionBlock: tx,
              signer: keypair,
              options: {
                showEffects: true,
              },
            });

            return {
              walletId: wallet.id,
              to: options.to,
              digest: result.digest,
            };
          }

          return {
            walletId: wallet.id,
            to: options.to,
            digest: 'no-funds-to-sweep',
          };
        } catch (err) {
          return {
            walletId: wallet.id,
            to: options.to,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })
    );

    const txResults = await Promise.all(tasks);
    results.push(...txResults);

    return results;
  }

  /**
   * Create a new wallet and add to inventory
   */
  async createWallet(id?: string): Promise<WalletMetadata> {
    const { Ed25519Keypair } = await import('@mysten/sui.js/keypairs/ed25519');
    const keypair = new Ed25519Keypair();
    const address = keypair.getPublicKey().toSuiAddress();

    const wallets = await this.loadWallets();
    const walletId = id || String(wallets.length);

    const wallet: WalletMetadata = {
      id: walletId,
      address,
    };

    // Save keypair
    await this.config.storage.saveKeypair(walletId, keypair);

    // Add to inventory
    wallets.push(wallet);
    await this.saveWallets(wallets);

    return wallet;
  }

  /**
   * Create multiple wallets
   */
  async createWallets(count: number): Promise<WalletMetadata[]> {
    const wallets: WalletMetadata[] = [];
    for (let i = 0; i < count; i++) {
      const wallet = await this.createWallet();
      wallets.push(wallet);
    }
    return wallets;
  }
}

