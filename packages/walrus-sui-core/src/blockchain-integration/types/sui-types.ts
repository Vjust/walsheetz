/**
 * Type definitions for Sui blockchain integration
 * These types replace `any` usage throughout the SDK integration layer
 */

import type { SuiClient } from '@mysten/sui/client';
import type { Transaction } from '@mysten/sui/transactions';

// =============================================================================
// Network Configuration Types
// =============================================================================

export interface NetworkConfig {
  packageId: string;
  registryObjectId: string;
  rpcUrl?: string;
  network?: string;
  features?: {
    contentHashInSave?: boolean;
    clockInSave?: boolean;
  };
}

export interface RuntimeConfig {
  getCurrentNetwork: () => NetworkConfig;
  isFallback?: boolean;
  network?: string;
  [key: string]: unknown;
}

// =============================================================================
// Validation Types
// =============================================================================

export interface ValidationResult {
  exists: boolean;
  objectId?: string;
  data?: unknown;
  error?: string;
}

export interface NetworkCheckResult {
  mismatch: boolean;
  chainIdentifier: string;
  environment: string;
  rpcUrl: string;
  chainMismatch?: boolean;
  packageExists?: boolean;
  packageCheckError?: string | null;
  packageId?: string;
  error?: string;
}

// =============================================================================
// Gas & Transaction Types
// =============================================================================

export interface GasBudgetResult {
  estimatedGas: number;
  finalGasBudget: number;
  finalCostSUI: string;
  isHighGas: boolean;
  fallback?: boolean;
}

export interface StorageTransactionData {
  spreadsheetObjectId: string;
  walrusBlobId: string;
  contentHash?: string;
  cellCount?: number;
  description?: string;
  version?: string;
}

export interface TransactionResult {
  digest: string;
  effects?: unknown;
  objectChanges?: unknown;
  balanceChanges?: unknown;
  [key: string]: unknown;
}

export interface TransactionOptions {
  requestType?: string;
  showEffects?: boolean;
  showObjectChanges?: boolean;
  showBalanceChanges?: boolean;
  showEvents?: boolean;
  options?: {
    showEffects?: boolean;
    showObjectChanges?: boolean;
    showBalanceChanges?: boolean;
    showEvents?: boolean;
  };
}

export interface TransactionQueueItem {
  id: string;
  transaction: Transaction;
  resolve: (value: TransactionResult) => void;
  reject: (reason?: Error) => void;
  timestamp: number;
}

// =============================================================================
// Wallet Types
// =============================================================================

export interface WalletInfo {
  name: string;
  icon?: string;
  version?: string;
  [key: string]: unknown;
}

export interface WalletAccount {
  address: string;
  publicKey?: string;
  publicKeyBase64?: string;
}

export interface WalletConnection {
  isConnected: boolean;
  isAutoConnecting?: boolean;
  address?: string;
  currentAccount?: WalletAccount;
  balance?: { mist: string } | null;
  availableWallets?: { installed: WalletInfo[]; notInstalled?: string[] };
  connectionError?: string | null;
  name?: string;
  connectWallet: (wallet: WalletInfo) => Promise<void>;
  disconnectWallet: () => void;
  sign?: (transaction: unknown) => Promise<{ signature: string } | TransactionResult>;
  signAndExecute?: (
    transaction: Transaction,
    options?: TransactionOptions
  ) => Promise<TransactionResult>;
  signAndExecuteTransaction?: (params: {
    transaction: Transaction;
    options?: TransactionOptions;
  }) => Promise<TransactionResult>;
  signAndExecuteTransactionBlock?: (params: {
    transactionBlock: Transaction;
    options?: TransactionOptions;
  }) => Promise<TransactionResult>;
}

// =============================================================================
// Wallet Manager Result Types
// =============================================================================

export interface ConnectResult {
  success: boolean;
  wallet?: {
    address: string;
    publicKey: string;
    balance: string;
  };
  error?: string;
}

export interface WalletInfoResult {
  connected: boolean;
  address: string | null;
  publicKey: string | null;
  network: string;
  balance: unknown | null;
}

export interface ConnectionStatus {
  isConnected: boolean;
  address: string | null;
  simulationMode: boolean;
}

export interface HealthStatus {
  isEnabled: boolean;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  lastHeartbeat: number | null;
  consecutiveFailures: number;
  lastSuccessfulTransaction: number | null;
  recentFailures: number;
  reconnectionAttempts: number;
}

export interface UnsignedTransactionResult {
  success: boolean;
  transaction?: Transaction;
  error?: string;
  metadata?: {
    adapterId: string;
    method: string;
    args: unknown[];
    description: string;
    estimatedGas?:
      | number
      | {
          computationCost: string;
          storageCost: string;
          storageRebate: string;
          totalGasUsed: string;
        };
  };
}

export interface ContractExecutionResult {
  success: boolean;
  result?: TransactionResult;
  metadata?: unknown;
  transactionDigest?: string;
  effects?: unknown;
  objectChanges?: unknown;
  error?: string;
  adapterId?: string;
  method?: string;
  args?: unknown[];
}

// =============================================================================
// Spreadsheet Types
// =============================================================================

export interface SpreadsheetMetadata {
  title?: string;
  owner?: string;
  version?: number;
  lastModified?: number;
  walrusBlobId?: string;
  contentHash?: string;
}

export interface SpreadsheetObject {
  objectId: string;
  title?: string;
  owner?: string;
  lastModified?: number;
  version?: number;
  [key: string]: unknown;
}

export interface SpreadsheetListResult {
  success: boolean;
  spreadsheets: SpreadsheetObject[];
  error?: string;
}

export interface LoadResult {
  success: boolean;
  data?: unknown;
  metadata?: {
    isEmpty?: boolean;
    version?: {
      walrus_blob_id?: string;
      version?: number;
    };
  };
  error?: string;
}

export interface SaveResult {
  success: boolean;
  spreadsheetId?: string;
  walrusBlobId?: string;
  transactionDigest?: string;
  saveInfo?: {
    blobId: string;
    digest: string;
    timestamp: number;
  };
  isFirstSave?: boolean;
  error?: string;
  stage?: string;
  technical?: string;
  details?: string;
  blobId?: string;
}

// =============================================================================
// Sponsor Types
// =============================================================================

export interface SponsorConfig {
  enabled: boolean;
  sponsorAddress?: string;
  maxGasBudget?: number;
}

export interface SponsorResult {
  success: boolean;
  sponsored: boolean;
  gasPayment?: unknown;
  error?: string;
}

// =============================================================================
// Deposit Types
// =============================================================================

export interface DepositConfig {
  minAmount: number;
  maxAmount: number;
  tokenType: string;
}

export interface DepositResult {
  success: boolean;
  transactionDigest?: string;
  amount?: number;
  error?: string;
}

// =============================================================================
// Event Types
// =============================================================================

export type EventListener = (data: unknown) => void;

export interface EventListenerMap {
  [eventName: string]: EventListener[];
}

// =============================================================================
// Sync Status Types
// =============================================================================

export interface SyncStatus {
  lastSyncTime?: number;
  pendingChanges: number;
  syncState: 'synced' | 'syncing' | 'pending' | 'error';
  error?: string;
}

// =============================================================================
// Enhanced Error Types
// =============================================================================

export interface EnhancedError extends Error {
  originalError?: unknown;
  attempt?: number;
  isRetryable?: boolean;
}

// =============================================================================
// Transaction Preparation Types
// =============================================================================

export interface GasCostSummaryResult {
  computationCost: string;
  storageCost: string;
  storageRebate: string;
  totalGasUsed: string;
}

export interface TransactionPreparation {
  transaction: Transaction;
  method: string;
  args: unknown[];
  description: string;
  estimatedGas?: number | GasCostSummaryResult;
  result?: unknown;
}

// =============================================================================
// Runtime Config Extensions
// =============================================================================

export interface RuntimeConfigWithServices extends RuntimeConfig {
  currentNetwork?: string;
  networks?: Record<string, NetworkConfig>;
  getServiceUrl?: (name: string) => string;
  getFeature?: (name: string, defaultValue: boolean) => boolean;
  setFeature?: (name: string, value: boolean) => void;
}

// =============================================================================
// Global Window Augmentation
// =============================================================================

declare global {
  interface Window {
    browserWalletManager?: unknown;
    walSheetzErrorRecovery?: {
      handleError: (error: unknown, context: Record<string, string>) => void;
    };
  }
}

// =============================================================================
// Re-export SDK types for convenience
// =============================================================================

export type { SuiClient, Transaction };
