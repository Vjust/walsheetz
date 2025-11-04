/**
 * Interface for storage operations
 */
export class IStorageService {
  /**
   * Save spreadsheet data
   * @param {Object} data - Spreadsheet data
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async saveData(data) {
    throw new Error('saveData method must be implemented')
  }

  /**
   * Load spreadsheet data
   * @returns {Promise<Object>} Spreadsheet data
   */
  async loadData() {
    throw new Error('loadData method must be implemented')
  }

  /**
   * Get edit history for a cell
   * @param {number} row - Row index
   * @param {number} col - Column index
   * @returns {Array} Edit history
   */
  getCellHistory(row, col) {
    throw new Error('getCellHistory method must be implemented')
  }

  /**
   * Clear all data
   * @returns {Promise<void>}
   */
  async clearData() {
    throw new Error('clearData method must be implemented')
  }
}