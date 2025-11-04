/**
 * SubWalletOrchestrator - high-level facade for CLI and browser usage
 * Combines SubWalletManager and SponsoredTransactions for easy consumption
 */

import { SuiClient } from '@mysten/sui.js/client';
import type { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { SubWalletManager } from './sub-wallet-walrus/core/SubWalletManager.js';
import { SponsoredTransactions } from './sub-wallet-walrus/core/SponsoredTransactions.js';
import {
  MoveSubWalletOrchestrator,
  type FundWalletsParams as MoveFundWalletsParams,
  type RegisterSponsorParams as MoveRegisterSponsorParams,
  type SetAllowanceParams as MoveSetAllowanceParams,
} from './sub-wallet-walrus/contracts/MoveSubWalletOrchestrator.js';
import { suiMoveCall, type SuiCliRunOptions } from './sub-wallet-walrus/wrappers/suiCli.js';
import type {
  SubWalletConfig,
  WalletBalance,
  WalletMetadata,
  FundOptions,
  SweepOptions,
  TransferResult,
  StorageAdapter,
} from './types.js';

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  /** Sui RPC URL */
  rpcUrl: string;
  /** Storage adapter for wallet metadata */
  storage: StorageAdapter;
  /** Optional concurrency limit */
  concurrency?: number;
  /** Optional sponsor keypair for gasless operations */
  sponsor?: Ed25519Keypair;
  /** Optional Move package configuration */
  move?: {
    packageId: string;
    policyId?: string;
  };
}

/**
 * Main orchestrator class - use this for most operations
 */
export class SubWalletOrchestrator {
  private manager: SubWalletManager;
  private sponsored: SponsoredTransactions;
  private config: OrchestratorConfig;
  private moveOrchestrator?: MoveSubWalletOrchestrator;
  private movePackageId?: string;
  private sponsorWalletBootstrapped = false;

  constructor(config: OrchestratorConfig) {
    this.config = config;

    const managerConfig: SubWalletConfig = {
      rpcUrl: config.rpcUrl,
      storage: config.storage,
      concurrency: config.concurrency,
    };

    this.manager = new SubWalletManager(managerConfig);
    this.sponsored = new SponsoredTransactions(this.manager.getClient());
    if (config.move) {
      this.movePackageId = config.move.packageId;
      this.moveOrchestrator = new MoveSubWalletOrchestrator({
        client: this.manager.getClient(),
        packageId: config.move.packageId,
        policyId: config.move.policyId,
      });
    }
  }

  /**
   * Get the underlying SubWalletManager
   */
  getManager(): SubWalletManager {
    return this.manager;
  }

  /**
   * Get the underlying SponsoredTransactions handler
   */
  getSponsored(): SponsoredTransactions {
    return this.sponsored;
  }

  /**
   * Get Move orchestrator (if configured)
   */
  getMoveOrchestrator(): MoveSubWalletOrchestrator | undefined {
    return this.moveOrchestrator;
  }

  /**
   * Get the Sui client
   */
  getClient(): SuiClient {
    return this.manager.getClient();
  }

  // ===== Wallet Inventory =====

  /**
   * Load all wallets from storage
   */
  async loadWallets(): Promise<WalletMetadata[]> {
    await this.ensureSponsorWallet();
    return this.manager.loadWallets();
  }

  /**
   * Save wallets to storage
   */
  async saveWallets(wallets: WalletMetadata[]): Promise<void> {
    return this.manager.saveWallets(wallets);
  }

  /**
   * Create a new wallet
   */
  async createWallet(id?: string): Promise<WalletMetadata> {
    await this.ensureSponsorWallet();
    return this.manager.createWallet(id);
  }

  /**
   * Create multiple wallets
   */
  async createWallets(count: number): Promise<WalletMetadata[]> {
    await this.ensureSponsorWallet();
    return this.manager.createWallets(count);
  }

  // ===== Balance Operations =====

  /**
   * Check balance for a single wallet address
   */
  async getBalance(address: string): Promise<{ sui: bigint; wal: bigint }> {
    return this.manager.getBalance(address);
  }

  /**
   * Check balances for all wallets
   */
  async checkAllBalances(): Promise<WalletBalance[]> {
    await this.ensureSponsorWallet();
    return this.manager.checkAllBalances();
  }

  /**
   * Get aggregate balance across all wallets
   */
  async getAggregateBalance(): Promise<{ totalSui: bigint; totalWal: bigint; count: number }> {
    await this.ensureSponsorWallet();
    return this.manager.getAggregateBalance();
  }

  // ===== Fund Operations =====

  /**
   * Fund all wallets with SUI from a sponsor keypair
   */
  async fundWallets(
    sponsorKeypair: Ed25519Keypair,
    options: FundOptions
  ): Promise<TransferResult[]> {
    await this.ensureSponsorWallet();
    return this.manager.fundWallets(sponsorKeypair, options);
  }

  /**
   * Fund wallets using sponsored transactions (gasless for recipients)
   * Uses the sponsor keypair from config or provided override
   */
  async fundWalletsSponsored(options: {
    sponsor?: Ed25519Keypair;
    amount: bigint;
    concurrency?: number;
  }): Promise<TransferResult[]> {
    const sponsor = options.sponsor || this.config.sponsor;
    if (!sponsor) {
      throw new Error('No sponsor keypair configured or provided');
    }

    const wallets = await this.loadWallets();
    const recipients = await Promise.all(
      wallets.map(async (wallet) => {
        // Try to load keypair, fallback to sponsor as sender
        const keypair = await this.config.storage.loadKeypair(wallet.id);
        return {
          sender: keypair || sponsor,
          to: wallet.address,
          amount: options.amount,
        };
      })
    );

    return this.sponsored.batchSponsorTransfers({
      sponsor,
      recipients,
      concurrency: options.concurrency,
    });
  }

  // ===== Sweep Operations =====

  /**
   * Sweep funds from all wallets to a target address
   */
  async sweepWallets(options: SweepOptions): Promise<TransferResult[]> {
    await this.ensureSponsorWallet();
    return this.manager.sweepWallets(options);
  }

  /**
   * Sweep funds from all wallets to the sponsor address
   * Convenience method that uses sponsor from config
   */
  async sweepToSponsor(options?: {
    includeWal?: boolean;
    includeSui?: boolean;
    gasReserve?: bigint;
    concurrency?: number;
  }): Promise<TransferResult[]> {
    if (!this.config.sponsor) {
      throw new Error('No sponsor keypair configured');
    }

    const sponsorAddress = this.config.sponsor.getPublicKey().toSuiAddress();
    return this.sweepWallets({
      to: sponsorAddress,
      ...options,
    });
  }

  // ===== Sponsored Transaction Helpers =====

  /**
   * Execute a custom sponsored transaction
   * Allows building arbitrary transactions with sponsor paying gas
   */
  async executeSponsoredTransaction(options: {
    sender: Ed25519Keypair;
    sponsor?: Ed25519Keypair;
    buildTransaction: (tx: import('@mysten/sui.js/transactions').TransactionBlock) => void;
    gasBudget?: bigint;
  }): Promise<{ digest: string }> {
    await this.ensureSponsorWallet();
    const sponsor = options.sponsor || this.config.sponsor;
    if (!sponsor) {
      throw new Error('No sponsor keypair configured or provided');
    }

    return this.sponsored.executeSponsoredTransaction({
      sender: options.sender,
      sponsor,
      buildTransaction: options.buildTransaction,
      gasBudget: options.gasBudget,
    });
  }

  /**
   * Build and execute Move-based funding transaction using RPC.
   */
  async fundWalletsViaMove(params: MoveFundWalletsParams, signer: Ed25519Keypair) {
    await this.ensureSponsorWallet();
    if (!this.moveOrchestrator) {
      throw new Error('Move orchestrator not configured');
    }
    return this.moveOrchestrator.fundWallets(params, signer);
  }

  async registerSponsorViaMove(params: MoveRegisterSponsorParams, signer: Ed25519Keypair) {
    await this.ensureSponsorWallet();
    if (!this.moveOrchestrator) {
      throw new Error('Move orchestrator not configured');
    }
    return this.moveOrchestrator.registerSponsor(params, signer);
  }

  async setSponsorAllowanceViaMove(params: MoveSetAllowanceParams, signer: Ed25519Keypair) {
    await this.ensureSponsorWallet();
    if (!this.moveOrchestrator) {
      throw new Error('Move orchestrator not configured');
    }
    return this.moveOrchestrator.setSponsorAllowance(params, signer);
  }

  /**
   * Invoke the Move contract using the Sui CLI for development/testing flows.
   */
  async fundWalletsViaCli(params: {
    packageId?: string;
    policyId: string;
    sponsorCapId: string;
    coinObjectId: string;
    recipients: string[];
    amounts: Array<number | bigint>;
    gasBudget?: number | bigint;
    signer?: string;
    profile?: string;
    runOptions?: SuiCliRunOptions;
    extraFlags?: string[];
  }): Promise<string> {
    await this.ensureSponsorWallet();
    const packageId = params.packageId ?? this.movePackageId;
    if (!packageId) {
      throw new Error('packageId required for CLI invocation');
    }

    const args = [
      `object:${params.policyId}`,
      `object:${params.sponsorCapId}`,
      `object:${params.coinObjectId}`,
      `vector[${params.recipients.join(',')}]`,
      `vector[${params.amounts.map((value) => String(value)).join(',')}]`,
    ];

    return suiMoveCall({
      packageId,
      module: 'policy',
      func: 'fund_wallets_sui',
      args,
      gasBudget: params.gasBudget,
      signer: params.signer,
      profile: params.profile,
      extraFlags: params.extraFlags,
      runOptions: params.runOptions,
    });
  }

  // ===== Utility Methods =====

  /**
   * Get wallet by ID
   */
  async getWallet(id: string): Promise<WalletMetadata | null> {
    const wallets = await this.loadWallets();
    return wallets.find((w) => w.id === id) || null;
  }

  /**
   * Get wallet keypair by ID
   */
  async getWalletKeypair(id: string): Promise<Ed25519Keypair | null> {
    await this.ensureSponsorWallet();
    return this.config.storage.loadKeypair(id);
  }

  /**
   * Format balance to human-readable SUI
   */
  formatSui(mist: bigint): string {
    const sui = Number(mist) / 1_000_000_000;
    return sui.toFixed(6);
  }

  /**
   * Format balance to human-readable WAL
   */
  formatWal(units: bigint): string {
    const wal = Number(units) / 1_000_000_000;
    return wal.toFixed(6);
  }

  /**
   * Parse SUI string to MIST
   */
  parseSui(sui: string): bigint {
    const value = parseFloat(sui);
    return BigInt(Math.floor(value * 1_000_000_000));
  }

  /**
   * Parse WAL string to units
   */
  parseWal(wal: string): bigint {
    const value = parseFloat(wal);
    return BigInt(Math.floor(value * 1_000_000_000));
  }

  /**
   * Ensure sponsor wallet is bootstrapped as wallet 0
   * Only runs once when sponsor is configured and no wallets exist yet
   */
  private async ensureSponsorWallet(): Promise<void> {
    if (this.sponsorWalletBootstrapped) {
      return;
    }

    const sponsor = this.config.sponsor;
    if (!sponsor) {
      this.sponsorWalletBootstrapped = true;
      return;
    }

    const wallets = await this.manager.loadWallets();
    if (wallets.length > 0) {
      this.sponsorWalletBootstrapped = true;
      return;
    }

    // Bootstrap wallet 0 with sponsor keypair
    const sponsorAddress = sponsor.getPublicKey().toSuiAddress();
    const wallet: WalletMetadata = {
      id: '0',
      address: sponsorAddress,
    };

    await this.config.storage.saveKeypair('0', sponsor);
    await this.manager.saveWallets([wallet]);
    this.sponsorWalletBootstrapped = true;
  }
}

