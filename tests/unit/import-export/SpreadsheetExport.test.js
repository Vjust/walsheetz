import * as XLSX from 'xlsx';

// Mock the logger dependency
const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
};
const LogComponent = 'SPREADSHEET_IMPORT_EXPORT';

// Mock module before importing service
import.meta.mockModule = import.meta.mockModule || (() => {});

// Import service after mocking
import { SpreadsheetImportExportService } from "../../../packages/spreadsheet-sdk/src/services/SpreadsheetImportExportService.js";

describe('SpreadsheetImportExportService export conversions', () => {
  let service;

  beforeEach(() => {
    service = new SpreadsheetImportExportService();
  });

  test('converts celldata sheets into populated worksheet', () => {
    const sheet = {
      name: 'TestSheet',
      celldata: [
      { r: 0, c: 0, v: { v: 'Hello', m: 'Hello', s: { bl: 1 } } },
      { r: 1, c: 2, v: { v: 42, m: '42' } },
      { r: 2, c: 1, v: { v: 3, m: '3' } },
      { r: 2, c: 2, v: { v: 4, m: '4' } },
      { r: 3, c: 2, v: { v: 7, m: '7', f: '=SUM(C2:C3)' } }]

    };

    const worksheet = service._convertSheetToWorksheet(sheet);
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    expect(rows[0][0]).toBe('Hello');
    expect(rows[1][2]).toBe(42);
    expect(rows[3][2]).toBe(7);

    // Ensure style was transferred for bold cell
    expect(worksheet.A1.s).toBeDefined();
    expect(worksheet.A1.s.font?.bold).toBe(true);

    // Ensure formula preserved (xlsx expects formula without leading '=')
    expect(worksheet.C4.f).toBe('SUM(C2:C3)');
    expect(worksheet.C4.v).toBe(7);
  });

  test('prefers celldata to preserve formulas and metadata', () => {
    const sheet = {
      row: 3,
      column: 3,
      data: [
      [{ v: 'Grid' }, { v: 1 }, { v: 2 }],
      [{ v: 'Overwrite' }, { v: 3 }, { v: 4 }]],

      celldata: [
      { r: 0, c: 0, v: { v: 'CellData' } },
      { r: 1, c: 0, v: { v: 'CellDataOverwrite', f: '=UPPER(A1)' } }]

    };

    const worksheet = service._convertSheetToWorksheet(sheet);
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Values should come from celldata (which contains formulas and metadata)
    expect(rows[0][0]).toBe('CellData');
    expect(rows[1][0]).toBe('CellDataOverwrite');

    // Formula should be preserved from celldata
    expect(worksheet.A2.f).toBe('UPPER(A1)');
  });

  test('expands rows and columns based on celldata bounds when sheet size missing', () => {
    const sheet = {
      celldata: [
      { r: 5, c: 5, v: { v: 'Edge' } }]

    };

    const worksheet = service._convertSheetToWorksheet(sheet);
    const edgeCellRef = XLSX.utils.encode_cell({ r: 5, c: 5 });

    // Worksheet should contain the edge cell even when row/column metadata is missing
    expect(worksheet[edgeCellRef]).toBeDefined();
    expect(worksheet[edgeCellRef].v).toBe('Edge');
  });

  test('handles number format with object structure', () => {
    const sheet = {
      celldata: [
        { r: 0, c: 0, v: { v: 42.567, m: '42.57', ct: { fa: 'Number', t: 'g' } } }
      ]
    };

    const worksheet = service._convertSheetToWorksheet(sheet);

    // Verify value is preserved
    expect(worksheet.A1.v).toBe(42.567);

    // Verify number format is applied (mapped from 'Number' -> '0.00')
    expect(worksheet.A1.s).toBeDefined();
    expect(worksheet.A1.s.numFmt).toBe('0.00');
  });

  test('handles date format with serial number', () => {
    const sheet = {
      celldata: [
        { r: 0, c: 0, v: { v: 45950, m: '2025-10-15', ct: { fa: 'Date', t: 'g' } } }
      ]
    };

    const worksheet = service._convertSheetToWorksheet(sheet);

    // Verify serial number is preserved
    expect(worksheet.A1.v).toBe(45950);

    // Verify date format is applied (mapped from 'Date' -> 'yyyy-mm-dd')
    expect(worksheet.A1.s).toBeDefined();
    expect(worksheet.A1.s.numFmt).toBe('yyyy-mm-dd');
  });

  test('handles date format with ISO string', () => {
    const sheet = {
      celldata: [
        { r: 0, c: 0, v: { v: '2025-10-15', m: '2025-10-15', ct: { fa: 'Date', t: 'g' } } }
      ]
    };

    const worksheet = service._convertSheetToWorksheet(sheet);

    // Verify ISO string is converted to Excel serial number
    // 2025-10-15 should be around day 45950 (October 15, 2025)
    expect(typeof worksheet.A1.v).toBe('number');
    expect(worksheet.A1.v).toBeGreaterThan(45000);
    expect(worksheet.A1.v).toBeLessThan(46000);

    // Verify date format is applied
    expect(worksheet.A1.s).toBeDefined();
    expect(worksheet.A1.s.numFmt).toBe('yyyy-mm-dd');
  });

  test('handles custom Excel format strings', () => {
    const sheet = {
      celldata: [
        { r: 0, c: 0, v: { v: 1234.56, m: '1,234.56', ct: { fa: '[$-409]#,##0.00', t: 'g' } } }
      ]
    };

    const worksheet = service._convertSheetToWorksheet(sheet);

    // Verify value is preserved
    expect(worksheet.A1.v).toBe(1234.56);

    // Verify custom format string is passed through
    expect(worksheet.A1.s).toBeDefined();
    expect(worksheet.A1.s.numFmt).toBe('[$-409]#,##0.00');
  });

  test('handles currency format', () => {
    const sheet = {
      celldata: [
        { r: 0, c: 0, v: { v: 1234.56, m: '$1,234.56', ct: { fa: 'Currency', t: 'g' } } }
      ]
    };

    const worksheet = service._convertSheetToWorksheet(sheet);

    // Verify value is preserved
    expect(worksheet.A1.v).toBe(1234.56);

    // Verify currency format is applied
    expect(worksheet.A1.s).toBeDefined();
    expect(worksheet.A1.s.numFmt).toBe('$#,##0.00');
  });

  test('handles percentage format', () => {
    const sheet = {
      celldata: [
        { r: 0, c: 0, v: { v: 0.85, m: '85%', ct: { fa: 'Percent', t: 'g' } } }
      ]
    };

    const worksheet = service._convertSheetToWorksheet(sheet);

    // Verify value is preserved
    expect(worksheet.A1.v).toBe(0.85);

    // Verify percentage format is applied
    expect(worksheet.A1.s).toBeDefined();
    expect(worksheet.A1.s.numFmt).toBe('0%');
  });

  test('preserves formulas from celldata when grid data has only computed values', () => {
    const sheet = {
      row: 4,
      column: 2,
      data: [
        [10, null],
        [20, null],
        [30, null],
        [null, 60]  // Computed result of formula
      ],
      celldata: [
        { r: 3, c: 1, v: { v: 60, m: '60', f: '=SUM(A1:A3)' } }
      ]
    };

    const worksheet = service._convertSheetToWorksheet(sheet);
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Verify computed value is present
    expect(rows[3][1]).toBe(60);

    // Verify formula is preserved (not lost)
    expect(worksheet.B4.f).toBe('SUM(A1:A3)');
    expect(worksheet.B4.v).toBe(60);
  });
});