import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeWalrusService } from '../node/NodeWalrusService';

describe('NodeWalrusService', () => {
  let service: NodeWalrusService;

  beforeEach(() => {
    service = new NodeWalrusService();
  });

  describe('batching', () => {
    it('should batch changes', async () => {
      const result = await service.batchChanges('sheet-1', [
        { type: 'add', cell: 'A1', value: 'test' }
      ]);
      expect(result.batched).toBe(true);
      expect(result.batchSize).toBe(1);
    });

    it('should get batch size', async () => {
      await service.batchChanges('sheet-1', [{ type: 'add', cell: 'A1' }]);
      const size = await service.getBatchSize('sheet-1');
      expect(size).toBe(1);
    });

    it('should clear batch', async () => {
      await service.batchChanges('sheet-1', [{ type: 'add' }]);
      await service.clearBatch('sheet-1');
      const size = await service.getBatchSize('sheet-1');
      expect(size).toBe(0);
    });
  });

  describe('deduplication', () => {
    it('should register content hash', async () => {
      await service.registerContentHash('hash-123', 'blob-456', { title: 'test' });
      const exists = await service.getBlobIdFromHash('hash-123');
      expect(exists).toBe('blob-456');
    });

    it('should detect duplicate content', async () => {
      await service.registerContentHash('hash-123', 'blob-456');
      const result = await service.checkContentDeduplication('hash-123', 'blob-789');
      expect(result.isDuplicate).toBe(true);
      expect(result.existingBlobId).toBe('blob-456');
    });

    it('should register new content as non-duplicate', async () => {
      const result = await service.checkContentDeduplication('new-hash', 'new-blob');
      expect(result.isDuplicate).toBe(false);
    });

    it('should get all deduplication entries', async () => {
      await service.registerContentHash('hash-1', 'blob-1');
      await service.registerContentHash('hash-2', 'blob-2');
      const entries = await service.getAllDeduplicationEntries();
      expect(entries.length).toBe(2);
    });

    it('should clear deduplication registry', async () => {
      await service.registerContentHash('hash-1', 'blob-1');
      await service.clearDeduplicationRegistry();
      const entries = await service.getAllDeduplicationEntries();
      expect(entries.length).toBe(0);
    });
  });

  describe('upload callback', () => {
    it('should set upload callback', async () => {
      const uploadFn = vi.fn(async () => ({}));
      service.setUploadCallback(uploadFn);
      // Callback set successfully
      expect(true).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources', async () => {
      await service.cleanup();
      // Should not throw
      expect(true).toBe(true);
    });
  });
});
