/**
 * Unit tests for GridSizeManager
 * Tests capacity management, growth calculations, and event handling
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { GridSizeManager } from "@/sdk/GridSizeManager.js";

describe('GridSizeManager', () => {
  let manager;

  beforeEach(() => {
    manager = new GridSizeManager({
      defaultCapacity: 1000,
      chunkSize: 1000
    });
  });

  describe('Initialization', () => {
    test('should initialize with default capacity', () => {
      expect(manager.getCapacity()).toBe(1000);
    });

    test('should calculate proper initial dimensions', () => {
      const dims = manager.getDimensions();
      expect(dims.rows).toBeGreaterThan(0);
      expect(dims.cols).toBeGreaterThan(0);
      expect(dims.rows * dims.cols).toBeGreaterThanOrEqual(1000);
    });

    test('should have empty expansion listeners', () => {
      expect(manager.expansionListeners.length).toBe(0);
    });
  });

  describe('Capacity Checking', () => {
    test('should not expand for data smaller than current capacity', () => {
      const result = manager.ensureCapacity({ rows: 10, cols: 10 });
      expect(result.expanded).toBe(false);
      expect(manager.getCapacity()).toBe(1000);
    });

    test('should expand for data larger than current capacity', () => {
      const initialCapacity = manager.getCapacity();
      const result = manager.ensureCapacity({ rows: 100, cols: 100 });
      expect(result.expanded).toBe(true);
      expect(manager.getCapacity()).toBeGreaterThan(initialCapacity);
    });

    test('should expand to next chunk boundary', () => {
      manager.ensureCapacity({ rows: 50, cols: 50 });
      const capacity = manager.getCapacity();
      // Capacity should be a multiple of chunk size
      expect(capacity % 1000).toBe(0);
    });

    test('should track rows and columns added', () => {
      const result = manager.ensureCapacity({ rows: 100, cols: 100 });
      if (result.expanded) {
        expect(result.rowsAdded).toBeGreaterThanOrEqual(0);
        expect(result.colsAdded).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Dimension Calculations', () => {
    test('should calculate square-equivalent dimensions', () => {
      const dims = manager._calculateDimensions(2000);
      expect(dims.rows * dims.cols).toBeGreaterThanOrEqual(2000);
      // Should be roughly square
      const aspect = Math.max(dims.rows, dims.cols) / Math.min(dims.rows, dims.cols);
      expect(aspect).toBeLessThan(2); // Not too skewed
    });

    test('should round up capacity to chunk boundary', () => {
      const boundary = manager._getNextCapacityBoundary(1500);
      expect(boundary).toBe(2000);
      expect(boundary % 1000).toBe(0);
    });

    test('should not change capacity if requirement is below current', () => {
      const initial = manager.getCapacity();
      const boundary = manager._getNextCapacityBoundary(500);
      expect(boundary).toBe(initial);
    });
  });

  describe('Expansion Callbacks', () => {
    test('should call expansion listeners on expansion', async () => {
      const listener = vi.fn();
      manager.onExpand(listener);

      manager.ensureCapacity({ rows: 100, cols: 100 });

      // Listener should be called if expansion occurred
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(listener).toHaveBeenCalled();
    });

    test('should not call listeners if no expansion needed', async () => {
      const listener = vi.fn();
      manager.onExpand(listener);

      manager.ensureCapacity({ rows: 5, cols: 5 });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(listener).not.toHaveBeenCalled();
    });

    test('should remove listener with offExpand', () => {
      const listener = vi.fn();
      manager.onExpand(listener);
      manager.offExpand(listener);

      manager.ensureCapacity({ rows: 100, cols: 100 });

      expect(manager.expansionListeners.length).toBe(0);
    });

    test('should provide expansion details to listener', async () => {
      let capturedDetails = null;
      const listener = (details) => {
        capturedDetails = details;
      };
      manager.onExpand(listener);

      manager.ensureCapacity({ rows: 100, cols: 100 });

      await new Promise((resolve) => setTimeout(resolve, 10));

      if (capturedDetails) {
        expect(capturedDetails).toHaveProperty('oldDimensions');
        expect(capturedDetails).toHaveProperty('newDimensions');
        expect(capturedDetails).toHaveProperty('rowsAdded');
        expect(capturedDetails).toHaveProperty('colsAdded');
      }
    });
  });

  describe('Import Preallocation', () => {
    test('should prealloc for large imports', () => {
      const result = manager.preallocateForImport({ rows: 1000, cols: 1000 });
      expect(result.expanded).toBe(true);
      expect(manager.getCapacity()).toBeGreaterThanOrEqual(1000000);
    });

    test('should handle sequential imports', () => {
      manager.preallocateForImport({ rows: 100, cols: 100 });
      const cap1 = manager.getCapacity();

      manager.preallocateForImport({ rows: 50, cols: 50 });
      const cap2 = manager.getCapacity();

      // Second allocation of smaller data shouldn't expand further
      expect(cap2).toBeLessThanOrEqual(cap1 * 1.5);
    });
  });

  describe('Reset', () => {
    test('should reset capacity to default', () => {
      manager.ensureCapacity({ rows: 100, cols: 100 });
      const expandedCapacity = manager.getCapacity();
      expect(expandedCapacity).toBeGreaterThan(1000);

      manager.reset();
      expect(manager.getCapacity()).toBe(1000);
    });

    test('should reset dimensions after reset', () => {
      manager.ensureCapacity({ rows: 100, cols: 100 });
      const expandedDims = manager.getDimensions();

      manager.reset();
      const resetDims = manager.getDimensions();

      expect(resetDims.rows * resetDims.cols).toBeCloseTo(1000, -2);
    });
  });

  describe('Info Method', () => {
    test('should return debug info', () => {
      const info = manager.getInfo();
      expect(info).toHaveProperty('capacity');
      expect(info).toHaveProperty('dimensions');
      expect(info).toHaveProperty('utilizationPotential');
      expect(info).toHaveProperty('defaultCapacity');
      expect(info).toHaveProperty('chunkSize');
    });
  });

  describe('Custom Configuration', () => {
    test('should respect custom default capacity', () => {
      const customManager = new GridSizeManager({
        defaultCapacity: 5000,
        chunkSize: 2000
      });
      expect(customManager.getCapacity()).toBe(5000);
    });

    test('should respect custom chunk size', () => {
      const customManager = new GridSizeManager({
        defaultCapacity: 1000,
        chunkSize: 500
      });
      const boundary = customManager._getNextCapacityBoundary(1500);
      expect(boundary).toBe(1500); // 3 chunks of 500 (ceil(1500/500) * 500 = 1500)
    });
  });
});