/**
 * Core type definitions for the SubWallet SDK
 */

import type { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';

/**
 * Wallet metadata stored in inventory
 */
export interface WalletMetadata {
  /** Wallet identifier (e.g., "0", "1", "wallet_0") */
  id: string;
  /** Sui address */
  address: string;
  /** Optional file path (Node only) */
  filePath?: string;
  /** Optional arbitrary metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Balance information for a wallet
 */
export interface WalletBalance {
  /** Wallet identifier */
  walletId: string;
  /** Sui address */
  address: string;
  /** SUI balance in MIST */
  sui: bigint;
  /** WAL balance in smallest unit */
  wal: bigint;
  /** Optional other coin types */
  other?: Record<string, bigint>;
}

/**
 * Result of a fund/transfer operation
 */
export interface TransferResult {
  /** Wallet identifier */
  walletId: string;
  /** Target address */
  to: string;
  /** Transaction digest if successful */
  digest?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Storage adapter interface for wallet metadata
 * Implement this to support Node FS, browser storage, or in-memory
 */
export interface StorageAdapter {
  /**
   * Load all wallet metadata
   */
  loadWallets(): Promise<WalletMetadata[]>;

  /**
   * Save wallet metadata
   */
  saveWallets(wallets: WalletMetadata[]): Promise<void>;

  /**
   * Load a keypair for a given wallet ID
   * @param walletId - wallet identifier
   * @returns Ed25519Keypair or null if not available
   */
  loadKeypair(walletId: string): Promise<Ed25519Keypair | null>;

  /**
   * Save a keypair for a given wallet ID
   */
  saveKeypair(walletId: string, keypair: Ed25519Keypair): Promise<void>;
}

/**
 * Configuration for SubWalletManager
 */
export interface SubWalletConfig {
  /** Sui RPC URL */
  rpcUrl: string;
  /** Storage adapter for wallet metadata */
  storage: StorageAdapter;
  /** Optional concurrency limit for parallel operations */
  concurrency?: number;
}

/**
 * Options for funding wallets
 */
export interface FundOptions {
  /** Amount in MIST to send per wallet */
  amount: bigint;
  /** Optional coin type (default: SUI) */
  coinType?: string;
  /** Optional concurrency limit */
  concurrency?: number;
}

/**
 * Options for sweeping funds
 */
export interface SweepOptions {
  /** Target address to sweep to */
  to: string;
  /** Whether to sweep WAL tokens (default: true) */
  includeWal?: boolean;
  /** Whether to sweep SUI (default: true) */
  includeSui?: boolean;
  /** Gas reserve to leave in each wallet (MIST) */
  gasReserve?: bigint;
  /** Optional concurrency limit */
  concurrency?: number;
}

/**
 * Sponsored transaction configuration
 */
export interface SponsorConfig {
  /** Sponsor keypair that pays for gas */
  sponsor: Ed25519Keypair;
  /** Gas budget in MIST */
  gasBudget?: bigint;
}

