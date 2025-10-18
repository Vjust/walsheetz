import * as XLSX from 'xlsx'
import { SpreadsheetImportExportService } from '../SpreadsheetImportExportService.js'

describe('SpreadsheetImportExportService export conversions', () => {
  let service

  beforeEach(() => {
    service = new SpreadsheetImportExportService()
  })

  test('converts celldata sheets into populated worksheet', () => {
    const sheet = {
      name: 'TestSheet',
      celldata: [
        { r: 0, c: 0, v: { v: 'Hello', m: 'Hello', s: { bl: 1 } } },
        { r: 1, c: 2, v: { v: 42, m: '42' } },
        { r: 2, c: 1, v: { v: 3, m: '3' } },
        { r: 2, c: 2, v: { v: 4, m: '4' } },
        { r: 3, c: 2, v: { v: 7, m: '7', f: '=SUM(C2:C3)' } }
      ]
    }

    const worksheet = service._convertSheetToWorksheet(sheet)
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

    expect(rows[0][0]).toBe('Hello')
    expect(rows[1][2]).toBe(42)
    expect(rows[3][2]).toBe(7)

    // Ensure style was transferred for bold cell
    expect(worksheet.A1.s).toBeDefined()
    expect(worksheet.A1.s.font?.bold).toBe(true)

    // Ensure formula preserved (xlsx expects formula without leading '=')
    expect(worksheet.C4.f).toBe('SUM(C2:C3)')
    expect(worksheet.C4.v).toBe(7)
  })

  test('prefers grid data when both formats available', () => {
    const sheet = {
      row: 3,
      column: 3,
      data: [
        [{ v: 'Grid' }, { v: 1 }, { v: 2 }],
        [{ v: 'Overwrite' }, { v: 3 }, { v: 4 }]
      ],
      celldata: [
        { r: 0, c: 0, v: { v: 'CellData' } },
        { r: 1, c: 0, v: { v: 'CellDataOverwrite' } }
      ]
    }

    const worksheet = service._convertSheetToWorksheet(sheet)
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

    // Values should come from grid data, not celldata overrides
    expect(rows[0][0]).toBe('Grid')
    expect(rows[1][0]).toBe('Overwrite')
  })

  test('expands rows and columns based on celldata bounds when sheet size missing', () => {
    const sheet = {
      celldata: [
        { r: 5, c: 5, v: { v: 'Edge' } }
      ]
    }

    const worksheet = service._convertSheetToWorksheet(sheet)
    const edgeCellRef = XLSX.utils.encode_cell({ r: 5, c: 5 })

    // Worksheet should contain the edge cell even when row/column metadata is missing
    expect(worksheet[edgeCellRef]).toBeDefined()
    expect(worksheet[edgeCellRef].v).toBe('Edge')
  })
})

