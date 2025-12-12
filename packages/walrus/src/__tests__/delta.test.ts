import { describe, it, expect } from 'vitest';
import {
  createCellDelta,
  applyCellDelta,
  reconstructFromDelta,
  calculateDeltaEfficiency
} from '../core/delta';

describe('delta', () => {
  const previousData = {
    version: 1,
    timestamp: 1000,
    spreadsheetId: 'test-1',
    cells: {
      'A1': { v: 'Hello' },
      'B1': { v: 42 },
      'C1': { v: 'Delete me' }
    },
    metadata: { title: 'Old Title' }
  };

  const newData = {
    version: 2,
    timestamp: 2000,
    spreadsheetId: 'test-1',
    cells: {
      'A1': { v: 'Hello' },
      'B1': { v: 43 }, // Modified
      'D1': { v: 'New cell' } // Added
      // C1 deleted
    },
    metadata: { title: 'New Title' }
  };

  describe('createCellDelta', () => {
    it('should identify added cells', () => {
      const delta = createCellDelta(previousData, newData);
      expect(delta.added).toEqual({ 'D1': { v: 'New cell' } });
    });

    it('should identify modified cells', () => {
      const delta = createCellDelta(previousData, newData);
      expect(delta.modified['B1']).toEqual({
        old: { v: 42 },
        new: { v: 43 }
      });
    });

    it('should identify deleted cells', () => {
      const delta = createCellDelta(previousData, newData);
      expect(delta.deleted).toContain('C1');
    });

    it('should track metadata changes', () => {
      const delta = createCellDelta(previousData, newData);
      expect(delta.metadata).toEqual({
        old: { title: 'Old Title' },
        new: { title: 'New Title' }
      });
    });

    it('should handle no metadata changes', () => {
      const data1 = { cells: { 'A1': { v: 'test' } }, metadata: { title: 'Same' } };
      const data2 = { cells: { 'A1': { v: 'test' } }, metadata: { title: 'Same' } };
      const delta = createCellDelta(data1, data2);
      expect(delta.metadata).toEqual({});
    });
  });

  describe('applyCellDelta', () => {
    it('should apply additions', () => {
      const delta = createCellDelta(previousData, newData);
      const result = applyCellDelta(previousData.cells, delta);
      expect(result['D1']).toEqual({ v: 'New cell' });
    });

    it('should apply modifications', () => {
      const delta = createCellDelta(previousData, newData);
      const result = applyCellDelta(previousData.cells, delta);
      expect(result['B1']).toEqual({ v: 43 });
    });

    it('should apply deletions', () => {
      const delta = createCellDelta(previousData, newData);
      const result = applyCellDelta(previousData.cells, delta);
      expect(result['C1']).toBeUndefined();
    });

    it('should preserve unchanged cells', () => {
      const delta = createCellDelta(previousData, newData);
      const result = applyCellDelta(previousData.cells, delta);
      expect(result['A1']).toEqual({ v: 'Hello' });
    });
  });

  describe('calculateDeltaEfficiency', () => {
    it('should calculate efficiency ratio', () => {
      const { efficiency, deltaSize, fullSize } = calculateDeltaEfficiency(previousData, newData);
      expect(efficiency).toBeGreaterThan(0);
      expect(deltaSize).toBeGreaterThan(0);
      expect(fullSize).toBeGreaterThan(0);
    });

    it('should return efficiency ratio of delta to full size', () => {
      const prev = { cells: { 'A1': { v: 1 }, 'B1': { v: 2 }, 'C1': { v: 3 } } };
      const curr = { cells: { 'A1': { v: 1 }, 'B1': { v: 2 }, 'C1': { v: 3 }, 'D1': { v: 4 } } };
      const { efficiency } = calculateDeltaEfficiency(prev, curr);
      expect(efficiency).toBeGreaterThan(0);
    });

    it('should calculate efficiency for identical data', () => {
      const data = { cells: { 'A1': { v: 1 } } };
      const { efficiency, deltaSize, fullSize } = calculateDeltaEfficiency(data, data);
      expect(efficiency).toBeGreaterThan(0);
      expect(deltaSize).toBeGreaterThan(0);
      expect(fullSize).toBeGreaterThan(0);
    });
  });

  describe('reconstructFromDelta', () => {
    it('should return full data unchanged', async () => {
      const fullData = { type: 'full' as const, cells: { 'A1': { v: 1 } } };
      const result = await reconstructFromDelta(
        fullData as any,
        async () => null as any
      );
      expect(result.cells).toEqual({ 'A1': { v: 1 } });
    });

    it('should throw if baseVersion missing', async () => {
      const deltaData = { type: 'delta' as const, delta: {} };
      await expect(
        reconstructFromDelta(deltaData as any, async () => null as any)
      ).rejects.toThrow();
    });

    it('should apply delta to reconstructed base', async () => {
      const baseData = {
        version: 1,
        timestamp: 1000,
        spreadsheetId: 'test-1',
        cells: { 'A1': { v: 1 }, 'B1': { v: 2 } },
        metadata: {}
      };

      const delta = { added: { 'C1': { v: 3 } }, modified: {}, deleted: [] };

      const deltaData = {
        type: 'delta' as const,
        version: 2,
        timestamp: 2000,
        spreadsheetId: 'test-1',
        baseVersion: 'base-blob-id',
        delta
      };

      const result = await reconstructFromDelta(
        deltaData,
        async (blobId) => blobId === 'base-blob-id' ? baseData : null
      );

      expect(result.cells).toEqual({
        'A1': { v: 1 },
        'B1': { v: 2 },
        'C1': { v: 3 }
      });
    });
  });
});
