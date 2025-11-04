/**
 * Unit tests for luckysheet/dataTransforms.js
 *
 * Tests shared helpers for converting between WalSheetz and Luckysheet data formats.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  convertToLuckysheetData,
  convertToLuckysheetFormula,
  buildLuckysheetFunctionObject,
  calculateSheetDimensions
} from '../dataTransforms.js';

describe('dataTransforms', () => {
  describe('convertToLuckysheetData', () => {
    it('should convert cell-reference format to celldata array', () => {
      const input = {
        cells: {
          'A1': { value: 'Hello' },
          'B2': { value: 42 },
          'C3': { value: '=SUM(A1:B2)' }
        }
      };

      const result = convertToLuckysheetData(input);

      expect(result).toHaveLength(3);
      expect(result).toEqual([
        { r: 0, c: 0, v: { v: 'Hello', m: 'Hello', ct: { fa: 'General', t: 'g' } } },
        { r: 1, c: 1, v: { v: 42, m: '42', ct: { fa: 'General', t: 'g' } } },
        { r: 2, c: 2, v: { v: '=SUM(A1:B2)', m: '=SUM(A1:B2)', ct: { fa: 'General', t: 'g' } } }
      ]);
    });

    it('should handle nested data format (data.data.cells)', () => {
      const input = {
        data: {
          data: {
            cells: {
              'A1': { value: 'Test' }
            }
          }
        }
      };

      const result = convertToLuckysheetData(input);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        r: 0,
        c: 0,
        v: { v: 'Test', m: 'Test', ct: { fa: 'General', t: 'g' } }
      });
    });

    it('should handle data.cells format', () => {
      const input = {
        data: {
          cells: {
            'B3': { value: 123 }
          }
        }
      };

      const result = convertToLuckysheetData(input);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        r: 2,
        c: 1,
        v: { v: 123, m: '123', ct: { fa: 'General', t: 'g' } }
      });
    });

    it('should return prebuilt celldata array if already in correct format', () => {
      const prebuilt = [
        { r: 0, c: 0, v: { v: 'Prebuilt', m: 'Prebuilt' } },
        { r: 1, c: 1, v: { v: 99, m: '99' } }
      ];

      const input = { celldata: prebuilt };
      const result = convertToLuckysheetData(input);

      expect(result).toBe(prebuilt);
      expect(result).toHaveLength(2);
    });

    it('should return empty array for invalid input', () => {
      expect(convertToLuckysheetData(null)).toEqual([]);
      expect(convertToLuckysheetData(undefined)).toEqual([]);
      expect(convertToLuckysheetData({})).toEqual([]);
      expect(convertToLuckysheetData({ cells: null })).toEqual([]);
    });

    it('should skip invalid cell references', () => {
      const input = {
        cells: {
          'A1': { value: 'Valid' },
          'INVALID': { value: 'Skip this' },
          '123': { value: 'Skip this too' },
          'B2': { value: 'Also valid' }
        }
      };

      const result = convertToLuckysheetData(input);

      expect(result).toHaveLength(2);
      expect(result.map(c => c.v.v)).toEqual(['Valid', 'Also valid']);
    });

    it('should handle cells with type metadata', () => {
      const input = {
        cells: {
          'A1': { value: 123, type: 'Number' }
        }
      };

      const result = convertToLuckysheetData(input);

      expect(result[0].v.ct).toEqual({ fa: 'Number', t: 'g' });
    });

    it('should handle null/undefined cell values', () => {
      const input = {
        cells: {
          'A1': { value: null },
          'B1': { value: undefined },
          'C1': {}
        }
      };

      const result = convertToLuckysheetData(input);

      expect(result).toHaveLength(3);
      expect(result[0].v.m).toBe('');
      expect(result[1].v.m).toBe('');
    });

    it('should handle multi-letter columns (AA, AB, etc.)', () => {
      const input = {
        cells: {
          'AA1': { value: 'Column 26' },
          'AB2': { value: 'Column 27' }
        }
      };

      const result = convertToLuckysheetData(input);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ r: 0, c: 26 });
      expect(result[1]).toMatchObject({ r: 1, c: 27 });
    });
  });

  describe('convertToLuckysheetFormula', () => {
    it('should convert function metadata to Luckysheet format', () => {
      const metadata = {
        description: 'Test function',
        category: 'Testing',
        parameters: [
          { name: 'arg1', description: 'First argument', optional: false, type: 'string' },
          { name: 'arg2', description: 'Second argument', optional: true, type: 'number' }
        ]
      };

      const result = convertToLuckysheetFormula('TEST_FUNC', metadata);

      expect(result).toMatchObject({
        n: 'TEST_FUNC',
        t: 0,
        d: 'Test function',
        a: 'arg1,arg2',
        m: [1, 2]
      });
      expect(result.p).toHaveLength(2);
      expect(result.p[0]).toMatchObject({
        name: 'arg1',
        detail: 'First argument',
        require: 'm',
        type: 's'
      });
      expect(result.p[1]).toMatchObject({
        name: 'arg2',
        detail: 'Second argument',
        require: 'o',
        type: 'n'
      });
    });

    it('should handle variadic parameters', () => {
      const metadata = {
        description: 'Variadic function',
        category: 'Math',
        parameters: [
          { name: 'arg1', optional: false },
          { name: '...values', optional: true }
        ]
      };

      const result = convertToLuckysheetFormula('VARIADIC', metadata);

      expect(result.m).toEqual([1, 255]); // Min 1, max 255 for variadic
      expect(result.p).toHaveLength(1); // Variadic param filtered out from display
    });

    it('should handle functions with no parameters', () => {
      const metadata = {
        description: 'No parameters',
        category: 'Info',
        parameters: []
      };

      const result = convertToLuckysheetFormula('NO_PARAMS', metadata);

      expect(result.a).toBe('');
      expect(result.m).toEqual([0, 0]);
      expect(result.p).toEqual([]);
    });

    it('should use default description if not provided', () => {
      const metadata = {
        category: 'Utility',
        parameters: []
      };

      const result = convertToLuckysheetFormula('UTIL_FUNC', metadata);

      expect(result.d).toBe('WalSheetz Utility function');
    });
  });

  describe('buildLuckysheetFunctionObject', () => {
    beforeEach(() => {
      // Suppress console logs during tests
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should build nested function tree', () => {
      const result = buildLuckysheetFunctionObject();

      expect(result).toBeTypeOf('object');
      // ensureLuckysheetFunctionTree creates nested structure
      // For example, WZ_BALANCE becomes object['W']['Z']['_']['B']['A']['L']['A']['N']['C']['E']
      // Check that we have some nested structure
      expect(Object.keys(result).length).toBeGreaterThan(0);
    });

    it('should include all WalSheetz functions', () => {
      const result = buildLuckysheetFunctionObject();

      // Check for known WZ functions by looking at function names in nested structure
      const allFunctions = getAllNestedFunctions(result);
      // Functions should have been added
      expect(allFunctions.length).toBeGreaterThan(0);
      // Check that we have WZ-prefixed functions
      expect(
        allFunctions.some(
          (f) => f && (f.startsWith('WALRUS.') || f.startsWith('SUI.'))
        )
      ).toBe(true);
    });

    it('should handle errors gracefully', () => {
      // buildLuckysheetFunctionObject should not throw even if individual functions fail
      expect(() => buildLuckysheetFunctionObject()).not.toThrow();
    });
  });

  describe('calculateSheetDimensions', () => {
    it('should calculate dimensions from celldata', () => {
      const celldata = [
        { r: 0, c: 0 },
        { r: 10, c: 5 },
        { r: 50, c: 30 }
      ];

      const result = calculateSheetDimensions(celldata);

      expect(result).toEqual({ rows: 100, cols: 31 }); // max(100, 51), max(26, 31)
    });

    it('should use minimum defaults for empty data', () => {
      const result = calculateSheetDimensions([]);

      expect(result).toEqual({ rows: 100, cols: 26 });
    });

    it('should use minimum defaults when cells are within defaults', () => {
      const celldata = [
        { r: 0, c: 0 },
        { r: 5, c: 10 }
      ];

      const result = calculateSheetDimensions(celldata);

      expect(result).toEqual({ rows: 100, cols: 26 });
    });

    it('should expand rows beyond default', () => {
      const celldata = [
        { r: 150, c: 5 }
      ];

      const result = calculateSheetDimensions(celldata);

      expect(result).toEqual({ rows: 151, cols: 26 });
    });

    it('should expand columns beyond default', () => {
      const celldata = [
        { r: 0, c: 50 }
      ];

      const result = calculateSheetDimensions(celldata);

      expect(result).toEqual({ rows: 100, cols: 51 });
    });

    it('should allow custom minimum dimensions', () => {
      const celldata = [{ r: 0, c: 0 }];

      const result = calculateSheetDimensions(celldata, 200, 50);

      expect(result).toEqual({ rows: 200, cols: 50 });
    });

    it('should handle null celldata', () => {
      const result = calculateSheetDimensions(null);

      expect(result).toEqual({ rows: 100, cols: 26 });
    });

    it('should ignore invalid cells without r/c properties', () => {
      const celldata = [
        { r: 10, c: 10 },
        { invalid: true },
        { r: null, c: null },
        { r: 20, c: 20 }
      ];

      const result = calculateSheetDimensions(celldata);

      expect(result).toEqual({ rows: 100, cols: 26 }); // max is 21, use defaults
    });
  });
});

/**
 * Helper to recursively get all function names from nested tree
 */
function getAllNestedFunctions(obj, prefix = '') {
  let functions = [];

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = prefix + key;

    if (value && typeof value === 'object') {
      if (value.n) {
        // This is a function definition
        functions.push(value.n);
      } else {
        // This is a nested object, recurse
        functions = functions.concat(getAllNestedFunctions(value, currentPath));
      }
    }
  }

  return functions;
}
