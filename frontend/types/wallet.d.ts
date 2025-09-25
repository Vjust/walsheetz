/**
 * TypeScript interfaces for wallet connection functionality
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { WalletAccount } from '@mysten/wallet-standard';

export interface WalletBalance {
  totalBalance: string;
  sui: string;
  mist: string;
}

export interface WalletInfo {
  name: string;
  icon: string;
  url: string;
  installed: boolean;
}

export interface AvailableWallets {
  installed: Wallet[];
  notInstalled: WalletInfo[];
}

export interface Wallet {
  name: string;
  icon?: string;
  features?: Record<string, unknown>;
}

export interface TransactionResult {
  digest: string;
  effects?: unknown;
  objectChanges?: unknown;
  events?: unknown;
  balanceChanges?: unknown;
}

export interface TransactionOptions {
  showEffects?: boolean;
  showEvents?: boolean;
  showObjectChanges?: boolean;
  showBalanceChanges?: boolean;
}

export interface UseWalletConnection {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;

  // Account info
  currentAccount: WalletAccount | null;
  address: string | undefined;
  formattedAddress: string;
  balance: WalletBalance | null;

  // Wallet info
  wallets: Wallet[];
  selectedWallet: Wallet | null;
  availableWallets: AvailableWallets;

  // Actions
  connectWallet: (wallet: Wallet) => Promise<unknown>;
  disconnectWallet: () => void;
  sign: (transaction: Transaction) => Promise<unknown>;
  signAndExecute: (transaction: Transaction, options?: TransactionOptions) => Promise<TransactionResult>;
  fetchBalance: () => Promise<void>;

  // Transaction builders
  createSpreadsheetTransaction: (title: string) => Promise<Transaction>;
  saveVersionTransaction: (
    spreadsheetId: string,
    walrusBlobId: string,
    contentHash: string,
    cellCount: number,
    description: string
  ) => Promise<Transaction>;

  // Client access
  suiClient: SuiClient;
}