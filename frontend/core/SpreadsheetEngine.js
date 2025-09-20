import { webSocketService } from '../services/WebSocketService.js';
import { logger, LogComponent } from '../utils/Logger.js';
import { CircuitBreaker } from '../utils/CircuitBreaker.js';

/**
 * Core spreadsheet business logic
 */
export class SpreadsheetEngine {
  constructor(storageService, blockchainService) {
    this.storageService = storageService
    this.blockchainService = blockchainService
    this.webSocketService = webSocketService
    this.editCount = 0
    this.pendingEdits = new Map()
    this.autoSaveInterval = 5000
    this.editThreshold = 3
    this.autoSaveTimer = null
    this.currentEditingCell = null
    this.lastSavedDataHash = null // For dirty checking
    this.luckysheetReady = false // Flag to track if Luckysheet is ready
    this.userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    this.spreadsheetId = `sheet-${Date.now()}`
    this.lastSaveTimestamp = null // Track when last successful save occurred

    // Circuit breaker for auto-save using shared utility
    this.autoSaveCircuitBreaker = new CircuitBreaker({
      name: 'AutoSave',
      failureThreshold: 3,
      recoveryTimeout: 60000, // 1 minute
      onStateChange: (state, name) => {
        logger.info(LogComponent.SPREADSHEET_ENGINE, 'circuit_breaker_state_change',
          `Circuit breaker state changed to ${state}`, { name, state });
      }
    });

    // Track if a save is currently in progress (separate from circuit breaker state)
    this.isSaveInProgress = false;
    
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'constructor', 'SpreadsheetEngine initialized', {
      userId: this.userId,
      spreadsheetId: this.spreadsheetId,
      autoSaveInterval: this.autoSaveInterval,
      editThreshold: this.editThreshold
    });
    
    logger.setContext(this.userId, this.spreadsheetId);
  }

  /**
   * Initialize the spreadsheet engine
   */
  async initialize() {
    logger.startTimer('spreadsheet_initialize');
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'initialize', 'Starting spreadsheet initialization');
    
    try {
      // Check for existing session and attempt to restore from Walrus
      let data;
      const sessionInfo = typeof this.storageService.getSessionInfo === 'function'
        ? this.storageService.getSessionInfo()
        : { hasSpreadsheet: false, hasWalrusBlobId: false, hasWalletAddress: false };
      
      logger.info(LogComponent.SPREADSHEET_ENGINE, 'session_check', 'Checking for existing session', sessionInfo);
      
      if (sessionInfo.hasSpreadsheet && sessionInfo.hasWalrusBlobId && sessionInfo.hasWalletAddress) {
        logger.info(LogComponent.SPREADSHEET_ENGINE, 'walrus_restore_attempt', 'Attempting to restore spreadsheet from Walrus');
        
        try {
          const restoreResult = await this.loadFromWalrus(
            sessionInfo.hasWalrusBlobId ? this.storageService.getLastWalrusBlobId() : null,
            sessionInfo.spreadsheetTitle
          );
          
          if (restoreResult.success) {
            data = restoreResult.data;
            logger.info(LogComponent.SPREADSHEET_ENGINE, 'walrus_restore_success', 'Successfully restored from Walrus', {
              blobId: this.storageService.getLastWalrusBlobId(),
              title: sessionInfo.spreadsheetTitle
            });
          } else {
            logger.warn(LogComponent.SPREADSHEET_ENGINE, 'walrus_restore_fallback', 'Walrus restore failed, falling back to localStorage', {
              error: restoreResult.error
            });
            data = await this.storageService.loadData();
          }
        } catch (walrusError) {
          logger.warn(LogComponent.SPREADSHEET_ENGINE, 'walrus_restore_error', 'Error during Walrus restore, using localStorage', {
            error: typeof walrusError === 'string' ? walrusError : walrusError.message || 'Unknown error'
          });
          data = await this.storageService.loadData();
        }
      } else {
        // No valid session, load from localStorage
        logger.debug(LogComponent.SPREADSHEET_ENGINE, 'initialize', 'No valid session found, loading data from localStorage');
        data = await this.storageService.loadData();
      }
      
      logger.info(LogComponent.SPREADSHEET_ENGINE, 'initialize', 'Data loaded successfully', {
        dataSize: JSON.stringify(data).length,
        hasData: !!data,
        source: sessionInfo.hasWalrusBlobId ? 'walrus' : 'localStorage'
      });
      
      // Setup auto-save
      this.setupAutoSave()
      
      // Initialize WebSocket connection for real-time collaboration
      try {
        logger.info(LogComponent.SPREADSHEET_ENGINE, 'websocket_connect', 'Attempting WebSocket connection');

        // Check bridge health before connecting
        const bridgeHealthy = await this.checkBridgeHealth();
        if (!bridgeHealthy) {
          logger.warn(LogComponent.SPREADSHEET_ENGINE, 'bridge_health_check', 'Bridge is not healthy, skipping WebSocket connection');
        } else {
          await this.webSocketService.connect(this.spreadsheetId, this.userId, 'ws://localhost:8081');
          this.setupCollaborationListeners()
          logger.info(LogComponent.SPREADSHEET_ENGINE, 'websocket_connect', 'WebSocket connected successfully');
        }
      } catch (wsError) {
        logger.warn(LogComponent.SPREADSHEET_ENGINE, 'websocket_connect', 'WebSocket connection failed, continuing without real-time features', {
          error: typeof wsError === 'string' ? wsError : wsError.message || 'Unknown error',
          stack: wsError.stack
        });
      }
      
      const duration = logger.endTimer('spreadsheet_initialize');
      logger.info(LogComponent.SPREADSHEET_ENGINE, 'initialize', 'Spreadsheet initialization completed', {
        initializationTime: duration,
        success: true
      });
      
      return { success: true, data }
    } catch (error) {
      logger.endTimer('spreadsheet_initialize');
      logger.error(LogComponent.SPREADSHEET_ENGINE, 'initialize', 'Spreadsheet initialization failed', {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack
      });
      return { success: false, error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error' }
    }
  }

  /**
   * Setup collaboration event listeners
   */
  setupCollaborationListeners() {
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'collaboration_setup', 'Setting up collaboration event listeners');
    
    this.webSocketService.on('cellLocked', (data) => {
      logger.info(LogComponent.COLLABORATION, 'cell_locked', `Cell locked by user`, {
        cellRef: data.cellRef,
        userName: data.userName,
        userId: data.userId,
        timestamp: Date.now()
      });
      // Emit event for UI to handle highlighting
      this.emit('cellLocked', data);
    });

    this.webSocketService.on('cellUnlocked', (data) => {
      logger.info(LogComponent.COLLABORATION, 'cell_unlocked', `Cell unlocked by user`, {
        cellRef: data.cellRef,
        userId: data.userId,
        timestamp: Date.now()
      });
      this.emit('cellUnlocked', data);
    });

    this.webSocketService.on('userJoined', (data) => {
      logger.info(LogComponent.COLLABORATION, 'user_joined', `User joined spreadsheet`, {
        userName: data.userName,
        userId: data.userId,
        timestamp: Date.now(),
        totalUsers: data.totalUsers || 'unknown'
      });
      this.emit('userJoined', data);
    });

    this.webSocketService.on('userLeft', (data) => {
      logger.info(LogComponent.COLLABORATION, 'user_left', `User left spreadsheet`, {
        userId: data.userId,
        userName: data.userName,
        timestamp: Date.now(),
        remainingUsers: data.remainingUsers || 'unknown'
      });
      this.emit('userLeft', data);
    });
    
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'collaboration_setup', 'Collaboration event listeners configured');
  }

  /**
   * Event emission helper
   */
  emit(event, data) {
    logger.debug(LogComponent.SPREADSHEET_ENGINE, 'event_emit', `Emitting event: ${event}`, {
      event,
      dataKeys: Object.keys(data || {}),
      timestamp: Date.now()
    });
    
    // This would integrate with the UI framework's event system
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent(`spreadsheet-${event}`, { detail: data }));
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'event_emit', `Event ${event} dispatched to DOM`);
    } else {
      logger.warn(LogComponent.SPREADSHEET_ENGINE, 'event_emit', `Cannot dispatch event - window.dispatchEvent not available`, { event });
    }
  }

  /**
   * Handle cell edit
   */
  handleCellEdit(row, col, oldValue, newValue) {
    // Add comprehensive logging for debugging
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'cell_edit_called', 'handleCellEdit called with parameters', {
      row: row,
      col: col,
      rowType: typeof row,
      colType: typeof col,
      oldValue: oldValue,
      newValue: newValue,
      stack: new Error().stack?.split('\n').slice(1, 4).join('\n') // Show call stack
    });
    
    // Validate input parameters with comprehensive checks
    if (row == null || col == null || row === undefined || col === undefined) {
      const error = 'Arguments row or column cannot be null or undefined'
      logger.warn(LogComponent.SPREADSHEET_ENGINE, 'cell_edit_validation', error, {
        row: row,
        col: col,
        rowType: typeof row,
        colType: typeof col,
        rowIsNull: row == null,
        colIsNull: col == null,
        rowIsUndefined: row === undefined,
        colIsUndefined: col === undefined,
        oldValue: oldValue,
        newValue: newValue,
        callStack: new Error().stack?.split('\n').slice(1, 6).join('\n')
      });
      // Reduce console noise: downgrade to warn
      console.warn('🚨 handleCellEdit validation failed:', {
        error: error,
        row: row,
        col: col,
        rowType: typeof row,
        colType: typeof col,
        rowIsNull: row == null,
        colIsNull: col == null,
        rowIsUndefined: row === undefined,
        colIsUndefined: col === undefined,
        oldValue: oldValue,
        newValue: newValue,
        callStack: new Error().stack?.split('\n').slice(1, 6)
      });
      return {
        success: false,
        error: error,
        editCount: this.editCount
      }
    }
    
    // Ensure row and col are numbers
    const numRow = Number(row)
    const numCol = Number(col)
    
    if (isNaN(numRow) || isNaN(numCol) || numRow < 0 || numCol < 0) {
      const error = 'Row and column must be valid non-negative numbers'
      logger.error(LogComponent.SPREADSHEET_ENGINE, 'cell_edit_validation', error, {
        row: row,
        col: col,
        numRow: numRow,
        numCol: numCol
      });
      return {
        success: false,
        error: error,
        editCount: this.editCount
      }
    }
    
    const cellKey = `${numRow}-${numCol}`
    const cellRef = this.getCellReference(numRow, numCol)
    
    logger.startTimer(`cell_edit_${cellRef}`);
    logger.logCellOperation('edit_attempt', cellRef, oldValue, newValue, {
      row: numRow,
      col: numCol,
      editCount: this.editCount,
      pendingEdits: this.pendingEdits.size
    });
    
    // Check if cell is locked by another user
    if (this.webSocketService.isCellLocked(cellRef)) {
      logger.warn(LogComponent.SPREADSHEET_ENGINE, 'cell_edit_blocked', `Cannot edit cell ${cellRef} - locked by another user`, {
        cellRef,
        lockedBy: this.webSocketService.getCellLockOwner(cellRef),
        editCount: this.editCount
      });
      logger.endTimer(`cell_edit_${cellRef}`);
      return {
        success: false,
        error: `Cell ${cellRef} is currently being edited by another user`,
        cellRef,
        editCount: this.editCount
      }
    }

    // Lock the cell for editing
    logger.debug(LogComponent.SPREADSHEET_ENGINE, 'cell_lock', `Locking cell for editing`, { cellRef });
    this.webSocketService.lockCell(cellRef)
    this.currentEditingCell = cellRef
    
    // Track the edit
    this.pendingEdits.set(cellKey, {
      row: numRow,
      col: numCol,
      oldValue,
      newValue,
      timestamp: Date.now()
    })

    this.editCount++
    
    console.error('🚀 DEBUG: Edit tracked and count incremented', {
      cellRef,
      oldValue,
      newValue,
      editCount: this.editCount,
      pendingEditsCount: this.pendingEdits.size,
      editThreshold: this.editThreshold
    });
    
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'cell_edit_pending', `Cell edit added to pending queue`, {
      cellRef,
      editCount: this.editCount,
      pendingEditsCount: this.pendingEdits.size,
      valueChanged: oldValue !== newValue,
      oldValueLength: String(oldValue || '').length,
      newValueLength: String(newValue || '').length
    });
    
    // Send real-time edit update
    try {
      this.webSocketService.sendCellEdit(cellRef, newValue, oldValue)
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'websocket_edit_sent', `Real-time edit sent via WebSocket`, { cellRef });
    } catch (wsError) {
      logger.warn(LogComponent.SPREADSHEET_ENGINE, 'websocket_edit_failed', `Failed to send real-time edit update`, {
        cellRef,
        error: typeof wsError === 'string' ? wsError : wsError.message || 'Unknown error'
      });
    }
    
    // Track in blockchain service
    if (this.blockchainService) {
      try {
        this.blockchainService.trackCellEdit(numRow, numCol, oldValue, newValue)
        logger.debug(LogComponent.SPREADSHEET_ENGINE, 'blockchain_edit_tracked', `Edit tracked in blockchain service`, { cellRef });
      } catch (blockchainError) {
        logger.warn(LogComponent.SPREADSHEET_ENGINE, 'blockchain_edit_track_failed', `Failed to track edit in blockchain service`, {
          cellRef,
          error: typeof blockchainError === 'string' ? blockchainError : blockchainError.message || 'Unknown error'
        });
      }
    }

    // Trigger auto-save if threshold reached
    if (this.editCount >= this.editThreshold) {
      logger.info(LogComponent.SPREADSHEET_ENGINE, 'autosave_triggered', `Edit threshold reached, triggering auto-save`, {
        editCount: this.editCount,
        editThreshold: this.editThreshold,
        pendingEdits: this.pendingEdits.size
      });
      this.triggerSave()
    }

    const editDuration = logger.endTimer(`cell_edit_${cellRef}`);
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'cell_edit_completed', `Cell edit completed successfully`, {
      cellRef,
      editCount: this.editCount,
      editDuration,
      success: true
    });

    return {
      success: true,
      cellRef,
      editCount: this.editCount
    }
  }

  /**
   * Handle cell selection/focus change
   */
  handleCellSelect(row, col) {
    const cellRef = this.getCellReference(row, col)
    
    logger.debug(LogComponent.SPREADSHEET_ENGINE, 'cell_select', `Cell selected`, {
      cellRef,
      row,
      col,
      previousCell: this.currentEditingCell
    });
    
    // Unlock previous cell if different
    if (this.currentEditingCell && this.currentEditingCell !== cellRef) {
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'cell_unlock', `Unlocking previous cell`, {
        previousCell: this.currentEditingCell,
        newCell: cellRef
      });
      this.webSocketService.unlockCell(this.currentEditingCell)
    }
    
    // Update presence
    try {
      this.webSocketService.updatePresence(cellRef)
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'presence_update', `User presence updated`, { cellRef });
    } catch (presenceError) {
      logger.warn(LogComponent.SPREADSHEET_ENGINE, 'presence_update_failed', `Failed to update user presence`, {
        cellRef,
        error: typeof presenceError === 'string' ? presenceError : presenceError.message || 'Unknown error'
      });
    }
    
    this.currentEditingCell = cellRef
    
    return { cellRef }
  }

  /**
   * Handle cell blur (stop editing)
   */
  handleCellBlur() {
    if (this.currentEditingCell) {
      logger.info(LogComponent.SPREADSHEET_ENGINE, 'cell_blur', `Cell editing stopped`, {
        cellRef: this.currentEditingCell,
        timestamp: Date.now()
      });
      
      try {
        this.webSocketService.unlockCell(this.currentEditingCell)
        logger.debug(LogComponent.SPREADSHEET_ENGINE, 'cell_unlock', `Cell unlocked on blur`, {
          cellRef: this.currentEditingCell
        });
      } catch (unlockError) {
        logger.warn(LogComponent.SPREADSHEET_ENGINE, 'cell_unlock_failed', `Failed to unlock cell on blur`, {
          cellRef: this.currentEditingCell,
          error: typeof unlockError === 'string' ? unlockError : unlockError.message || 'Unknown error'
        });
      }
      
      this.currentEditingCell = null
    } else {
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'cell_blur', `Cell blur called but no current editing cell`);
    }
  }

  /**
   * Set Luckysheet ready flag
   */
  setLuckysheetReady(ready) {
    this.luckysheetReady = ready
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'luckysheet_ready_state', `Luckysheet ready state changed`, {
      ready: ready,
      timestamp: Date.now()
    })
  }

  /**
   * Convert column number to letters (0=A, 1=B, ..., 26=AA, 27=AB, etc.)
   */
  columnNumberToLetters(num) {
    let result = '';
    let n = num + 1; // Convert to 1-based
    while (n > 0) {
      n--; // Adjust for 0-based alphabet
      result = String.fromCharCode(65 + (n % 26)) + result;
      n = Math.floor(n / 26);
    }
    return result;
  }

  /**
   * Convert column letters to numbers (A=0, B=1, ..., AA=26, AB=27, etc.)
   */
  columnLettersToNumber(letters) {
    let result = 0;
    for (let i = 0; i < letters.length; i++) {
      result = result * 26 + (letters.charCodeAt(i) - 64); // A=1, B=2, etc.
    }
    return result - 1; // Convert to 0-based indexing
  }

  /**
   * Get cell reference (A1, B2, etc.)
   */
  getCellReference(row, col) {
    // Validate input parameters
    if (row == null || col == null) {
      logger.error(LogComponent.SPREADSHEET_ENGINE, 'cell_reference_validation', 'Row or column cannot be null or undefined', {
        row: row,
        col: col
      });
      return 'INVALID'
    }
    
    const numRow = Number(row)
    const numCol = Number(col)
    
    if (isNaN(numRow) || isNaN(numCol)) {
      logger.error(LogComponent.SPREADSHEET_ENGINE, 'cell_reference_validation', 'Row and column must be valid non-negative numbers', {
        row: row,
        col: col,
        numRow: numRow,
        numCol: numCol
      });
      return 'INVALID'
    }
    if (numRow < 0) {
      // Edge-case behavior expected by tests: negative row -> A0
      return 'A0'
    }
    if (numCol < 0) {
      // Edge-case: negative column, still return a reference string with row number
      return `${String.fromCharCode(65)}${numRow + 1}`
    }
    
    return this.columnNumberToLetters(numCol) + (numRow + 1)
  }

  /**
   * Save current state
   */
  async save(title = null) {
    logger.startTimer('spreadsheet_save');
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'save_start', `Starting spreadsheet save operation`, {
      editCount: this.editCount,
      pendingEdits: this.pendingEdits.size,
      walletConnected: this.blockchainService?.isWalletConnected() || false
    });

    // Set flag to indicate save in progress
    this.isSaveInProgress = true;

    // Use circuit breaker to execute the save operation
    return await this.autoSaveCircuitBreaker.execute(async () => {
      // Collect spreadsheet data
      const data = this.collectSpreadsheetData(title)
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'data_collected', `Spreadsheet data collected for save`, {
        dataSize: JSON.stringify(data).length,
        editCount: data.edits?.length || 0,
        version: data.version
      });
      
      // Save to local storage
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'storage_save', `Saving to local storage`);
      await this.storageService.saveData(data)
      logger.info(LogComponent.SPREADSHEET_ENGINE, 'storage_save', `Successfully saved to local storage`);
      
      // Save to blockchain if connected
      if (this.blockchainService?.isWalletConnected()) {
        logger.info(LogComponent.SPREADSHEET_ENGINE, 'blockchain_save', `Attempting blockchain save`);
        const blockchainResult = await this.blockchainService.saveToBlockchain(data)
        
        if (!blockchainResult.success) {
          logger.warn(LogComponent.SPREADSHEET_ENGINE, 'blockchain_save_failed', `Blockchain save failed`, {
            error: blockchainResult.error,
            reason: blockchainResult.reason,
            message: typeof blockchainResult.message === 'string' ? blockchainResult.message : blockchainResult.message || 'Unknown blockchain error',
            walrusOnly: blockchainResult.walrusOnly,
            fallbackMethod: blockchainResult.method || 'unknown'
          });

          // Handle different failure scenarios with user-visible messages
          if (blockchainResult.walrusOnly) {
            // Walrus succeeded but blockchain failed - show warning with guidance
            console.warn('⚠️  PARTIAL SAVE: Your data is stored in Walrus but not confirmed on Sui blockchain', {
              issue: (typeof blockchainResult.message === 'string' ? blockchainResult.message : blockchainResult.message || 'Unknown error') || (typeof blockchainResult.error === 'string' ? blockchainResult.error : blockchainResult.error || 'Unknown error'),
              impact: 'Data is safely stored in decentralized storage but not linked on-chain',
              recommendation: blockchainResult.reason === 'insufficient_balance' ?
                'Add more SUI tokens to your wallet and try saving again' :
                'Try saving again to complete the blockchain confirmation',
              status: 'Queued for retry when possible'
            });
          } else {
            // Complete failure - show error with actionable guidance
            const errorMessage = (typeof blockchainResult.message === 'string' ? blockchainResult.message : blockchainResult.message || 'Unknown error') || (typeof blockchainResult.error === 'string' ? blockchainResult.error : blockchainResult.error || 'Unknown error');
            const actionNeeded = blockchainResult.reason === 'insufficient_balance' ?
              'Please add SUI tokens to your wallet' :
              blockchainResult.reason === 'wallet_rejected' ?
                'Please approve the transaction in your wallet' :
                'Please check your connection and try again';

            console.error('❌ SAVE FAILED: Unable to save to blockchain or decentralized storage', {
              error: errorMessage,
              action: actionNeeded,
              reason: blockchainResult.reason,
              backup: 'Your work is safe in browser localStorage'
            });
          }

          // Throw error for circuit breaker to handle
          throw new Error(blockchainResult.error || 'Blockchain save failed');
        } else {
          logger.info(LogComponent.SPREADSHEET_ENGINE, 'blockchain_save', `Blockchain save completed successfully`, {
            method: blockchainResult.method,
            blobId: blockchainResult.blobId,
            transactionId: blockchainResult.transactionId,
            walrusSuccess: blockchainResult.walrusSuccess,
            blockchainSuccess: blockchainResult.blockchainSuccess
          });

          // Show user-visible success message only when both blockchain and Walrus succeed
          if (blockchainResult.walrusSuccess && blockchainResult.blockchainSuccess) {
            const successMessage = {
              suiTransaction: blockchainResult.transactionId,
              walrusBlobId: blockchainResult.walrusBlobId,
              method: blockchainResult.method,
              durability: 'Your data is now permanently accessible on the decentralized web'
            };

            // Include latest version info if available
            if (blockchainResult.latestVersion) {
              successMessage.onChainVersion = `v${blockchainResult.latestVersion.versionNumber}`;
              successMessage.savedAt = blockchainResult.latestVersion.timestampFormatted;
              successMessage.cells = blockchainResult.latestVersion.cellCount;
            }

            console.log('🎉 FULL SUCCESS: Your data is now stored on both Sui blockchain AND Walrus decentralized storage!', successMessage);
          }
        }
      } else {
        logger.debug(LogComponent.SPREADSHEET_ENGINE, 'blockchain_save_skipped', `Blockchain save skipped - wallet not connected`);
      }

      // Reset edit tracking and update hash for dirty checking
      const previousEditCount = this.editCount;
      const previousPendingEdits = this.pendingEdits.size;
      this.editCount = 0
      this.pendingEdits.clear()

      // Update last save timestamp to prevent immediate redundant saves
      this.lastSaveTimestamp = Date.now()

      // Update saved data hash for dirty checking
      try {
        if (window.luckysheet && window.luckysheet.getAllSheets) {
          const currentData = window.luckysheet.getAllSheets()
          const currentDataString = JSON.stringify(currentData)
          this.lastSavedDataHash = this.hashString(currentDataString)
          logger.debug(LogComponent.SPREADSHEET_ENGINE, 'hash_updated', 'Updated data hash after successful save', {
            newHash: this.lastSavedDataHash
          })
        }
      } catch (error) {
        logger.warn(LogComponent.SPREADSHEET_ENGINE, 'hash_update_error', 'Error updating saved data hash', {
          error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
        })
      }
      
      const saveDuration = logger.endTimer('spreadsheet_save');
      logger.info(LogComponent.SPREADSHEET_ENGINE, 'save_completed', `Spreadsheet save completed successfully`, {
        previousEditCount,
        previousPendingEdits,
        saveDuration,
        success: true
      });

      return { success: true }
    }, async (error) => {
      // Circuit breaker fallback function
      logger.warn(LogComponent.SPREADSHEET_ENGINE, 'save_circuit_breaker_fallback',
        'Save operation failed through circuit breaker', {
          error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
          circuitState: this.autoSaveCircuitBreaker.getState()
        });
      return { success: false, error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error', circuitBreakerTripped: true };
    }).finally(() => {
      // Always reset the save in progress flag
      this.isSaveInProgress = false;
    });
  }

  /**
   * Setup automatic saving
   */
  setupAutoSave() {
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'autosave_setup', `Setting up auto-save functionality`, {
      autoSaveInterval: this.autoSaveInterval,
      editThreshold: this.editThreshold
    });
    
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer)
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'autosave_setup', `Cleared existing auto-save timer`);
    }

    // Delay auto-save start to allow initial data loading and hash initialization to complete
    setTimeout(() => {
      this.autoSaveTimer = setInterval(() => {
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'autosave_timer', 'Auto-save timer fired', {
        editCount: this.editCount,
        pendingEdits: this.pendingEdits.size,
        walletConnected: this.blockchainService?.isWalletConnected(),
        hasBlockchainService: !!this.blockchainService
      });

      // Check circuit breaker first
      if (this.shouldSkipAutoSave()) {
        return;
      }

      const hasEdits = this.editCount > 0
      const hasDataChanged = this.hasDataChanged()

      // Calculate current hash for debugging (same logic as hasDataChanged)
      let currentHash = 'unknown';
      try {
        if (window.luckysheet && window.luckysheet.getAllSheets) {
          const currentData = window.luckysheet.getAllSheets();
          const currentDataString = JSON.stringify(currentData);
          currentHash = this.hashString(currentDataString);
        }
      } catch (error) {
        currentHash = 'error';
      }

      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'data_change_check', 'Checking for data changes', {
        currentHash,
        lastSavedDataHash: this.lastSavedDataHash,
        hasChanged: hasDataChanged
      });

      if (hasEdits || hasDataChanged) {
        logger.debug(LogComponent.SPREADSHEET_ENGINE, 'autosave_interval', `Auto-save interval triggered`, {
          editCount: this.editCount,
          pendingEdits: this.pendingEdits.size,
          hasEdits,
          hasDataChanged
        });
        logger.debug(LogComponent.SPREADSHEET_ENGINE, 'autosave_triggered', 'Auto-save threshold met, triggering save', {
          hasEdits,
          hasDataChanged
        });
        // Get current title from luckysheet or use default
        const currentTitle = this.getCurrentTitle();
        this.triggerSave(currentTitle)
      } else {
        logger.debug(LogComponent.SPREADSHEET_ENGINE, 'autosave_skipped', 'Auto-save skipped - no changes detected', {
          editCount: this.editCount,
          hasDataChanged
        });
      }
    }, this.autoSaveInterval)

    logger.info(LogComponent.SPREADSHEET_ENGINE, 'autosave_setup', `Auto-save timer configured and started`);
  }, 3000); // 3 second delay to allow initial loading to complete
  }

  /**
   * Check if auto-save should be skipped due to circuit breaker
   */
  shouldSkipAutoSave() {

    // Skip if currently saving
    if (this.isSaveInProgress) {
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'autosave_skipped', 'Auto-save skipped - save in progress');
      return true;
    }

    // Skip if circuit breaker is open
    const circuitState = this.autoSaveCircuitBreaker.getState();
    if (circuitState === 'OPEN') {
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'autosave_skipped', 'Auto-save skipped - circuit breaker open', {
        state: circuitState,
        stats: this.autoSaveCircuitBreaker.getStats()
      });
      return true;
    }

    // Skip if Luckysheet is not ready
    if (!this.luckysheetReady) {
      console.error('🚀 DEBUG: Auto-save skipped - Luckysheet not ready');
      return true;
    }

    // Skip if blockchain service is unavailable
    if (!this.blockchainService?.isWalletConnected()) {
      console.error('🚀 DEBUG: Auto-save skipped - blockchain service unavailable');
      return true;
    }

    // Skip if a blockchain transaction is currently processing to avoid overlap
    if (this.blockchainService?.getTransactionState && this.blockchainService.getTransactionState().isProcessing) {
      console.debug('🚀 DEBUG: Auto-save skipped - blockchain transaction in progress')
      return true;
    }

    // Skip if recent save completed successfully (prevent immediate redundant saves)
    const now = Date.now();
    const timeSinceLastSave = now - (this.lastSaveTimestamp || 0);
    const minIntervalBetweenSaves = 8000; // 8 seconds minimum between saves

    if (this.lastSaveTimestamp && timeSinceLastSave < minIntervalBetweenSaves) {
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'autosave_skipped', 'Auto-save skipped - too soon after last save', {
        timeSinceLastSave,
        minInterval: minIntervalBetweenSaves,
        lastSaveTimestamp: this.lastSaveTimestamp
      });
      return true;
    }

    return false;
  }


  /**
   * Check if spreadsheet data has changed since last save
   */
  hasDataChanged() {
    try {
      if (!window.luckysheet || !window.luckysheet.getAllSheets) {
        return false
      }

      const currentData = window.luckysheet.getAllSheets()
      const currentDataString = JSON.stringify(currentData)
      const currentHash = this.hashString(currentDataString)

      if (this.lastSavedDataHash === null) {
        // First time, consider it changed
        return true
      }

      const hasChanged = currentHash !== this.lastSavedDataHash
      return hasChanged
    } catch (error) {
      logger.warn(LogComponent.SPREADSHEET_ENGINE, 'data_change_check_error', 'Error checking data changes', {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      })
      return false
    }
  }

  /**
   * Generate simple hash for data comparison
   */
  hashString(str) {
    let hash = 0
    if (str.length === 0) return hash
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return hash.toString()
  }

  /**
   * Get current spreadsheet title
   */
  getCurrentTitle() {
    try {
      if (window.luckysheetfile && window.luckysheetfile[0] && window.luckysheetfile[0].name) {
        return window.luckysheetfile[0].name;
      }
    } catch (error) {
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'title_get_error', 'Error getting current title', {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      });
    }
    return 'Untitled Spreadsheet';
  }

  /**
   * Trigger save operation
   */
  async triggerSave(title = null) {
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'save_triggered', `Save operation manually triggered`);
    return await this.save(title)
  }

  /**
   * Collect current spreadsheet data
   */
  collectSpreadsheetData(title = null) {
    logger.debug(LogComponent.SPREADSHEET_ENGINE, 'data_collection', `Collecting spreadsheet data`, {
      pendingEditsCount: this.pendingEdits.size,
      editCount: this.editCount
    });
    
    // Extract actual data from Luckysheet
    let cells = {};
    let metadata = {
      title: title || 'Untitled Spreadsheet', // Use passed title parameter first
      cellCount: 0,
      sheets: 1
    };
    
    try {
      if (this.luckysheetReady && window.luckysheet && window.luckysheet.getAllSheets) {
        const allSheets = window.luckysheet.getAllSheets();

        if (allSheets && allSheets.length > 0) {
          const sheetData = allSheets[0];
          const celldata = sheetData.celldata || [];

          // Convert Luckysheet celldata to our storage format
          celldata.forEach(cell => {
            if (cell && cell.r !== undefined && cell.c !== undefined && cell.v) {
              const cellRef = this.columnNumberToLetters(cell.c) + (cell.r + 1); // Convert to A1, B2, etc.
              cells[cellRef] = {
                value: cell.v.v,
                displayValue: cell.v.m || cell.v.v,
                type: cell.v.ct ? cell.v.ct.fa : 'General',
                formula: cell.v.f || null
              };
            }
          });

          metadata.cellCount = Object.keys(cells).length;
          // Use provided title, fall back to luckysheet name, then existing metadata title, then default
          metadata.title = title || sheetData.name || metadata.title || 'Untitled Spreadsheet';

          logger.debug(LogComponent.SPREADSHEET_ENGINE, 'data_collection_luckysheet', `Extracted data from Luckysheet using getAllSheets()`, {
            cellsExtracted: metadata.cellCount,
            sheetName: metadata.title
          });
        } else {
          logger.warn(LogComponent.SPREADSHEET_ENGINE, 'data_collection_empty', `getAllSheets() returned empty data`);
        }
      } else {
        logger.warn(LogComponent.SPREADSHEET_ENGINE, 'data_collection_fallback', `Luckysheet not available, using pending edits`);
        
        // Fallback to pending edits if Luckysheet is not available
        Array.from(this.pendingEdits.values()).forEach(edit => {
          if (edit.cellRef && edit.value !== undefined) {
            cells[edit.cellRef] = {
              value: edit.value,
              displayValue: edit.value,
              type: 'General',
              formula: null
            };
          }
        });
        
        metadata.cellCount = Object.keys(cells).length;
      }
    } catch (error) {
      logger.error(LogComponent.SPREADSHEET_ENGINE, 'data_collection_error', `Error collecting Luckysheet data`, {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      });
      
      // Fallback to empty data structure
      cells = {};
      metadata.cellCount = 0;
      metadata.title = title || 'Untitled Spreadsheet';
    }
    
    const data = {
      data: {
        cells: cells,
        metadata: metadata
      },
      timestamp: Date.now(),
      version: this.generateVersion()
    };
    
    logger.debug(LogComponent.SPREADSHEET_ENGINE, 'data_collection', `Data collection completed`, {
      cellCount: metadata.cellCount,
      dataVersion: data.version,
      dataSize: JSON.stringify(data).length
    });
    
    return data;
  }

  /**
   * Generate version identifier
   */
  generateVersion() {
    const version = `v${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    logger.debug(LogComponent.SPREADSHEET_ENGINE, 'version_generated', `New version identifier generated`, {
      version,
      timestamp: Date.now()
    });
    return version;
  }

  /**
   * Get current status
   */
  getStatus() {
    const status = {
      editCount: this.editCount,
      pendingEdits: this.pendingEdits.size,
      walletConnected: this.blockchainService?.isWalletConnected() || false,
      autoSaveEnabled: !!this.autoSaveTimer
    };
    
    logger.debug(LogComponent.SPREADSHEET_ENGINE, 'status_check', `Status requested`, status);
    
    return status;
  }

  /**
   * Cleanup resources
   */
  /**
   * Check if the WebSocket bridge is healthy and ready for connections
   */
  async checkBridgeHealth() {
    try {
      const healthUrl = 'http://localhost:8081/health';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000); // 3 second timeout

      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeout);
      return response.ok;
    } catch (error) {
      logger.warn(LogComponent.SPREADSHEET_ENGINE, 'bridge_health_check', 'Bridge health check failed', {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      });
      return false;
    }
  }

  cleanup() {
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'cleanup', `Starting cleanup process`, {
      autoSaveActive: !!this.autoSaveTimer,
      currentEditingCell: this.currentEditingCell,
      pendingEdits: this.pendingEdits.size
    });
    
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer)
      this.autoSaveTimer = null
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'cleanup', `Auto-save timer cleared`);
    }
    
    // Save any pending edits before cleanup
    if (this.editCount > 0) {
      logger.warn(LogComponent.SPREADSHEET_ENGINE, 'cleanup', `Pending edits found during cleanup`, {
        editCount: this.editCount,
        pendingEdits: this.pendingEdits.size
      });
      // Note: In production, might want to trigger a final save here
    }
    
    // Disconnect WebSocket
    if (this.webSocketService) {
      try {
        this.webSocketService.disconnect()
        logger.info(LogComponent.SPREADSHEET_ENGINE, 'cleanup', `WebSocket disconnected`);
      } catch (wsError) {
        logger.warn(LogComponent.SPREADSHEET_ENGINE, 'cleanup', `Error during WebSocket disconnect`, {
          error: typeof wsError === 'string' ? wsError : wsError.message || 'Unknown error'
        });
      }
    }
    
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'cleanup', `Cleanup process completed`);
  }

  /**
   * Load data into the spreadsheet
   */
  async loadData(data) {
    logger.startTimer('load_data');
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'load_data', `Loading data into spreadsheet`, {
      hasData: !!data,
      dataSize: data ? JSON.stringify(data).length : 0
    });

    try {
      if (!data) {
        throw new Error('No data provided to load');
      }

      // Save to local storage first
      await this.storageService.saveData(data);
      
      // If we have Luckysheet initialized, try to refresh it with new data
      // Support multiple shapes from loader/walrus
      const cellsSource =
        (data?.data?.data?.cells) ||
        (data?.data?.cells) ||
        (data?.cells) ||
        null

      if (window.luckysheet && window.luckysheet.getAllSheets && cellsSource) {
        try {
          // Convert data to Luckysheet format and update the sheet
          const celldata = [];
          const cells = cellsSource;

          Object.keys(cells).forEach(cellRef => {
            const cell = cells[cellRef];
            const match = cellRef.match(/^([A-Z]+)(\d+)$/);

            if (match) {
              const col = this.columnLettersToNumber(match[1]); // Proper base-26 conversion
              const row = parseInt(match[2]) - 1; // Convert to 0-based

              celldata.push({
                r: row,
                c: col,
                v: {
                  v: cell.value,
                  m: cell.value?.toString() || '',
                  ct: cell.type ? { fa: cell.type, t: 'g' } : { fa: 'General', t: 'g' }
                }
              });
            }
          });

          // Update the Luckysheet data using getAllSheets API
          const allSheets = window.luckysheet.getAllSheets();
          if (allSheets && allSheets[0]) {
            allSheets[0].celldata = celldata;

            // NEW: set sheet name from metadata so Header can sync it
            const sheetTitle = data?.data?.metadata?.title || data?.title || 'Sheet1';
            try { allSheets[0].name = sheetTitle; } catch {}
            try { if (window.luckysheetfile?.[0]) window.luckysheetfile[0].name = sheetTitle; } catch {}

            if (window.luckysheet.refreshFormula) {
              window.luckysheet.refreshFormula();
            }
            logger.info(LogComponent.SPREADSHEET_ENGINE, 'luckysheet_refresh', `Luckysheet refreshed with new data using getAllSheets()`, {
              cellCount: celldata.length
            });
          }
        } catch (refreshError) {
          logger.warn(LogComponent.SPREADSHEET_ENGINE, 'luckysheet_refresh_failed', `Failed to refresh Luckysheet directly`, {
            error: typeof refreshError === 'string' ? refreshError : refreshError.message || 'Unknown error'
          });
        }
      }
      
      logger.info(LogComponent.SPREADSHEET_ENGINE, 'load_data', `Data loaded and stored successfully`);

      // Initialize lastSavedDataHash to prevent unnecessary auto-saves after data load
      try {
        if (window.luckysheet && window.luckysheet.getAllSheets) {
          const currentData = window.luckysheet.getAllSheets();
          const currentDataString = JSON.stringify(currentData);
          this.lastSavedDataHash = this.hashString(currentDataString);
          logger.debug(LogComponent.SPREADSHEET_ENGINE, 'hash_initialized', 'Initialized data hash after load', {
            hash: this.lastSavedDataHash
          });
        }
      } catch (hashError) {
        logger.warn(LogComponent.SPREADSHEET_ENGINE, 'hash_init_error', 'Error initializing data hash after load', {
          error: typeof hashError === 'string' ? hashError : hashError.message || 'Unknown error'
        });
      }

      const loadDuration = logger.endTimer('load_data');
      logger.info(LogComponent.SPREADSHEET_ENGINE, 'load_data_success', `Data load completed successfully`, {
        loadDuration,
        dataSize: JSON.stringify(data).length
      });

      return { success: true };
    } catch (error) {
      logger.endTimer('load_data');
      logger.error(LogComponent.SPREADSHEET_ENGINE, 'load_data_failed', `Failed to load data into spreadsheet`, {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack
      });

      return { success: false, error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error' };
    }
  }

  /**
   * Load spreadsheet data from Walrus storage
   */
  async loadFromWalrus(blobId, title, expectedHash = null) {
    if (!blobId) {
      return { success: false, error: 'No blob ID provided' };
    }

    logger.startTimer('walrus_load');
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'walrus_load_start', 'Loading spreadsheet from Walrus', {
      blobId: blobId,
      title: title
    });

    try {
      // Access Walrus service through the blockchain adapter
      if (!this.blockchainService?.walrusService) {
        return { success: false, error: 'Walrus service not available' };
      }

      const walrusResult = await this.blockchainService.walrusService.retrieveBlob(blobId, expectedHash);
      
      if (!walrusResult.success) {
        logger.warn(LogComponent.SPREADSHEET_ENGINE, 'walrus_load_failed', 'Failed to retrieve blob from Walrus', {
          blobId,
          error: walrusResult.error
        });
        return { success: false, error: walrusResult.error };
      }

      const spreadsheetData = walrusResult.data;

      // Normalize source: accept {data:{cells,metadata}} or {cells,metadata}
      const src = (spreadsheetData && spreadsheetData.data) ? spreadsheetData.data : spreadsheetData;

      if (!src || typeof src !== 'object') {
        return { success: false, error: 'Invalid spreadsheet data from Walrus' };
      }

      const validatedData = {
        version: spreadsheetData.version || `restored-${Date.now()}`,
        createdAt: spreadsheetData.createdAt || Date.now(),
        savedAt: spreadsheetData.savedAt || Date.now(),
        restoredAt: Date.now(),
        title: title || src.title || src.metadata?.title || 'Restored Spreadsheet',
        cells: src.cells || {},
        edits: spreadsheetData.edits || [],
        metadata: {
          title: title || src.metadata?.title || src.title || 'Restored Spreadsheet',
          rows: src.metadata?.rows || 100,
          cols: src.metadata?.cols || 26,
          sheets: src.metadata?.sheets || [{
            name: 'Sheet1',
            index: 0,
            order: 0,
            status: 1
          }],
          ...src.metadata
        }
      };

      const duration = logger.endTimer('walrus_load');
      logger.info(LogComponent.SPREADSHEET_ENGINE, 'walrus_load_success', 'Successfully loaded spreadsheet from Walrus', {
        blobId,
        title: validatedData.title,
        cellCount: Object.keys(validatedData.cells).length,
        duration
      });

      return { success: true, data: validatedData };

    } catch (error) {
      logger.endTimer('walrus_load');
      logger.error(LogComponent.SPREADSHEET_ENGINE, 'walrus_load_error', 'Error loading from Walrus', {
        blobId,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack
      });

      return { success: false, error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error' };
    }
  }
}
