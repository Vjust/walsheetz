import { SpreadsheetImportExportService } from '../SpreadsheetImportExportService.js'
import * as XLSX from 'xlsx'
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'

describe('SpreadsheetImportExportService CSV Export Regression Tests', () => {
  let service
  let originalWindow

  beforeEach(() => {
    service = new SpreadsheetImportExportService()
    // Store original window for restoration
    originalWindow = global.window
  })

  afterEach(() => {
    // Restore window
    global.window = originalWindow
    vi.clearAllMocks()
  })

  describe('exportToCSV with celldata format', () => {
    test('exports sheet with celldata format successfully', async () => {
      const luckysheetData = {
        sheets: [
          {
            name: 'Sheet1',
            row: 3,
            column: 3,
            celldata: [
              { r: 0, c: 0, v: { v: 'Name', m: 'Name' } },
              { r: 0, c: 1, v: { v: 'Age', m: 'Age' } },
              { r: 1, c: 0, v: { v: 'John', m: 'John' } },
              { r: 1, c: 1, v: { v: 30, m: '30' } },
              { r: 2, c: 0, v: { v: 'Jane', m: 'Jane' } },
              { r: 2, c: 1, v: { v: 25, m: '25' } }
            ]
          }
        ],
        info: { name: 'TestSheet' }
      }

      // Mock XLSX.writeFile
      const writeFileSpy = vi.spyOn(XLSX, 'writeFile').mockImplementation(() => {})

      await service.exportToCSV(luckysheetData, {
        filename: 'test.csv'
      })

      expect(writeFileSpy).toHaveBeenCalledWith(expect.any(Object), 'test.csv', { bookType: 'csv' })
      writeFileSpy.mockRestore()
    })

    test('exports sheet with both data and celldata formats, preferring data', async () => {
      const luckysheetData = {
        sheets: [
          {
            name: 'Sheet1',
            row: 2,
            column: 2,
            data: [
              [{ v: 'From Data', m: 'From Data' }, { v: 1 }],
              [{ v: 'Row2', m: 'Row2' }, { v: 2 }]
            ],
            celldata: [
              { r: 0, c: 0, v: { v: 'From CellData', m: 'From CellData' } }
            ]
          }
        ],
        info: { name: 'TestSheet' }
      }

      const writeFileSpy = vi.spyOn(XLSX, 'writeFile').mockImplementation(function(workbook) {
        // Verify the workbook contains data from grid format, not celldata
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        expect(sheet.A1.v).toBe('From Data')
        expect(sheet.A2.v).toBe('Row2')
      })

      await service.exportToCSV(luckysheetData, { filename: 'test.csv' })
      expect(writeFileSpy).toHaveBeenCalled()
      writeFileSpy.mockRestore()
    })
  })

  describe('exportToCSV with fallback data sources', () => {
    test('uses luckysheet.getluckysheetfile() when sheets array is empty', async () => {
      const fallbackSheet = {
        name: 'FallbackSheet',
        row: 1,
        column: 1,
        celldata: [{ r: 0, c: 0, v: { v: 'Fallback Data', m: 'Fallback Data' } }]
      }

      const luckysheetData = {
        sheets: [],
        info: { name: 'Empty' }
      }

      // Mock window.luckysheet.getluckysheetfile
      global.window = {
        luckysheet: {
          getluckysheetfile: vi.fn(() => [fallbackSheet])
        }
      }

      const writeFileSpy = vi.spyOn(XLSX, 'writeFile').mockImplementation(function(workbook) {
        expect(workbook).toBeDefined()
      })

      await service.exportToCSV(luckysheetData, { filename: 'test.csv' })

      expect(global.window.luckysheet.getluckysheetfile).toHaveBeenCalled()
      expect(writeFileSpy).toHaveBeenCalled()
      writeFileSpy.mockRestore()
    })

    test('uses getAllSheets() as second fallback when getluckysheetfile fails', async () => {
      const fallbackSheet = {
        name: 'AllSheetsSheet',
        row: 1,
        column: 1,
        celldata: [{ r: 0, c: 0, v: { v: 'From getAllSheets', m: 'From getAllSheets' } }]
      }

      const luckysheetData = {
        sheets: [],
        info: { name: 'Empty' }
      }

      // Mock window.luckysheet with failing getluckysheetfile and working getAllSheets
      global.window = {
        luckysheet: {
          getluckysheetfile: vi.fn(() => {
            throw new Error('getluckysheetfile not available')
          }),
          getAllSheets: vi.fn(() => [fallbackSheet])
        }
      }

      const writeFileSpy = vi.spyOn(XLSX, 'writeFile').mockImplementation(() => {})

      await service.exportToCSV(luckysheetData, { filename: 'test.csv' })

      expect(global.window.luckysheet.getAllSheets).toHaveBeenCalled()
      expect(writeFileSpy).toHaveBeenCalled()
      writeFileSpy.mockRestore()
    })

    test('uses window.luckysheetfile as last resort fallback', async () => {
      const fallbackSheet = {
        name: 'WindowSheet',
        row: 1,
        column: 1,
        celldata: [{ r: 0, c: 0, v: { v: 'From window.luckysheetfile', m: 'From window.luckysheetfile' } }]
      }

      const luckysheetData = {
        sheets: [],
        info: { name: 'Empty' }
      }

      // Mock window without luckysheet object
      global.window = {
        luckysheetfile: [fallbackSheet]
      }

      const writeFileSpy = vi.spyOn(XLSX, 'writeFile').mockImplementation(() => {})

      await service.exportToCSV(luckysheetData, { filename: 'test.csv' })

      expect(writeFileSpy).toHaveBeenCalled()
      writeFileSpy.mockRestore()
    })

    test('throws error when no sheet data found from any source', async () => {
      const luckysheetData = {
        sheets: [],
        info: { name: 'Empty' }
      }

      // Mock empty window state
      global.window = {}

      await expect(service.exportToCSV(luckysheetData, { filename: 'test.csv' })).rejects.toThrow(
        /No sheet data found/
      )
    })
  })

  describe('exportToCSV error handling', () => {
    test('throws error when export already in progress', async () => {
      service.exportInProgress = true

      await expect(
        service.exportToCSV({ sheets: [{}], info: {} }, { filename: 'test.csv' })
      ).rejects.toThrow('Export already in progress')
    })

    test('throws error when no luckysheetData provided', async () => {
      await expect(service.exportToCSV(null, { filename: 'test.csv' })).rejects.toThrow(
        'No spreadsheet data provided'
      )
    })

    test('properly resets exportInProgress flag on error', async () => {
      const luckysheetData = {
        sheets: [],
        info: { name: 'Empty' }
      }

      global.window = {}

      try {
        await service.exportToCSV(luckysheetData, { filename: 'test.csv' })
      } catch (e) {
        // Expected error
      }

      expect(service.exportInProgress).toBe(false)
    })

    test('properly resets exportInProgress flag on success', async () => {
      const luckysheetData = {
        sheets: [
          {
            name: 'Sheet1',
            celldata: [{ r: 0, c: 0, v: { v: 'Test' } }]
          }
        ],
        info: { name: 'Test' }
      }

      const writeFileSpy = vi.spyOn(XLSX, 'writeFile').mockImplementation(() => {})

      await service.exportToCSV(luckysheetData, { filename: 'test.csv' })

      expect(service.exportInProgress).toBe(false)
      writeFileSpy.mockRestore()
    })
  })

  describe('CSV export with formulas and formatting', () => {
    test('preserves formulas in CSV export', async () => {
      const luckysheetData = {
        sheets: [
          {
            name: 'FormulaSheet',
            row: 3,
            column: 3,
            celldata: [
              { r: 0, c: 0, v: { v: 'A', m: 'A' } },
              { r: 0, c: 1, v: { v: 'B', m: 'B' } },
              { r: 1, c: 0, v: { v: 1, m: '1' } },
              { r: 1, c: 1, v: { v: 2, m: '2' } },
              { r: 2, c: 0, v: { v: 3, m: '3', f: '=SUM(A2:A3)' } }
            ]
          }
        ],
        info: { name: 'Test' }
      }

      const writeFileSpy = vi.spyOn(XLSX, 'writeFile').mockImplementation(function(workbook) {
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        // Cell A3 should have the formula
        expect(sheet.A3.f).toBe('SUM(A2:A3)')
      })

      await service.exportToCSV(luckysheetData, { filename: 'test.csv' })
      expect(writeFileSpy).toHaveBeenCalled()
      writeFileSpy.mockRestore()
    })

    test('handles cells with style information', async () => {
      const luckysheetData = {
        sheets: [
          {
            name: 'StyledSheet',
            row: 1,
            column: 1,
            celldata: [
              {
                r: 0,
                c: 0,
                v: { v: 'Bold Text', m: 'Bold Text' },
                s: { bl: 1, fc: '#FF0000' }
              }
            ]
          }
        ],
        info: { name: 'Test' }
      }

      const writeFileSpy = vi.spyOn(XLSX, 'writeFile').mockImplementation(() => {})

      await service.exportToCSV(luckysheetData, { filename: 'test.csv' })
      expect(writeFileSpy).toHaveBeenCalled()
      writeFileSpy.mockRestore()
    })
  })

  describe('exportToCSV filename generation', () => {
    test('uses provided filename if specified', async () => {
      const luckysheetData = {
        sheets: [
          {
            name: 'Sheet1',
            celldata: [{ r: 0, c: 0, v: { v: 'Test' } }]
          }
        ],
        info: { name: 'Test' }
      }

      const writeFileSpy = vi.spyOn(XLSX, 'writeFile').mockImplementation(() => {})

      await service.exportToCSV(luckysheetData, { filename: 'custom_name.csv' })

      expect(writeFileSpy).toHaveBeenCalledWith(expect.any(Object), 'custom_name.csv', {
        bookType: 'csv'
      })

      writeFileSpy.mockRestore()
    })

    test('generates filename with timestamp when not provided', async () => {
      const luckysheetData = {
        sheets: [
          {
            name: 'MySheet',
            celldata: [{ r: 0, c: 0, v: { v: 'Test' } }]
          }
        ],
        info: { name: 'Test' }
      }

      const writeFileSpy = vi.spyOn(XLSX, 'writeFile').mockImplementation(() => {})

      await service.exportToCSV(luckysheetData, {})

      const [, filename] = writeFileSpy.mock.calls[0]
      expect(filename).toMatch(/MySheet_\d{4}-\d{2}-\d{2}\.csv/)

      writeFileSpy.mockRestore()
    })
  })
})
