import { logger, LogComponent } from '../utils/Logger.js';

/**
 * Service for handling bulk import/export operations with progress tracking
 */
export class BulkOperationsService {
  constructor(importExportService) {
    this.importExportService = importExportService;
    this.operations = new Map();
  }

  /**
   * Start a bulk import operation with multiple files
   * @param {Array<File>} files - Array of files to import
   * @param {Object} options - Import options
   * @returns {String} Operation ID
   */
  async startBulkImport(files, options = {}) {
    const operationId = `bulk_import_${Date.now()}`;

    try {
      if (!Array.isArray(files) || files.length === 0) {
        throw new Error('No files provided for bulk import');
      }

      const operation = {
        id: operationId,
        type: 'bulk_import',
        status: 'processing',
        totalFiles: files.length,
        processedFiles: 0,
        successfulFiles: 0,
        failedFiles: 0,
        currentFile: null,
        progress: 0,
        startTime: Date.now(),
        endTime: null,
        results: [],
        errors: [],
        cancelRequested: false,
        onProgress: options.onProgress || (() => {}),
        onComplete: options.onComplete || (() => {}),
        onError: options.onError || (() => {})
      };

      this.operations.set(operationId, operation);

      logger.info(LogComponent.UI_COMPONENT, 'bulk_import_started', 'Bulk import operation started', {
        operationId,
        fileCount: files.length
      });

      // Process files sequentially
      for (let i = 0; i < files.length; i++) {
        if (operation.cancelRequested) {
          logger.info(LogComponent.UI_COMPONENT, 'bulk_import_cancelled', 'Bulk import cancelled by user', {
            operationId
          });
          operation.status = 'cancelled';
          break;
        }

        const file = files[i];
        operation.currentFile = file.name;

        try {
          logger.info(LogComponent.UI_COMPONENT, 'bulk_import_file_processing', `Processing file ${i + 1} of ${files.length}`, {
            operationId,
            fileName: file.name
          });

          // Import file
          const importedData = await this.importExportService.importFromExcel(file, options);

          operation.results.push({
            fileName: file.name,
            status: 'success',
            data: importedData,
            timestamp: Date.now()
          });

          operation.successfulFiles++;
        } catch (error) {
          logger.warn(LogComponent.UI_COMPONENT, 'bulk_import_file_error', `Failed to import file ${file.name}`, {
            operationId,
            error: error.message
          });

          operation.errors.push({
            fileName: file.name,
            error: error.message,
            timestamp: Date.now()
          });

          operation.failedFiles++;
        }

        operation.processedFiles++;
        operation.progress = Math.round((operation.processedFiles / operation.totalFiles) * 100);

        // Call progress callback
        operation.onProgress({
          operationId,
          progress: operation.progress,
          processedFiles: operation.processedFiles,
          totalFiles: operation.totalFiles,
          currentFile: operation.currentFile,
          successfulFiles: operation.successfulFiles,
          failedFiles: operation.failedFiles
        });
      }

      operation.endTime = Date.now();
      operation.status = operation.errors.length > 0 && operation.successfulFiles === 0 ? 'failed' : 'completed';

      logger.info(LogComponent.UI_COMPONENT, 'bulk_import_completed', 'Bulk import operation completed', {
        operationId,
        successfulFiles: operation.successfulFiles,
        failedFiles: operation.failedFiles,
        duration: operation.endTime - operation.startTime
      });

      // Call completion callback
      operation.onComplete({
        operationId,
        status: operation.status,
        successfulFiles: operation.successfulFiles,
        failedFiles: operation.failedFiles,
        results: operation.results,
        errors: operation.errors
      });

      return operationId;
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'bulk_import_error', 'Bulk import operation failed', {
        operationId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Start a bulk export operation
   * @param {Array<Object>} spreadsheets - Array of spreadsheet data to export
   * @param {Object} options - Export options
   * @returns {String} Operation ID
   */
  async startBulkExport(spreadsheets, options = {}) {
    const operationId = `bulk_export_${Date.now()}`;

    try {
      if (!Array.isArray(spreadsheets) || spreadsheets.length === 0) {
        throw new Error('No spreadsheets provided for bulk export');
      }

      const operation = {
        id: operationId,
        type: 'bulk_export',
        status: 'processing',
        totalSpreadsheets: spreadsheets.length,
        processedSpreadsheets: 0,
        successfulExports: 0,
        failedExports: 0,
        currentSpreadsheet: null,
        progress: 0,
        startTime: Date.now(),
        endTime: null,
        results: [],
        errors: [],
        cancelRequested: false,
        onProgress: options.onProgress || (() => {}),
        onComplete: options.onComplete || (() => {}),
        onError: options.onError || (() => {})
      };

      this.operations.set(operationId, operation);

      logger.info(LogComponent.UI_COMPONENT, 'bulk_export_started', 'Bulk export operation started', {
        operationId,
        spreadsheetCount: spreadsheets.length
      });

      // Process spreadsheets sequentially
      for (let i = 0; i < spreadsheets.length; i++) {
        if (operation.cancelRequested) {
          logger.info(LogComponent.UI_COMPONENT, 'bulk_export_cancelled', 'Bulk export cancelled by user', {
            operationId
          });
          operation.status = 'cancelled';
          break;
        }

        const spreadsheet = spreadsheets[i];
        operation.currentSpreadsheet = spreadsheet.title || `Spreadsheet_${i + 1}`;

        try {
          logger.info(LogComponent.UI_COMPONENT, 'bulk_export_processing', `Processing spreadsheet ${i + 1} of ${spreadsheets.length}`, {
            operationId,
            title: operation.currentSpreadsheet
          });

          // Export spreadsheet
          await this.importExportService.exportToExcel(spreadsheet, {
            title: spreadsheet.title,
            format: options.format || 'xlsx'
          });

          operation.results.push({
            title: spreadsheet.title,
            status: 'success',
            timestamp: Date.now()
          });

          operation.successfulExports++;
        } catch (error) {
          logger.warn(LogComponent.UI_COMPONENT, 'bulk_export_error', `Failed to export spreadsheet`, {
            operationId,
            title: spreadsheet.title,
            error: error.message
          });

          operation.errors.push({
            title: spreadsheet.title,
            error: error.message,
            timestamp: Date.now()
          });

          operation.failedExports++;
        }

        operation.processedSpreadsheets++;
        operation.progress = Math.round((operation.processedSpreadsheets / operation.totalSpreadsheets) * 100);

        // Call progress callback
        operation.onProgress({
          operationId,
          progress: operation.progress,
          processedSpreadsheets: operation.processedSpreadsheets,
          totalSpreadsheets: operation.totalSpreadsheets,
          currentSpreadsheet: operation.currentSpreadsheet,
          successfulExports: operation.successfulExports,
          failedExports: operation.failedExports
        });
      }

      operation.endTime = Date.now();
      operation.status = operation.errors.length > 0 && operation.successfulExports === 0 ? 'failed' : 'completed';

      logger.info(LogComponent.UI_COMPONENT, 'bulk_export_completed', 'Bulk export operation completed', {
        operationId,
        successfulExports: operation.successfulExports,
        failedExports: operation.failedExports,
        duration: operation.endTime - operation.startTime
      });

      // Call completion callback
      operation.onComplete({
        operationId,
        status: operation.status,
        successfulExports: operation.successfulExports,
        failedExports: operation.failedExports,
        results: operation.results,
        errors: operation.errors
      });

      return operationId;
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'bulk_export_error', 'Bulk export operation failed', {
        operationId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Cancel an ongoing bulk operation
   * @param {String} operationId - Operation ID to cancel
   */
  cancelOperation(operationId) {
    const operation = this.operations.get(operationId);
    if (operation && operation.status === 'processing') {
      operation.cancelRequested = true;
      logger.info(LogComponent.UI_COMPONENT, 'bulk_operation_cancel_requested', 'Bulk operation cancel requested', {
        operationId
      });
    }
  }

  /**
   * Get operation status
   * @param {String} operationId - Operation ID
   * @returns {Object} Operation status
   */
  getOperationStatus(operationId) {
    const operation = this.operations.get(operationId);
    if (!operation) return null;

    return {
      id: operation.id,
      type: operation.type,
      status: operation.status,
      progress: operation.progress,
      processedFiles: operation.processedFiles || operation.processedSpreadsheets || 0,
      totalFiles: operation.totalFiles || operation.totalSpreadsheets || 0,
      successCount: operation.successfulFiles || operation.successfulExports || 0,
      failureCount: operation.failedFiles || operation.failedExports || 0,
      currentItem: operation.currentFile || operation.currentSpreadsheet,
      startTime: operation.startTime,
      endTime: operation.endTime,
      duration: operation.endTime ? operation.endTime - operation.startTime : null
    };
  }

  /**
   * Get all operations
   * @returns {Array} All operations
   */
  getAllOperations() {
    return Array.from(this.operations.values());
  }

  /**
   * Clear completed operations from memory
   */
  clearCompletedOperations() {
    for (const [id, operation] of this.operations.entries()) {
      if (operation.status === 'completed' || operation.status === 'failed' || operation.status === 'cancelled') {
        this.operations.delete(id);
      }
    }

    logger.info(LogComponent.UI_COMPONENT, 'bulk_operations_cleared', 'Completed bulk operations cleared');
  }

  /**
   * Get operation results
   * @param {String} operationId - Operation ID
   * @returns {Object} Operation results
   */
  getOperationResults(operationId) {
    const operation = this.operations.get(operationId);
    if (!operation) return null;

    return {
      id: operation.id,
      type: operation.type,
      status: operation.status,
      results: operation.results,
      errors: operation.errors,
      summary: {
        total: operation.results.length + operation.errors.length,
        successful: operation.results.length,
        failed: operation.errors.length,
        duration: operation.endTime - operation.startTime
      }
    };
  }
}

export default BulkOperationsService;
