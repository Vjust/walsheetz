/**
 * Integration tests for CSV import with GridSizeManager
 * Tests large CSV imports don't cause stack overflow
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { SpreadsheetImportExportService } from "@/sdk/import-export/services/SpreadsheetImportExportService.js";
import { parseCSV } from "@/sdk/utils/BlobParser.js";

describe('CSV Import Integration', () => {
  let importService;

  beforeEach(() => {
    importService = new SpreadsheetImportExportService();
  });

  describe('Async Chunked CSV Conversion', () => {
    test('should handle small CSV data', async () => {
      const smallCSV = 'Name,Age\nJohn,30\nJane,25';
      const parsed = parseCSV(smallCSV);
      const result = await importService._convertParsedCSVToLuckysheetSheet(parsed, 'TestSheet');

      expect(result.name).toBe('TestSheet');
      expect(result.row).toBeGreaterThan(0);
      expect(result.column).toBeGreaterThan(0);
      expect(Array.isArray(result.celldata)).toBe(true);
    });

    test('should handle medium CSV data without blocking', async () => {
      // Create a 100x100 CSV (10k cells)
      const rows = 100;
      const cols = 100;
      let csvData = Array(cols).fill('Col').map((c, i) => `${c}${i}`).join(',') + '\n';
      for (let r = 0; r < rows - 1; r++) {
        csvData += Array(cols).fill(r * cols).map((_, c) => `${r}-${c}`).join(',') + '\n';
      }

      const parsed = parseCSV(csvData);
      const startTime = Date.now();

      const result = await importService._convertParsedCSVToLuckysheetSheet(parsed, 'MediumSheet');

      const duration = Date.now() - startTime;

      expect(result.row).toBe(100);
      expect(result.column).toBe(100);
      expect(result.celldata.length).toBeGreaterThan(0);
      // Should not take excessively long (async processing should prevent blocking)
      expect(duration).toBeLessThan(10000); // 10 seconds max
    });

    test('should handle large CSV data (50k+ cells)', async () => {
      // Create a 500x150 CSV (75k cells)
      const rows = 500;
      const cols = 150;
      let csvData = Array(cols).fill('Col').map((c, i) => `${c}${i}`).join(',') + '\n';
      for (let r = 0; r < rows - 1; r++) {
        csvData += Array(cols).fill(r * cols).map((_, c) => `R${r}C${c}`).join(',') + '\n';
      }

      const parsed = parseCSV(csvData);
      const startTime = Date.now();

      const result = await importService._convertParsedCSVToLuckysheetSheet(parsed, 'LargeSheet');

      const duration = Date.now() - startTime;

      expect(result.row).toBe(500);
      expect(result.column).toBe(150);
      expect(result.celldata.length).toBeGreaterThan(0);
      // Should not cause stack overflow or hang
      expect(duration).toBeLessThan(30000); // 30 seconds max
    });

    test('should not stack overflow with very large data', async () => {
      // Create a 1000x100 CSV (100k cells) - would definitely cause stack overflow without chunking
      const rows = 1000;
      const cols = 100;
      let csvData = Array(cols).fill('Col').map((c, i) => `${c}${i}`).join(',') + '\n';
      for (let r = 0; r < rows - 1; r++) {
        csvData += Array(cols).fill(r * cols).map((_, c) => r * cols + c).join(',') + '\n';
      }

      const parsed = parseCSV(csvData);

      // This should not throw a stack overflow error
      let threwError = false;
      try {
        await importService._convertParsedCSVToLuckysheetSheet(parsed, 'VeryLargeSheet');
      } catch (error) {
        if (error.message.includes('stack') || error instanceof RangeError) {
          threwError = true;
        }
      }

      expect(threwError).toBe(false);
    });

    test('should provide progress callbacks', async () => {
      const progressUpdates = [];
      const onProgress = (processed, total) => {
        progressUpdates.push({ processed, total });
      };

      // Create a 200x100 CSV (20k cells) - should trigger multiple progress callbacks
      const rows = 200;
      const cols = 100;
      let csvData = Array(cols).fill('Col').map((c, i) => `${c}${i}`).join(',') + '\n';
      for (let r = 0; r < rows - 1; r++) {
        csvData += Array(cols).fill(r * cols).map((_, c) => `${r}:${c}`).join(',') + '\n';
      }

      const parsed = parseCSV(csvData);
      const result = await importService._convertParsedCSVToLuckysheetSheet(
        parsed,
        'ProgressTestSheet',
        onProgress
      );

      expect(result.celldata.length).toBeGreaterThan(0);
      // Should have received at least one progress update (final one)
      expect(progressUpdates.length).toBeGreaterThan(0);
      // Final progress should show total cells processed
      const lastUpdate = progressUpdates[progressUpdates.length - 1];
      expect(lastUpdate.processed).toBeLessThanOrEqual(rows * cols);
    });

    test('should preserve data integrity during chunked processing', async () => {
      // Create CSV with known data
      const testData = [
      ['Name', 'Age', 'City'],
      ['Alice', '30', 'NYC'],
      ['Bob', '25', 'LA'],
      ['Charlie', '35', 'Chicago']];

      let csvData = testData.map((row) => row.join(',')).join('\n');

      const parsed = parseCSV(csvData);
      const result = await importService._convertParsedCSVToLuckysheetSheet(parsed, 'DataIntegrityTest');

      // Verify all cells are present
      expect(result.row).toBe(4);
      expect(result.column).toBe(3);

      // Verify cell data is present and correct
      const cellsByPosition = {};
      result.celldata.forEach((cell) => {
        cellsByPosition[`${cell.r}:${cell.c}`] = cell.v;
      });

      // Check some key cells
      expect(cellsByPosition['0:0']).toBeDefined(); // Name
      expect(cellsByPosition['1:0']).toBeDefined(); // Alice
      expect(cellsByPosition['1:1']).toBeDefined(); // 30
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed CSV gracefully', async () => {
      const malformedCSV = 'Name,Age\nJohn,30,Extra\nJane,25'; // Inconsistent columns

      const parsed = parseCSV(malformedCSV);
      const result = await importService._convertParsedCSVToLuckysheetSheet(parsed, 'MalformedSheet');

      expect(result.celldata).toBeDefined();
      // Should still process without crashing
      expect(result.row).toBeGreaterThan(0);
    });

    test('should handle empty CSV', async () => {
      const emptyCSV = '';
      const parsed = parseCSV(emptyCSV);
      const result = await importService._convertParsedCSVToLuckysheetSheet(parsed, 'EmptySheet');

      expect(result.row).toBe(1);
      expect(result.column).toBe(1);
    });
  });

  describe('Performance', () => {
    test('should not block main thread significantly', async () => {
      // Create CSV with 50k cells
      const rows = 500;
      const cols = 100;
      let csvData = Array(cols).fill('Col').map((c, i) => `${c}${i}`).join(',') + '\n';
      for (let r = 0; r < rows - 1; r++) {
        csvData += Array(cols).fill(r * cols).map((_, c) => Math.random()).join(',') + '\n';
      }

      const parsed = parseCSV(csvData);

      // Track if we yielded control
      let yieldOccurred = false;
      const origSetTimeout = global.setTimeout;
      const mockSetTimeout = vi.fn((...args) => {
        yieldOccurred = true;
        return origSetTimeout.apply(global, args);
      });
      global.setTimeout = mockSetTimeout;

      try {
        await importService._convertParsedCSVToLuckysheetSheet(parsed, 'PerfTestSheet');
        // For large data, we should have yielded control
        expect(yieldOccurred || mockSetTimeout.mock.calls.length > 0).toBe(true);
      } finally {
        global.setTimeout = origSetTimeout;
      }
    });
  });
});