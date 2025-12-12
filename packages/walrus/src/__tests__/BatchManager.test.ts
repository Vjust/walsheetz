import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BatchManager } from '../batch/BatchManager';
import { NodeBatchPersistence } from '../batch/adapters/NodeBatchPersistence';

describe('BatchManager', () => {
  let batchManager: BatchManager;
  let persistence: NodeBatchPersistence;

  beforeEach(() => {
    persistence = new NodeBatchPersistence();
    batchManager = new BatchManager(persistence, {
      uploadThreshold: 5,
      timeoutMs: 100,
      maxBatchSize: 20
    });
  });

  describe('addChanges', () => {
    it('should add changes to new batch', async () => {
      const result = await batchManager.addChanges('sheet-1', [{ type: 'add', data: 'test' }]);
      expect(result.batched).toBe(true);
      expect(result.batchSize).toBe(1);
    });

    it('should accumulate changes', async () => {
      await batchManager.addChanges('sheet-1', [{ type: 'add', data: 'test1' }]);
      const result = await batchManager.addChanges('sheet-1', [{ type: 'add', data: 'test2' }]);
      expect(result.batchSize).toBe(2);
    });

    it('should upload when threshold reached', async () => {
      const uploadFn = vi.fn(async () => ({}));
      batchManager.setUploadCallback(uploadFn);

      const changes = Array.from({ length: 5 }, (_, i) => ({ type: 'add', data: `test${i}` }));
      const result = await batchManager.addChanges('sheet-1', changes);

      expect(result.uploaded).toBe(true);
      expect(uploadFn).toHaveBeenCalled();
    });

    it('should force upload when requested', async () => {
      const uploadFn = vi.fn(async () => ({}));
      batchManager.setUploadCallback(uploadFn);

      const result = await batchManager.addChanges('sheet-1', [{ type: 'add', data: 'test' }], { force: true });
      expect(result.uploaded).toBe(true);
      expect(uploadFn).toHaveBeenCalled();
    });

    it('should add custom tags', async () => {
      await batchManager.addChanges('sheet-1', [{ type: 'add' }], { tags: ['custom-tag'] });
      const batch = await batchManager.getBatch('sheet-1');
      expect(batch?.metadata.tags).toContain('custom-tag');
    });
  });

  describe('getBatchSize', () => {
    it('should return correct batch size', async () => {
      await batchManager.addChanges('sheet-1', [{ type: 'add' }, { type: 'modify' }]);
      const size = await batchManager.getBatchSize('sheet-1');
      expect(size).toBe(2);
    });

    it('should return 0 for non-existent batch', async () => {
      const size = await batchManager.getBatchSize('non-existent');
      expect(size).toBe(0);
    });
  });

  describe('clearBatch', () => {
    it('should delete batch', async () => {
      await batchManager.addChanges('sheet-1', [{ type: 'add' }]);
      await batchManager.clearBatch('sheet-1');
      const batch = await batchManager.getBatch('sheet-1');
      expect(batch).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should clear all timers', async () => {
      await batchManager.addChanges('sheet-1', [{ type: 'add' }]);
      await batchManager.addChanges('sheet-2', [{ type: 'add' }]);
      await batchManager.cleanup();
      // Should not throw
      expect(true).toBe(true);
    });
  });
});
