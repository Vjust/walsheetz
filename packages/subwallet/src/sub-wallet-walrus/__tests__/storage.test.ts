/**
 * Tests for storage adapters
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageAdapter } from '../storage/memory-adapter.js';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import type { WalletMetadata } from '../types.js';

describe('MemoryStorageAdapter', () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
  });

  describe('loadWallets', () => {
    it('should return empty array initially', async () => {
      const wallets = await storage.loadWallets();
      expect(wallets).toEqual([]);
    });

    it('should return initial wallets if provided', async () => {
      const initial: WalletMetadata[] = [
        { id: '1', address: '0x123' },
      ];
      const storageWithData = new MemoryStorageAdapter(initial);
      const wallets = await storageWithData.loadWallets();
      
      expect(wallets).toEqual(initial);
    });
  });

  describe('saveWallets', () => {
    it('should save and load wallets', async () => {
      const wallets: WalletMetadata[] = [
        { id: '1', address: '0x123' },
        { id: '2', address: '0x456' },
      ];
      
      await storage.saveWallets(wallets);
      const loaded = await storage.loadWallets();
      
      expect(loaded).toEqual(wallets);
    });

    it('should overwrite previous wallets', async () => {
      await storage.saveWallets([{ id: '1', address: '0x123' }]);
      await storage.saveWallets([{ id: '2', address: '0x456' }]);
      
      const loaded = await storage.loadWallets();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('2');
    });
  });

  describe('loadKeypair', () => {
    it('should return null for non-existent keypair', async () => {
      const keypair = await storage.loadKeypair('nonexistent');
      expect(keypair).toBeNull();
    });
  });

  describe('saveKeypair', () => {
    it('should save and load keypair', async () => {
      const keypair = new Ed25519Keypair();
      const address = keypair.getPublicKey().toSuiAddress();
      
      await storage.saveKeypair('test', keypair);
      const loaded = await storage.loadKeypair('test');
      
      expect(loaded).toBeDefined();
      expect(loaded?.getPublicKey().toSuiAddress()).toBe(address);
    });

    it('should handle multiple keypairs', async () => {
      const kp1 = new Ed25519Keypair();
      const kp2 = new Ed25519Keypair();
      
      await storage.saveKeypair('wallet1', kp1);
      await storage.saveKeypair('wallet2', kp2);
      
      const loaded1 = await storage.loadKeypair('wallet1');
      const loaded2 = await storage.loadKeypair('wallet2');
      
      expect(loaded1?.getPublicKey().toSuiAddress()).toBe(kp1.getPublicKey().toSuiAddress());
      expect(loaded2?.getPublicKey().toSuiAddress()).toBe(kp2.getPublicKey().toSuiAddress());
    });
  });

  describe('clear', () => {
    it('should clear all data', async () => {
      await storage.saveWallets([{ id: '1', address: '0x123' }]);
      await storage.saveKeypair('test', new Ed25519Keypair());
      
      storage.clear();
      
      const wallets = await storage.loadWallets();
      const keypair = await storage.loadKeypair('test');
      
      expect(wallets).toEqual([]);
      expect(keypair).toBeNull();
    });
  });
});

