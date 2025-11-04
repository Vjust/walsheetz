/**
 * In-memory storage adapter - suitable for browser or testing
 */

import type { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import type { StorageAdapter, WalletMetadata } from '../../types.js';

export class MemoryStorageAdapter implements StorageAdapter {
  private wallets: WalletMetadata[] = [];
  private keypairs: Map<string, Ed25519Keypair> = new Map();

  constructor(initialWallets?: WalletMetadata[]) {
    if (initialWallets) {
      this.wallets = [...initialWallets];
    }
  }

  async loadWallets(): Promise<WalletMetadata[]> {
    return [...this.wallets];
  }

  async saveWallets(wallets: WalletMetadata[]): Promise<void> {
    this.wallets = [...wallets];
  }

  async loadKeypair(walletId: string): Promise<Ed25519Keypair | null> {
    return this.keypairs.get(walletId) || null;
  }

  async saveKeypair(walletId: string, keypair: Ed25519Keypair): Promise<void> {
    this.keypairs.set(walletId, keypair);
  }

  /**
   * Clear all stored data (useful for testing)
   */
  clear(): void {
    this.wallets = [];
    this.keypairs.clear();
  }
}

