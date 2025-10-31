import { logger, LogComponent } from '@utils/logging/Logger.js';
import LuckyExcel from 'luckyexcel';
import * as XLSX from 'xlsx';
import { parseCSV } from '../utils/BlobParser.js'

/**
 * Service for handling import and export of spreadsheet data
 *
 * **Phase 2 Lifecycle Context:**
 * With the new useSpreadsheetLifecycle hook, Luckysheet's internal state is managed by the hook
 * and may not be immediately synchronized with window.luckysheetfile. To ensure reliable exports:
 *
 * 1. Data sources are checked in priority order:
 *    - luckysheetData.sheets (passed from Header.jsx - most current in Phase 2)
 *    - window.luckysheet.getluckysheetfile() (Luckysheet's getter method)
 *    - window.luckysheet.getAllSheets() (alternative getter)
 *    - window.luckysheetfile (legacy fallback)
 *
 * 2. Sheet data may be in two formats - both are supported:
 *    - Grid format: sheet.data[row][col] (array of arrays)
 *    - CellData format: sheet.celldata (array of cell objects with r, c properties)
 *    - Priority: grid format is preferred when both are present
 *
 * **Import:** Excel (.xlsx) → Luckysheet JSON format using Luckyexcel
 * **Export:** Luckysheet JSON → Excel (.xlsx) or CSV format using SheetJS/xlsx
 */
export class SpreadsheetImportExportService {
  constructor() {
    this.importInProgress = false;
    this.exportInProgress = false;
  }

  /**
   * Import Excel file and convert to Luckysheet format
   * @param {File} file - The Excel file to import
   * @param {Object} options - Import options { title, onProgress }
   * @returns {Promise<Object>} Luckysheet data structure
   */
  async importFromExcel(file, options = {}) {
    if (this.importInProgress) {
      throw new Error('Import already in progress');
    }

    if (!file) {
      throw new Error('No file provided');
    }

    const validExtensions = ['.xlsx', '.xls', '.xlsm', '.xlsb', '.csv'];
    const fileName = file.name.toLowerCase();
    const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));

    if (!hasValidExtension) {
      throw new Error('Invalid file format. Please upload an Excel file (.xlsx, .xls, .xlsm)');
    }

    // Warn user about XLSB format limitations
    if (fileName.endsWith('.xlsb')) {
      logger.warn(LogComponent.UI_COMPONENT, 'xlsb_format_warning', 'XLSB format detected - some features may not be preserved', {
        fileName: file.name
      });
    }

    this.importInProgress = true;

    try {
      logger.info(LogComponent.UI_COMPONENT, 'import_start', 'Starting Excel file import', {
        fileName: file.name,
        fileSize: file.size
      });

      // Read file as ArrayBuffer/Text depending on type
      const isCSV = fileName.endsWith('.csv')
      const arrayBuffer = await this._readFileAsArrayBuffer(file);

      // Ensure we're in a browser environment with proper DOM
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        throw new Error('Excel import is only available in browser environment');
      }

      // Ensure document.body exists (should be present in normal browser environment)
      if (!document.body) {
        throw new Error('Document body not available. Please try again.');
      }

      // CSV path: convert to Luckysheet structure without LuckyExcel
      if (isCSV) {
        try {
          const text = new TextDecoder('utf-8').decode(arrayBuffer)
          const parsed = parseCSV(text, {})

          // Pass onProgress callback to CSV conversion for large files
          const sheet = await this._convertParsedCSVToLuckysheetSheet(
            parsed,
            options.title || (file.name.replace(/\.[^.]+$/, '')),
            options.onProgress
          )

          const exportJson = {
            info: { name: options.title || (file.name.replace(/\.[^.]+$/, '')) },
            sheets: [sheet]
          }

          logger.info(LogComponent.UI_COMPONENT, 'csv_import_success', 'CSV import completed', {
            fileName: file.name,
            rows: sheet.row,
            columns: sheet.column
          })

          return this._processImportedData(exportJson, options)
        } catch (error) {
          logger.error(LogComponent.UI_COMPONENT, 'csv_import_error', 'CSV import failed', {
            fileName: file.name,
            error: error?.message || String(error)
          })
          throw new Error(`Failed to import CSV file: ${error?.message || 'Unknown error'}`)
        }
      }

      // Create a temporary container for LuckyExcel if needed
      // LuckyExcel sometimes needs DOM access during transformation
      let tempContainer = document.getElementById('luckyexcel-temp-container');
      if (!tempContainer) {
        tempContainer = document.createElement('div');
        tempContainer.id = 'luckyexcel-temp-container';
        tempContainer.style.display = 'none';
        document.body.appendChild(tempContainer);
      }

      // Convert using Luckyexcel
      return await new Promise((resolve, reject) => {
        try {
          LuckyExcel.transformExcelToLucky(
            arrayBuffer,
            (exportJson, luckysheetfile) => {
              logger.info(LogComponent.UI_COMPONENT, 'import_success', 'Excel import completed', {
                fileName: file.name,
                sheetsCount: exportJson.sheets?.length || 0
              });

              // Apply custom options if provided
              const processedData = this._processImportedData(exportJson, options);
              resolve(processedData);
            },
            (error) => {
              logger.error(LogComponent.UI_COMPONENT, 'import_error', 'Excel import failed', {
                fileName: file.name,
                error: error?.message || String(error)
              });

              reject(new Error(`Failed to import Excel file: ${error?.message || 'Unknown error'}`));
            }
          );
        } catch (error) {
          logger.error(LogComponent.UI_COMPONENT, 'import_exception', 'Excel import threw exception', {
            fileName: file.name,
            error: error?.message || String(error)
          });
          reject(new Error(`Failed to import Excel file: ${error?.message || 'Unknown error'}`));
        }
      });

    } finally {
      this.importInProgress = false;
    }
  }

  /**
   * Convert parsed CSV grid to a Luckysheet sheet object (asynchronous chunked version)
   * Processes cells in chunks to avoid stack overflow and blocking the main thread
   * @private
   * @param {Object} parsed - Parsed CSV data with rows, cols, and data array
   * @param {string} sheetName - Name for the sheet
   * @param {Function} onProgress - Optional callback for progress: (processedCells, totalCells) => {}
   * @returns {Promise<Object>} Luckysheet sheet object
   */
  async _convertParsedCSVToLuckysheetSheet(parsed, sheetName, onProgress = null) {
    const rows = parsed?.rows || 0
    const cols = parsed?.cols || 0
    const data = parsed?.data || []
    const totalCells = rows * cols

    // Use 5000 cells per chunk for good balance between UI responsiveness and performance
    const CHUNK_SIZE = 5000

    const celldata = []
    let processedCells = 0

    logger.debug(LogComponent.UI_COMPONENT, 'csv_conversion_start', 'Starting async CSV conversion', {
      rows,
      cols,
      totalCells,
      chunkSize: CHUNK_SIZE
    })

    // Helper to yield control to browser
    const yieldToMain = () => {
      return new Promise(resolve => {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => resolve(), { timeout: 50 })
        } else {
          setTimeout(resolve, 0)
        }
      })
    }

    // Process cells in chunks
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const value = data[r]?.[c]
        if (value !== undefined && value !== null && String(value) !== '') {
          celldata.push({ r, c, v: { v: value, m: String(value) } })
        }

        processedCells++

        // Yield control periodically
        if (processedCells % CHUNK_SIZE === 0) {
          if (onProgress) {
            onProgress(processedCells, totalCells)
          }
          await yieldToMain()
        }
      }
    }

    // Final progress update
    if (onProgress && processedCells % CHUNK_SIZE !== 0) {
      onProgress(totalCells, totalCells)
    }

    logger.debug(LogComponent.UI_COMPONENT, 'csv_conversion_complete', 'Async CSV conversion completed', {
      rows,
      cols,
      cellCount: celldata.length,
      totalCells
    })

    return {
      name: sheetName || 'Sheet1',
      row: Math.max(rows, 1),
      column: Math.max(cols, 1),
      celldata,
      config: {}
    }
  }

  /**
   * Export Luckysheet data to Excel file
   * @param {Object} luckysheetData - Luckysheet data structure
   * @param {Object} options - Export options (title, filename, etc.)
   * @returns {Promise<void>} Downloads the Excel file
   */
  async exportToExcel(luckysheetData, options = {}) {
    if (this.exportInProgress) {
      throw new Error('Export already in progress');
    }

    if (!luckysheetData) {
      throw new Error('No spreadsheet data provided');
    }

    this.exportInProgress = true;

    try {
      logger.info(LogComponent.UI_COMPONENT, 'export_start', 'Starting spreadsheet export to Excel', {
        sheetsCount: luckysheetData.sheets?.length || 1
      });

      // Convert Luckysheet format to SheetJS format
      const workbook = this._convertLuckysheetToXLSX(luckysheetData, options);

      // Generate filename
      const filename = options.filename || this._generateFilename(options.title || 'spreadsheet');

      // Write file
      XLSX.writeFile(workbook, filename);

      logger.info(LogComponent.UI_COMPONENT, 'export_success', 'Spreadsheet export completed', {
        filename,
        sheetsCount: workbook.SheetNames.length
      });

    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'export_error', 'Spreadsheet export failed', {
        error: error?.message || String(error)
      });

      throw new Error(`Failed to export spreadsheet: ${error?.message || 'Unknown error'}`);

    } finally {
      this.exportInProgress = false;
    }
  }

  /**
   * Export Luckysheet data to CSV file
   * Phase 2 lifecycle: tries multiple data sources to ensure sheet data is found
   * @param {Object} luckysheetData - Luckysheet data structure
   * @param {Object} options - Export options
   * @returns {Promise<void>} Downloads the CSV file
   */
  async exportToCSV(luckysheetData, options = {}) {
    if (this.exportInProgress) {
      throw new Error('Export already in progress');
    }

    if (!luckysheetData) {
      throw new Error('No spreadsheet data provided');
    }

    this.exportInProgress = true;

    try {
      logger.info(LogComponent.UI_COMPONENT, 'csv_export_start', 'Starting CSV export', {
        sheetsCount: luckysheetData.sheets?.length || 1
      });

      // Use first sheet for CSV (CSV doesn't support multiple sheets)
      let sheet = luckysheetData.sheets?.[0];

      // If sheet is missing from luckysheetData, try to fetch from Luckysheet's live state
      if (!sheet) {
        logger.warn(LogComponent.UI_COMPONENT, 'csv_export_no_sheet', 'No sheet in luckysheetData, attempting fallback', {
          sheetsLength: luckysheetData.sheets?.length
        });

        // Try to get sheet from Luckysheet's live state
        if (typeof window !== 'undefined' && window.luckysheet) {
          // Try primary getter (Phase 2 lifecycle)
          if (!sheet && typeof window.luckysheet.getluckysheetfile === 'function') {
            try {
              const allSheets = window.luckysheet.getluckysheetfile();
              if (Array.isArray(allSheets) && allSheets.length > 0) {
                sheet = allSheets[0];
                logger.info(LogComponent.UI_COMPONENT, 'csv_export_fallback', 'Retrieved sheet from luckysheet.getluckysheetfile()', {
                  sheetName: sheet?.name
                });
              }
            } catch (fallbackError) {
              logger.warn(LogComponent.UI_COMPONENT, 'csv_export_fallback_error', 'Error calling getluckysheetfile()', {
                error: fallbackError?.message
              });
            }
          }

          // Second fallback: try getAllSheets
          if (!sheet && typeof window.luckysheet.getAllSheets === 'function') {
            try {
              const allSheets = window.luckysheet.getAllSheets(true);
              if (Array.isArray(allSheets) && allSheets.length > 0) {
                sheet = allSheets[0];
                logger.info(LogComponent.UI_COMPONENT, 'csv_export_fallback', 'Retrieved sheet from luckysheet.getAllSheets()', {
                  sheetName: sheet?.name
                });
              }
            } catch (fallbackError) {
              logger.warn(LogComponent.UI_COMPONENT, 'csv_export_fallback_error', 'Error calling getAllSheets()', {
                error: fallbackError?.message
              });
            }
          }
        }

        // If still no sheet, try window.luckysheetfile
        if (!sheet && typeof window !== 'undefined' && Array.isArray(window.luckysheetfile) && window.luckysheetfile.length > 0) {
          sheet = window.luckysheetfile[0];
          logger.info(LogComponent.UI_COMPONENT, 'csv_export_fallback', 'Retrieved sheet from window.luckysheetfile', {
            sheetName: sheet?.name
          });
        }
      }

      // If sheet is still missing, provide detailed error message
      if (!sheet) {
        const errorDetails = {
          hasSheets: luckysheetData.sheets ? true : false,
          sheetsLength: luckysheetData.sheets?.length || 0,
          luckysheetAvailable: typeof window !== 'undefined' && !!window.luckysheet,
          dataSource: 'luckysheetData'
        };
        logger.error(LogComponent.UI_COMPONENT, 'csv_export_no_data', 'No sheet data available from any source', errorDetails);
        throw new Error('No sheet data found. Please ensure data is loaded before exporting.');
      }

      // Convert to workbook and export as CSV
      const workbook = this._convertSheetToWorkbook(sheet, options);
      const filename = options.filename || this._generateFilename(sheet.name || 'export', 'csv');

      XLSX.writeFile(workbook, filename, { bookType: 'csv' });

      logger.info(LogComponent.UI_COMPONENT, 'csv_export_success', 'CSV export completed', {
        filename,
        sheetName: sheet.name
      });

    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'csv_export_error', 'CSV export failed', {
        error: error?.message || String(error)
      });

      throw new Error(`Failed to export to CSV: ${error?.message || 'Unknown error'}`);

    } finally {
      this.exportInProgress = false;
    }
  }

  /**
   * Read file as ArrayBuffer
   * @private
   */
  _readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      if (typeof FileReader === 'undefined') {
        reject(new Error('FileReader is not available in this environment'));
        return;
      }

      try {
        const reader = new FileReader();
        
        reader.onload = (e) => {
          if (e.target && e.target.result) {
            resolve(e.target.result);
          } else {
            reject(new Error('Failed to read file: No result data'));
          }
        };
        
        reader.onerror = (e) => {
          const errorMsg = e.target?.error?.message || 'Unknown error reading file';
          reject(new Error(`Failed to read file: ${errorMsg}`));
        };
        
        reader.readAsArrayBuffer(file);
      } catch (error) {
        reject(new Error(`Failed to initialize file reader: ${error.message}`));
      }
    });
  }

  /**
   * Process imported data with custom options
   * @private
   */
  _processImportedData(importedData, options = {}) {
    const processed = { ...importedData };

    // Apply title if provided
    if (options.title && processed.info) {
      processed.info.name = options.title;
    }

    // Merge with existing metadata if provided
    if (options.metadata && processed.info) {
      processed.info = { ...processed.info, ...options.metadata };
    }

    return processed;
  }

  /**
   * Convert Luckysheet format to XLSX workbook
   * @private
   */
  _convertLuckysheetToXLSX(luckysheetData, options = {}) {
    const workbook = XLSX.utils.book_new();

    const sheets = luckysheetData.sheets || [];
    if (sheets.length === 0) {
      // Create empty sheet
      const ws = XLSX.utils.aoa_to_sheet([[]]);
      XLSX.utils.book_append_sheet(workbook, ws, 'Sheet1');
      return workbook;
    }

    // Process each sheet
    sheets.forEach((sheet, index) => {
      try {
        const worksheet = this._convertSheetToWorksheet(sheet);
        const sheetName = sheet.name || `Sheet${index + 1}`;
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      } catch (error) {
        logger.warn(LogComponent.UI_COMPONENT, 'sheet_conversion_warn', `Failed to convert sheet ${index}`, {
          error: error.message,
          sheetName: sheet.name
        });
      }
    });

    return workbook;
  }

  /**
   * Convert Luckysheet sheet to XLSX worksheet with advanced formatting
   *
   * **Phase 2 Lifecycle Support:**
   * Handles both grid data format (sheet.data[r][c]) and celldata format (sheet.celldata array)
   * which may come from either:
   * - useSpreadsheetLifecycle hook initialization (celldata format, row/column calculated from bounds)
   * - Legacy Luckysheet initialization (can be either format)
   * - Imported data (typically grid format from user files)
   *
   * **Data Format Priority:**
   * 1. Grid format (sheet.data) - preferred when available
   * 2. CellData format (sheet.celldata) - used if grid data unavailable
   * 3. Empty sheet - returned if neither format is available
   *
   * @private
   */
  _convertSheetToWorksheet(sheet) {
    if (!sheet) {
      return XLSX.utils.aoa_to_sheet([[]]);
    }

    const initialRowCount = typeof sheet.row === 'number' && sheet.row > 0 ? sheet.row : 0;
    const initialColCount = typeof sheet.column === 'number' && sheet.column > 0 ? sheet.column : 0;

    // Check which data format is available
    const hasGridData = Array.isArray(sheet.data) && sheet.data.length > 0;
    const hasCellData = Array.isArray(sheet.celldata) && sheet.celldata.length > 0;

    // If neither format available, return empty sheet
    if (!hasGridData && !hasCellData) {
      return XLSX.utils.aoa_to_sheet([[]]);
    }

    // Determine effective row/column counts from available data
    let rows = initialRowCount;
    let cols = initialColCount;

    if (hasGridData) {
      rows = Math.max(rows, sheet.data.length || 0);
      const gridMaxCols = sheet.data.reduce((max, row) => {
        if (Array.isArray(row)) {
          return Math.max(max, row.length);
        }
        return max;
      }, 0);
      cols = Math.max(cols, gridMaxCols);
    }

    if (hasCellData) {
      const bounds = sheet.celldata.reduce((acc, cell) => {
        if (cell && typeof cell.r === 'number') {
          acc.maxRow = Math.max(acc.maxRow, cell.r);
        }
        if (cell && typeof cell.c === 'number') {
          acc.maxCol = Math.max(acc.maxCol, cell.c);
        }
        return acc;
      }, { maxRow: -1, maxCol: -1 });

      if (bounds.maxRow >= 0) {
        rows = Math.max(rows, bounds.maxRow + 1);
      }
      if (bounds.maxCol >= 0) {
        cols = Math.max(cols, bounds.maxCol + 1);
      }
    }

    rows = Math.max(rows, 1);
    cols = Math.max(cols, 1);

    // Build lookup for celldata format if needed (more efficient than repeated searching)
    let cellLookup = null;
    if (hasCellData) {
      cellLookup = new Map();
      for (const cell of sheet.celldata) {
        if (cell == null) continue;
        const key = `${cell.r}:${cell.c}`;
        const payload = cell?.v !== undefined ? cell.v : cell;
        cellLookup.set(key, payload);
      }
    }

    // Helper to get cell from either format (prefer grid data when present)
    const getCellAt = (r, c) => {
      const gridCell = hasGridData ? sheet.data?.[r]?.[c] : undefined;
      if (gridCell !== undefined && gridCell !== null) {
        return gridCell;
      }
      if (cellLookup) {
        return cellLookup.get(`${r}:${c}`);
      }
      return undefined;
    };

    // Build 2D array from sheet data and collect formatting / formula info
    const matrix = new Array(rows);
    const cellFormats = {};
    const formulaCells = {};

    for (let r = 0; r < rows; r++) {
      matrix[r] = new Array(cols);
      for (let c = 0; c < cols; c++) {
        const cell = getCellAt(r, c);
        if (cell === undefined || cell === null) continue;

        if (typeof cell === 'object') {
          const hasVProp = Object.prototype.hasOwnProperty.call(cell, 'v');
          const hasMProp = Object.prototype.hasOwnProperty.call(cell, 'm');
          const cellValue = hasVProp ? cell.v : (hasMProp ? cell.m : '');
          matrix[r][c] = cellValue !== undefined ? cellValue : '';

          // Track formulas to reapply after sheet creation
          if (cell.f) {
            const cellRef = XLSX.utils.encode_cell({ r, c });
            const formula = typeof cell.f === 'string' && cell.f.startsWith('=') ? cell.f.slice(1) : cell.f;
            formulaCells[cellRef] = {
              f: formula,
              v: matrix[r][c]
            };
          }

          const styleSource = cell.s || cell;
          if (styleSource && typeof styleSource === 'object') {
            const convertedStyle = this._convertLuckysheetCellStyle(styleSource);
            if (convertedStyle) {
              const cellRef = XLSX.utils.encode_cell({ r, c });
              cellFormats[cellRef] = convertedStyle;
            }
          }
        } else {
          // Primitive value (string, number, etc.)
          matrix[r][c] = cell;
        }
      }
    }

    // Convert to worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(matrix);

    // Apply cell formatting
    for (const [cellRef, format] of Object.entries(cellFormats)) {
      if (!worksheet[cellRef]) {
        worksheet[cellRef] = {};
      }
      worksheet[cellRef].s = format;
    }

    // Apply formulas after worksheet creation
    for (const [cellRef, { f, v }] of Object.entries(formulaCells)) {
      if (!worksheet[cellRef]) {
        worksheet[cellRef] = {};
      }
      worksheet[cellRef].f = f;
      if (v !== undefined) {
        worksheet[cellRef].v = v;
      }
    }

    // Apply column widths if available
    if (sheet.config?.columnlen) {
      const colWidths = [];
      for (let c = 0; c < cols; c++) {
        const colWidth = sheet.config.columnlen[c];
        if (colWidth) {
          colWidths[c] = { wch: Math.max(8, colWidth / 15) }; // Convert Luckysheet width to Excel width
        }
      }
      if (colWidths.length > 0) {
        worksheet['!cols'] = colWidths;
      }
    }

    // Apply row heights if available
    if (sheet.config?.rowlen) {
      const rowHeights = [];
      for (let r = 0; r < rows; r++) {
        const rowHeight = sheet.config.rowlen[r];
        if (rowHeight) {
          rowHeights[r] = { hpt: Math.max(15, rowHeight) };
        }
      }
      if (rowHeights.length > 0) {
        worksheet['!rows'] = rowHeights;
      }
    }

    // Apply merged cells if available
    if (sheet.config?.merge && Array.isArray(sheet.config.merge)) {
      worksheet['!merges'] = sheet.config.merge.map(merge => {
        return {
          s: { r: merge.r, c: merge.c },
          e: { r: merge.r + merge.rs - 1, c: merge.c + merge.cs - 1 }
        };
      });
    }

    return worksheet;
  }

  /**
   * Convert Luckysheet cell style to XLSX cell style
   * @private
   */
  _convertLuckysheetCellStyle(luckysheetStyle) {
    const xlsxStyle = {
      font: {},
      fill: {},
      alignment: {},
      border: {},
      numFmt: undefined
    };

    // Font properties
    if (luckysheetStyle.ff) {
      xlsxStyle.font.name = luckysheetStyle.ff;
    }
    if (luckysheetStyle.fs) {
      xlsxStyle.font.sz = luckysheetStyle.fs;
    }
    if (luckysheetStyle.bl) {
      xlsxStyle.font.bold = true;
    }
    if (luckysheetStyle.it) {
      xlsxStyle.font.italic = true;
    }
    if (luckysheetStyle.un) {
      xlsxStyle.font.underline = 'single';
    }
    if (luckysheetStyle.fc) {
      xlsxStyle.font.color = { rgb: this._normalizeColor(luckysheetStyle.fc) };
    }

    // Background/Fill properties
    if (luckysheetStyle.bg) {
      xlsxStyle.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { rgb: this._normalizeColor(luckysheetStyle.bg) }
      };
    }

    // Alignment properties
    if (luckysheetStyle.ht !== undefined) {
      const hAlignMap = { 0: 'left', 1: 'center', 2: 'right' };
      xlsxStyle.alignment.horizontal = hAlignMap[luckysheetStyle.ht] || 'left';
    }
    if (luckysheetStyle.vt !== undefined) {
      const vAlignMap = { 0: 'top', 1: 'center', 2: 'bottom' };
      xlsxStyle.alignment.vertical = vAlignMap[luckysheetStyle.vt] || 'top';
    }
    if (luckysheetStyle.tr) {
      xlsxStyle.alignment.textRotation = luckysheetStyle.tr;
    }
    if (luckysheetStyle.tb) {
      xlsxStyle.alignment.wrapText = true;
    }

    // Number format
    if (luckysheetStyle.ct) {
      xlsxStyle.numFmt = this._convertNumberFormat(luckysheetStyle.ct);
    }

    // Border properties (simplified - basic border support)
    if (luckysheetStyle.bl_t || luckysheetStyle.bl_b || luckysheetStyle.bl_l || luckysheetStyle.bl_r) {
      xlsxStyle.border = {
        top: luckysheetStyle.bl_t ? { style: 'thin' } : undefined,
        bottom: luckysheetStyle.bl_b ? { style: 'thin' } : undefined,
        left: luckysheetStyle.bl_l ? { style: 'thin' } : undefined,
        right: luckysheetStyle.bl_r ? { style: 'thin' } : undefined
      };
    }

    return xlsxStyle;
  }

  /**
   * Normalize color from Luckysheet format to Excel format
   * @private
   */
  _normalizeColor(color) {
    if (!color) return 'FFFFFF';
    // Remove # if present and ensure it's uppercase
    const normalized = color.replace('#', '').toUpperCase();
    // Ensure it's 6 characters (add leading zeros if needed)
    return normalized.padStart(6, '0');
  }

  /**
   * Convert Luckysheet number format to Excel format
   * @private
   */
  _convertNumberFormat(luckysheetFormat) {
    const formatMap = {
      'General': '@',
      'Percent': '0%',
      'Currency': '$#,##0.00',
      'Date': 'YYYY-MM-DD',
      'Time': 'HH:MM:SS',
      'Number': '0.00'
    };
    return formatMap[luckysheetFormat] || '@';
  }

  /**
   * Convert single sheet to workbook (for CSV export)
   *
   * **Purpose:** Wraps a single Luckysheet sheet into a SheetJS workbook structure
   * suitable for CSV export. CSV format only supports a single sheet, so the first
   * sheet in a multi-sheet workbook is selected and exported.
   *
   * **Phase 2 Lifecycle:**
   * Works with sheet data from either useSpreadsheetLifecycle hook (celldata format)
   * or legacy sources, automatically adapting to whichever format is available.
   *
   * @private
   */
  _convertSheetToWorkbook(sheet, options = {}) {
    const worksheet = this._convertSheetToWorksheet(sheet);
    const workbook = XLSX.utils.book_new();
    const sheetName = sheet.name || 'Sheet1';
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    return workbook;
  }

  /**
   * Generate filename with timestamp
   * @private
   */
  _generateFilename(baseName, extension = 'xlsx') {
    const timestamp = new Date().toISOString().slice(0, 10);
    const sanitized = baseName.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${sanitized}_${timestamp}.${extension}`;
  }

  /**
   * Get import/export status
   */
  getStatus() {
    return {
      importInProgress: this.importInProgress,
      exportInProgress: this.exportInProgress,
      isProcessing: this.importInProgress || this.exportInProgress
    };
  }
}

export default SpreadsheetImportExportService;
