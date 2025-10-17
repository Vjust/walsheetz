import { logger, LogComponent } from '../utils/Logger.js';
import LuckyExcel from 'luckyexcel';
import * as XLSX from 'xlsx';

/**
 * Service for handling import and export of spreadsheet data
 * - Import: Excel (.xlsx) → Luckysheet JSON format using Luckyexcel
 * - Export: Luckysheet JSON → Excel (.xlsx) format using SheetJS/xlsx
 */
export class SpreadsheetImportExportService {
  constructor() {
    this.importInProgress = false;
    this.exportInProgress = false;
  }

  /**
   * Import Excel file and convert to Luckysheet format
   * @param {File} file - The Excel file to import
   * @param {Object} options - Import options
   * @returns {Promise<Object>} Luckysheet data structure
   */
  async importFromExcel(file, options = {}) {
    if (this.importInProgress) {
      throw new Error('Import already in progress');
    }

    if (!file) {
      throw new Error('No file provided');
    }

    const validExtensions = ['.xlsx', '.xls', '.xlsm', '.xlsb'];
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

      // Read file as ArrayBuffer
      const arrayBuffer = await this._readFileAsArrayBuffer(file);

      // Convert using Luckyexcel
      return await new Promise((resolve, reject) => {
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
      });

    } finally {
      this.importInProgress = false;
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
      const sheet = luckysheetData.sheets?.[0];
      if (!sheet) {
        throw new Error('No sheet data found');
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
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error(`Failed to read file: ${e.target.error}`));
      reader.readAsArrayBuffer(file);
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
   * @private
   */
  _convertSheetToWorksheet(sheet) {
    if (!sheet || !sheet.data) {
      return XLSX.utils.aoa_to_sheet([[]]);
    }

    const rows = sheet.row || 100;
    const cols = sheet.column || 26;

    // Build 2D array from sheet data and prepare cell formatting
    const matrix = [];
    const cellFormats = {};

    for (let r = 0; r < rows; r++) {
      matrix[r] = [];
      for (let c = 0; c < cols; c++) {
        if (sheet.data[r] && sheet.data[r][c]) {
          const cell = sheet.data[r][c];
          // Extract value from cell
          matrix[r][c] = cell.v !== undefined ? cell.v : cell.m;

          // Store cell formatting for later application
          if (cell.s) {
            cellFormats[XLSX.utils.encode_cell({ r, c })] = this._convertLuckysheetCellStyle(cell.s);
          }
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
