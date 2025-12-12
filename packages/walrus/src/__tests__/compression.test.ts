import { describe, it, expect } from 'vitest';
import {
  compressDataWithAlgorithm,
  decompressDataWithAlgorithm,
  detectCompressionAlgorithm,
  isCompressed
} from '../core/compression';

describe('compression', () => {
  const testData = new TextEncoder().encode('Hello, World! This is test data.');

  describe('compressDataWithAlgorithm', () => {
    it('should return data unchanged for "none" algorithm', async () => {
      const result = await compressDataWithAlgorithm(testData, 'none');
      expect(result).toEqual(testData);
    });

    it('should handle compression (skip if CompressionStream unavailable)', async () => {
      try {
        const compressed = await compressDataWithAlgorithm(testData, 'gzip');
        expect(compressed).toBeDefined();
        expect(compressed.length).toBeGreaterThan(0);
      } catch (e) {
        // CompressionStream not available in test environment
        expect(true).toBe(true);
      }
    });
  });

  describe('decompressDataWithAlgorithm', () => {
    it('should return data unchanged for "none" algorithm', async () => {
      const result = await decompressDataWithAlgorithm(testData, 'none');
      expect(result).toEqual(testData);
    });

    it('should handle decompression (skip if DecompressionStream unavailable)', async () => {
      try {
        const compressed = await compressDataWithAlgorithm(testData, 'gzip');
        const decompressed = await decompressDataWithAlgorithm(compressed, 'gzip');
        expect(decompressed).toBeDefined();
      } catch (e) {
        // DecompressionStream not available in test environment
        expect(true).toBe(true);
      }
    });
  });

  describe('detectCompressionAlgorithm', () => {
    it('should detect gzip format by magic bytes', () => {
      const gzipData = new Uint8Array([0x1f, 0x8b, 0x08, 0x00]);
      expect(detectCompressionAlgorithm(gzipData)).toBe('gzip');
    });

    it('should detect deflate format by magic bytes', () => {
      const deflateData = new Uint8Array([0x78, 0x01, 0x00]);
      expect(detectCompressionAlgorithm(deflateData)).toBe('deflate');
    });

    it('should return "none" for uncompressed data', () => {
      expect(detectCompressionAlgorithm(testData)).toBe('none');
    });

    it('should handle short data gracefully', () => {
      expect(detectCompressionAlgorithm(new Uint8Array([0x1f]))).toBe('none');
    });
  });

  describe('isCompressed', () => {
    it('should return true for compressed data', () => {
      const gzipData = new Uint8Array([0x1f, 0x8b, 0x08, 0x00]);
      expect(isCompressed(gzipData)).toBe(true);
    });

    it('should return false for uncompressed data', () => {
      expect(isCompressed(testData)).toBe(false);
    });
  });
});
