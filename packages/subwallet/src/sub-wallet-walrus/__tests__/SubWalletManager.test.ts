/**
 * Tests for SubWalletManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SubWalletManager } from '../core/SubWalletManager.js';
import { MemoryStorageAdapter } from '../storage/memory-adapter.js';
import type { SubWalletConfig } from '../types.js';

describe('SubWalletManager', () => {
  let manager: SubWalletManager;
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
    const config: SubWalletConfig = {
      rpcUrl: 'https://fullnode.testnet.sui.io:443',
      storage,
      concurrency: 4,
    };
    manager = new SubWalletManager(config);
  });

  describe('createWallet', () => {
    it('should create a new wallet with unique ID', async () => {
      const wallet = await manager.createWallet();
      
      expect(wallet).toBeDefined();
      expect(wallet.id).toBeDefined();
      expect(wallet.address).toMatch(/^0x[a-f0-9]+$/);
    });

    it('should create wallet with custom ID', async () => {
      const wallet = await manager.createWallet('custom-id');
      
      expect(wallet.id).toBe('custom-id');
      expect(wallet.address).toMatch(/^0x[a-f0-9]+$/);
    });

    it('should save wallet to storage', async () => {
      const wallet = await manager.createWallet();
      const wallets = await storage.loadWallets();
      
      expect(wallets).toHaveLength(1);
      expect(wallets[0].id).toBe(wallet.id);
      expect(wallets[0].address).toBe(wallet.address);
    });

    it('should save keypair to storage', async () => {
      const wallet = await manager.createWallet();
      const keypair = await storage.loadKeypair(wallet.id);
      
      expect(keypair).toBeDefined();
      expect(keypair?.getPublicKey().toSuiAddress()).toBe(wallet.address);
    });
  });

  describe('createWallets', () => {
    it('should create multiple wallets', async () => {
      const wallets = await manager.createWallets(5);
      
      expect(wallets).toHaveLength(5);
      expect(new Set(wallets.map(w => w.id)).size).toBe(5); // All unique IDs
      expect(new Set(wallets.map(w => w.address)).size).toBe(5); // All unique addresses
    });

    it('should save all wallets to storage', async () => {
      await manager.createWallets(3);
      const stored = await storage.loadWallets();
      
      expect(stored).toHaveLength(3);
    });
  });

  describe('loadWallets', () => {
    it('should load wallets from storage', async () => {
      await manager.createWallets(2);
      const wallets = await manager.loadWallets();
      
      expect(wallets).toHaveLength(2);
    });

    it('should return empty array when no wallets', async () => {
      const wallets = await manager.loadWallets();
      
      expect(wallets).toEqual([]);
    });
  });

  describe('saveWallets', () => {
    it('should save wallets to storage', async () => {
      const wallets = [
        { id: '1', address: '0x123' },
        { id: '2', address: '0x456' },
      ];
      
      await manager.saveWallets(wallets);
      const loaded = await storage.loadWallets();
      
      expect(loaded).toEqual(wallets);
    });
  });

  // Note: Balance and transaction tests would require mocking SuiClient
  // or running against a local testnet. Here's an example structure:

  describe('getBalance', () => {
    it('should return zero balance for new wallet', async () => {
      // This test would require mocking SuiClient
      // const wallet = await manager.createWallet();
      // const balance = await manager.getBalance(wallet.address);
      // expect(balance.sui).toBe(BigInt(0));
      // expect(balance.wal).toBe(BigInt(0));
    });
  });

  describe('Input Validation', () => {
    it('should reject funding with zero amount', async () => {
      await manager.createWallet();
      const { Ed25519Keypair } = await import('@mysten/sui.js/keypairs/ed25519');
      const sponsor = new Ed25519Keypair();

      await expect(
        manager.fundWallets(sponsor, { amount: BigInt(0) })
      ).rejects.toThrow('Invalid funding amount');
    });

    it('should reject funding with negative amount', async () => {
      await manager.createWallet();
      const { Ed25519Keypair } = await import('@mysten/sui.js/keypairs/ed25519');
      const sponsor = new Ed25519Keypair();

      await expect(
        manager.fundWallets(sponsor, { amount: BigInt(-100) })
      ).rejects.toThrow('Invalid funding amount');
    });

    it('should reject funding when no wallets exist', async () => {
      const { Ed25519Keypair } = await import('@mysten/sui.js/keypairs/ed25519');
      const sponsor = new Ed25519Keypair();

      await expect(
        manager.fundWallets(sponsor, { amount: BigInt(1000000) })
      ).rejects.toThrow('No wallets available to fund');
    });
  });
});

