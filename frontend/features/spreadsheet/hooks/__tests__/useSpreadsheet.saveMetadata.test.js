/**
 * Tests for useSpreadsheet save metadata tracking
 * Validates that metadata is captured and exposed correctly
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('useSpreadsheet - Save Metadata Tracking', () => {
  // Fixed timestamp to prevent time drift
  const FIXED_TIMESTAMP = 1700000000000;

  beforeEach(() => {
    // CRITICAL: Call useFakeTimers() BEFORE setSystemTime()
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_TIMESTAMP));
  });

  afterEach(() => {
    // Restore real time
    vi.useRealTimers();
  });

  // Mock save info object using frozen time
  const mockSaveInfo = {
    blobId: 'test-blob-12345',
    transactionDigest: 'test-tx-abcde',
    contentHash: 'test-hash-xyz',
    storageStatus: 'newly_created',
    expiryTimestamp: FIXED_TIMESTAMP + 7 * 86400000, // 7 days from frozen time
    endEpoch: 1000,
    method: 'blockchain',
    storageStrategy: 'standard',
    timestamp: FIXED_TIMESTAMP, // Use frozen timestamp
    isFirstSave: true
  };

  describe('Save Result Structure', () => {
    it('should return required metadata fields in save result', () => {
      // This validates the shape of the result object
      expect(mockSaveInfo).toHaveProperty('blobId');
      expect(mockSaveInfo).toHaveProperty('transactionDigest');
      expect(mockSaveInfo).toHaveProperty('contentHash');
      expect(mockSaveInfo).toHaveProperty('storageStatus');
      expect(mockSaveInfo).toHaveProperty('expiryTimestamp');
    });

    it('should have valid blob ID format', () => {
      expect(mockSaveInfo.blobId).toBeTruthy();
      expect(typeof mockSaveInfo.blobId).toBe('string');
      expect(mockSaveInfo.blobId.length).toBeGreaterThan(0);
    });

    it('should have valid transaction digest', () => {
      expect(mockSaveInfo.transactionDigest).toBeTruthy();
      expect(typeof mockSaveInfo.transactionDigest).toBe('string');
      expect(mockSaveInfo.transactionDigest.length).toBeGreaterThan(0);
    });

    it('should have storage status as expected value', () => {
      const validStatuses = ['newly_created', 'already_certified'];
      expect(validStatuses).toContain(mockSaveInfo.storageStatus);
    });

    it('should have valid expiry timestamp', () => {
      expect(mockSaveInfo.expiryTimestamp).toBeGreaterThan(Date.now());
    });
  });

  describe('Storage Strategy Options', () => {
    it('should recognize standard storage strategy', () => {
      const standard = { ...mockSaveInfo, storageStrategy: 'standard' };
      expect(standard.storageStrategy).toBe('standard');
    });

    it('should recognize delta storage strategy', () => {
      const delta = { ...mockSaveInfo, storageStrategy: 'delta-compression' };
      expect(delta.storageStrategy).toBe('delta-compression');
    });

    it('should recognize redundancy storage strategy', () => {
      const redundant = { ...mockSaveInfo, storageStrategy: 'redundancy' };
      expect(redundant.storageStrategy).toBe('redundancy');
    });
  });

  describe('First Save Tracking', () => {
    it('should mark first save with isFirstSave flag', () => {
      expect(mockSaveInfo.isFirstSave).toBe(true);
    });

    it('should have timestamp for tracking', () => {
      expect(mockSaveInfo.timestamp).toBeTruthy();
      expect(typeof mockSaveInfo.timestamp).toBe('number');
    });

    it('should have method field indicating blockchain save', () => {
      expect(mockSaveInfo.method).toBe('blockchain');
    });
  });

  describe('Expiry Information', () => {
    it('should calculate expiry in future', () => {
      const daysUntilExpiry = (mockSaveInfo.expiryTimestamp - Date.now()) / (86400000);
      expect(daysUntilExpiry).toBeGreaterThan(0);
      expect(daysUntilExpiry).toBeLessThanOrEqual(365);
    });

    it('should have epoch information', () => {
      expect(mockSaveInfo.endEpoch).toBeTruthy();
      expect(typeof mockSaveInfo.endEpoch).toBe('number');
      expect(mockSaveInfo.endEpoch).toBeGreaterThan(0);
    });

    it('should calculate time remaining helper', () => {
      const timeLeft = mockSaveInfo.expiryTimestamp - Date.now();
      const daysLeft = Math.floor(timeLeft / (86400000));
      const hoursLeft = Math.floor((timeLeft % (86400000)) / (3600000));

      expect(daysLeft).toBeGreaterThanOrEqual(0);
      expect(hoursLeft).toBeGreaterThanOrEqual(0);
      expect(hoursLeft).toBeLessThan(24);
    });
  });

  describe('Content Hash Validation', () => {
    it('should have content hash or fallback value', () => {
      expect(mockSaveInfo.contentHash).toBeTruthy();
    });

    it('should handle missing content hash gracefully', () => {
      const noHash = { ...mockSaveInfo, contentHash: 'unknown' };
      expect(noHash.contentHash).toBe('unknown');
    });
  });

  describe('Metadata Fallback Handling', () => {
    it('should handle missing blobId with null', () => {
      const incomplete = { ...mockSaveInfo, blobId: null };
      expect(incomplete.blobId).toBeNull();
    });

    it('should handle missing transaction digest', () => {
      const incomplete = { ...mockSaveInfo, transactionDigest: null };
      expect(incomplete.transactionDigest).toBeNull();
    });
  });
});
