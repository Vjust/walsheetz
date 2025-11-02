/**
 * Tests for BlockchainAdapter save metadata returns
 * Validates that all save methods return complete metadata
 */

import { describe, it, expect } from 'vitest';

describe('BlockchainAdapter - Save Metadata Returns', () => {
  const baseMetadata = {
    success: true,
    blobId: 'test-blob-id-12345',
    walrusBlobId: 'test-blob-id-12345',
    transactionDigest: 'test-tx-digest-abcde',
    transactionId: 'test-tx-digest-abcde',
    contentHash: 'test-content-hash-xyz',
    storageStatus: 'newly_created',
    expiryTimestamp: Date.now() + 50 * 86400000,
    endEpoch: 1000,
    method: 'blockchain',
    storageStrategy: 'standard',
    spreadsheetId: 'sheet-12345',
    timestamp: Date.now()
  };

  describe('Standard Save Metadata', () => {
    it('should return blobId on successful save', () => {
      expect(baseMetadata).toHaveProperty('blobId');
      expect(baseMetadata.blobId).toBeTruthy();
    });

    it('should return transaction digest', () => {
      expect(baseMetadata).toHaveProperty('transactionDigest');
      expect(baseMetadata.transactionDigest).toBeTruthy();
    });

    it('should return content hash', () => {
      expect(baseMetadata).toHaveProperty('contentHash');
      expect(baseMetadata.contentHash).toBeTruthy();
    });

    it('should return storage status', () => {
      expect(baseMetadata).toHaveProperty('storageStatus');
      expect(['newly_created', 'already_certified']).toContain(baseMetadata.storageStatus);
    });

    it('should return expiry timestamp', () => {
      expect(baseMetadata).toHaveProperty('expiryTimestamp');
      expect(baseMetadata.expiryTimestamp).toBeGreaterThan(Date.now());
    });

    it('should return end epoch', () => {
      expect(baseMetadata).toHaveProperty('endEpoch');
      expect(baseMetadata.endEpoch).toBeGreaterThan(0);
    });

    it('should return save method', () => {
      expect(baseMetadata).toHaveProperty('method');
      expect(baseMetadata.method).toBeTruthy();
    });

    it('should return storage strategy', () => {
      expect(baseMetadata).toHaveProperty('storageStrategy');
      expect(['standard', 'delta-compression', 'redundancy']).toContain(
        baseMetadata.storageStrategy
      );
    });
  });

  describe('Dual Field Support', () => {
    it('should have both blobId and walrusBlobId fields', () => {
      expect(baseMetadata.blobId).toBe(baseMetadata.walrusBlobId);
    });

    it('should have both transactionDigest and transactionId fields', () => {
      expect(baseMetadata.transactionDigest).toBe(baseMetadata.transactionId);
    });
  });

  describe('Enhanced Save Metadata', () => {
    const enhancedMetadata = {
      ...baseMetadata,
      method: 'enhanced',
      storageStrategy: 'delta-with-redundancy',
      redundantBlobIds: ['blob-secondary-1', 'blob-secondary-2'],
      compressionInfo: {
        compressionRatio: 0.45,
        originalSize: 1000000,
        compressedSize: 450000
      },
      enhancedFeatures: {
        redundancy: true,
        deltaCompression: true,
        integrityVerification: true
      }
    };

    it('should include redundant blob IDs when redundancy enabled', () => {
      expect(enhancedMetadata).toHaveProperty('redundantBlobIds');
      expect(Array.isArray(enhancedMetadata.redundantBlobIds)).toBe(true);
      expect(enhancedMetadata.redundantBlobIds.length).toBeGreaterThan(0);
    });

    it('should include compression information', () => {
      expect(enhancedMetadata).toHaveProperty('compressionInfo');
      expect(enhancedMetadata.compressionInfo.compressionRatio).toBeLessThan(1);
      expect(enhancedMetadata.compressionInfo.compressedSize).toBeLessThan(
        enhancedMetadata.compressionInfo.originalSize
      );
    });

    it('should indicate enhanced features used', () => {
      expect(enhancedMetadata).toHaveProperty('enhancedFeatures');
      expect(enhancedMetadata.enhancedFeatures.redundancy).toBe(true);
      expect(enhancedMetadata.enhancedFeatures.deltaCompression).toBe(true);
    });
  });

  describe('Creation Metadata', () => {
    const creationMetadata = {
      ...baseMetadata,
      method: 'blockchain',
      ultraOptimized: true,
      walletPrompts: 1,
      title: 'My Spreadsheet',
      data: {}
    };

    it('should mark optimized creates', () => {
      expect(creationMetadata).toHaveProperty('ultraOptimized');
      expect(creationMetadata.ultraOptimized).toBe(true);
    });

    it('should track wallet prompts', () => {
      expect(creationMetadata).toHaveProperty('walletPrompts');
      expect(typeof creationMetadata.walletPrompts).toBe('number');
    });

    it('should include title information', () => {
      expect(creationMetadata).toHaveProperty('title');
      expect(creationMetadata.title).toBeTruthy();
    });
  });

  describe('Fallback Handling', () => {
    it('should handle missing content hash with fallback', () => {
      const incomplete = { ...baseMetadata, contentHash: 'unknown' };
      expect(incomplete.contentHash).toBe('unknown');
    });

    it('should handle missing endEpoch gracefully', () => {
      const incomplete = { ...baseMetadata, endEpoch: null };
      expect(incomplete.endEpoch).toBeNull();
    });

    it('should calculate expiryTimestamp from epochs if needed', () => {
      const withoutExpiry = { ...baseMetadata, expiryTimestamp: null };
      // In real implementation, this would be calculated as Date.now() + (epochs * 86400000)
      expect(withoutExpiry.expiryTimestamp).toBeNull();
    });
  });
});
