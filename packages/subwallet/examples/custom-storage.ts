/**
 * Example custom storage adapter using browser localStorage
 * This shows how to implement your own storage for browser environments
 */

import type { StorageAdapter, WalletMetadata } from '../src/types.js';
import type { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';

/**
 * Browser localStorage adapter
 * Stores wallet metadata and keypairs in browser localStorage
 */
export class LocalStorageAdapter implements StorageAdapter {
  private walletsKey = 'subwallet_wallets';
  private keypairPrefix = 'subwallet_keypair_';

  async loadWallets(): Promise<WalletMetadata[]> {
    try {
      const data = localStorage.getItem(this.walletsKey);
      return data ? JSON.parse(data) : [];
    } catch (err) {
      console.warn('Failed to load wallets from localStorage:', err);
      return [];
    }
  }

  async saveWallets(wallets: WalletMetadata[]): Promise<void> {
    try {
      localStorage.setItem(this.walletsKey, JSON.stringify(wallets));
    } catch (err) {
      console.error('Failed to save wallets to localStorage:', err);
      throw err;
    }
  }

  async loadKeypair(walletId: string): Promise<Ed25519Keypair | null> {
    try {
      const key = localStorage.getItem(`${this.keypairPrefix}${walletId}`);
      if (!key) return null;

      const { Ed25519Keypair } = await import('@mysten/sui.js/keypairs/ed25519');
      const secretKey = new Uint8Array(JSON.parse(key));
      return Ed25519Keypair.fromSecretKey(secretKey);
    } catch (err) {
      console.warn(`Failed to load keypair for wallet ${walletId}:`, err);
      return null;
    }
  }

  async saveKeypair(walletId: string, keypair: Ed25519Keypair): Promise<void> {
    try {
      const exported = keypair.export();
      const key = JSON.stringify(Array.from(exported.privateKey));
      localStorage.setItem(`${this.keypairPrefix}${walletId}`, key);
    } catch (err) {
      console.error(`Failed to save keypair for wallet ${walletId}:`, err);
      throw err;
    }
  }

  /**
   * Clear all wallet data from localStorage
   */
  clear(): void {
    localStorage.removeItem(this.walletsKey);
    // Clear all keypairs
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith(this.keypairPrefix)) {
        localStorage.removeItem(key);
      }
    });
  }
}

/**
 * IndexedDB adapter for larger datasets
 * Better for storing many wallets in browser
 */
export class IndexedDBAdapter implements StorageAdapter {
  private dbName = 'subwallet_db';
  private version = 1;
  private db: IDBDatabase | null = null;

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('wallets')) {
          db.createObjectStore('wallets', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('keypairs')) {
          db.createObjectStore('keypairs');
        }
      };
    });
  }

  async loadWallets(): Promise<WalletMetadata[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('wallets', 'readonly');
      const store = tx.objectStore('wallets');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveWallets(wallets: WalletMetadata[]): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('wallets', 'readwrite');
      const store = tx.objectStore('wallets');

      // Clear existing
      store.clear();

      // Add all wallets
      wallets.forEach((wallet) => store.add(wallet));

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadKeypair(walletId: string): Promise<Ed25519Keypair | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('keypairs', 'readonly');
      const store = tx.objectStore('keypairs');
      const request = store.get(walletId);

      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }

        import('@mysten/sui.js/keypairs/ed25519')
          .then(({ Ed25519Keypair }) => {
            const secretKey = new Uint8Array(request.result);
            resolve(Ed25519Keypair.fromSecretKey(secretKey));
          })
          .catch(reject);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveKeypair(walletId: string, keypair: Ed25519Keypair): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('keypairs', 'readwrite');
      const store = tx.objectStore('keypairs');
      const exported = keypair.export();
      const request = store.put(Array.from(exported.privateKey), walletId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Usage example:
/*
import { SubWalletOrchestrator } from '@walrus/subwallet-sdk';
import { LocalStorageAdapter } from './custom-storage';

const orchestrator = new SubWalletOrchestrator({
  rpcUrl: 'https://fullnode.testnet.sui.io:443',
  storage: new LocalStorageAdapter(),
});

// Or with IndexedDB:
const orchestrator = new SubWalletOrchestrator({
  rpcUrl: 'https://fullnode.testnet.sui.io:443',
  storage: new IndexedDBAdapter(),
});
*/
