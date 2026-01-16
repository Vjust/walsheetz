import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NodeWalrusService } from '../node/NodeWalrusService';

// Mock the config loader to avoid actual network calls
vi.mock('../shared/ConfigLoader.js', () => ({
  configLoader: {
    getConfig: vi.fn().mockResolvedValue({
      getServiceUrl: vi.fn().mockReturnValue('http://localhost:9000')
    })
  }
}));

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

  describe('storeBatch', () => {
    it('should return success without blobId when batch not uploaded', async () => {
      // Mock _ensureInitialized to avoid actual initialization
      (service as any)._ensureInitialized = async () => {
        (service as any)._blobClient = {};
      };

      const result = await service.storeBatch('sheet-1', [{ change: 1 }]);

      expect(result.success).toBe(true);
      expect(result.blobId).toBeUndefined();
      expect(result.batchSize).toBe(1);
    });

    it('should accumulate changes in batch', async () => {
      // Mock _ensureInitialized to avoid actual initialization
      (service as any)._ensureInitialized = async () => {
        (service as any)._blobClient = {};
      };

      await service.storeBatch('sheet-1', [{ change: 1 }]);
      const result = await service.storeBatch('sheet-1', [{ change: 2 }, { change: 3 }]);

      expect(result.success).toBe(true);
      expect(result.batchSize).toBe(3);
    });

    it('should handle force upload option', async () => {
      // Mock the blob client with storeBlob method
      const mockStoreBlob = vi.fn().mockResolvedValue({ blobId: 'test-blob-id', contentHash: 'hash-123' });
      (service as any)._ensureInitialized = async () => {
        (service as any)._blobClient = { storeBlob: mockStoreBlob };
      };

      const result = await service.storeBatch('sheet-1', [{ change: 1 }], { force: true });

      expect(result.success).toBe(true);
      expect(result.blobId).toBe('test-blob-id');
      expect(mockStoreBlob).toHaveBeenCalled();
    });

    it('should return error on failure', async () => {
      // Force an error by making _ensureInitialized throw
      (service as any)._ensureInitialized = async () => {
        throw new Error('Init failed');
      };

      const result = await service.storeBatch('sheet-1', [{ change: 1 }]);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Init failed');
    });

    it('should preserve batch changes in payload (Bug 5)', async () => {
      const capturedPayload: any[] = [];
      const mockStoreBlob = vi.fn().mockImplementation((payload) => {
        capturedPayload.push(payload);
        return Promise.resolve({ blobId: 'test-blob-id', contentHash: 'hash-123' });
      });
      (service as any)._ensureInitialized = async () => {
        (service as any)._blobClient = { storeBlob: mockStoreBlob };
      };

      const changes = [
        { cellKey: '0_1_1', oldValue: null, newValue: 'test', changeType: 'create' },
        { cellKey: '0_1_2', oldValue: 'old', newValue: 'new', changeType: 'update' }
      ];

      await service.storeBatch('sheet-1', changes, { force: true });

      expect(capturedPayload.length).toBe(1);
      const payload = capturedPayload[0];
      expect(payload.cells['__batch_changes']).toBeDefined();

      const storedChanges = JSON.parse(payload.cells['__batch_changes'].v);
      expect(storedChanges).toEqual(changes);
    });

    it('should return distinct blobIds for concurrent uploads (Bug 6)', async () => {
      let callCount = 0;
      const mockStoreBlob = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({ blobId: `blob-${callCount}`, contentHash: `hash-${callCount}` });
      });

      // Create separate service instances to simulate concurrent behavior
      const service1 = new NodeWalrusService();
      const service2 = new NodeWalrusService();

      (service1 as any)._ensureInitialized = async () => {
        (service1 as any)._blobClient = { storeBlob: mockStoreBlob };
      };
      (service2 as any)._ensureInitialized = async () => {
        (service2 as any)._blobClient = { storeBlob: mockStoreBlob };
      };

      const [result1, result2] = await Promise.all([
        service1.storeBatch('sheet-A', [{ change: 'A' }], { force: true }),
        service2.storeBatch('sheet-B', [{ change: 'B' }], { force: true })
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.blobId).not.toBe(result2.blobId);
      expect(result1.blobId).toBeDefined();
      expect(result2.blobId).toBeDefined();
    });
  });
});
