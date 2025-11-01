// WebSocket service disabled for single-user MVP
// import { webSocketService } from '../services/WebSocketService.js';
import { logger, LogComponent } from "@/sdk/shared/utils/Logger.js";
import { defiStateManager } from "@/sdk/services/DeFiStateManager.js";
import { CircuitBreaker } from "@/sdk/shared/utils/CircuitBreaker.js";
import luckysheetApi from "@/sdk/services/luckysheetApi.js";
import { getSuiBalance, getSuiGasPrice, getSuiEpoch } from "@/sdk/services/formulas/SuiFunctions.js";
import { recordTelemetry } from "@/sdk/shared/utils/Telemetry.js";
import { FormulaRefreshScheduler } from "@/sdk/core/scheduling/FormulaRefreshScheduler.js";
import { OfflineQueueManager } from "@/sdk/core/queue/OfflineQueueManager.js";

/**
 * Core spreadsheet business logic
 */
export class SpreadsheetEngine {
  constructor(storageService, blockchainService, autoSaveEnabled = false, gridSizeManager = null) {
    this.storageService = storageService;
    this.blockchainService = blockchainService;
    // this.webSocketService = webSocketService; // Disabled for single-user MVP
    this.editCount = 0;
    this.pendingEdits = new Map();
    this.lastManualSaveTimestamp = null;
    this.lastEditTimestamp = null; // Will be set only when actual edits occur
    this.currentEditingCell = null;
    this.lastSavedDataHash = null; // For dirty checking
    this.luckysheetReady = false; // Flag to track if Luckysheet is ready
    this.userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.spreadsheetId = `sheet-${Date.now()}`;
    this.lastSaveTimestamp = null; // Track when last successful save occurred
    this.autoSaveEnabled = autoSaveEnabled; // Track auto-save state
    this.gridSizeManager = gridSizeManager; // Grid capacity manager for large imports

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

    // Smart auto-save configuration
    this.walrusAutoSaveInterval = 30000; // 30 seconds for Walrus-only saves
    this.blockchainCommitInterval = 300000; // 5 minutes before showing commit prompt
    this.commitReminderInterval = 60000; // Check every minute for reminder conditions
    this.walrusAutoSaveTimer = null;
    this.commitPromptTimer = null;
    this.lastWalrusSaveTimestamp = null;
    this.lastSuiCommitTimestamp = null;
    this.pendingWalrusSaves = [];
    this.pendingSuiCommit = null;
    this.saveStatus = 'ready'; // 'ready', 'saving_walrus', 'awaiting_commit', 'committing', 'synced'
    this.commitPromptState = {
      visible: false,
      suppressed: false,
      since: null,
      lastPromptedAt: null,
      metadata: null,
      snoozeUntil: null
    };

    // Store metadata from last successful save (for UI confirmation)
    this._lastSaveInfo = null;

    // Store partial save info (Walrus succeeded, blockchain failed)
    this._partialSaveInfo = null;

    // Offline queue state (synced from OfflineQueueManager for backward compatibility)
    this.isOnline = navigator.onLine;
    this.offlineQueue = { length: 0 }; // Facade - only exposes length
    this.offlineQueueProcessingTimer = null; // Facade - indicates if processing

    // Offline queue for disconnected saves (Phase 4: Extracted to OfflineQueueManager)
    this.offlineQueueManager = new OfflineQueueManager({
      onProcessItem: (item) => this.processOfflineQueueItem(item),
      onStateChange: (state) => this._syncOfflineState(state)
    });

    // Formula refresh scheduling (Phase 4: Extracted to FormulaRefreshScheduler)
    this.formulaScheduler = new FormulaRefreshScheduler();

    logger.info(LogComponent.SPREADSHEET_ENGINE, 'constructor', 'SpreadsheetEngine initialized', {
      userId: this.userId,
      spreadsheetId: this.spreadsheetId
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
      const sessionInfo = typeof this.storageService.getSessionInfo === 'function' ?
      this.storageService.getSessionInfo() :
      { hasSpreadsheet: false, hasWalrusBlobId: false, hasWalletAddress: false };

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

      // Load partial save info from storage adapter (Walrus succeeded, blockchain failed)
      if (this.storageService?.getPartialSaveInfo) {
        this._partialSaveInfo = this.storageService.getPartialSaveInfo();
        if (this._partialSaveInfo) {
          logger.info(LogComponent.SPREADSHEET_ENGINE, 'partial_save_restored',
          'Restored partial save from session', {
            blobId: this._partialSaveInfo.blobId,
            status: this._partialSaveInfo.status
          });
        }
      }

      // Initialize last edit timestamp as null - will be set only when actual edits occur
      // this.lastEditTimestamp remains null until first edit

      // WebSocket collaboration disabled for single-user MVP
      logger.info(LogComponent.SPREADSHEET_ENGINE, 'websocket_connect', 'WebSocket collaboration disabled for single-user MVP');

      // Setup smart auto-save after successful initialization (only if enabled)
      if (this.autoSaveEnabled) {
        this.setupSmartAutoSave();
      }

      const duration = logger.endTimer('spreadsheet_initialize');
      logger.info(LogComponent.SPREADSHEET_ENGINE, 'initialize', 'Spreadsheet initialization completed', {
        initializationTime: duration,
        success: true
      });

      return { success: true, data };
    } catch (error) {
      logger.endTimer('spreadsheet_initialize');
      logger.error(LogComponent.SPREADSHEET_ENGINE, 'initialize', 'Spreadsheet initialization failed', {
        error: typeof error === 'string' ? error : error && error.message || 'Unknown error',
        stack: error.stack
      });
      return { success: false, error: typeof error === 'string' ? error : error && error.message || 'Unknown error' };
    }
  }

  /**
   * Setup smart auto-save functionality
   */
  setupSmartAutoSave() {
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'smart_autosave_setup', 'Setting up smart auto-save functionality', {
      walrusInterval: this.walrusAutoSaveInterval,
      blockchainInterval: this.blockchainSyncInterval,
      autoSaveEnabled: this.autoSaveEnabled
    });

    // Setup offline/online event listeners (always needed for offline queue)
    this.setupOfflineQueueManagement();

    // Only start timers if auto-save is enabled
    if (this.autoSaveEnabled) {
      this.startAutoSaveTimers();
    }

    logger.info(LogComponent.SPREADSHEET_ENGINE, 'smart_autosave_setup', 'Smart auto-save configured', {
      timersStarted: this.autoSaveEnabled
    });
  }

  /**
   * Start auto-save timers
   */
  startAutoSaveTimers() {
    // Clear existing timers first
    this.stopAutoSaveTimers();

    logger.info(LogComponent.SPREADSHEET_ENGINE, 'start_autosave_timers', 'Starting auto-save timers');

    // Setup Walrus auto-save (no wallet prompts)
    this.walrusAutoSaveTimer = setInterval(() => {
      this.performWalrusAutoSave();
    }, this.walrusAutoSaveInterval);

    this.commitPromptTimer = setInterval(() => {
      this.checkCommitPromptConditions();
    }, this.commitReminderInterval);

    logger.info(LogComponent.SPREADSHEET_ENGINE, 'start_autosave_timers', 'Auto-save timers started');
  }

  /**
   * Stop auto-save timers
   */
  stopAutoSaveTimers() {
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'stop_autosave_timers', 'Stopping auto-save timers');

    if (this.walrusAutoSaveTimer) {
      clearInterval(this.walrusAutoSaveTimer);
      this.walrusAutoSaveTimer = null;
    }
    if (this.commitPromptTimer) {
      clearInterval(this.commitPromptTimer);
      this.commitPromptTimer = null;
    }

    logger.info(LogComponent.SPREADSHEET_ENGINE, 'stop_autosave_timers', 'Auto-save timers stopped');
  }

  /**
   * Set auto-save enabled state and start/stop timers accordingly
   */
  setAutoSaveEnabled(enabled) {
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'set_autosave_enabled', 'Auto-save state changed', {
      previousState: this.autoSaveEnabled,
      newState: enabled
    });

    this.autoSaveEnabled = enabled;

    if (enabled) {
      this.startAutoSaveTimers();
    } else {
      this.stopAutoSaveTimers();
    }
  }

  /**
   * Perform Walrus-only auto-save (no wallet prompts)
   */
  async performWalrusAutoSave() {
    if (this.isSaveInProgress) {
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'walrus_autosave_skipped', 'Walrus auto-save skipped - save in progress');
      return;
    }

    if (this.editCount === 0 && !this.hasDataChanged()) {
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'walrus_autosave_skipped', 'Walrus auto-save skipped - no changes');
      return;
    }

    if (!this.blockchainService?.walrusService) {
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'walrus_autosave_skipped', 'Walrus service not available');
      return;
    }

    logger.debug(LogComponent.SPREADSHEET_ENGINE, 'walrus_autosave_start', 'Starting Walrus auto-save');
    this.saveStatus = 'saving_walrus';

    try {
      const data = this.collectSpreadsheetData();

      // Save to localStorage first (always works offline)
      await this.storageService.saveData(data);

      // Check if we're online for Walrus save
      if (!this.isOnline) {
        logger.info(LogComponent.SPREADSHEET_ENGINE, 'walrus_autosave_offline', 'Adding Walrus save to offline queue');
        this.addToOfflineQueue({
          type: 'walrus_save',
          data: data,
          title: this.getSpreadsheetTitle?.() || 'Auto-save'
        });
        this.saveStatus = 'ready';
        return;
      }

      const walrusResult = await this.blockchainService.walrusService.storeBlob(data, {
        autoSave: true,
        spreadsheetId: this.spreadsheetId,
        chunk: data.metadata?.chunk
      });

      if (walrusResult.success) {
        this.lastWalrusSaveTimestamp = Date.now();
        this.pendingWalrusSaves.push({
          blobId: walrusResult.blobId,
          timestamp: Date.now(),
          data: data,
          metadata: walrusResult.metadata
        });
        recordTelemetry('walrus_autosave_success', {
          blobId: walrusResult.blobId,
          size: walrusResult.size,
          chunkExpiryTimestamp: walrusResult.metadata?.chunk?.expiryTimestamp || null
        });

        // Keep only last 10 pending saves
        if (this.pendingWalrusSaves.length > 10) {
          this.pendingWalrusSaves.shift();
        }

        this.saveStatus = 'saved_walrus';
        logger.info(LogComponent.SPREADSHEET_ENGINE, 'walrus_autosave_success', 'Walrus auto-save completed', {
          blobId: walrusResult.blobId,
          editCount: this.editCount
        });

        // Reset edit tracking after successful Walrus save
        this.editCount = 0;
        this.pendingEdits.clear();
      } else {
        throw new Error(walrusResult.error || 'Walrus save failed');
      }
    } catch (error) {
      logger.warn(LogComponent.SPREADSHEET_ENGINE, 'walrus_autosave_error', 'Walrus auto-save failed', {
        error: typeof error === 'string' ? error : error.message || 'Unknown error'
      });
      this.saveStatus = 'error';
    }
  }

  /**
   * Perform periodic blockchain sync (batches pending Walrus saves)
   */
  async commitPendingWalrusSaves() {
    if (!this.blockchainService?.isWalletConnected()) {
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'commit_skipped', 'Sui commit skipped - wallet not connected');
      return;
    }

    if (this.pendingWalrusSaves.length === 0) {
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'commit_skipped', 'Sui commit skipped - no pending saves');
      return;
    }

    if (this.isSaveInProgress) {
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'commit_skipped', 'Sui commit skipped - save in progress');
      return;
    }

    // Check if we're online for blockchain sync
    if (!this.isOnline) {
      logger.info(LogComponent.SPREADSHEET_ENGINE, 'commit_offline', 'Adding Sui commit to offline queue');
      const blobIds = this.pendingWalrusSaves.map((save) => save.blobId);
      this.addToOfflineQueue({
        type: 'sui_commit',
        blobIds: blobIds
      });
      return;
    }

    logger.info(LogComponent.SPREADSHEET_ENGINE, 'commit_start', 'Starting Sui commit', {
      pendingSaves: this.pendingWalrusSaves.length
    });

    this.saveStatus = 'committing';
    this.isSaveInProgress = true;

    try {
      // Get the latest Walrus save for blockchain sync
      const latestSave = this.pendingWalrusSaves[this.pendingWalrusSaves.length - 1];

      const blockchainResult = await this.blockchainService.saveToBlockchain(latestSave.data, {
        walrusBlobId: latestSave.blobId,
        skipWalrusUpload: true
      });

      if (blockchainResult.success) {
        this.lastSuiCommitTimestamp = Date.now();
        this.lastManualSaveTimestamp = Date.now();
        this.saveStatus = 'synced';

        this.pendingWalrusSaves = [];
        this.pendingSuiCommit = null;

        recordTelemetry('sui_commit_success', {
          walrusBlobId: latestSave.blobId,
          transactionId: blockchainResult.transactionId,
          chunkExpiryTimestamp: latestSave.metadata?.chunk?.expiryTimestamp || null
        });

        logger.info(LogComponent.SPREADSHEET_ENGINE, 'commit_success', 'Sui commit completed', {
          transactionId: blockchainResult.transactionId,
          blobId: latestSave.blobId
        });
      } else {
        throw new Error(blockchainResult.error || 'Blockchain sync failed');
      }
    } catch (error) {
      logger.warn(LogComponent.SPREADSHEET_ENGINE, 'commit_error', 'Sui commit failed', {
        error: typeof error === 'string' ? error : error.message || 'Unknown error'
      });
      this.saveStatus = 'error';
    } finally {
      this.isSaveInProgress = false;
    }
  }

  /**
   * Sync offline queue state from manager to engine facade
   * Phase 4: Maintains backward compatibility with direct property access
   * @private
   */
  _syncOfflineState(state) {
    this.isOnline = state.isOnline;
    this.offlineQueue.length = state.queueSize;
    this.offlineQueueProcessingTimer = state.isProcessing ? {} : null;
  }

  /**
   * Setup offline queue management and event listeners
   * Phase 4: Delegates to OfflineQueueManager
   */
  setupOfflineQueueManagement() {
    this.offlineQueueManager.setupListeners();
  }

  /**
   * Add a save operation to the offline queue
   * Phase 4: Delegates to OfflineQueueManager
   */
  addToOfflineQueue(operation) {
    this.offlineQueueManager.addToOfflineQueue(operation);
  }

  /**
   * Process a single offline queue item
   */
  async processOfflineQueueItem(item) {
    const { operation } = item;

    switch (operation.type) {
      case 'walrus_save':
        logger.debug(LogComponent.SPREADSHEET_ENGINE, 'offline_queue_walrus', 'Processing offline Walrus save', {
          queueId: item.id
        });
        return await this.executeWalrusSave(operation.data, operation.title);

      case 'sui_commit':
        logger.debug(LogComponent.SPREADSHEET_ENGINE, 'offline_queue_commit', 'Processing offline Sui commit', {
          queueId: item.id
        });
        return await this.executeSuiCommit(operation.blobIds);

      default:
        throw new Error(`Unknown offline operation type: ${operation.type}`);
    }
  }

  /**
   * Execute a Walrus save operation
   */
  async executeWalrusSave(data, title) {
    if (!this.blockchainService?.walrusService) {
      throw new Error('Walrus service not available');
    }

    const result = await this.blockchainService.walrusService.storeBlob(data, {});
    if (result.success) {
      this.lastWalrusSaveTimestamp = Date.now();
      this.pendingWalrusSaves.push({
        blobId: result.blobId,
        timestamp: this.lastWalrusSaveTimestamp,
        title: title
      });
      return result;
    } else {
      throw new Error(result.error || 'Walrus save failed');
    }
  }

  /**
   * Execute a blockchain sync operation
   */
  async executeSuiCommit(blobIds) {
    if (!this.blockchainService?.isWalletConnected()) {
      throw new Error('Wallet not connected');
    }

    const result = await this.blockchainService.syncToBlockchain(blobIds);
    if (result.success) {
      this.lastSuiCommitTimestamp = Date.now();
      return result;
    } else {
      throw new Error(result.error || 'Sui commit failed');
    }
  }

  /**
   * Setup collaboration event listeners - disabled for single-user MVP
   * Phase 2: Re-enable this method when adding multi-user collaboration
   */
  setupCollaborationListeners() {
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'collaboration_setup', 'Collaboration listeners disabled for single-user MVP');
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
      const error = 'Arguments row or column cannot be null or undefined';
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
      };
    }

    // Ensure row and col are numbers
    const numRow = Number(row);
    const numCol = Number(col);

    if (isNaN(numRow) || isNaN(numCol) || numRow < 0 || numCol < 0) {
      const error = 'Row and column must be valid non-negative numbers';
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
      };
    }

    const cellKey = `${numRow}-${numCol}`;
    const cellRef = this.getCellReference(numRow, numCol);

    logger.startTimer(`cell_edit_${cellRef}`);
    logger.logCellOperation('edit_attempt', cellRef, oldValue, newValue, {
      row: numRow,
      col: numCol,
      editCount: this.editCount,
      pendingEdits: this.pendingEdits.size
    });

    // Cell locking disabled for single-user MVP
    // Phase 2: Re-enable when adding multi-user collaboration
    this.currentEditingCell = cellRef;

    // Track the edit
    this.pendingEdits.set(cellKey, {
      row: numRow,
      col: numCol,
      oldValue,
      newValue,
      timestamp: Date.now()
    });

    this.editCount++;
    this.lastEditTimestamp = Date.now();

    console.error('🚀 DEBUG: Edit tracked and count incremented', {
      cellRef,
      oldValue,
      newValue,
      editCount: this.editCount,
      pendingEditsCount: this.pendingEdits.size
    });

    logger.info(LogComponent.SPREADSHEET_ENGINE, 'cell_edit_pending', `Cell edit added to pending queue`, {
      cellRef,
      editCount: this.editCount,
      pendingEditsCount: this.pendingEdits.size,
      valueChanged: oldValue !== newValue,
      oldValueLength: String(oldValue || '').length,
      newValueLength: String(newValue || '').length
    });

    // Real-time edit updates disabled for single-user MVP
    // Phase 2: Re-enable WebSocket broadcasting when adding multi-user collaboration

    // Track in blockchain service
    if (this.blockchainService) {
      try {
        this.blockchainService.trackCellEdit(numRow, numCol, oldValue, newValue);
        logger.debug(LogComponent.SPREADSHEET_ENGINE, 'blockchain_edit_tracked', `Edit tracked in blockchain service`, { cellRef });
      } catch (blockchainError) {
        logger.warn(LogComponent.SPREADSHEET_ENGINE, 'blockchain_edit_track_failed', `Failed to track edit in blockchain service`, {
          cellRef,
          error: typeof blockchainError === 'string' ? blockchainError : blockchainError.message || 'Unknown error'
        });
      }
    }

    // Auto-save removed - manual save only

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
    };
  }

  /**
   * Handle cell selection/focus change
   */
  handleCellSelect(row, col) {
    const cellRef = this.getCellReference(row, col);

    logger.debug(LogComponent.SPREADSHEET_ENGINE, 'cell_select', `Cell selected`, {
      cellRef,
      row,
      col,
      previousCell: this.currentEditingCell
    });

    // Cell unlocking and presence updates disabled for single-user MVP
    // Phase 2: Re-enable when adding multi-user collaboration

    this.currentEditingCell = cellRef;

    return { cellRef };
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

      // Cell unlocking disabled for single-user MVP
      // Phase 2: Re-enable when adding multi-user collaboration

      this.currentEditingCell = null;
    } else {
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'cell_blur', `Cell blur called but no current editing cell`);
    }
  }

  /**
   * Set Luckysheet ready flag
   */
  setLuckysheetReady(ready) {
    this.luckysheetReady = ready;
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'luckysheet_ready_state', `Luckysheet ready state changed`, {
      ready: ready,
      timestamp: Date.now()
    });
  }

  /**
   * Convert column number to letters (0=A, 1=B, ..., 26=AA, 27=AB, etc.)
   */
  columnNumberToLetters(num) {
    let result = '';
    let n = num + 1; // Convert to 1-based
    while (n > 0) {
      n--; // Adjust for 0-based alphabet
      result = String.fromCharCode(65 + n % 26) + result;
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
      return 'INVALID';
    }

    const numRow = Number(row);
    const numCol = Number(col);

    if (isNaN(numRow) || isNaN(numCol)) {
      logger.error(LogComponent.SPREADSHEET_ENGINE, 'cell_reference_validation', 'Row and column must be valid non-negative numbers', {
        row: row,
        col: col,
        numRow: numRow,
        numCol: numCol
      });
      return 'INVALID';
    }
    if (numRow < 0) {
      // Edge-case behavior expected by tests: negative row -> A0
      return 'A0';
    }
    if (numCol < 0) {
      // Edge-case: negative column, still return a reference string with row number
      return `${String.fromCharCode(65)}${numRow + 1}`;
    }

    return this.columnNumberToLetters(numCol) + (numRow + 1);
  }

  /**
   * Save current state (BLOCKCHAIN-FIRST MODE)
   *
   * New save flow (RAM-only + blockchain):
   * 1. CHECK: Wallet must be connected (mandatory)
   * 2. SAVE: Blockchain/Walrus save (primary, mandatory)
   * 3. CACHE: Store in RAM memory only (no browser persistence)
   *
   * Data is LOST on page refresh unless blockchain save succeeds first.
   */
  async save(title = null, epochs = null) {
    logger.startTimer('spreadsheet_save');

    // Use default or provided epochs for Walrus storage
    const epochsToUse = epochs || 50;

    logger.info(LogComponent.SPREADSHEET_ENGINE, 'save_start', `Starting BLOCKCHAIN-FIRST save operation`, {
      editCount: this.editCount,
      pendingEdits: this.pendingEdits.size,
      walletConnected: this.blockchainService?.isWalletConnected() || false,
      epochs: epochsToUse,
      mode: 'blockchain-first'
    });

    // Set flag to indicate save in progress
    this.isSaveInProgress = true;

    // Use circuit breaker to execute the save operation
    return await this.autoSaveCircuitBreaker.execute(async () => {
      // STEP 1: Check wallet connection (MANDATORY)
      if (!this.blockchainService?.isWalletConnected()) {
        logger.error(LogComponent.SPREADSHEET_ENGINE, 'save_blocked', `Save blocked: Wallet not connected (required for blockchain-first mode)`);
        throw new Error('❌ Wallet must be connected to save. In RAM-only mode, blockchain saves are mandatory.');
      }

      // Collect spreadsheet data
      const data = this.collectSpreadsheetData(title);
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'data_collected', `Spreadsheet data collected for save`, {
        dataSize: JSON.stringify(data).length,
        editCount: data.edits?.length || 0,
        version: data.version,
        epochs: epochsToUse
      });

      // STEP 2: Save to blockchain FIRST (PRIMARY, MANDATORY)
      logger.info(LogComponent.SPREADSHEET_ENGINE, 'blockchain_save', `[BLOCKCHAIN-FIRST] Attempting blockchain save with ${epochsToUse} epochs`);
      const blockchainResult = await this.blockchainService.saveToBlockchain(data, { epochs: epochsToUse });

      // STEP 3: Check blockchain result (MANDATORY SUCCESS)
      if (!blockchainResult.success) {
        logger.error(LogComponent.SPREADSHEET_ENGINE, 'blockchain_save_failed', `[BLOCKCHAIN-FIRST] Blockchain save FAILED - data NOT saved`, {
          error: blockchainResult.error,
          reason: blockchainResult.reason,
          message: typeof blockchainResult.message === 'string' ? blockchainResult.message : blockchainResult.message || 'Unknown error',
          critical: 'NO FALLBACK - data exists in RAM only and will be lost on refresh'
        });

        // Determine error reason and provide guidance
        const errorMessage = (typeof blockchainResult.message === 'string' ? blockchainResult.message : blockchainResult.message) || (
        typeof blockchainResult.error === 'string' ? blockchainResult.error : blockchainResult.error) ||
        'Unknown error';
        const actionNeeded = blockchainResult.reason === 'insufficient_balance' ?
        'Please add SUI tokens to your wallet and try again' :
        blockchainResult.reason === 'wallet_rejected' ?
        'Please approve the transaction in your wallet' :
        'Check your connection and try again';

        const criticalError = `❌ SAVE FAILED: Blockchain save required but failed. Your unsaved work is in RAM only and will be lost on page refresh.\n\nError: ${errorMessage}\nAction: ${actionNeeded}`;
        console.error(criticalError);

        // Throw error for circuit breaker to handle - THIS IS CRITICAL
        throw new Error(blockchainResult.error || 'Blockchain save failed - no fallback available');
      }

      // STEP 4: Blockchain success - now cache to RAM memory
      logger.info(LogComponent.SPREADSHEET_ENGINE, 'blockchain_save_success', `[BLOCKCHAIN-FIRST] Blockchain save succeeded - caching to RAM`, {
        method: blockchainResult.method,
        blobId: blockchainResult.blobId,
        transactionId: blockchainResult.transactionId,
        walrusSuccess: blockchainResult.walrusSuccess,
        blockchainSuccess: blockchainResult.blockchainSuccess
      });

      // Cache data to RAM (StorageAdapter now uses in-memory only)
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'ram_cache_save', `Caching spreadsheet data to RAM`);
      await this.storageService.saveData(data);
      logger.info(LogComponent.SPREADSHEET_ENGINE, 'ram_cache_save', `Successfully cached to RAM (blockchain save was primary)`);

      // Show user-visible success message
      const successMessage = {
        suiTransaction: blockchainResult.transactionId,
        walrusBlobId: blockchainResult.walrusBlobId || blockchainResult.blobId,
        method: blockchainResult.method,
        durability: 'Your data is now permanently stored on the decentralized web'
      };

      // Include latest version info if available
      if (blockchainResult.latestVersion) {
        successMessage.onChainVersion = `v${blockchainResult.latestVersion.versionNumber}`;
        successMessage.savedAt = blockchainResult.latestVersion.timestampFormatted;
        successMessage.cells = blockchainResult.latestVersion.cellCount;
      }

      console.log('🎉 [BLOCKCHAIN-FIRST] SUCCESS: Data saved to Sui blockchain AND Walrus storage!', successMessage);

      // Reset edit tracking and update hash for dirty checking
      const previousEditCount = this.editCount;
      const previousPendingEdits = this.pendingEdits.size;
      this.editCount = 0;
      this.pendingEdits.clear();

      // Update last manual save timestamp
      this.lastManualSaveTimestamp = Date.now();
      this.lastSaveTimestamp = Date.now();

      // Update saved data hash for dirty checking
      try {
        if (luckysheetApi.isReady) {
          const currentData = luckysheetApi.getAllSheets();
          const currentDataString = JSON.stringify(currentData);
          this.lastSavedDataHash = this.hashString(currentDataString);
          logger.debug(LogComponent.SPREADSHEET_ENGINE, 'hash_updated', 'Updated data hash after successful save', {
            newHash: this.lastSavedDataHash
          });
        }
      } catch (error) {
        logger.warn(LogComponent.SPREADSHEET_ENGINE, 'hash_update_error', 'Error updating saved data hash', {
          error: typeof error === 'string' ? error : error && error.message || 'Unknown error'
        });
      }

      const saveDuration = logger.endTimer('spreadsheet_save');

      // Capture metadata from blockchain result for UI confirmation
      this._lastSaveInfo = {
        blobId: blockchainResult.blobId || blockchainResult.walrusBlobId,
        transactionDigest: blockchainResult.transactionDigest || blockchainResult.transactionId,
        contentHash: blockchainResult.contentHash,
        storageStatus: blockchainResult.storageStatus,
        expiryTimestamp: blockchainResult.expiryTimestamp,
        endEpoch: blockchainResult.endEpoch,
        method: blockchainResult.method,
        storageStrategy: blockchainResult.storageStrategy,
        timestamp: Date.now(),
        isFirstSave: !this._lastSaveInfo // Track if this is first save (for modal auto-open)
      };

      // Return success (wallet is guaranteed to be connected; throws earlier if disconnected)
      const saveResult = {
        success: true,
        method: 'blockchain',
        saveInfo: this._lastSaveInfo
      };

      logger.info(LogComponent.SPREADSHEET_ENGINE, 'save_completed', `Spreadsheet save completed successfully (blockchain)`, {
        previousEditCount,
        previousPendingEdits,
        saveDuration,
        success: true,
        method: saveResult.method,
        blobId: this._lastSaveInfo.blobId,
        transactionDigest: this._lastSaveInfo.transactionDigest
      });

      // Emit save details event for UI listeners and devtools
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('save:details-update', {
          detail: this._lastSaveInfo
        }));
      }

      return saveResult;
    }, async (error) => {
      // Circuit breaker fallback function
      logger.warn(LogComponent.SPREADSHEET_ENGINE, 'save_circuit_breaker_fallback',
      'Save operation failed through circuit breaker', {
        error: typeof error === 'string' ? error : error && error.message || 'Unknown error',
        circuitState: this.autoSaveCircuitBreaker.getState()
      });
      return { success: false, error: typeof error === 'string' ? error : error && error.message || 'Unknown error', circuitBreakerTripped: true };
    }).finally(() => {
      // Always reset the save in progress flag
      this.isSaveInProgress = false;
    });
  }

  /**
   * Get metadata from last successful save (for UI confirmation)
   * Returns null if no save has been completed yet
   */
  getLastSaveInfo() {
    return this._lastSaveInfo;
  }

  /**
   * Check if spreadsheet data has changed since last save
   */
  hasDataChanged() {
    try {
      if (!luckysheetApi.isReady) {
        return false;
      }

      const currentData = luckysheetApi.getAllSheets();
      const currentDataString = JSON.stringify(currentData);
      const currentHash = this.hashString(currentDataString);

      if (this.lastSavedDataHash === null) {
        // First time, consider it changed
        return true;
      }

      const hasChanged = currentHash !== this.lastSavedDataHash;
      return hasChanged;
    } catch (error) {
      logger.warn(LogComponent.SPREADSHEET_ENGINE, 'data_change_check_error', 'Error checking data changes', {
        error: typeof error === 'string' ? error : error && error.message || 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Generate simple hash for data comparison
   */
  hashString(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
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
        error: typeof error === 'string' ? error : error && error.message || 'Unknown error'
      });
    }
    return 'Untitled Spreadsheet';
  }

  /**
   * Trigger save operation
   */
  async triggerSave(title = null) {
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'save_triggered', `Save operation manually triggered`);
    return await this.save(title);
  }

  /**
   * Force blockchain sync of pending Walrus saves
   */
  async forceSyncToBlockchain() {
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'force_sync_triggered', `Manual blockchain sync triggered`);
    return await this.commitPendingWalrusSaves();
  }

  /**
   * Save to Walrus + Blockchain (blockchain-first mode)
   *
   * In RAM-only mode, ALL saves must go through blockchain.
   * This method is maintained for compatibility but now routes to main save().
   */
  async saveToWalrusOnly(title = null) {
    logger.warn(LogComponent.SPREADSHEET_ENGINE, 'walrus_only_deprecated', `saveToWalrusOnly called - redirecting to blockchain-first save()`, {
      note: 'In RAM-only mode, all saves go through blockchain'
    });

    // In blockchain-first mode, redirect to main save() method
    // which ensures blockchain persistence
    return await this.save(title);
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
      if (this.luckysheetReady && luckysheetApi.isReady) {
        const allSheets = luckysheetApi.getAllSheets();

        if (allSheets && allSheets.length > 0) {
          const sheetData = allSheets[0];
          const celldata = sheetData.celldata || [];

          // Convert Luckysheet celldata to our storage format
          celldata.forEach((cell) => {
            if (cell && cell.r !== undefined && cell.c !== undefined && cell.v) {
              const cellRef = this.columnNumberToLetters(cell.c) + (cell.r + 1); // Convert to A1, B2, etc.
              const cellData = {
                value: cell.v.v,
                displayValue: cell.v.m || cell.v.v,
                type: cell.v.ct ? cell.v.ct.fa : 'General',
                formula: cell.v.f || null
              };

              // Evaluate custom formulas if present
              this.evaluateCustomFormulasForCell(cellRef, cellData);

              cells[cellRef] = cellData;
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
        Array.from(this.pendingEdits.values()).forEach((edit) => {
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
        error: typeof error === 'string' ? error : error && error.message || 'Unknown error'
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
   * Evaluate custom formulas if needed (e.g., =SUI_BALANCE, =SUI_GAS_PRICE, =SUI_EPOCH)
   * @param {string} cellRef - Cell reference (e.g., A1, B2)
   * @param {Object} cellData - Cell data object with value, formula, etc.
   */
  async evaluateCustomFormulaIfNeeded(cellRef, cellData) {
    const formula = cellData.formula;
    if (!formula || typeof formula !== 'string' || !formula.startsWith('=')) {
      return; // Not a formula
    }

    const formulaUpper = formula.toUpperCase();

    try {
      // Check for SUI_BALANCE formula
      const balanceMatch = formulaUpper.match(/^=SUI_BALANCE\s*\(\s*["']?([^"')]+)["']?\s*\)$/);
      if (balanceMatch) {
        const address = balanceMatch[1].trim();
        logger.info(LogComponent.SPREADSHEET_ENGINE, 'custom_formula_eval', `Evaluating SUI_BALANCE for ${cellRef}`, {
          cellRef,
          address: address.substring(0, 10) + '...'
        });

        try {
          const balance = await getSuiBalance(address);
          cellData.value = parseFloat(balance);
          cellData.displayValue = `${balance} SUI`;
          logger.info(LogComponent.SPREADSHEET_ENGINE, 'custom_formula_success', `SUI_BALANCE evaluated for ${cellRef}`, {
            cellRef,
            balance
          });

          // Refresh Luckysheet display if available
          this.refreshLuckysheetCell(cellRef, cellData);
        } catch (error) {
          logger.error(LogComponent.SPREADSHEET_ENGINE, 'custom_formula_error', `Failed to evaluate SUI_BALANCE for ${cellRef}`, {
            cellRef,
            error: error.message
          });
          cellData.value = '#ERROR';
          cellData.displayValue = `#ERROR: ${error.message}`;
        }
        return;
      }

      // Check for SUI_GAS_PRICE formula
      if (formulaUpper.match(/^=SUI_GAS_PRICE\s*\(\s*\)$/)) {
        logger.info(LogComponent.SPREADSHEET_ENGINE, 'custom_formula_eval', `Evaluating SUI_GAS_PRICE for ${cellRef}`, { cellRef });

        try {
          const gasPrice = await getSuiGasPrice();
          cellData.value = parseInt(gasPrice);
          cellData.displayValue = `${gasPrice} MIST`;
          logger.info(LogComponent.SPREADSHEET_ENGINE, 'custom_formula_success', `SUI_GAS_PRICE evaluated for ${cellRef}`, {
            cellRef,
            gasPrice
          });

          this.refreshLuckysheetCell(cellRef, cellData);
        } catch (error) {
          logger.error(LogComponent.SPREADSHEET_ENGINE, 'custom_formula_error', `Failed to evaluate SUI_GAS_PRICE for ${cellRef}`, {
            cellRef,
            error: error.message
          });
          cellData.value = '#ERROR';
          cellData.displayValue = `#ERROR: ${error.message}`;
        }
        return;
      }

      // Check for SUI_EPOCH formula
      if (formulaUpper.match(/^=SUI_EPOCH\s*\(\s*\)$/)) {
        logger.info(LogComponent.SPREADSHEET_ENGINE, 'custom_formula_eval', `Evaluating SUI_EPOCH for ${cellRef}`, { cellRef });

        try {
          const epoch = await getSuiEpoch();
          cellData.value = parseInt(epoch);
          cellData.displayValue = `Epoch ${epoch}`;
          logger.info(LogComponent.SPREADSHEET_ENGINE, 'custom_formula_success', `SUI_EPOCH evaluated for ${cellRef}`, {
            cellRef,
            epoch
          });

          this.refreshLuckysheetCell(cellRef, cellData);
        } catch (error) {
          logger.error(LogComponent.SPREADSHEET_ENGINE, 'custom_formula_error', `Failed to evaluate SUI_EPOCH for ${cellRef}`, {
            cellRef,
            error: error.message
          });
          cellData.value = '#ERROR';
          cellData.displayValue = `#ERROR: ${error.message}`;
        }
        return;
      }

    } catch (error) {
      logger.error(LogComponent.SPREADSHEET_ENGINE, 'custom_formula_parse_error', `Error parsing custom formula for ${cellRef}`, {
        cellRef,
        formula,
        error: error.message
      });
    }
  }

  /**
   * Refresh a specific cell in Luckysheet if it's available and ready
   * @param {string|number} cellRefOrRow - Cell reference (e.g., A1, B2) or row number
   * @param {Object|number} cellDataOrCol - Updated cell data or column number
   * @param {*} value - Value to set (if using row/col parameters)
   */
  refreshLuckysheetCell(cellRefOrRow, cellDataOrCol, value) {
    try {
      let row, col, cellValue;

      // Handle both cellRef/cellData and row/col/value parameter patterns
      if (typeof cellRefOrRow === 'string') {
        // cellRef, cellData pattern
        const cellRef = cellRefOrRow;
        const cellData = cellDataOrCol;
        const parsed = this.parseCellRef(cellRef);
        if (!parsed) return;

        row = parsed.row;
        col = parsed.col;
        cellValue = cellData.value;
      } else {
        // row, col, value pattern
        row = cellRefOrRow;
        col = cellDataOrCol;
        cellValue = value;
      }

      // Update the cell in the global luckysheet mock (for testing)
      if (typeof global !== 'undefined' && global.luckysheet && global.luckysheet.flowdata) {
        if (global.luckysheet.flowdata[row] && global.luckysheet.flowdata[row][col]) {
          global.luckysheet.flowdata[row][col].v = cellValue;
        }
        if (global.luckysheet.refreshFormula) {
          global.luckysheet.refreshFormula();
        }
      }

      // Update the cell in Luckysheet if available
      if (this.luckysheetReady && luckysheetApi.isReady) {
        if (luckysheetApi.setCellValue) {
          luckysheetApi.setCellValue(row, col, cellValue);
        }

        // Refresh formulas
        if (luckysheetApi.refreshFormula) {
          luckysheetApi.refreshFormula();
        }

        logger.debug(LogComponent.SPREADSHEET_ENGINE, 'luckysheet_cell_refresh', `Cell refreshed in Luckysheet`, {
          row,
          col,
          value: cellValue
        });
      }
    } catch (error) {
      logger.warn(LogComponent.SPREADSHEET_ENGINE, 'luckysheet_refresh_error', `Failed to refresh cell in Luckysheet`, {
        error: error.message
      });
    }
  }

  /**
   * Parse cell reference like A1, B2 to {row, col}
   * @param {string} cellRef - Cell reference
   * @returns {Object} - {row, col} (0-indexed)
   */
  parseCellRef(cellRef) {
    const match = cellRef.match(/^([A-Z]+)(\d+)$/);
    if (!match) {
      return null; // Return null for invalid references instead of throwing
    }

    const letters = match[1];
    const number = parseInt(match[2]);

    // Row numbers must be >= 1 (A0, B0, etc. are invalid)
    if (number < 1) {
      return null;
    }

    // Convert letters to column number (A=0, B=1, ..., Z=25, AA=26, etc.)
    let col = 0;
    for (let i = 0; i < letters.length; i++) {
      col = col * 26 + (letters.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    col -= 1; // Convert to 0-indexed

    const row = number - 1; // Convert to 0-indexed

    return { row, col };
  }

  /**
   * Evaluate a custom formula and return the result (for testing and direct evaluation)
   * @param {string} formula - Formula string (e.g., =SUI_BALANCE("0x123..."))
   * @returns {Promise<string|null>} - Result value or null if not a custom formula
   */
  async evaluateFormulaDirectly(formula) {
    if (!formula || typeof formula !== 'string' || !formula.startsWith('=')) {
      return null; // Not a formula
    }

    const formulaUpper = formula.toUpperCase();

    try {
      // Check if it's a SUI formula (regardless of validity)
      const isSuiFormula = formulaUpper.startsWith('=SUI_BALANCE') ||
      formulaUpper.startsWith('=SUI_GAS_PRICE') ||
      formulaUpper.startsWith('=SUI_EPOCH');

      if (!isSuiFormula) {
        return null; // Not a SUI formula
      }

      // Check for valid SUI_BALANCE formula
      const balanceMatch = formulaUpper.match(/^=SUI_BALANCE\s*\(\s*["']?([^"')]+)["']?\s*\)$/);
      if (balanceMatch) {
        const address = balanceMatch[1].trim();
        try {
          const balance = await getSuiBalance(address);
          return balance;
        } catch (error) {
          return '#ERROR';
        }
      }

      // Check for valid SUI_GAS_PRICE formula
      if (formulaUpper.match(/^=SUI_GAS_PRICE\s*\(\s*\)$/)) {
        try {
          const gasPrice = await getSuiGasPrice();
          return gasPrice;
        } catch (error) {
          return '#ERROR';
        }
      }

      // Check for valid SUI_EPOCH formula
      if (formulaUpper.match(/^=SUI_EPOCH\s*\(\s*\)$/)) {
        try {
          const epoch = await getSuiEpoch();
          return epoch;
        } catch (error) {
          return '#ERROR';
        }
      }

      // It's a SUI formula but invalid syntax
      return '#ERROR';

    } catch (error) {
      return '#ERROR';
    }
  }

  /**
   * Evaluate custom formulas for a cell (internal method used during data collection)
   * @param {string} cellRef - Cell reference (e.g., A1, B2)
   * @param {Object} cellData - Cell data object with value, formula, etc.
   */
  async evaluateCustomFormulasForCell(cellRef, cellData) {
    const formula = cellData.formula;
    if (!formula || typeof formula !== 'string' || !formula.startsWith('=')) {
      return; // Not a formula
    }

    const formulaUpper = formula.toUpperCase();

    try {
      // Check for SUI_BALANCE formula
      const balanceMatch = formulaUpper.match(/^=SUI_BALANCE\s*\(\s*["']?([^"')]+)["']?\s*\)$/);
      if (balanceMatch) {
        const address = balanceMatch[1].trim();
        logger.info(LogComponent.SPREADSHEET_ENGINE, 'custom_formula_eval', `Evaluating SUI_BALANCE for ${cellRef}`, {
          cellRef,
          address: address.substring(0, 10) + '...'
        });

        try {
          const balance = await getSuiBalance(address);
          cellData.value = parseFloat(balance);
          cellData.displayValue = `${balance} SUI`;
          logger.info(LogComponent.SPREADSHEET_ENGINE, 'custom_formula_success', `SUI_BALANCE evaluated for ${cellRef}`, {
            cellRef,
            balance
          });

          // Refresh Luckysheet display if available
          this.refreshLuckysheetCell(cellRef, cellData);
        } catch (error) {
          logger.error(LogComponent.SPREADSHEET_ENGINE, 'custom_formula_error', `Failed to evaluate SUI_BALANCE for ${cellRef}`, {
            cellRef,
            error: error.message
          });
          cellData.value = '#ERROR';
          cellData.displayValue = `#ERROR: ${error.message}`;
        }
        return;
      }

      // Check for SUI_GAS_PRICE formula
      if (formulaUpper.match(/^=SUI_GAS_PRICE\s*\(\s*\)$/)) {
        logger.info(LogComponent.SPREADSHEET_ENGINE, 'custom_formula_eval', `Evaluating SUI_GAS_PRICE for ${cellRef}`, { cellRef });

        try {
          const gasPrice = await getSuiGasPrice();
          cellData.value = parseInt(gasPrice);
          cellData.displayValue = `${gasPrice} MIST`;
          logger.info(LogComponent.SPREADSHEET_ENGINE, 'custom_formula_success', `SUI_GAS_PRICE evaluated for ${cellRef}`, {
            cellRef,
            gasPrice
          });

          this.refreshLuckysheetCell(cellRef, cellData);
        } catch (error) {
          logger.error(LogComponent.SPREADSHEET_ENGINE, 'custom_formula_error', `Failed to evaluate SUI_GAS_PRICE for ${cellRef}`, {
            cellRef,
            error: error.message
          });
          cellData.value = '#ERROR';
          cellData.displayValue = `#ERROR: ${error.message}`;
        }
        return;
      }

      // Check for SUI_EPOCH formula
      if (formulaUpper.match(/^=SUI_EPOCH\s*\(\s*\)$/)) {
        logger.info(LogComponent.SPREADSHEET_ENGINE, 'custom_formula_eval', `Evaluating SUI_EPOCH for ${cellRef}`, { cellRef });

        try {
          const epoch = await getSuiEpoch();
          cellData.value = parseInt(epoch);
          cellData.displayValue = `Epoch ${epoch}`;
          logger.info(LogComponent.SPREADSHEET_ENGINE, 'custom_formula_success', `SUI_EPOCH evaluated for ${cellRef}`, {
            cellRef,
            epoch
          });

          this.refreshLuckysheetCell(cellRef, cellData);
        } catch (error) {
          logger.error(LogComponent.SPREADSHEET_ENGINE, 'custom_formula_error', `Failed to evaluate SUI_EPOCH for ${cellRef}`, {
            cellRef,
            error: error.message
          });
          cellData.value = '#ERROR';
          cellData.displayValue = `#ERROR: ${error.message}`;
        }
        return;
      }

      // Check for WalSheetz DeFi formulas
      await this.evaluateWalSheetzFormulas(cellRef, cellData, formulaUpper, formula);

    } catch (error) {
      logger.error(LogComponent.SPREADSHEET_ENGINE, 'custom_formula_parse_error', `Error parsing custom formula for ${cellRef}`, {
        cellRef,
        formula,
        error: error.message
      });
    }
  }

  /**
   * Evaluate WalSheetz DeFi formulas
   * @param {string} cellRef - Cell reference (e.g., A1, B2)
   * @param {Object} cellData - Cell data object with value, formula, etc.
   * @param {string} formulaUpper - Uppercase formula string
   * @param {string} formula - Original formula string
   */
  async evaluateWalSheetzFormulas(cellRef, cellData, formulaUpper, formula) {
    try {
      // Check for loading states using static import of defiStateManager

      // Check for loading state and add visual indicator
      const addStatusIndicator = (cellData, adapterId = 'registry', method = 'unknown', args = [], status = 'ready') => {
        let statusIcon = '';
        let statusClass = '';

        if (defiStateManager) {
          // Use the same key generation method as DeFiStateManager
          const cacheKey = `${cellRef}:${adapterId}:${method}:${JSON.stringify(args)}`;

          if (defiStateManager.loadingStates?.has(cacheKey)) {
            statusIcon = '⏳';
            statusClass = 'wz-loading';
            status = 'loading';
          } else if (defiStateManager.errorStates?.has(cacheKey)) {
            statusIcon = '❌';
            statusClass = 'wz-error';
            status = 'error';
          } else if (status === 'ready' && cellData.value !== '#ERROR') {
            statusIcon = '✅';
            statusClass = 'wz-success';
          }
        }

        // Add status indicator to cell display
        if (statusIcon && cellData.displayValue && !cellData.displayValue.startsWith(statusIcon)) {
          cellData.displayValue = `${statusIcon} ${cellData.displayValue}`;
          cellData.wzStatus = status;
          cellData.wzStatusClass = statusClass;
        }

        return { statusIcon, statusClass, status };
      };

    } catch (error) {
      logger.error(LogComponent.SPREADSHEET_ENGINE, 'walsheetz_formula_parse_error', `Error parsing WalSheetz formula for ${cellRef}`, {
        cellRef,
        formula,
        error: error.message
      });
    }
  }

  /**
   * Format WalSheetz result for display in spreadsheet cell
   * @param {*} result - Result from WalSheetz function
   * @returns {string} - Formatted display value
   */
  formatWalSheetzResult(result) {
    if (result === null || result === undefined) {
      return 'N/A';
    }

    if (typeof result === 'object') {
      if (Array.isArray(result)) {
        return `${result.length} items`;
      }
      if (result.status === 'loading') {
        return 'Loading...';
      }
      if (result.status === 'error') {
        return `Error: ${result.message}`;
      }
      // Try to extract meaningful display value
      if (result.supplyApy !== undefined) {
        return `${(result.supplyApy * 100).toFixed(2)}% APY`;
      }
      if (result.totalSupply !== undefined) {
        return `Supply: ${result.totalSupply}`;
      }
      return JSON.stringify(result).substring(0, 50) + '...';
    }

    return result.toString();
  }

  /**
   * Get current status
   */
  getStatus() {
    const status = {
      editCount: this.editCount,
      pendingEdits: this.pendingEdits.size,
      walletConnected: this.blockchainService?.isWalletConnected() || false,
      lastManualSaveTimestamp: this.lastManualSaveTimestamp,
      lastEditTimestamp: this.lastEditTimestamp,

      // Smart auto-save status
      saveStatus: this.saveStatus,
      lastWalrusSaveTimestamp: this.lastWalrusSaveTimestamp,
      lastSuiCommitTimestamp: this.lastSuiCommitTimestamp,
      pendingWalrusSaves: this.pendingWalrusSaves.length,
      commitPromptEnabled: !!this.commitPromptTimer,

      // Time since saves for UI display
      timeSinceLastWalrusSave: this.lastWalrusSaveTimestamp ? Date.now() - this.lastWalrusSaveTimestamp : null,
      timeSinceLastSuiCommit: this.lastSuiCommitTimestamp ? Date.now() - this.lastSuiCommitTimestamp : null,
      chunkMetadata: this.commitPromptState.metadata?.chunk || null,

      // Offline queue status
      isOnline: this.isOnline,
      offlineQueueSize: this.offlineQueue.length,
      offlineQueueProcessing: !!this.offlineQueueProcessingTimer
    };

    logger.debug(LogComponent.SPREADSHEET_ENGINE, 'status_check', `Status requested`, status);

    return status;
  }

  /**
   * Get time since last manual save in milliseconds
   */
  getTimeSinceLastSave() {
    if (!this.lastManualSaveTimestamp) {
      return null; // Never saved
    }
    return Date.now() - this.lastManualSaveTimestamp;
  }

  /**
   * Get time since last edit in milliseconds
   */
  getTimeSinceLastEdit() {
    if (!this.lastEditTimestamp) {
      return null; // Never edited
    }
    return Date.now() - this.lastEditTimestamp;
  }

  /**
   * Get the age of the last save for UI display
   */
  getLastSaveAge() {
    return this.getTimeSinceLastSave();
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
      // Downgrade to debug - bridge is optional for UI-only development
      logger.debug(LogComponent.SPREADSHEET_ENGINE, 'bridge_health_check', 'Bridge health check failed (expected if running UI-only)', {
        error: typeof error === 'string' ? error : error && error.message || 'Unknown error'
      });
      return false;
    }
  }

  cleanup() {
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'cleanup', `Starting cleanup process`, {
      currentEditingCell: this.currentEditingCell,
      pendingEdits: this.pendingEdits.size,
      walrusAutoSaveActive: !!this.walrusAutoSaveTimer
    });

    // Clear smart auto-save timers
    this.stopAutoSaveTimers();

    // Clean up offline queue (Phase 4: Delegated to OfflineQueueManager)
    this.offlineQueueManager.cleanup();
    logger.debug(LogComponent.SPREADSHEET_ENGINE, 'cleanup', `Offline queue manager cleaned up`);

    // Clean up refresh scheduler (Phase 4: Delegated to FormulaRefreshScheduler)
    this.formulaScheduler.cleanup();
    logger.debug(LogComponent.SPREADSHEET_ENGINE, 'cleanup', `Refresh scheduler stopped and cleared`);

    // Save any pending edits before cleanup
    if (this.editCount > 0) {
      logger.warn(LogComponent.SPREADSHEET_ENGINE, 'cleanup', `Pending edits found during cleanup`, {
        editCount: this.editCount,
        pendingEdits: this.pendingEdits.size
      });
      // Note: In production, might want to trigger a final save here
    }

    // WebSocket cleanup disabled for single-user MVP
    // Phase 2: Re-enable when adding multi-user collaboration

    logger.info(LogComponent.SPREADSHEET_ENGINE, 'cleanup', `Cleanup process completed`);
  }

  /**
   * Register a cell for periodic refresh
   * Phase 4: Delegates to FormulaRefreshScheduler
   * @param {string} cellRef - Cell reference (e.g., "A1", "B5")
   * @param {number} interval - Refresh interval in milliseconds
   * @param {string} formula - Formula to re-execute
   */
  registerCellForRefresh(cellRef, interval, formula) {
    this.formulaScheduler.registerCellForRefresh(cellRef, interval, formula);
  }

  /**
   * Unregister a cell from periodic refresh
   * Phase 4: Delegates to FormulaRefreshScheduler
   * @param {string} cellRef - Cell reference
   */
  unregisterCellForRefresh(cellRef) {
    this.formulaScheduler.unregisterCellForRefresh(cellRef);
  }

  /**
   * Start the refresh scheduler loop
   * Phase 4: Delegates to FormulaRefreshScheduler
   */
  startRefreshScheduler() {
    this.formulaScheduler.startRefreshScheduler();
  }

  /**
   * Stop the refresh scheduler loop
   * Phase 4: Delegates to FormulaRefreshScheduler
   */
  stopRefreshScheduler() {
    this.formulaScheduler.stopRefreshScheduler();
  }

  /**
   * Enable/disable refresh scheduler globally
   * Phase 4: Delegates to FormulaRefreshScheduler
   * @param {boolean} enabled - Enable or disable
   */
  setRefreshEnabled(enabled) {
    this.formulaScheduler.setRefreshEnabled(enabled);
  }

  /**
   * Clear the spreadsheet grid completely
   */
  async clearGrid() {
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'clear_grid', 'Clearing spreadsheet grid');

    try {
      if (luckysheetApi.isReady) {
        // Clear the actual sheet data that Luckysheet uses
        if (window.luckysheetfile && window.luckysheetfile[0]) {
          window.luckysheetfile[0].celldata = [];
          window.luckysheetfile[0].name = 'Sheet1';

          // Trigger a full refresh to display the cleared grid
          luckysheetApi.refresh('all');

          logger.info(LogComponent.SPREADSHEET_ENGINE, 'grid_cleared', 'Grid cleared successfully using direct update');
        } else {
          // Fallback: try to clear via getAllSheets if luckysheetfile is not available
          const allSheets = luckysheetApi.getAllSheets();
          if (allSheets && allSheets[0]) {
            allSheets[0].celldata = [];
            allSheets[0].name = 'Sheet1';
            luckysheetApi.refreshFormula();

            logger.warn(LogComponent.SPREADSHEET_ENGINE, 'grid_cleared_fallback', 'Used fallback getAllSheets method for grid clearing');
          }
        }
      }

      // Clear local storage to match the empty grid
      const emptyData = {
        data: {
          cells: {},
          metadata: { title: 'Sheet1' }
        }
      };
      await this.storageService.saveData(emptyData);

      logger.info(LogComponent.SPREADSHEET_ENGINE, 'clear_grid_complete', 'Grid clearing completed');
    } catch (error) {
      logger.error(LogComponent.SPREADSHEET_ENGINE, 'clear_grid_error', 'Error clearing grid', {
        error: typeof error === 'string' ? error : error && error.message || 'Unknown error'
      });
      throw error;
    }
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
      data?.data?.data?.cells ||
      data?.data?.cells ||
      data?.cells ||
      null;

      if (luckysheetApi.isReady && cellsSource) {
        try {
          // Convert data to Luckysheet format and update the sheet
          const celldata = [];
          const cells = cellsSource;

          Object.keys(cells).forEach((cellRef) => {
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

          // Update the actual Luckysheet instance data
          const sheetTitle = data?.data?.metadata?.title || data?.title || 'Sheet1';

          if (window.luckysheetfile && window.luckysheetfile[0]) {
            // Update the actual sheet data that Luckysheet uses
            window.luckysheetfile[0].celldata = celldata;
            window.luckysheetfile[0].name = sheetTitle;

            // Trigger a full refresh to display the new data
            luckysheetApi.refresh('all');

            logger.info(LogComponent.SPREADSHEET_ENGINE, 'luckysheet_refresh', `Luckysheet refreshed with new data using direct update`, {
              cellCount: celldata.length,
              sheetTitle
            });
          } else {
            // Fallback: try to update via getAllSheets if luckysheetfile is not available
            const allSheets = luckysheetApi.getAllSheets();
            if (allSheets && allSheets[0]) {
              allSheets[0].celldata = celldata;
              allSheets[0].name = sheetTitle;
              luckysheetApi.refreshFormula();

              // Only warn if this seems like an unexpected fallback (not during initialization)
              if (window.luckysheet && window.luckysheet.getSheet) {
                logger.debug(LogComponent.SPREADSHEET_ENGINE, 'luckysheet_fallback', `Used fallback getAllSheets method for data update`, {
                  hasLuckysheet: !!window.luckysheet,
                  hasLuckysheetfile: !!window.luckysheetfile,
                  luckysheetfileType: typeof window.luckysheetfile
                });
              } else {
                logger.info(LogComponent.SPREADSHEET_ENGINE, 'luckysheet_fallback_init', `Using fallback during Luckysheet initialization`);
              }
            }
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
        if (luckysheetApi.isReady) {
          const currentData = luckysheetApi.getAllSheets();
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
        error: typeof error === 'string' ? error : error && error.message || 'Unknown error',
        stack: error.stack
      });

      return { success: false, error: typeof error === 'string' ? error : error && error.message || 'Unknown error' };
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
      const src = spreadsheetData && spreadsheetData.data ? spreadsheetData.data : spreadsheetData;

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
        error: typeof error === 'string' ? error : error && error.message || 'Unknown error',
        stack: error.stack
      });

      return { success: false, error: typeof error === 'string' ? error : error && error.message || 'Unknown error' };
    }
  }

  checkCommitPromptConditions() {
    if (!this.blockchainService?.isWalletConnected()) return;
    if (this.commitPromptState.suppressed) return;
    if (this.isSaveInProgress) return;

    const latestSave = this.pendingWalrusSaves[this.pendingWalrusSaves.length - 1];
    if (!latestSave) return;

    const now = Date.now();
    if (this.commitPromptState.snoozeUntil && now < this.commitPromptState.snoozeUntil) {
      return;
    }

    const elapsedSinceAutoSave = now - latestSave.timestamp;
    if (elapsedSinceAutoSave < this.blockchainCommitInterval) {
      return;
    }

    const chunk = latestSave.metadata?.chunk || null;
    const expiresSoon = chunk?.expiryTimestamp ?
    chunk.expiryTimestamp - now < (chunk.renewalWarningDays || 7) * 86400000 :
    false;

    this.commitPromptState.visible = true;
    this.commitPromptState.metadata = {
      blobId: latestSave.blobId,
      chunk,
      expiresSoon
    };
    this.commitPromptState.lastPromptedAt = now;
  }

  snoozeCommitPrompt(durationMs = 5 * 60 * 1000) {
    this.commitPromptState.visible = false;
    this.commitPromptState.snoozeUntil = Date.now() + durationMs;
  }

  suppressCommitPrompts() {
    this.commitPromptState.visible = false;
    this.commitPromptState.suppressed = true;
  }

  /**
   * Get pending partial save info (Walrus succeeded, blockchain failed)
   * @returns {Object|null} Partial save info or null if none pending
   */
  getPartialSaveInfo() {
    return this._partialSaveInfo;
  }

  /**
   * Clear partial save info after successful retry
   */
  clearPartialSaveInfo() {
    this._partialSaveInfo = null;
    if (this.storageService?.clearPartialSaveInfo) {
      this.storageService.clearPartialSaveInfo();
    }
    logger.info(LogComponent.SPREADSHEET_ENGINE, 'partial_save_cleared',
    'Partial save info cleared');
  }

  async getDatasets(filter = {}) {
    if (!this.blockchainService?.walrusService?.queryDatasets) {
      return { success: false, error: 'Dataset query not available' };
    }

    try {
      const ownerAddress = this.blockchainService.walletManager?.getWalletInfo().address || null;
      const filterWithOwner = {
        owner: ownerAddress,
        ...filter
      };
      return await this.blockchainService.walrusService.queryDatasets(filterWithOwner);
    } catch (error) {
      logger.error(LogComponent.SPREADSHEET_ENGINE, 'dataset_query_failed', 'Walrus dataset query failed', {
        error: typeof error === 'string' ? error : error.message || 'Unknown error'
      });
      return { success: false, error: typeof error === 'string' ? error : error.message || 'Unknown error' };
    }
  }
}