/**
 * Core spreadsheet business logic
 */
export class SpreadsheetEngine {
  constructor(storageService, blockchainService) {
    this.storageService = storageService
    this.blockchainService = blockchainService
    this.editCount = 0
    this.pendingEdits = new Map()
    this.autoSaveInterval = 5000
    this.editThreshold = 3
    this.autoSaveTimer = null
  }

  /**
   * Initialize the spreadsheet engine
   */
  async initialize() {
    try {
      const data = await this.storageService.loadData()
      this.setupAutoSave()
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Handle cell edit
   */
  handleCellEdit(row, col, oldValue, newValue) {
    const cellKey = `${row}-${col}`
    
    // Track the edit
    this.pendingEdits.set(cellKey, {
      row,
      col,
      oldValue,
      newValue,
      timestamp: Date.now()
    })

    this.editCount++
    
    // Track in blockchain service
    if (this.blockchainService) {
      this.blockchainService.trackCellEdit(row, col, oldValue, newValue)
    }

    // Trigger auto-save if threshold reached
    if (this.editCount >= this.editThreshold) {
      this.triggerSave()
    }

    return {
      cellRef: this.getCellReference(row, col),
      editCount: this.editCount
    }
  }

  /**
   * Get cell reference (A1, B2, etc.)
   */
  getCellReference(row, col) {
    return String.fromCharCode(65 + col) + (row + 1)
  }

  /**
   * Save current state
   */
  async save() {
    try {
      const data = this.collectSpreadsheetData()
      
      // Save to local storage
      await this.storageService.saveData(data)
      
      // Save to blockchain if connected
      if (this.blockchainService?.isWalletConnected()) {
        const blockchainResult = await this.blockchainService.saveToBlockchain(data)
        if (!blockchainResult.success) {
          console.warn('Blockchain save failed:', blockchainResult.error)
        }
      }

      this.editCount = 0
      this.pendingEdits.clear()
      
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Setup automatic saving
   */
  setupAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer)
    }

    this.autoSaveTimer = setInterval(() => {
      if (this.editCount > 0) {
        this.triggerSave()
      }
    }, this.autoSaveInterval)
  }

  /**
   * Trigger save operation
   */
  async triggerSave() {
    return await this.save()
  }

  /**
   * Collect current spreadsheet data
   */
  collectSpreadsheetData() {
    // This would integrate with Luckysheet to get actual data
    // For now, return pending edits
    return {
      edits: Array.from(this.pendingEdits.values()),
      timestamp: Date.now(),
      version: this.generateVersion()
    }
  }

  /**
   * Generate version identifier
   */
  generateVersion() {
    return `v${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      editCount: this.editCount,
      pendingEdits: this.pendingEdits.size,
      walletConnected: this.blockchainService?.isWalletConnected() || false,
      autoSaveEnabled: !!this.autoSaveTimer
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer)
      this.autoSaveTimer = null
    }
  }
}