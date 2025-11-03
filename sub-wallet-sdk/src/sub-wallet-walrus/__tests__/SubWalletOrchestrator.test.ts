/**
 * Tests for SubWalletOrchestrator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SubWalletOrchestrator } from '../../SubWalletOrchestrator.js';
import { MemoryStorageAdapter } from '../storage/memory-adapter.js';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';

describe('SubWalletOrchestrator', () => {
  let orchestrator: SubWalletOrchestrator;
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
    orchestrator = new SubWalletOrchestrator({
      rpcUrl: 'https://fullnode.testnet.sui.io:443',
      storage,
      concurrency: 4,
    });
  });

  describe('createWallet', () => {
    it('should create wallet via orchestrator', async () => {
      const wallet = await orchestrator.createWallet();
      
      expect(wallet).toBeDefined();
      expect(wallet.id).toBeDefined();
      expect(wallet.address).toMatch(/^0x[a-f0-9]+$/);
    });
  });

  describe('createWallets', () => {
    it('should create multiple wallets', async () => {
      const wallets = await orchestrator.createWallets(3);
      
      expect(wallets).toHaveLength(3);
    });
  });

  describe('getWallet', () => {
    it('should retrieve wallet by ID', async () => {
      const created = await orchestrator.createWallet('test-id');
      const retrieved = await orchestrator.getWallet('test-id');
      
      expect(retrieved).toEqual(created);
    });

    it('should return null for non-existent wallet', async () => {
      const wallet = await orchestrator.getWallet('nonexistent');
      
      expect(wallet).toBeNull();
    });
  });

  describe('getWalletKeypair', () => {
    it('should retrieve wallet keypair', async () => {
      const wallet = await orchestrator.createWallet('test');
      const keypair = await orchestrator.getWalletKeypair('test');
      
      expect(keypair).toBeDefined();
      expect(keypair?.getPublicKey().toSuiAddress()).toBe(wallet.address);
    });
  });

  describe('utility methods', () => {
    it('should format SUI correctly', () => {
      const formatted = orchestrator.formatSui(BigInt(50_000_000));
      expect(formatted).toBe('0.050000');
    });

    it('should format WAL correctly', () => {
      const formatted = orchestrator.formatWal(BigInt(100_000_000));
      expect(formatted).toBe('0.100000');
    });

    it('should parse SUI correctly', () => {
      const mist = orchestrator.parseSui('0.05');
      expect(mist).toBe(BigInt(50_000_000));
    });

    it('should parse WAL correctly', () => {
      const units = orchestrator.parseWal('0.1');
      expect(units).toBe(BigInt(100_000_000));
    });
  });

  describe('with sponsor', () => {
    it('should initialize with sponsor keypair', () => {
      const sponsor = new Ed25519Keypair();
      const orch = new SubWalletOrchestrator({
        rpcUrl: 'https://fullnode.testnet.sui.io:443',
        storage,
        sponsor,
      });
      
      expect(orch).toBeDefined();
    });

    it('should throw error when sweepToSponsor called without sponsor', async () => {
      await expect(orchestrator.sweepToSponsor()).rejects.toThrow(
        'No sponsor keypair configured'
      );
    });
  });
});

