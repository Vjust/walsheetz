import { IBlockchainService } from '../interfaces/IBlockchainService.js';
// Use browser-compatible services in frontend
import { browserWalletManager } from '@services/blockchain/wallet/BrowserWalletManager.js';
import { browserSuiService } from '@services/blockchain/sui/BrowserSuiService.js';
import { browserWalrusService } from '@services/blockchain/walrus/BrowserWalrusService.js';
// Collaboration disabled for single-user MVP
import { collaborationService } from '../services/CollaborationService.js';
import { errorRecoveryService } from '../services/ErrorRecoveryService.js';
import { progressiveEnhancementService } from '../services/ProgressiveEnhancementService.js';
import { offlineModeService } from '../services/OfflineModeService.js';
import { logger, LogComponent, ErrorCategory } from '@utils/logging/Logger.js';
import { configLoader } from '@utils/config/ConfigLoader.js';
import { validationGuards } from '@utils/validation/ValidationGuards.js';
import { transactionManager } from '../services/TransactionManager.js';
import { transactionEventBus } from '@utils/helpers/EventBus.js';
import { NetworkError, WalletError, ContractError, ValidationError, StorageError, ErrorFactory } from '@utils/errors/errors.js';
import { standardizedErrorHandler } from '../utils/StandardizedErrorHandler.js';
import { transactionExperienceManager } from '../utils/TransactionExperience.js';
import { atomicOperationManager } from '../services/blockchain/AtomicOperationManager.js';
import {
  createWalrusStorageOp,
  createTxPrepOp,
  createBlockchainExecutionOp
} from './atomicOperations/index.js';
import { OperationHelpers } from './atomicOperations/OperationHelpers.js';


/**
 * Blockchain service adapter implementing IBlockchainService
 */
export class BlockchainAdapter extends IBlockchainService {
  constructor(storageAdapter = null) {
    super();
    
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'constructor', 'Initializing BlockchainAdapter');
    
    this.config = null; // Will be loaded asynchronously
    this.configLoader = configLoader;
    this.validationGuards = validationGuards;
    this.walletManager = browserWalletManager;
    this.suiService = browserSuiService;
    this.walrusService = browserWalrusService;
    this.collaborationService = collaborationService;
    this.storageAdapter = storageAdapter; // For session persistence
    this.editTracker = new Map();
    this.spreadsheetObjectId = null; // Will be set when spreadsheet is created
    this.syncQueue = []; // Queue for failed saves to retry later

    // Transaction state tracking to prevent overlapping saves and wallet spam
    this.transactionState = {
      isProcessing: false,
      lastTransaction: null,
      failureCount: 0,
      lastFailureTime: null,
      disabled: false,
      processingStartTime: null,
      processingTimeout: 30000 // 30 seconds timeout
    };
    this.syncStatus = {
      lastSync: null,
      pendingChanges: 0,
      isConnected: false,
      grpcConnected: false,
      collaborationEnabled: false
    };
    
    // Write sequencing and coalescing for rate limiting
    this.pendingSavesBySheet = new Map(); // Map<spreadsheetId, Promise>
    this.saveQueueBySheet = new Map(); // Map<spreadsheetId, Array<pendingData>>
    this.debounceTimers = new Map(); // Map<spreadsheetId, timeoutId>
    this.debounceDelay = 750; // 750ms debounce for rapid edits
    this.maxBatchSize = 50; // Max changes to batch together

    // Prevent multiple initializations
    this.servicesInitialized = false;
    this.initializingServices = false;
    this.initializationPromise = null;

    // Initialize operation helpers with dependency injection
    this.operationHelpers = new OperationHelpers({
      logger,
      logComponent: LogComponent.BLOCKCHAIN_ADAPTER
    });

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'constructor', 'Services initialized', {
      walletManager: !!this.walletManager,
      suiService: !!this.suiService,
      walrusService: !!this.walrusService,
      collaborationService: !!this.collaborationService,
      editTrackerSize: this.editTracker.size,
      syncQueueSize: this.syncQueue.length
    });
    
    // Listen to wallet events
    this.setupEventListeners()

    // Initialize collaboration service (only in browser environment, not in tests)
    if (typeof window !== 'undefined' && (typeof process === 'undefined' || process.env.NODE_ENV !== 'test')) {
      this.initializeServices()
    }

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'constructor', 'BlockchainAdapter initialization completed')
  }

  // Get runtime configuration with caching
  async getRuntimeConfig() {
    if (!this.config) {
      this.config = await this.configLoader.getConfig();
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'get_runtime_config', 'Runtime config loaded', {
        network: this.config.currentNetwork,
        version: this.config.version,
        features: Object.keys(this.config.features)
      });
    }
    return this.config;
  }

  // Get current network configuration
  async getCurrentNetworkConfig() {
    const config = await this.getRuntimeConfig();
    return config.getCurrentNetwork();
  }

  // Validate current configuration before critical operations
  async validateConfiguration() {
    const config = await this.getRuntimeConfig();
    const validation = await this.validationGuards.runPreflightChecks(config.currentNetwork);
    
    if (!validation.overall.status === 'passed') {
      const error = new Error(`Configuration validation failed: ${validation.overall.error || 'Unknown error'}`);
      error.validationResults = validation;
      throw error;
    }
    
    return validation;
  }

  async initializeServices() {
    // Prevent multiple concurrent initializations
    if (this.initializingServices) {
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'initialize_services', 'Service initialization already in progress, waiting...');
      return this.initializationPromise || Promise.resolve(false);
    }

    if (this.servicesInitialized) {
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'initialize_services', 'Services already initialized, skipping...');
      return true;
    }

    this.initializingServices = true;
    this.initializationPromise = this._initializeServicesInternal();

    try {
      const result = await this.initializationPromise;
      this.servicesInitialized = result;
      return result;
    } finally {
      this.initializingServices = false;
      this.initializationPromise = null;
    }
  }

  async _initializeServicesInternal() {
    logger.startTimer('blockchain_services_init');
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'initialize_services', 'Starting service initialization');

    try {
      // Initialize Sui service with gRPC
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'sui_init', 'Initializing Sui service');
      const suiInitialized = await this.suiService.initialize();
      logger.logBlockchainOperation('sui_initialize', suiInitialized, {
        service: 'SuiService'
      });
      
      // Collaboration disabled for single-user MVP
      this.syncStatus.grpcConnected = suiInitialized;
      this.syncStatus.collaborationEnabled = false;
      
      if (suiInitialized) {
        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'initialize_services', 'All services fully initialized', {
          suiService: suiInitialized
        });

        // Subscribe to blockchain events from gRPC
        this.suiService.subscribeToEvents((event) => {
          logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'blockchain_event', `Blockchain event received: ${event.type}`, {
            eventType: event.type,
            eventData: event.data,
            timestamp: Date.now()
          });
          this.handleBlockchainEvent(event);
        });

        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'event_subscription', 'Subscribed to blockchain events');
      } else {
        logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'initialize_services', 'Partial service initialization', {
          suiInitialized,
          degradedMode: true
        });
      }

      const initDuration = logger.endTimer('blockchain_services_init');
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'initialize_services', 'Service initialization completed', {
        duration: initDuration,
        allServicesOnline: suiInitialized
      });
      
    } catch (error) {
      logger.endTimer('blockchain_services_init');
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'initialize_services', 'Failed to initialize services', {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack
      });
    }
  }

  setupEventListeners() {
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'setup_listeners', 'Setting up event listeners');
    
    this.walletManager.on('connected', (data) => {
      this.syncStatus.isConnected = true;
      logger.info(LogComponent.WALLET_MANAGER, 'wallet_connected', 'Wallet connected successfully', {
        address: data.address,
        walletType: data.walletType || 'unknown',
        autoConnect: data.autoConnect || false
      });
      
      // Collaboration disabled for single-user MVP
    });

    this.walletManager.on('disconnected', () => {
      this.syncStatus.isConnected = false;
      logger.info(LogComponent.WALLET_MANAGER, 'wallet_disconnected', 'Wallet disconnected', {
        pendingEdits: this.editTracker.size,
        syncQueueSize: this.syncQueue.length
      });
      
      // Collaboration disabled for single-user MVP
    });

    this.walletManager.on('error', (error) => {
      logger.error(LogComponent.WALLET_MANAGER, 'wallet_error', 'Wallet operation error', {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        errorType: error.type || 'unknown',
        stack: error.stack
      });
    });

    // Collaboration event listeners disabled for single-user MVP

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'setup_listeners', 'Event listeners configured successfully');
  }

  async connectWallet() {
    logger.startTimer('wallet_connect');
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'connect_wallet', 'Initiating wallet connection');

    try {
      const result = await this.walletManager.connect();

      if (result.success) {
        this.syncStatus.isConnected = true;
        const connectDuration = logger.endTimer('wallet_connect');

        logger.logBlockchainOperation('wallet_connect', true, {
          wallet: result.wallet,
          address: result.address,
          duration: connectDuration
        });

        return {
          success: true,
          wallet: result.wallet,
          address: result.address
        };
      } else {
        logger.endTimer('wallet_connect');
        logger.logBlockchainOperation('wallet_connect', false, {
          error: result.error,
          errorCode: result.code
        });

        return {
          success: false,
          error: result.error
        };
      }
    } catch (error) {
      logger.endTimer('wallet_connect');

      // Create structured error for wallet connection failures
      const structuredError = ErrorFactory.create('wallet', typeof error === 'string' ? error : (error && error.message) || 'Unknown error', error.code, {
        originalError: error,
        operation: 'wallet_connection',
        walletType: this.getCurrentWalletType()
      });

      // Use error recovery service for comprehensive error handling
      const recovery = await errorRecoveryService.handleError(structuredError, {
        component: LogComponent.BLOCKCHAIN_ADAPTER,
        action: 'connect_wallet',
        operation: 'wallet_connection'
      });

      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        recovery: recovery.userMessage,
        category: recovery.category,
        requiresUserAction: recovery.requiresUserAction,
        queued: recovery.queued
      };
    }
  }

  async disconnectWallet() {
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'disconnect_wallet', 'Disconnecting wallet', {
      pendingEdits: this.editTracker.size,
      syncStatus: this.syncStatus.isConnected
    });
    
    try {
      await this.walletManager.disconnect();
      this.syncStatus.isConnected = false;
      
      const clearedEdits = this.editTracker.size;
      this.editTracker.clear();
      
      logger.logBlockchainOperation('wallet_disconnect', true, {
        clearedEdits,
        wasConnected: this.syncStatus.isConnected
      });
    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'disconnect_wallet', 'Failed to disconnect wallet', {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack
      });
    }
  }

  trackCellEdit(row, col, oldValue, newValue) {
    const cellKey = `${row}-${col}`;
    const cellRef = this.getCellReference(row, col);
    const edit = {
      row,
      col,
      oldValue,
      newValue,
      timestamp: Date.now()
    };

    this.editTracker.set(cellKey, edit);
    const previousPendingChanges = this.syncStatus.pendingChanges;
    this.syncStatus.pendingChanges = this.editTracker.size;

    logger.logCellOperation('tracked', cellRef, oldValue, newValue, {
      cellKey,
      timestamp: edit.timestamp,
      previousPendingChanges,
      currentPendingChanges: this.syncStatus.pendingChanges,
      valueChanged: oldValue !== newValue
    });
  }
  
  getCellReference(row, col) {
    // Validate input parameters
    if (row == null || col == null) {
      console.error('[BlockchainAdapter] Row or column cannot be null or undefined', {
        row: row,
        col: col
      });
      return 'INVALID'
    }
    
    const numRow = Number(row)
    const numCol = Number(col)
    
    if (isNaN(numRow) || isNaN(numCol) || numRow < 0 || numCol < 0) {
      console.error('[BlockchainAdapter] Row and column must be valid non-negative numbers', {
        row: row,
        col: col,
        numRow: numRow,
        numCol: numCol
      });
      return 'INVALID'
    }
    
    return String.fromCharCode(65 + numCol) + (numRow + 1);
  }

  isWalletConnected() {
    return this.walletManager.isConnected;
  }

  getWalletAddress() {
    const walletInfo = this.walletManager.getWalletInfo();
    return walletInfo.address;
  }

  getWalletInfo() {
    return this.walletManager.getWalletInfo();
  }

  /**
   * Get wallet balance in SUI
   * @returns {Promise<number>} Balance in SUI (not MIST)
   * @throws {Error} If wallet is not connected
   */
  async getWalletBalance() {
    if (!this.isWalletConnected()) {
      throw new Error('Wallet not connected');
    }

    const walletInfo = this.walletManager.getWalletInfo();
    const address = walletInfo.address;

    try {
      const balanceData = await this.suiService.getBalance(address);
      const balanceMIST = parseInt(balanceData.totalBalance || '0');
      const balanceSUI = balanceMIST / 1_000_000_000; // Convert MIST to SUI

      return balanceSUI;
    } catch (error) {
      throw new Error(`Failed to get wallet balance: ${error.message}`);
    }
  }

  generateVersion() {
    return `v${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async autoReconnect() {
    try {
      const reconnected = await this.walletManager.autoReconnect();
      if (reconnected) {
        this.syncStatus.isConnected = true;
      }
      return reconnected;
    } catch (error) {
      console.error('Auto-reconnect failed:', error);
      return false;
    }
  }

  getPendingEdits() {
    return Array.from(this.editTracker.values());
  }

  clearPendingEdits() {
    this.editTracker.clear();
    this.syncStatus.pendingChanges = 0;
  }

  // Reset transaction state (useful for manual recovery)
  resetTransactionState() {
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'reset_transaction_state', 'Manually resetting transaction state', {
      previousFailureCount: this.transactionState.failureCount,
      wasDisabled: this.transactionState.disabled,
      isProcessing: this.transactionState.isProcessing
    });

    this.transactionState = {
      isProcessing: false,
      lastTransaction: null,
      failureCount: 0,
      lastFailureTime: null,
      disabled: false,
      processingStartTime: null,
      processingTimeout: 30000 // 30 seconds timeout
    };

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'reset_transaction_state', 'Transaction state reset successfully');
  }

  // Get current transaction state for debugging
  getTransactionState() {
    // Merge TransactionManager state with circuit breaker state
    const managerState = transactionManager.getTransactionState(this.spreadsheetObjectId);
    return {
      ...this.transactionState,
      ...managerState,
      timeSinceLastFailure: this.transactionState.lastFailureTime ?
        Date.now() - this.transactionState.lastFailureTime : null,
      spreadsheetObjectId: this.spreadsheetObjectId
    };
  }

  // gRPC-based collaboration methods

  async connectToCollaboration() {
    logger.startTimer('collaboration_connect');
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'collaboration_connect', 'Attempting collaboration connection', {
      collaborationEnabled: this.syncStatus.collaborationEnabled,
      walletConnected: this.isWalletConnected()
    });
    
    try {
      if (!this.syncStatus.collaborationEnabled) {
        logger.warn(LogComponent.COLLABORATION, 'collaboration_disabled', 'Collaboration not enabled');
        return false;
      }

      if (!this.isWalletConnected()) {
        logger.warn(LogComponent.COLLABORATION, 'wallet_required', 'Wallet not connected, cannot join collaboration');
        return false;
      }

      const user = await this.collaborationService.connectUser();
      const connectDuration = logger.endTimer('collaboration_connect');
      
      logger.info(LogComponent.COLLABORATION, 'collaboration_connected', 'Connected to collaboration successfully', {
        userName: user.userName,
        userId: user.userId,
        duration: connectDuration
      });
      return true;
    } catch (error) {
      logger.endTimer('collaboration_connect');
      logger.error(LogComponent.COLLABORATION, 'collaboration_connect_failed', 'Failed to connect to collaboration', {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack
      });
      return false;
    }
  }

  async disconnectFromCollaboration() {
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'collaboration_disconnect', 'Disconnecting from collaboration');
    
    try {
      await this.collaborationService.disconnectUser();
      logger.info(LogComponent.COLLABORATION, 'collaboration_disconnected', 'Disconnected from collaboration successfully');
    } catch (error) {
      logger.error(LogComponent.COLLABORATION, 'collaboration_disconnect_failed', 'Failed to disconnect from collaboration', {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack
      });
    }
  }

  // Handle blockchain events from gRPC
  handleBlockchainEvent(event) {
    console.log('Blockchain event:', event);
    
    switch (event.type) {
      case 'SpreadsheetCreated':
        this.spreadsheetObjectId = event.data.spreadsheet_id;
        console.log('Spreadsheet created on-chain:', this.spreadsheetObjectId);
        break;
        
      case 'VersionSaved':
        console.log('Version saved on-chain:', event.data.version_id);
        this.syncStatus.lastSync = Date.now();
        break;
        
      case 'CellLocked':
        console.log('Cell locked:', event.data.cell_ref);
        break;
        
      case 'CellUnlocked':
        console.log('Cell unlocked:', event.data.cell_ref);
        break;
    }
  }

  // Lock a cell for editing (gRPC-based)
  async lockCellForEditing(cellRef) {
    logger.startTimer(`cell_lock_${cellRef}`);
    logger.info(LogComponent.COLLABORATION, 'cell_lock_attempt', 'Attempting to lock cell for editing', {
      cellRef,
      collaborationEnabled: this.syncStatus.collaborationEnabled
    });
    
    try {
      if (!this.syncStatus.collaborationEnabled) {
        logger.debug(LogComponent.COLLABORATION, 'cell_lock_disabled', 'Collaboration not enabled, cell locking disabled', { cellRef });
        return true; // Allow editing without locking
      }

      const result = await this.collaborationService.lockCell(cellRef);
      const lockDuration = logger.endTimer(`cell_lock_${cellRef}`);
      
      if (result.success) {
        logger.info(LogComponent.COLLABORATION, 'cell_locked', 'Cell locked for editing successfully', {
          cellRef,
          duration: lockDuration
        });
      } else {
        logger.warn(LogComponent.COLLABORATION, 'cell_lock_failed', 'Cell lock request failed', {
          cellRef,
          error: result.error
        });
      }
      
      return result.success;
    } catch (error) {
      logger.endTimer(`cell_lock_${cellRef}`);
      logger.error(LogComponent.COLLABORATION, 'cell_lock_error', 'Failed to lock cell due to error', {
        cellRef,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack
      });
      return false;
    }
  }

  // Unlock a cell (gRPC-based)
  async unlockCell(cellRef) {
    logger.debug(LogComponent.COLLABORATION, 'cell_unlock_attempt', 'Attempting to unlock cell', {
      cellRef,
      collaborationEnabled: this.syncStatus.collaborationEnabled
    });
    
    try {
      if (!this.syncStatus.collaborationEnabled) {
        logger.debug(LogComponent.COLLABORATION, 'cell_unlock_disabled', 'Collaboration disabled, skipping unlock', { cellRef });
        return; // No-op if collaboration disabled
      }

      await this.collaborationService.unlockCell(cellRef);
      logger.info(LogComponent.COLLABORATION, 'cell_unlocked', 'Cell unlocked successfully', { cellRef });
    } catch (error) {
      logger.error(LogComponent.COLLABORATION, 'cell_unlock_error', 'Failed to unlock cell', {
        cellRef,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack
      });
    }
  }

  // Check if current user can edit a cell
  canEditCell(cellRef) {
    if (!this.syncStatus.collaborationEnabled) {
      return true; // Allow editing if collaboration disabled
    }

    return this.collaborationService.canEditCell(cellRef);
  }

  // Get cell lock status
  getCellLockStatus(cellRef) {
    if (!this.syncStatus.collaborationEnabled) {
      return null;
    }

    return this.collaborationService.getCellLockStatus(cellRef);
  }

  // Get collaboration state
  getCollaborationState() {
    if (!this.syncStatus.collaborationEnabled) {
      return {
        enabled: false,
        activeUsers: [],
        lockedCells: {},
        currentUser: null
      };
    }

    return this.collaborationService.getCollaborationState();
  }

  // Optimized single-transaction spreadsheet creation with combined operations
  async createNewSpreadsheetOptimized(title = 'Untitled Spreadsheet', initialData = null) {
    logger.startTimer('create_optimized_spreadsheet');
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'create_optimized_start', 'Starting optimized spreadsheet creation', {
      title,
      hasInitialData: !!initialData,
      walletConnected: this.isWalletConnected()
    });

    // REQUIRE Sui to be configured for creation so that Walrus blob is referenced on-chain
    const networkConfig = await this.getCurrentNetworkConfig();
    if (!networkConfig?.packageId || !networkConfig?.registryObjectId) {
      logger.endTimer('create_optimized_spreadsheet');
      return { success: false, error: 'Sui is not configured for the current network. Set packageId and registryObjectId.' };
    }

    // Run validation before starting creation
    try {
      await this.validateConfiguration();
    } catch (error) {
      logger.endTimer('create_optimized_spreadsheet');
      return { success: false, error: `Configuration validation failed: ${typeof error === 'string' ? error : (error && error.message) || 'Unknown error'}` };
    }

    if (!this.isWalletConnected()) {
      logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'create_optimized_blocked', 'Creation blocked - wallet not connected');
      return {
        success: false,
        error: 'Wallet not connected'
      };
    }

    try {
      // Step 1: Prepare data for storage
      const spreadsheetData = initialData || this.createEmptySpreadsheetData(title);

      // Step 2: Store data to Walrus first (faster, no wallet interaction)
      logger.startTimer('walrus_storage_optimized');

      // Get default epochs from config via configLoader
      const runtimeConfig = await this.configLoader.getConfig();
      const networkConfig = runtimeConfig.getCurrentNetwork();
      const defaultEpochs = networkConfig.walrus?.features?.epochsDefault || 50;

      logger.info(LogComponent.STORAGE_SERVICE, 'walrus_store_optimized', `Storing spreadsheet data in Walrus with ${defaultEpochs} epochs`);

      await this.walrusService.connect();

      const walrusResult = await this.walrusService.storeBlob(spreadsheetData, {
        epochs: defaultEpochs,
        contentType: 'application/json'
      });

      if (!walrusResult.success) {
        logger.endTimer('walrus_storage_optimized');
        throw {
          stage: 'walrus',
          message: `Walrus storage failed: ${walrusResult.error}`,
          details: walrusResult
        };
      }

      logger.endTimer('walrus_storage_optimized');
      logger.info(LogComponent.STORAGE_SERVICE, 'walrus_store_optimized', 'Data stored in Walrus', {
        blobId: walrusResult.blobId,
        size: walrusResult.size
      });

      // Immediately persist blob ID to storage to avoid losing it if blockchain transaction fails
      if (this.storageAdapter && walrusResult.blobId) {
        try {
          this.storageAdapter.setLastWalrusBlobId(walrusResult.blobId);
          logger.info(LogComponent.STORAGE_SERVICE, 'blob_persisted', 'Blob ID persisted to storage', {
            blobId: walrusResult.blobId
          });
        } catch (e) {
          logger.warn(LogComponent.STORAGE_SERVICE, 'blob_persist_failed', 'Failed to persist blob ID', {
            error: typeof e === 'string' ? e : e?.message
          });
        }
      }

      // Step 3: Create SINGLE combined transaction (NEW APPROACH)
      logger.startTimer('combined_transaction_create');
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'combined_transaction', 'Creating single combined transaction for creation + version save');

      const cellCount = Object.keys(spreadsheetData.cells || {}).length;
      const description = `Initial version created ${new Date().toLocaleString()}`;
      
      // Execute the two separate transactions (createSpreadsheetWithInitialVersion handles this now)
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'wallet_prompt_combined', 'Two wallet prompts: Create spreadsheet + save initial version');

      let combinedResult;
      try {
        combinedResult = await this.suiService.createSpreadsheetWithInitialVersion(
          title,
          walrusResult.blobId,
          walrusResult.contentHash?.hash,
          cellCount,
          description
        );
      } catch (txError) {
        // Extract module name from stack trace for better diagnostics
        const stack = typeof txError === 'string' ? '' : txError?.stack || '';
        const moduleName = stack.match(/at ([^(]+)/)?.[1] || 'createSpreadsheetWithInitialVersion';

        logger.endTimer('combined_transaction_create');
        throw {
          stage: 'createTx',
          message: `Failed in ${moduleName}: ${typeof txError === 'string' ? txError : (txError?.message || 'Unknown error')}`,
          stack,
          details: txError,
          moduleName
        };
      }

      if (!combinedResult.success) {
        logger.endTimer('combined_transaction_create');
        throw {
          stage: 'createTx',
          message: `Failed to create spreadsheet with initial version: ${combinedResult.error || 'Unknown error'}`,
          details: combinedResult
        };
      }

      // Extract spreadsheet object ID from the result
      const spreadsheetObjectId = combinedResult.spreadsheetObjectId;

      // Debug logging to see actual transaction results
      console.log('📊 Debug - two-transaction results:', {
        spreadsheetObjectId,
        createTransactionDigest: combinedResult.createTransactionDigest,
        saveTransactionDigest: combinedResult.saveTransactionDigest,
        hasObjectChanges: !!combinedResult.objectChanges,
        objectChangeCount: combinedResult.objectChanges?.length || 0
      });

      if (!spreadsheetObjectId) {
        logger.endTimer('combined_transaction_create');
        throw {
          stage: 'createTx',
          message: `Failed to get spreadsheet object ID from two-transaction result`,
          details: { combinedResult }
        };
      }

      this.spreadsheetObjectId = spreadsheetObjectId;

      // Persist to storage immediately so UI has reference even if something fails later
      if (this.storageAdapter) {
        try {
          this.storageAdapter.setCurrentSpreadsheetId(spreadsheetObjectId);
          logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_persisted', 'Spreadsheet ID persisted to storage', {
            spreadsheetId: spreadsheetObjectId
          });
        } catch (e) {
          logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_persist_failed', 'Failed to persist spreadsheet ID', {
            error: typeof e === 'string' ? e : e?.message
          });
        }
      }
      logger.endTimer('combined_transaction_create');
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'two_transaction_success', 'Two transactions executed successfully - spreadsheet created AND initial version saved!', {
        objectId: this.spreadsheetObjectId,
        createTransactionDigest: combinedResult.createTransactionDigest,
        saveTransactionDigest: combinedResult.saveTransactionDigest,
        optimization: 'TWO_WALLET_PROMPTS'
      });

      // Step 5: Update state and return result
      this.syncStatus.lastSync = Date.now();
      this.syncStatus.pendingChanges = 0;
      this.editTracker.clear();

      const duration = logger.endTimer('create_optimized_spreadsheet');
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'create_optimized_completed', 'ULTRA-OPTIMIZED spreadsheet creation completed with SINGLE transaction!', {
        duration,
        spreadsheetId: this.spreadsheetObjectId,
        walrusBlobId: walrusResult.blobId,
        title,
        hasInitialData: !!initialData,
        optimization: 'SINGLE_COMBINED_TRANSACTION',
        walletPrompts: 1 // Previously was 2!
      });

      // Calculate expiry timestamp from epochs
      const expiryTimestamp = walrusResult.endEpoch ?
        new Date(walrusResult.endEpoch * 1000).getTime() :
        Date.now() + defaultEpochs * 86400000; // Default to epochs in milliseconds

      // Build saveInfo object matching SpreadsheetEngine format for UI confirmation
      const saveInfo = {
        blobId: walrusResult.blobId,
        walrusBlobId: walrusResult.blobId,
        transactionDigest: combinedResult.saveTransactionDigest,
        createTransactionDigest: combinedResult.createTransactionDigest,
        contentHash: walrusResult.contentHash?.hash || walrusResult.contentHash || 'unknown',
        storageStatus: walrusResult.storageStatus || 'newly_created',
        expiryTimestamp,
        endEpoch: walrusResult.endEpoch,
        method: 'blockchain',
        storageStrategy: 'standard',
        timestamp: Date.now(),
        isFirstSave: true
      };

      return {
        success: true,
        spreadsheetId: this.spreadsheetObjectId,
        blobId: walrusResult.blobId,
        walrusBlobId: walrusResult.blobId,
        title,
        data: spreadsheetData,
        transactionDigest: combinedResult.saveTransactionDigest,
        transactionId: combinedResult.saveTransactionDigest,
        createTransactionDigest: combinedResult.createTransactionDigest,
        contentHash: walrusResult.contentHash?.hash || walrusResult.contentHash || 'unknown',
        storageStatus: walrusResult.storageStatus || 'newly_created',
        expiryTimestamp,
        endEpoch: walrusResult.endEpoch,
        method: 'blockchain',
        storageStrategy: 'standard',
        timestamp: Date.now(),
        optimized: true,
        ultraOptimized: true,
        walletPrompts: 1,
        saveInfo
      };

    } catch (error) {
      logger.endTimer('create_optimized_spreadsheet');

      // Handle structured error format from different stages
      const errorStage = error?.stage || 'unknown';
      const errorMessage = error?.message || (typeof error === 'string' ? error : (error && error.message) || 'Unknown error');
      const moduleName = error?.moduleName || (error?.stack?.match(/at ([^(]+)/) ? error.stack.match(/at ([^(]+)/)[1] : 'unknown');
      const stack = error?.stack || '';

      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'create_optimized_failed', 'Optimized spreadsheet creation failed', {
        stage: errorStage,
        error: errorMessage,
        moduleName,
        stack: stack.substring(0, 500), // Limit stack trace to 500 chars for logging
        details: error?.details || {}
      });

      return {
        success: false,
        error: errorMessage,
        stage: errorStage,
        moduleName,
        stack,
        details: error?.details || {},
        // Include blob ID if we got that far (for potential recovery)
        blobId: error?.details?.blobId || undefined
      };
    }
  }

  // Create a new empty spreadsheet with blockchain integration (legacy method)
  async createNewSpreadsheet(title = 'Untitled Spreadsheet') {
    return this.createNewSpreadsheetOptimized(title, null);
  }

  // Create empty spreadsheet data structure
  createEmptySpreadsheetData(title) {
    return {
      version: `v${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      savedAt: Date.now(),
      title: title,
      cells: {},
      edits: [],
      metadata: {
        title: title,
        rows: 100,
        cols: 26,
        sheets: [{
          name: 'Sheet1',
          index: 0,
          order: 0,
          status: 1
        }]
      }
    };
  }

  // Enhanced blockchain save method with redundancy and delta compression support
  async saveToBlockchainEnhanced(data, options = {}) {
    logger.startTimer('blockchain_save_enhanced');
    const saveId = `save-enhanced-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Normalize incoming data shape (engine vs UI producer)
    const normalizedData = this._normalizeSpreadsheetData(data);
    const rawDataSize = JSON.stringify(normalizedData).length;

    // Enhanced options with defaults
    const enhancedOptions = {
      useRedundancy: options.useRedundancy || false,
      redundancyLevel: options.redundancyLevel || 3,
      useDeltaCompression: options.useDeltaCompression || true,
      compressionThreshold: options.compressionThreshold || 1.3, // 30% compression minimum
      criticalData: options.criticalData || false,
      ...options
    };
    
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'save_enhanced_start', `[${saveId}] 🚀 Starting enhanced blockchain save`, {
      saveId,
      dataSize: rawDataSize,
      useRedundancy: enhancedOptions.useRedundancy,
      redundancyLevel: enhancedOptions.redundancyLevel,
      useDeltaCompression: enhancedOptions.useDeltaCompression,
      criticalData: enhancedOptions.criticalData,
      hasSpreadsheetId: !!this.spreadsheetObjectId
    });

    if (!this.isWalletConnected()) {
      logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'save_enhanced_blocked', 'Enhanced save blocked - wallet not connected');
      return { success: false, error: 'Wallet not connected' };
    }

    try {
      // Step 1: Determine storage strategy
      let storageStrategy = 'standard';
      let previousBlobId = null;
      
      if (enhancedOptions.useDeltaCompression && this.spreadsheetObjectId) {
        // Try to get previous version for delta compression
        try {
          const versions = await this.suiService.getSpreadsheetVersions(this.spreadsheetObjectId);
          if (versions.length > 0) {
            previousBlobId = versions[0].walrus_blob_id;
            storageStrategy = 'delta-compression';
          }
        } catch (deltaError) {
          console.warn('⚠️ Could not retrieve previous version for delta compression, using standard storage');
        }
      }
      
      if (enhancedOptions.useRedundancy || enhancedOptions.criticalData) {
        storageStrategy = storageStrategy === 'delta-compression' ? 'delta-with-redundancy' : 'redundancy';
      }
      
      console.log(`💾 Using storage strategy: ${storageStrategy}`);

      // Step 2: Enhanced storage with selected strategy
      logger.startTimer('walrus_storage_enhanced');
      let walrusResult;
      
      switch (storageStrategy) {
        case 'delta-compression':
          console.log('📊 Storing with delta compression');
          walrusResult = await this.walrusService.storeDeltaVersion(
            this.spreadsheetObjectId || data.title,
            data,
            previousBlobId,
            { chunk: options.chunk }
          );
          break;
          
        case 'redundancy':
          console.log(`🛡️ Storing with ${enhancedOptions.redundancyLevel}x redundancy`);
          walrusResult = await this.walrusService.storeWithRedundancy(
            data,
            enhancedOptions.redundancyLevel,
            { spreadsheetId: this.spreadsheetObjectId || data.title, chunk: options.chunk }
          );
          break;
          
        case 'delta-with-redundancy':
          console.log(`📊🛡️ Storing with delta compression AND ${enhancedOptions.redundancyLevel}x redundancy`);
          // First create delta version
          const deltaResult = await this.walrusService.storeDeltaVersion(
            this.spreadsheetObjectId || data.title,
            data,
            previousBlobId,
            { chunk: options.chunk }
          );

          if (deltaResult.success && deltaResult.compressionInfo?.compressionRatio >= enhancedOptions.compressionThreshold) {
            // Delta was effective, now store with redundancy
            walrusResult = await this.walrusService.storeWithRedundancy(
              deltaResult.data || data,
              enhancedOptions.redundancyLevel,
              {
                spreadsheetId: this.spreadsheetObjectId || data.title,
                isDelta: true,
                compressionRatio: deltaResult.compressionInfo.compressionRatio,
                chunk: options.chunk
              }
            );
            walrusResult.compressionInfo = deltaResult.compressionInfo;
          } else {
            // Delta wasn't effective, fallback to redundancy only
            console.log('⚠️ Delta compression not effective, using redundancy only');
            walrusResult = await this.walrusService.storeWithRedundancy(
              data,
              enhancedOptions.redundancyLevel,
              { spreadsheetId: this.spreadsheetObjectId || data.title, chunk: options.chunk }
            );
          }
          break;
          
        default: // 'standard'
          console.log('💾 Using standard storage');
          walrusResult = await this.walrusService.storeBlob(data, {
            epochs: options.epochs || 50,
            spreadsheetId: this.spreadsheetObjectId || data.title,
            chunk: options.chunk
          });
          break;
      }
      
      logger.endTimer('walrus_storage_enhanced');

      if (!walrusResult.success) {
        throw new Error(`Enhanced Walrus storage failed: ${walrusResult.error}`);
      }

      // Step 3: Create enhanced blockchain transaction
      logger.startTimer('blockchain_transaction_enhanced');
      
      const cellCount = Object.keys(normalizedData.cells || {}).length;
      const contentHash = walrusResult.contentHash?.hash || 'unknown';
      
      let transaction;
      const transactionData = {
        spreadsheetObjectId: this.spreadsheetObjectId,
        walrusBlobId: walrusResult.blobId || walrusResult.primaryBlobId,
        redundantBlobIds: walrusResult.allBlobIds?.slice(1) || [],
        contentHash,
        cellCount,
        version: normalizedData.version || this.generateVersion(),
        description: `Enhanced v${normalizedData.version || this.generateVersion()} - ${storageStrategy}`,
        isDelta: storageStrategy.includes('delta'),
        compressionRatio: walrusResult.compressionInfo?.compressionRatio || 1.0,
        integrityVerified: true
      };

      let executeResult;

      if (!this.spreadsheetObjectId) {
        // Handle new spreadsheet with enhanced features
        // NOTE: createSpreadsheetWithInitialVersion executes BOTH transactions internally
        // (create spreadsheet + save initial version), so we use its result directly
        console.log('🚀 Creating new spreadsheet with enhanced combined transaction');

        let description;
        if (enhancedOptions.useRedundancy) {
          // Use enhanced metadata in description
          const enhancedMetadata = {
            desc: transactionData.description,
            redundant: transactionData.redundantBlobIds?.length > 0,
            delta: transactionData.isDelta,
            compression: transactionData.compressionRatio
          };
          // Stringify and truncate to <= 500 chars
          description = JSON.stringify(enhancedMetadata).substring(0, 500);
        } else {
          description = transactionData.description;
        }

        executeResult = await this.suiService.createSpreadsheetWithInitialVersion(
          normalizedData.title || 'WalSheetz Spreadsheet',
          transactionData.walrusBlobId,
          contentHash,
          cellCount,
          description
        );

        logger.endTimer('blockchain_transaction_enhanced');

        if (!executeResult.success) {
          throw new Error(`Enhanced blockchain transaction failed: ${executeResult.error || 'Unknown error'}`);
        }

        // Extract and store the spreadsheet object ID from the result
        if (executeResult.spreadsheetObjectId) {
          this.spreadsheetObjectId = executeResult.spreadsheetObjectId;
        }
      } else {
        // Update existing spreadsheet - create TransactionBlock and execute it
        let transaction;
        if (enhancedOptions.useRedundancy || storageStrategy.includes('delta')) {
          // Use enhanced metadata in description
          const enhancedMetadata = {
            desc: transactionData.description,
            redundant: transactionData.redundantBlobIds?.length > 0,
            delta: transactionData.isDelta,
            compression: transactionData.compressionRatio
          };
          // Stringify and truncate to <= 500 chars
          transactionData.description = JSON.stringify(enhancedMetadata).substring(0, 500);
          transaction = this.suiService.createStorageTransaction(transactionData);
        } else {
          transaction = this.suiService.createStorageTransaction(transactionData);
        }

        // Execute transaction
        executeResult = await this.suiService.executeTransaction(transaction);
        logger.endTimer('blockchain_transaction_enhanced');

        if (!executeResult.success) {
          throw new Error(`Enhanced blockchain transaction failed: ${executeResult.error}`);
        }
      }

      // Clear edit tracking
      this.editTracker.clear();
      this.syncStatus.lastSyncTime = Date.now();
      this.syncStatus.pendingChanges = 0;

      // Update session with latest save info
      if (this.storageAdapter && walrusResult) {
        this.storageAdapter.setCurrentSpreadsheetId(this.spreadsheetObjectId);
        this.storageAdapter.setLastWalrusBlobId(walrusResult.blobId || walrusResult.primaryBlobId);
        if (normalizedData?.title) {
          this.storageAdapter.setSpreadsheetTitle(normalizedData.title);
        }
      }

      const totalDuration = logger.endTimer('blockchain_save_enhanced');

      // Extract transaction digest from result (format differs for new vs existing spreadsheets)
      const transactionDigest = executeResult.digest || executeResult.saveTransactionDigest || executeResult.createTransactionDigest;

      // Calculate expiry timestamp from endEpoch
      const expiryTimestamp = walrusResult.endEpoch ?
        new Date(walrusResult.endEpoch * 1000).getTime() :
        Date.now() + (enhancedOptions.epochs || 50) * 86400000;

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'save_enhanced_success', '🎉 Enhanced blockchain save completed', {
        saveId,
        strategy: storageStrategy,
        blobId: walrusResult.blobId || walrusResult.primaryBlobId,
        redundantBlobIds: walrusResult.allBlobIds?.slice(1)?.length || 0,
        compressionRatio: walrusResult.compressionInfo?.compressionRatio,
        transactionDigest,
        spreadsheetObjectId: this.spreadsheetObjectId,
        duration: totalDuration
      });

      return {
        success: true,
        method: 'enhanced',
        storageStrategy,
        blobId: walrusResult.blobId || walrusResult.primaryBlobId,
        walrusBlobId: walrusResult.blobId || walrusResult.primaryBlobId,
        redundantBlobIds: walrusResult.allBlobIds?.slice(1) || [],
        compressionInfo: walrusResult.compressionInfo,
        transactionDigest,
        contentHash: walrusResult.contentHash?.hash || walrusResult.contentHash || 'unknown',
        storageStatus: walrusResult.storageStatus || 'newly_created',
        expiryTimestamp,
        endEpoch: walrusResult.endEpoch,
        spreadsheetObjectId: this.spreadsheetObjectId,
        duration: totalDuration,
        enhancedFeatures: {
          redundancy: enhancedOptions.useRedundancy,
          deltaCompression: storageStrategy.includes('delta'),
          integrityVerification: true
        }
      };

    } catch (error) {
      logger.endTimer('blockchain_save_enhanced');
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'save_enhanced_failed', 'Enhanced blockchain save failed', {
        saveId,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      });

      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        method: 'enhanced'
      };
    }
  }

  // Sequenced save with write coalescing and debouncing
  async saveToBlockchainSequenced(data, options = {}) {
    const spreadsheetId = this.spreadsheetObjectId || 'pending';
    
    // Clear existing debounce timer
    if (this.debounceTimers.has(spreadsheetId)) {
      clearTimeout(this.debounceTimers.get(spreadsheetId));
    }
    
    // Add to queue
    if (!this.saveQueueBySheet.has(spreadsheetId)) {
      this.saveQueueBySheet.set(spreadsheetId, []);
    }
    const queue = this.saveQueueBySheet.get(spreadsheetId);
    queue.push({ data, options, timestamp: Date.now() });
    
    // Limit queue size
    if (queue.length > this.maxBatchSize) {
      queue.splice(0, queue.length - this.maxBatchSize);
    }
    
    // Set new debounce timer
    return new Promise((resolve, reject) => {
      const timer = setTimeout(async () => {
        this.debounceTimers.delete(spreadsheetId);
        
        // Check if there's already a save in progress
        if (this.pendingSavesBySheet.has(spreadsheetId)) {
          // Wait for current save to complete
          try {
            await this.pendingSavesBySheet.get(spreadsheetId);
          } catch (e) {
            // Previous save failed, continue with new one
          }
        }
        
        // Process queued saves
        const toProcess = this.saveQueueBySheet.get(spreadsheetId) || [];
        this.saveQueueBySheet.set(spreadsheetId, []);
        
        if (toProcess.length === 0) {
          resolve({ success: true, skipped: true });
          return;
        }
        
        // Merge all pending data
        const mergedData = this.mergeQueuedData(toProcess);
        const mergedOptions = { ...toProcess[toProcess.length - 1].options, batched: true };
        
        // Create save promise and store it
        const savePromise = this.saveToBlockchain(mergedData, mergedOptions);
        this.pendingSavesBySheet.set(spreadsheetId, savePromise);
        
        try {
          const result = await savePromise;
          this.pendingSavesBySheet.delete(spreadsheetId);
          resolve(result);
        } catch (error) {
          this.pendingSavesBySheet.delete(spreadsheetId);
          reject(error);
        }
      }, this.debounceDelay);
      
      this.debounceTimers.set(spreadsheetId, timer);
    });
  }
  
  // Merge multiple queued data updates into a single update
  mergeQueuedData(queue) {
    if (queue.length === 0) return {};
    if (queue.length === 1) return queue[0].data;
    
    // Start with the first item
    const merged = JSON.parse(JSON.stringify(queue[0].data));
    
    // Merge all subsequent items
    for (let i = 1; i < queue.length; i++) {
      const item = queue[i].data;
      
      // Merge cells
      if (item.cells) {
        merged.cells = { ...(merged.cells || {}), ...item.cells };
      }
      
      // Update metadata
      if (item.title) merged.title = item.title;
      if (item.description) merged.description = item.description;
      
      // Merge styles
      if (item.styles) {
        merged.styles = { ...(merged.styles || {}), ...item.styles };
      }
      
      // Merge formulas
      if (item.formulas) {
        merged.formulas = { ...(merged.formulas || {}), ...item.formulas };
      }
    }
    
    // Update cell count
    merged.cellCount = Object.keys(merged.cells || {}).length;
    merged.batchedCount = queue.length;
    merged.description = `Batched ${queue.length} edits`;
    
    return merged;
  }

  /**
   * Handle partial save scenario (Walrus succeeded, blockchain failed)
   * @private
   */
  _handlePartialSave(atomicResult, normalizedData) {
    const walrusResult = atomicResult.results?.find(r => r.name === 'walrus_storage');
    const blockchainResult = atomicResult.results?.find(r => r.name === 'blockchain_execution');

    // Only handle if Walrus succeeded but blockchain failed
    if (!walrusResult?.success || blockchainResult?.success) {
      return { handled: false };
    }

    // Create partial save info object
    const partialSaveInfo = {
      status: 'walrus_only',
      blobId: walrusResult.blobId,
      contentHash: walrusResult.contentHash || walrusResult.contentHash?.hash,
      size: walrusResult.size,
      timestamp: Date.now(),
      expiryTimestamp: walrusResult.expiryTimestamp,
      endEpoch: walrusResult.endEpoch,
      walrusSuccess: true,
      blockchainSuccess: false,
      blockchainError: atomicResult.error || 'Blockchain execution failed',
      pendingBlockchainData: {
        spreadsheetObjectId: this.spreadsheetObjectId,
        walrusBlobId: walrusResult.blobId,
        contentHash: walrusResult.contentHash || walrusResult.contentHash?.hash,
        cellCount: Object.keys(normalizedData.cells || {}).length
      }
    };

    // Log the partial save
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'partial_save_captured',
      'Partial save captured: Walrus succeeded, blockchain failed', {
        blobId: walrusResult.blobId,
        blockchainError: atomicResult.error
      });

    // Store partial save info for potential retry
    this.storageAdapter?.setPartialSaveInfo(partialSaveInfo);

    return {
      handled: true,
      partialSaveInfo
    };
  }

  // Enhanced blockchain save method with progressive enhancement and transaction modal support
  async saveToBlockchain(data, options = {}) {
    logger.startTimer('blockchain_save');
    const saveId = `save-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // PREFLIGHT VALIDATION - Early error detection using actual adapter methods

    // 1. Check wallet connection using actual method
    if (!this.isWalletConnected()) {
      logger.endTimer('blockchain_save');
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'preflight_failed', 'Wallet not connected');
      return {
        success: false,
        error: 'Wallet not connected',
        details: 'Please connect your Sui wallet before saving',
        preflight: true
      };
    }

    // 2. Get runtime config using actual method
    const config = await this.getRuntimeConfig();
    if (!config) {
      logger.endTimer('blockchain_save');
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'preflight_failed', 'Configuration not loaded');
      return {
        success: false,
        error: 'Configuration not loaded',
        details: 'App configuration is missing. Try refreshing the page.',
        preflight: true
      };
    }

    // 3. Get network config and check Sui setup using actual method
    const networkConfig = await this.getCurrentNetworkConfig();
    if (!networkConfig?.packageId || !networkConfig?.registryObjectId) {
      logger.endTimer('blockchain_save');
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'preflight_failed', 'Sui not configured', {
        network: networkConfig?.name || 'unknown',
        hasPackageId: !!networkConfig?.packageId,
        hasRegistryObjectId: !!networkConfig?.registryObjectId
      });
      return {
        success: false,
        error: 'Sui is not configured for the current network',
        details: 'Set packageId and registryObjectId in app-config.json',
        preflight: true
      };
    }

    // 4. Check Walrus service is initialized
    if (!this.walrusService) {
      logger.endTimer('blockchain_save');
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'preflight_failed', 'Walrus service not initialized');
      return {
        success: false,
        error: 'Walrus storage service not available',
        details: 'Storage service failed to initialize. Try refreshing the page.',
        preflight: true
      };
    }

    // Normalize incoming data shape (engine vs UI producer)
    const normalizedData = this._normalizeSpreadsheetData(data)
    const rawDataSize = JSON.stringify(normalizedData).length;
    
    // Define atomic operations for save process
    const atomicOperations = this._createAtomicSaveOperations(normalizedData, options);

    // Execute operations atomically
    const atomicResult = await atomicOperationManager.executeAtomic(atomicOperations, {
      saveId,
      normalizedData,
      options,
      spreadsheetObjectId: this.spreadsheetObjectId
    });

    if (atomicResult.success) {
      // Update state based on successful atomic operation
      const finalResult = atomicResult.results[atomicResult.results.length - 1]; // Get the final operation result

      // Extract results from different operations
      const walrusResult = atomicResult.results.find(r => r.name === 'walrus_storage');
      const blockchainResult = atomicResult.results.find(r => r.name === 'blockchain_execution');

      if (walrusResult && blockchainResult) {
        // Update sync status and session info
        this.syncStatus.lastSync = Date.now();
        this.syncStatus.pendingChanges = 0;
        this.editTracker.clear();

        // Update session with latest save info
        if (this.storageAdapter && walrusResult.success) {
          this.storageAdapter.setCurrentSpreadsheetId(this.spreadsheetObjectId);
          this.storageAdapter.setLastWalrusBlobId(walrusResult.blobId);
          if (normalizedData.title) {
            this.storageAdapter.setSpreadsheetTitle(normalizedData.title);
          }
        }

        // Calculate expiry timestamp from epochs
        const expiryTimestamp = walrusResult.endEpoch ?
          new Date(walrusResult.endEpoch * 1000).getTime() :
          Date.now() + (options.epochs || 50) * 86400000; // Fallback to epochs in milliseconds

        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'save_completed', 'Parallel save operation completed successfully', {
          duration: logger.endTimer('blockchain_save'),
          walrusSuccess: walrusResult.success,
          blockchainSuccess: blockchainResult.success,
          method: 'parallel_atomic_processing'
        });

        return {
          success: true,
          blobId: walrusResult.blobId,
          walrusBlobId: walrusResult.blobId,
          transactionDigest: blockchainResult.blockchainResult?.digest,
          transactionId: blockchainResult.blockchainResult?.digest,
          contentHash: walrusResult.contentHash?.hash || walrusResult.contentHash || 'unknown',
          storageStatus: walrusResult.storageStatus || 'newly_created',
          expiryTimestamp,
          endEpoch: walrusResult.endEpoch,
          spreadsheetId: this.spreadsheetObjectId,
          timestamp: Date.now(),
          method: 'blockchain',
          storageStrategy: options.storageStrategy || 'standard',
          blockchainSuccess: blockchainResult.success,
          walrusSuccess: walrusResult.success,
          atomicOperationId: atomicResult.operationId,
          parallelProcessing: true
        };
      } else {
        logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'save_incomplete', 'Parallel operations completed but missing expected results', {
          operations: atomicResult.results.map(r => r.name)
        });

        return {
          success: false,
          error: 'Parallel processing completed but missing required results',
          atomicOperationId: atomicResult.operationId,
          operationResults: atomicResult.results.map(r => ({ name: r.name, success: r.success }))
        };
      }

    } else {
      // Atomic operation failed with rollback
      logger.endTimer('blockchain_save');

      // Check if this is a partial save scenario
      const partialSaveResult = this._handlePartialSave(atomicResult, normalizedData);

      if (partialSaveResult.handled) {
        return {
          success: false,
          partial: true,
          ...partialSaveResult.partialSaveInfo
        };
      }

      // Use standardized error handler for consistent error processing
      const errorResult = await standardizedErrorHandler.processError(
        new Error(atomicResult.error),
        {
          operationId: atomicResult.operationId,
          parallelProcessing: true,
          rollbackCompleted: atomicResult.rollbackCompleted
        }
      );

      return {
        success: false,
        error: errorResult.userMessage,
        technicalError: atomicResult.error,
        atomicOperationId: atomicResult.operationId,
        rollbackCompleted: atomicResult.rollbackCompleted,
        category: errorResult.category,
        recoveryActions: errorResult.recoveryActions,
        requiresUserAction: errorResult.requiresUserAction,
        parallelProcessing: true
      };
    }
  }

  /**
   * Log operation step with standard formatting
   * Delegates to operationHelpers for standardized logging
   * @private
   */
  _logOperationStep(operationName, stage, message, metadata = {}) {
    return this.operationHelpers.logOperationStep(operationName, stage, message, metadata);
  }

  /**
   * Create a no-op cleanup handler factory
   * Delegates to operationHelpers
   * @private
   */
  _createNoOpCleanupHandler(operationName, resultProperty = null) {
    return this.operationHelpers.createNoOpCleanupHandler(operationName, resultProperty);
  }

  /**
   * Validate operation result field and throw if missing
   * Delegates to operationHelpers
   * @private
   */
  _validateOperationResult(result, fieldName, operationName) {
    return this.operationHelpers.validateOperationResult(result, fieldName, operationName);
  }

  /**
   * Get operation result from context by operation name
   * Delegates to operationHelpers
   * @private
   */
  _getOperationResult(context, operationName) {
    return this.operationHelpers.getOperationResult(context, operationName);
  }

  /**
   * Create atomic operations for the save process with parallel processing
   */
  _createAtomicSaveOperations(data, options) {
    // Create operations using factory functions
    const walrusOp = createWalrusStorageOp(this, data, options);
    const txPrepOp = createTxPrepOp(this, data);
    const blockchainOp = createBlockchainExecutionOp(this);

    return [walrusOp, txPrepOp, blockchainOp];
  }

  // Normalize various producer shapes into a single structure used for Walrus/Sui
  _normalizeSpreadsheetData(input) {
    const top = input || {}
    const nested = top.data || {}
    const cells = top.cells || nested.cells || top.celldata || {}
    // Extract title from multiple possible locations
    const title = top.title || nested.metadata?.title || top.metadata?.title || 'Untitled Spreadsheet'
    const version = top.version || nested.version || this.generateVersion()
    const timestamp = top.timestamp || Date.now()

    return {
      version,
      timestamp,
      title,
      cells,
      metadata: nested.metadata || top.metadata || { title },
      changes: top.changes || [],
      spreadsheetId: this.spreadsheetObjectId || top.spreadsheetId || title
    }
  }

  // Save with progressive enhancement - gracefully degrades based on service availability
  async saveWithProgressiveEnhancement(data, options = {}) {
    logger.startTimer('progressive_save');
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'progressive_save_start', 'Starting progressive save', {
      dataSize: JSON.stringify(data).length,
      hasSpreadsheetId: !!this.spreadsheetObjectId
    });

    // Check service health
    const serviceStatus = await progressiveEnhancementService.forceHealthCheck();

    // Primary save function (full blockchain + Walrus)
    const primarySave = async () => {
      return await this.saveToBlockchain(data, options);
    };

    // Fallback save function (local storage only)
    const fallbackSave = async () => {
      logger.warn(LogComponent.STORAGE_SERVICE, 'fallback_save_local', 'Using local storage fallback - blockchain unavailable');

      // EXCEPTION: localStorage fallback for network resilience (documented)
      // Data will be retried to blockchain when services recover
      const localKey = `walsheetz_fallback_${Date.now()}`;
      localStorage.setItem(localKey, JSON.stringify(data));

      // Update sync status
      this.syncStatus.lastSync = Date.now();
      this.syncStatus.pendingChanges = 0;
      this.editTracker.clear();

      // Emit event for UI notification
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('save:fallback', {
          detail: {
            message: 'Network disconnected - changes saved locally only',
            warning: 'Your data will sync to blockchain when connection is restored',
            localKey: localKey,
            action: 'retry_when_online',
            timestamp: Date.now()
          }
        }));

        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'fallback_event_emitted', 'Notified UI of fallback save', {
          localKey: localKey,
          message: 'Network disconnected - saved locally'
        });
      }

      return {
        success: true,
        method: 'local_fallback',
        localKey,
        message: 'Saved locally - will sync to blockchain when services are available',
        fallback: true,
        reason: 'Service degradation',
        userNotified: true
      };
    };

    // Execute with progressive enhancement
    const result = await progressiveEnhancementService.executeWithFallback(
      'save_blockchain',
      primarySave,
      fallbackSave,
      {
        operation: 'save_with_progressive_enhancement',
        dataSize: JSON.stringify(data).length,
        serviceStatus: serviceStatus.degradationLevel
      }
    );

    logger.endTimer('progressive_save');
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'progressive_save_complete', 'Progressive save completed', {
      success: result.success,
      method: result.method,
      fallback: result.fallback,
      degradationLevel: serviceStatus.degradationLevel
    });

    return result;
  }

  // Create spreadsheet with progressive enhancement
  async createSpreadsheetWithProgressiveEnhancement(title = 'Untitled Spreadsheet') {
    logger.startTimer('progressive_create');
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'progressive_create_start', 'Starting progressive create', {
      title,
      walletConnected: this.isWalletConnected()
    });

    // Check service health
    const serviceStatus = await progressiveEnhancementService.forceHealthCheck();

    // Primary create function (full blockchain integration)
    const primaryCreate = async () => {
      return await this.createNewSpreadsheetOptimized(title);
    };

    // Fallback create function (local only)
    const fallbackCreate = async () => {
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'fallback_create_local', 'Creating local-only spreadsheet');

      const emptyData = this.createEmptySpreadsheetData(title);

      return {
        success: true,
        method: 'local_fallback',
        data: emptyData,
        title,
        message: 'Created locally - will sync to blockchain when services are available',
        fallback: true,
        reason: 'Service degradation'
      };
    };

    // Execute with progressive enhancement
    const result = await progressiveEnhancementService.executeWithFallback(
      'create_spreadsheet',
      primaryCreate,
      fallbackCreate,
      {
        operation: 'create_with_progressive_enhancement',
        title,
        serviceStatus: serviceStatus.degradationLevel
      }
    );

    logger.endTimer('progressive_create');
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'progressive_create_complete', 'Progressive create completed', {
      success: result.success,
      method: result.method,
      fallback: result.fallback,
      hasSpreadsheetId: !!result.spreadsheetId
    });

    return result;
  }

  // Get enhanced sync status with progressive enhancement info
  getSyncStatus() {
    const collaborationState = this.getCollaborationState();
    const progressiveStatus = progressiveEnhancementService.getServiceStatus();

    return {
      ...this.syncStatus,
      pendingEdits: Array.from(this.editTracker.values()),
      // Wallet works with direct Sui service integration
      walletOnly: this.walletManager.isConnected,
      collaborationState: collaborationState,
      collaborationEnabled: this.syncStatus.collaborationEnabled,
      // Progressive enhancement status
      progressiveEnhancement: progressiveStatus,
      degradationLevel: progressiveStatus.degradationLevel,
      availableFeatures: progressiveEnhancementService.getAvailableFeatures(),
      statusMessage: progressiveEnhancementService.getStatusMessage(),
      recoveryEstimate: progressiveEnhancementService.getRecoveryEstimate()
    };
  }

  // Offline mode methods

  // Create spreadsheet in offline mode
  async createOfflineSpreadsheet(title = 'Untitled Spreadsheet') {
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'create_offline_start', 'Creating offline spreadsheet', { title });

    const result = await offlineModeService.createOfflineSpreadsheet(title);

    if (result.success) {
      // Set the current spreadsheet ID for consistency
      this.spreadsheetObjectId = result.spreadsheetId;
    }

    return result;
  }

  // Save spreadsheet in offline mode
  async saveOfflineSpreadsheet(data) {
    if (!this.spreadsheetObjectId) {
      throw new Error('No active spreadsheet - create one first');
    }

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'save_offline_start', 'Saving offline spreadsheet', {
      spreadsheetId: this.spreadsheetObjectId,
      dataSize: JSON.stringify(data).length
    });

    const result = await offlineModeService.saveOfflineSpreadsheet(this.spreadsheetObjectId, data);

    return result;
  }

  // Load spreadsheet from offline storage
  async loadOfflineSpreadsheet(spreadsheetId) {
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'load_offline_start', 'Loading offline spreadsheet', { spreadsheetId });

    const result = await offlineModeService.loadOfflineSpreadsheet(spreadsheetId);

    if (result.success) {
      this.spreadsheetObjectId = spreadsheetId;
    }

    return result;
  }

  // Get list of offline spreadsheets
  getOfflineSpreadsheets() {
    return offlineModeService.getOfflineSpreadsheets();
  }

  // Sync offline data when services become available
  async syncOfflineData() {
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'sync_offline_start', 'Starting offline data synchronization');

    const result = await offlineModeService.processPendingOperations();

    if (result) {
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'sync_offline_complete', 'Offline data sync completed', result);
    }

    return result;
  }

  // Get offline status
  getOfflineStatus() {
    return offlineModeService.getOfflineStatus();
  }

  // Enhanced create method that works both online and offline
  async createSpreadsheetSmart(title = 'Untitled Spreadsheet') {
    logger.startTimer('smart_create');
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'smart_create_start', 'Starting smart create', {
      title,
      isOnline: navigator.onLine
    });

    // Check if we should use offline mode
    const serviceStatus = await progressiveEnhancementService.forceHealthCheck();
    const shouldUseOffline = serviceStatus.degradationLevel >= 2 || !navigator.onLine;

    let result;

    if (shouldUseOffline) {
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'smart_create_offline', 'Using offline mode for creation');
      result = await this.createOfflineSpreadsheet(title);
    } else {
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'smart_create_online', 'Using online mode for creation');
      result = await this.createSpreadsheetWithProgressiveEnhancement(title);
    }

    logger.endTimer('smart_create');
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'smart_create_complete', 'Smart create completed', {
      success: result.success,
      offline: shouldUseOffline
    });

    return result;
  }

  // Enhanced save method that works both online and offline
  async saveSpreadsheetSmart(data) {
    logger.startTimer('smart_save');
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'smart_save_start', 'Starting smart save', {
      isOnline: navigator.onLine,
      hasSpreadsheetId: !!this.spreadsheetObjectId
    });

    // Check if we should use offline mode
    const serviceStatus = await progressiveEnhancementService.forceHealthCheck();
    const shouldUseOffline = serviceStatus.degradationLevel >= 2 || !navigator.onLine;

    let result;

    if (shouldUseOffline) {
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'smart_save_offline', 'Using offline mode for save');
      result = await this.saveOfflineSpreadsheet(data);
    } else {
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'smart_save_online', 'Using online mode for save');
      result = await this.saveWithProgressiveEnhancement(data);
    }

    logger.endTimer('smart_save');
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'smart_save_complete', 'Smart save completed', {
      success: result.success,
      offline: shouldUseOffline,
      method: result.method
    });

    return result;
  }

  // Queue data for later sync when blockchain services become available
  queueForLaterSync(data) {
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'queue_data', 'Queueing data for later blockchain sync', {
      currentQueueSize: this.syncQueue.length,
      dataSize: JSON.stringify(data).length
    });
    
    const queueItem = {
      data,
      timestamp: Date.now(),
      retries: 0,
      maxRetries: 3,
      queueId: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    this.syncQueue.push(queueItem);
    
    // Limit queue size to prevent memory issues
    const removedItem = this.syncQueue.length > 10 ? this.syncQueue.shift() : null;
    
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'queue_data', 'Data queued for sync', {
      queueId: queueItem.queueId,
      queueSize: this.syncQueue.length,
      removedOldest: !!removedItem,
      removedQueueId: removedItem?.queueId
    });
    
    // Try to process queue if services are available
    this.processSyncQueue();
  }

  // Process queued sync operations
  async processSyncQueue() {
    if (this.syncQueue.length === 0) return;
    if (!this.syncStatus.grpcConnected || !this.syncStatus.isConnected) return;
    
    console.log(`📤 Processing ${this.syncQueue.length} queued sync operations...`);
    
    const item = this.syncQueue[0];
    
    try {
      const result = await this.saveToBlockchain(item.data);
      
      if (result.success) {
        console.log('✅ Successfully synced queued item to blockchain');
        this.syncQueue.shift(); // Remove successfully synced item
        
        // Process next item after a short delay
        if (this.syncQueue.length > 0) {
          setTimeout(() => this.processSyncQueue(), 1000);
        }
      } else {
        item.retries++;
        if (item.retries >= item.maxRetries) {
          console.warn('❌ Max retries reached for queued item, removing from queue');
          this.syncQueue.shift();
        }
      }
    } catch (error) {
      console.error('Failed to sync queued item:', error);
      item.retries++;
      
      if (item.retries >= item.maxRetries) {
        console.warn('❌ Max retries reached for queued item, removing from queue');
        this.syncQueue.shift();
      }
    }
  }

  // Get queued sync items count
  getQueuedSyncCount() {
    return this.syncQueue.length;
  }

  // Clear sync queue (for cleanup)
  clearSyncQueue() {
    this.syncQueue = [];
  }

  // Get user's spreadsheets from wallet
  async getUserSpreadsheets() {
    logger.startTimer('get_user_spreadsheets');
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_discovery', 'Fetching user spreadsheets from blockchain');

    if (!this.isWalletConnected()) {
      logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_discovery_blocked', 'Cannot fetch spreadsheets - wallet not connected');
      return {
        success: false,
        error: 'Wallet not connected',
        spreadsheets: []
      };
    }

    try {
      const walletInfo = this.walletManager.getWalletInfo();
      const spreadsheets = await this.suiService.getUserSpreadsheets(walletInfo.address);
      
      const duration = logger.endTimer('get_user_spreadsheets');
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_discovery_success', 'Successfully fetched user spreadsheets', {
        count: spreadsheets.length,
        duration,
        address: walletInfo.address?.slice(0, 8) + '...'
      });

      return {
        success: true,
        spreadsheets: spreadsheets,
        count: spreadsheets.length
      };
    } catch (error) {
      logger.endTimer('get_user_spreadsheets');
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_discovery_failed', 'Failed to fetch user spreadsheets', {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      });

      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        spreadsheets: []
      };
    }
  }

  // Enhanced load method with redundancy and delta reconstruction support  
  async loadSpreadsheetEnhanced(spreadsheetId, onProgress = null) {
    logger.startTimer('load_spreadsheet_enhanced');
    const loadId = `load-enhanced-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_load_enhanced', `[${loadId}] 🛡️ Loading spreadsheet with enhanced features`, {
      loadId,
      spreadsheetId,
      hasProgress: !!onProgress,
      timestamp: new Date().toISOString()
    });

    if (!this.isWalletConnected()) {
      logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_load_enhanced_blocked', 'Cannot load spreadsheet - wallet not connected');
      return { success: false, error: 'Wallet not connected' };
    }

    try {
      // Connect to Walrus
      if (onProgress) onProgress('Loading spreadsheet...', 'Connecting to enhanced storage...');
      await this.walrusService.connect();

      // Load with redundancy support
      if (onProgress) onProgress('Loading spreadsheet...', 'Fetching with redundancy support...');
      
      console.log(`[${loadId}] 🛡️ Fetching enhanced spreadsheet data`, {
        spreadsheetId,
        timestamp: new Date().toISOString()
      });
      
      const fetchStartTime = Date.now();
      const result = await this.suiService.getSpreadsheetDataWithRedundancy(
        spreadsheetId, 
        this.walrusService
      );
      const fetchDuration = Date.now() - fetchStartTime;
      
      console.log(`[${loadId}] 📊 Enhanced spreadsheet data received`, {
        success: !!result,
        redundancyUsed: result?.redundancyUsed,
        fallbackUsed: result?.fallbackUsed,
        versionCount: result?.allVersions?.length || 0,
        currentVersion: result?.version?.version_number,
        isDelta: result?.version?.is_delta,
        hasRedundancy: result?.version?.has_redundancy,
        fetchDuration: `${fetchDuration}ms`
      });
      
      this.spreadsheetObjectId = spreadsheetId;
      const duration = logger.endTimer('load_spreadsheet_enhanced');
      
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_load_enhanced_success', '🎉 Enhanced spreadsheet load completed', {
        spreadsheetId,
        version: result.version.version_number,
        cellCount: result.version.cell_count,
        redundancyUsed: result.redundancyUsed,
        fallbackUsed: result.fallbackUsed,
        duration
      });

      return {
        success: true,
        method: 'enhanced',
        data: result.spreadsheetData,
        metadata: {
          spreadsheetId,
          version: result.version,
          allVersions: result.allVersions,
          enhancedFeatures: {
            redundancyUsed: result.redundancyUsed,
            fallbackUsed: result.fallbackUsed,
            isDelta: result.version?.is_delta,
            hasRedundancy: result.version?.has_redundancy,
            compressionRatio: result.version?.compression_ratio
          }
        }
      };
    } catch (error) {
      logger.endTimer('load_spreadsheet_enhanced');
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_load_enhanced_failed', 'Enhanced spreadsheet load failed', {
        spreadsheetId,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      });

      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        method: 'enhanced'
      };
    }
  }

  // Load a specific spreadsheet from blockchain and Walrus
  async loadSpreadsheet(spreadsheetId, onProgress = null) {
    logger.startTimer('load_spreadsheet');
    const loadId = `load-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_load', `[${loadId}] 📥 Loading spreadsheet from blockchain`, {
      loadId,
      spreadsheetId,
      hasProgress: !!onProgress,
      timestamp: new Date().toISOString()
    });
    
    console.log(`[${loadId}] 🔍 Starting spreadsheet load`, {
      spreadsheetId,
      walletConnected: this.isWalletConnected()
    });

    // REQUIRE Sui configuration for loading to ensure on-chain reference is used
    const networkConfig = await this.getCurrentNetworkConfig();
    if (!networkConfig?.packageId || !networkConfig?.registryObjectId) {
      logger.endTimer('load_spreadsheet');
      return { success: false, error: 'Sui is not configured for the current network. Set packageId and registryObjectId.' };
    }

    if (!this.isWalletConnected()) {
      logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_load_blocked', 'Cannot load spreadsheet - wallet not connected');
      return {
        success: false,
        error: 'Wallet not connected'
      };
    }

    try {
      // First validate that the spreadsheet object exists on-chain
      if (onProgress) onProgress('Loading spreadsheet...', 'Validating spreadsheet existence...');

      const existenceCheck = await this.suiService.validateSpreadsheetExists(spreadsheetId);
      if (!existenceCheck.exists || !existenceCheck.isCorrectType) {
        logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_not_found',
          `Spreadsheet object does not exist or is not valid: ${existenceCheck.error}`, {
          spreadsheetId,
          existenceCheck
        });

        // Clear the invalid spreadsheet from session storage
        this.storageAdapter.clearInvalidSpreadsheetSession();

        return {
          success: false,
          error: `Spreadsheet not found on-chain: ${existenceCheck.error}. The spreadsheet object may not have been created on this network.`,
          metadata: {
            spreadsheetId,
            exists: existenceCheck.exists,
            isCorrectType: existenceCheck.isCorrectType,
            actualType: existenceCheck.actualType
          }
        };
      }

      // Connect to Walrus if not already connected
      if (onProgress) onProgress('Loading spreadsheet...', 'Connecting to Walrus storage...');
      await this.walrusService.connect();

      // Load spreadsheet data with progress callback
      if (onProgress) onProgress('Loading spreadsheet...', 'Fetching version history...');

      console.log(`[${loadId}] 🔗 Fetching spreadsheet data from blockchain`, {
        spreadsheetId,
        timestamp: new Date().toISOString()
      });

      const fetchStartTime = Date.now();
      const result = await this.suiService.getSpreadsheetData(spreadsheetId, this.walrusService, onProgress);
      const fetchDuration = Date.now() - fetchStartTime;
      
      console.log(`[${loadId}] 📊 Spreadsheet data received`, {
        success: !!result,
        isEmptySpreadsheet: result?.isEmptySpreadsheet,
        hasVersions: !!result?.allVersions?.length,
        versionCount: result?.allVersions?.length || 0,
        currentVersion: result?.version?.version_number,
        walrusBlobId: result?.version?.walrus_blob_id,
        fetchDuration: `${fetchDuration}ms`
      });
      
      // Set current spreadsheet
      this.spreadsheetObjectId = spreadsheetId;

      // Check version compatibility
      let versionCompatibility = null;
      try {
        versionCompatibility = await this.suiService.validateSpreadsheetVersion(spreadsheetId);

        if (!versionCompatibility.compatible) {
          // For legacy spreadsheets (v0), this is expected behavior - log at info level
          const isLegacySpreadsheet = versionCompatibility.spreadsheetVersion === 0 && versionCompatibility.moduleVersion === 1;
          const logLevel = isLegacySpreadsheet ? 'info' : 'warn';

          logger[logLevel](LogComponent.BLOCKCHAIN_ADAPTER, 'version_mismatch',
            isLegacySpreadsheet
              ? 'Loading legacy spreadsheet (version 0) - this is expected for older data'
              : 'Spreadsheet version mismatch detected',
            {
              spreadsheetId,
              spreadsheetVersion: versionCompatibility.spreadsheetVersion,
              moduleVersion: versionCompatibility.moduleVersion,
              needsMigration: versionCompatibility.needsMigration,
              isLegacy: isLegacySpreadsheet
            }
          );
        }
      } catch (versionError) {
        logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'version_check_failed', 'Failed to check version compatibility', {
          error: typeof versionError === 'string' ? versionError : (versionError && versionError.message) || 'Unknown error'
        });
        // Continue loading even if version check fails
      }

      const duration = logger.endTimer('load_spreadsheet');

      // Handle empty spreadsheets (created but no versions saved)
      if (result.isEmptySpreadsheet) {
        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_load_empty', 'Loaded empty spreadsheet (no versions)', {
          spreadsheetId,
          duration
        });

        return {
          success: true,
          data: result.spreadsheetData,
          metadata: {
            spreadsheetId,
            version: null,
            allVersions: [],
            isEmpty: true,
            versionCompatibility
          }
        };
      }

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_load_success', 'Successfully loaded spreadsheet', {
        spreadsheetId,
        version: result.version.version_number,
        cellCount: result.version.cell_count,
        duration,
        versionCompatible: versionCompatibility?.compatible
      });

      return {
        success: true,
        data: result.spreadsheetData,
        metadata: {
          spreadsheetId,
          version: result.version,
          allVersions: result.allVersions,
          versionCompatibility
        }
      };
    } catch (error) {
      logger.endTimer('load_spreadsheet');
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_load_failed', 'Failed to load spreadsheet', {
        spreadsheetId,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      });

      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      };
    }
  }

  // Utility method to extract spreadsheet object ID from transaction result
  async extractSpreadsheetObjectId(transactionResult) {
    try {
      const networkConfig = await this.getCurrentNetworkConfig();
      const packageIdNormalized = networkConfig.packageId.startsWith('0x')
        ? networkConfig.packageId.slice(2)
        : networkConfig.packageId;
      
      // Try multiple extraction methods
      if (transactionResult.objectChanges) {
        const createdObjects = transactionResult.objectChanges.filter(change => 
          change.type === 'created' && 
          change.objectType?.includes(`${packageIdNormalized}::spreadsheet::Spreadsheet`)
        );
        
        if (createdObjects.length > 0) {
          return createdObjects[0].objectId;
        }
      }
      
      if (transactionResult.effects?.created) {
        const createdObjects = transactionResult.effects.created.filter(obj =>
          obj.objectType?.includes(`${packageIdNormalized}::spreadsheet::Spreadsheet`)
        );
        
        if (createdObjects.length > 0) {
          return createdObjects[0].objectId;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Failed to extract spreadsheet object ID:', error);
      return null;
    }
  }

  // Verify integrity of current spreadsheet
  async verifySpreadsheetIntegrity(options = {}) {
    try {
      if (!this.spreadsheetObjectId) {
        throw new Error('No active spreadsheet to verify');
      }

      console.log('🔍 Starting spreadsheet integrity verification');
      
      const versions = await this.suiService.getEnhancedSpreadsheetVersions(this.spreadsheetObjectId);
      if (versions.length === 0) {
        return {
          success: true,
          integrity: 'no-versions',
          message: 'No versions to verify'
        };
      }

      const verificationResults = [];
      const versionsToCheck = options.allVersions ? versions : [versions[0]];

      for (const version of versionsToCheck) {
        console.log(`🔍 Verifying version ${version.version_number}...`);
        
        const versionResult = await this.suiService.verifyVersionIntegrity(
          version.objectId,
          this.walrusService
        );
        
        verificationResults.push({
          version: version.version_number,
          objectId: version.objectId,
          ...versionResult
        });
      }

      const allPassed = verificationResults.every(result => result.overallIntegrity);
      const passedCount = verificationResults.filter(result => result.overallIntegrity).length;

      console.log('🔍 Spreadsheet integrity verification completed:', {
        spreadsheetId: this.spreadsheetObjectId,
        versionsChecked: verificationResults.length,
        passed: passedCount,
        allPassed
      });

      return {
        success: true,
        integrity: allPassed ? 'verified' : 'compromised',
        spreadsheetId: this.spreadsheetObjectId,
        versionsChecked: verificationResults.length,
        passed: passedCount,
        failed: verificationResults.length - passedCount,
        results: verificationResults
      };

    } catch (error) {
      console.error('Spreadsheet integrity verification failed:', error);
      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        integrity: 'unknown'
      };
    }
  }

  // Rename spreadsheet (update title)
  async renameSpreadsheet(spreadsheetId, newTitle) {
    logger.startTimer('rename_spreadsheet');
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_rename', 'Renaming spreadsheet', {
      spreadsheetId,
      newTitle: newTitle.substring(0, 30) + '...'
    });

    if (!this.isWalletConnected()) {
      logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_rename_blocked', 'Cannot rename spreadsheet - wallet not connected');
      return {
        success: false,
        error: 'Wallet not connected'
      };
    }

    try {
      const result = await this.suiService.updateSpreadsheetTitle(spreadsheetId, newTitle);
      
      const duration = logger.endTimer('rename_spreadsheet');
      if (result.success) {
        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_rename_success', 'Successfully renamed spreadsheet', {
          spreadsheetId,
          newTitle,
          duration,
          transactionDigest: result.transactionDigest
        });
      } else {
        logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_rename_failed', 'Failed to rename spreadsheet', {
          spreadsheetId,
          error: result.error
        });
      }

      return result;
    } catch (error) {
      logger.endTimer('rename_spreadsheet');
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_rename_error', 'Error renaming spreadsheet', {
        spreadsheetId,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      });

      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      };
    }
  }

  // Make spreadsheet public
  async makeSpreadsheetPublic(spreadsheetId) {
    logger.startTimer('make_public');
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_make_public', 'Making spreadsheet public', {
      spreadsheetId
    });

    if (!this.isWalletConnected()) {
      logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_public_blocked', 'Cannot make public - wallet not connected');
      return {
        success: false,
        error: 'Wallet not connected'
      };
    }

    try {
      const result = await this.suiService.makeSpreadsheetPublic(spreadsheetId);
      
      const duration = logger.endTimer('make_public');
      if (result.success) {
        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_public_success', 'Successfully made spreadsheet public', {
          spreadsheetId,
          duration,
          transactionDigest: result.transactionDigest
        });
      } else {
        logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_public_failed', 'Failed to make spreadsheet public', {
          spreadsheetId,
          error: result.error
        });
      }

      return result;
    } catch (error) {
      logger.endTimer('make_public');
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_public_error', 'Error making spreadsheet public', {
        spreadsheetId,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      });

      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      };
    }
  }

  // Make spreadsheet private
  async makeSpreadsheetPrivate(spreadsheetId) {
    logger.startTimer('make_private');
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_make_private', 'Making spreadsheet private', {
      spreadsheetId
    });

    if (!this.isWalletConnected()) {
      logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_private_blocked', 'Cannot make private - wallet not connected');
      return {
        success: false,
        error: 'Wallet not connected'
      };
    }

    try {
      const result = await this.suiService.makeSpreadsheetPrivate(spreadsheetId);
      
      const duration = logger.endTimer('make_private');
      if (result.success) {
        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_private_success', 'Successfully made spreadsheet private', {
          spreadsheetId,
          duration,
          transactionDigest: result.transactionDigest
        });
      } else {
        logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_private_failed', 'Failed to make spreadsheet private', {
          spreadsheetId,
          error: result.error
        });
      }

      return result;
    } catch (error) {
      logger.endTimer('make_private');
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_private_error', 'Error making spreadsheet private', {
        spreadsheetId,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      });

      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      };
    }
  }

  // Transfer spreadsheet ownership
  async transferSpreadsheetOwnership(spreadsheetId, newOwnerAddress) {
    logger.startTimer('transfer_ownership');
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_transfer', 'Transferring spreadsheet ownership', {
      spreadsheetId,
      newOwner: newOwnerAddress.substring(0, 10) + '...'
    });

    if (!this.isWalletConnected()) {
      logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_transfer_blocked', 'Cannot transfer ownership - wallet not connected');
      return {
        success: false,
        error: 'Wallet not connected'
      };
    }

    try {
      const result = await this.suiService.transferSpreadsheetOwnership(spreadsheetId, newOwnerAddress);
      
      const duration = logger.endTimer('transfer_ownership');
      if (result.success) {
        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_transfer_success', 'Successfully transferred spreadsheet ownership', {
          spreadsheetId,
          newOwner: newOwnerAddress,
          duration,
          transactionDigest: result.transactionDigest
        });
      } else {
        logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_transfer_failed', 'Failed to transfer spreadsheet ownership', {
          spreadsheetId,
          error: result.error
        });
      }

      return result;
    } catch (error) {
      logger.endTimer('transfer_ownership');
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_transfer_error', 'Error transferring spreadsheet ownership', {
        spreadsheetId,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      });

      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      };
    }
  }

  // Prune old spreadsheet versions
  async pruneSpreadsheetVersions(spreadsheetId, keepCount = 10) {
    logger.startTimer('prune_versions');
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_prune', 'Pruning old spreadsheet versions', {
      spreadsheetId,
      keepCount
    });

    if (!this.isWalletConnected()) {
      logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_prune_blocked', 'Cannot prune versions - wallet not connected');
      return {
        success: false,
        error: 'Wallet not connected'
      };
    }

    try {
      const result = await this.suiService.pruneOldVersions(spreadsheetId, keepCount);
      
      const duration = logger.endTimer('prune_versions');
      if (result.success) {
        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_prune_success', 'Successfully pruned old versions', {
          spreadsheetId,
          keptVersions: keepCount,
          duration,
          transactionDigest: result.transactionDigest
        });
      } else {
        logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_prune_failed', 'Failed to prune old versions', {
          spreadsheetId,
          error: result.error
        });
      }

      return result;
    } catch (error) {
      logger.endTimer('prune_versions');
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_prune_error', 'Error pruning old versions', {
        spreadsheetId,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      });

      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      };
    }
  }

  // Delete spreadsheet completely (WARNING: This is permanent!)
  async deleteSpreadsheet(spreadsheetId) {
    logger.startTimer('delete_spreadsheet');
    logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_delete', 'DELETING SPREADSHEET PERMANENTLY', {
      spreadsheetId: spreadsheetId.substring(0, 10) + '...',
      warning: 'This operation is irreversible'
    });

    if (!this.isWalletConnected()) {
      logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_delete_blocked', 'Cannot delete spreadsheet - wallet not connected');
      return {
        success: false,
        error: 'Wallet not connected'
      };
    }

    try {
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_delete_start', 'Starting deletion process', {
        spreadsheetId,
        walletAddress: this.getWalletAddress()
      });

      const result = await this.suiService.deleteSpreadsheet(spreadsheetId);
      
      const duration = logger.endTimer('delete_spreadsheet');
      if (result.success) {
        logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_delete_success', 'Successfully deleted spreadsheet', {
          spreadsheetId,
          versionsDeleted: result.deletedVersionCount,
          duration,
          transactionDigest: result.transactionDigest,
          gasUsed: result.gasUsed
        });

        // Clear the spreadsheet from local state if it's the current one
        if (this.spreadsheetObjectId === spreadsheetId) {
          logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'clear_current_spreadsheet', 'Clearing current spreadsheet from local state');
          this.spreadsheetObjectId = null;
          this.editTracker.clear();
          this.syncQueue = [];
          this.clearPendingEdits();

          // Also clear the session in storage adapter
          if (this.storageAdapter) {
            try {
              this.storageAdapter.clearSession();
              logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'session_cleared', '🧹 Session cleared for deleted spreadsheet');
            } catch (clearError) {
              logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'session_clear_failed', 'Failed to clear session', {
                error: typeof clearError === 'string' ? clearError : clearError.message
              });
            }
          }

          // Reset sync status for deleted spreadsheet
          this.syncStatus.pendingChanges = 0;
          this.syncStatus.lastSync = null;
          logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'sync_status_reset', 'Sync status reset after deletion');
        }

      } else {
        logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_delete_failed', 'Failed to delete spreadsheet', {
          spreadsheetId,
          error: result.error
        });
      }

      return result;
    } catch (error) {
      logger.endTimer('delete_spreadsheet');
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'spreadsheet_delete_error', 'Error deleting spreadsheet', {
        spreadsheetId,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      });

      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      };
    }
  }

  // Enhanced transaction creation with gas estimation
  async createTransactionWithEstimation(operation, params = {}) {
    logger.startTimer(`transaction_create_${operation}`);
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'transaction_create_start', 'Creating transaction with estimation', {
      operation,
      params
    });

    try {
      let transaction;
      let description = '';

      // Create the appropriate transaction based on operation type
      switch (operation) {
        case 'create_spreadsheet':
          transaction = await this.suiService.createSpreadsheetTransaction(params.title || 'Untitled Spreadsheet');
          description = `Create new spreadsheet "${params.title || 'Untitled Spreadsheet'}"`;
          break;

        case 'save_version':
          transaction = await this.suiService.createStorageTransaction(params);
          description = `Save version to blockchain`;
          break;

        case 'update_title':
          transaction = this.suiService.createUpdateTitleTransaction(params.spreadsheetId, params.newTitle);
          description = `Update spreadsheet title to "${params.newTitle}"`;
          break;

        case 'transfer_ownership':
          transaction = this.suiService.createTransferOwnershipTransaction(params.spreadsheetId, params.newOwner);
          description = `Transfer ownership to ${params.newOwner}`;
          break;

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      // Estimate gas for the transaction
      const gasEstimate = await this.suiService.estimateGas(transaction);
      const balanceCheck = await this.suiService.checkSufficientBalance(gasEstimate);

      logger.endTimer(`transaction_create_${operation}`);
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'transaction_create_complete', 'Transaction created with estimation', {
        operation,
        gasEstimate: gasEstimate.estimatedCostSUI,
        sufficient: balanceCheck.sufficient
      });

      return {
        success: true,
        transaction,
        gasEstimate,
        balanceCheck,
        description,
        operation
      };

    } catch (error) {
      logger.endTimer(`transaction_create_${operation}`);

      // Create structured error for transaction creation
      const structuredError = ErrorFactory.fromError(error);
      structuredError.details = {
        ...structuredError.details,
        operation,
        spreadsheetId: this.spreadsheetObjectId,
        context: 'transaction_creation'
      };

      // Use error recovery service
      const recovery = await errorRecoveryService.handleError(structuredError, {
        component: LogComponent.BLOCKCHAIN_ADAPTER,
        action: 'create_transaction_with_estimation',
        operation: operation
      });

      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        recovery: recovery.userMessage,
        category: recovery.category,
        requiresUserAction: recovery.requiresUserAction
      };
    }
  }

  // Execute transaction with enhanced error handling
  async executeTransactionWithRecovery(transaction, context = {}) {
    logger.startTimer('transaction_execute_enhanced');
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'transaction_execute_start', 'Executing transaction with recovery', context);

    try {
      const result = await this.suiService.executeTransaction(transaction);

      logger.endTimer('transaction_execute_enhanced');
      logger.logBlockchainOperation('transaction_execute', true, {
        digest: result.digest,
        success: result.success
      });

      return result;

    } catch (error) {
      logger.endTimer('transaction_execute_enhanced');

      const recovery = await errorRecoveryService.handleError(error, {
        component: LogComponent.BLOCKCHAIN_ADAPTER,
        action: 'execute_transaction_with_recovery',
        operation: context.operation || 'execute_transaction'
      });

      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        recovery: recovery.userMessage,
        category: recovery.category,
        requiresUserAction: recovery.requiresUserAction,
        queued: recovery.queued
      };
    }
  }

  // Batch multiple operations into a single transaction
  async batchOperations(operations = []) {
    logger.startTimer('batch_operations');
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'batch_start', 'Starting batch operation', {
      operationCount: operations.length
    });

    if (operations.length === 0) {
      return { success: true, operations: [], message: 'No operations to batch' };
    }

    try {
      // For now, execute operations sequentially
      // In the future, this could combine compatible operations into single transactions
      const results = [];

      for (const operation of operations) {
        const result = await this.createTransactionWithEstimation(operation.type, operation.params);
        results.push(result);

        if (!result.success) {
          logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'batch_operation_failed', 'Batch operation failed', {
            operation: operation.type,
            error: result.error
          });
        }
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      logger.endTimer('batch_operations');
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'batch_complete', 'Batch operations completed', {
        total: operations.length,
        successful,
        failed
      });

      return {
        success: successful > 0,
        results,
        summary: { total: operations.length, successful, failed }
      };

    } catch (error) {
      logger.endTimer('batch_operations');

      const recovery = await errorRecoveryService.handleError(error, {
        component: LogComponent.BLOCKCHAIN_ADAPTER,
        action: 'batch_operations',
        operation: 'batch_operations'
      });

      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        recovery: recovery.userMessage,
        category: recovery.category
      };
    }
  }

  // Get gas estimation for UI display
  async getGasEstimation(operation, params = {}) {
    try {
      const result = await this.createTransactionWithEstimation(operation, params);

      if (result.success) {
        return {
          success: true,
          estimatedCost: result.gasEstimate.estimatedCostSUI,
          sufficient: result.balanceCheck.sufficient,
          currentBalance: result.balanceCheck.currentBalanceSUI,
          recommendedBudget: result.gasEstimate.recommendedBudget
        };
      } else {
        return result;
      }
    } catch (error) {
      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        category: ErrorCategory.BLOCKCHAIN
      };
    }
  }

  // Lock a cell for collaborative editing
  async lockCell(cellRef) {
    try {
      logger.startTimer('cell_lock');
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'cell_lock_start', 'Starting cell lock operation', {
        cellRef,
        spreadsheetId: this.spreadsheetObjectId
      });

      if (!this.spreadsheetObjectId) {
        throw new Error('No active spreadsheet - cannot lock cell');
      }

      // Check wallet connection
      const walletInfo = this.walletManager.isConnected;
      if (!walletInfo) {
        throw new Error('Wallet not connected - cannot lock cell');
      }

      // Create lock cell transaction
      const tx = this.suiService.createLockCellTransaction(this.spreadsheetObjectId, cellRef);

      // Execute the transaction
      const result = await this.suiService.executeTransaction(tx);

      logger.endTimer('cell_lock');
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'cell_lock_success', 'Cell locked successfully', {
        cellRef,
        transactionDigest: result.digest,
        duration: logger.getTimerDuration('cell_lock')
      });

      return {
        success: true,
        transactionDigest: result.digest,
        cellRef,
        lockedBy: this.walletManager.getWalletInfo().address
      };
    } catch (error) {
      logger.endTimer('cell_lock');
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'cell_lock_error', 'Failed to lock cell', {
        cellRef,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        duration: logger.getTimerDuration('cell_lock')
      });

      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        cellRef,
        category: ErrorCategory.BLOCKCHAIN
      };
    }
  }

  // Unlock a cell for collaborative editing
  async unlockCell(cellRef) {
    try {
      logger.startTimer('cell_unlock');
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'cell_unlock_start', 'Starting cell unlock operation', {
        cellRef,
        spreadsheetId: this.spreadsheetObjectId
      });

      if (!this.spreadsheetObjectId) {
        throw new Error('No active spreadsheet - cannot unlock cell');
      }

      // Check wallet connection
      const walletInfo = this.walletManager.isConnected;
      if (!walletInfo) {
        throw new Error('Wallet not connected - cannot unlock cell');
      }

      // Create unlock cell transaction
      const tx = this.suiService.createUnlockCellTransaction(this.spreadsheetObjectId, cellRef);

      // Execute the transaction
      const result = await this.suiService.executeTransaction(tx);

      logger.endTimer('cell_unlock');
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'cell_unlock_success', 'Cell unlocked successfully', {
        cellRef,
        transactionDigest: result.digest,
        duration: logger.getTimerDuration('cell_unlock')
      });

      return {
        success: true,
        transactionDigest: result.digest,
        cellRef
      };
    } catch (error) {
      logger.endTimer('cell_unlock');
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'cell_unlock_error', 'Failed to unlock cell', {
        cellRef,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        duration: logger.getTimerDuration('cell_unlock')
      });

      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        cellRef,
        category: ErrorCategory.BLOCKCHAIN
      };
    }
  }

  /**
   * Clear invalid object cache when "notExists" errors occur
   */
  clearInvalidObjectCache() {
    logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'cache_cleanup', 'Clearing invalid object cache in BlockchainAdapter');

    try {
      // Reset transaction state to clear any stuck states
      this.transactionState.isProcessing = false;
      this.transactionState.processingStartTime = null;
      this.transactionState.lastTransaction = null;

      // Clear any cached spreadsheet object IDs
      if (this.spreadsheetObjectId) {
        logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'cache_clear_object_id', 'Clearing cached spreadsheet object ID', {
          oldObjectId: this.spreadsheetObjectId
        });
        this.spreadsheetObjectId = null;
      }

      // Clear any cached metadata
      this.cachedMetadata = null;

      // Clear sync queue of potentially invalid data
      if (this.syncQueue && this.syncQueue.length > 0) {
        logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'cache_clear_sync_queue', 'Clearing sync queue due to invalid objects', {
          queueSize: this.syncQueue.length
        });
        this.syncQueue = [];
      }

      // Clear session IDs and storage adapter cache
      if (this.storageAdapter) {
        if (typeof this.storageAdapter.setCurrentSpreadsheetId === 'function') {
          this.storageAdapter.setCurrentSpreadsheetId(null);
          logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'cache_clear_session_id', 'Cleared current spreadsheet ID from storage adapter');
        }

        if (typeof this.storageAdapter.clearObjectCache === 'function') {
          this.storageAdapter.clearObjectCache();
          logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'cache_clear_storage_cache', 'Cleared storage adapter object cache');
        }
      }

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'cache_cleanup_complete', 'BlockchainAdapter cache cleared');
    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'cache_cleanup_error', 'Error clearing BlockchainAdapter cache', {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      });
    }
  }

  // Cleanup method for proper disposal of the adapter
  cleanup() {
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'cleanup', 'Cleaning up BlockchainAdapter');

    try {
      // Remove WebSocket event listener if it exists
      if (this.webSocketEventListener && this.webSocketService) {
        this.webSocketService.off('blockchainEvent', this.webSocketEventListener);
        this.webSocketEventListener = null;
        this.webSocketService = null;
        logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'cleanup_websocket', 'WebSocket event listener removed');
      }

      // Clear invalid object cache
      this.clearInvalidObjectCache();

      // Disconnect from collaboration
      this.disconnectFromCollaboration();

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'cleanup_complete', 'BlockchainAdapter cleanup completed');
    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'cleanup_error', 'Error during BlockchainAdapter cleanup', {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack
      });
    }
  }

  /**
   * Retry a single fallback save to blockchain
   * @param {string} localKey - The localStorage key for the fallback
   * @returns {Promise<Object>} Result of retry attempt
   */
  async retryFallbackSave(localKey) {
    try {
      // Get fallback data from localStorage
      const fallbackData = localStorage.getItem(localKey);
      if (!fallbackData) {
        logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'retry_not_found', 'Fallback key not found', { localKey });
        return {
          success: false,
          error: 'Fallback data not found',
          localKey
        };
      }

      let data;
      try {
        data = JSON.parse(fallbackData);
      } catch (e) {
        logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'retry_parse_error', 'Failed to parse fallback data', {
          localKey,
          error: e.message
        });
        return {
          success: false,
          error: 'Invalid fallback data format',
          localKey
        };
      }

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'retry_start', 'Starting fallback retry', {
        localKey,
        dataSize: fallbackData.length
      });

      // Attempt to save the cached fallback data to blockchain
      // Use saveToBlockchain directly with the cached payload, not the current in-memory sheet
      const saveResult = await this.saveToBlockchain(data, { epochs: 50 });

      if (saveResult.success) {
        // Delete the fallback key on success
        localStorage.removeItem(localKey);

        // Emit success event
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('save:retry-success', {
            detail: {
              localKey,
              timestamp: Date.now()
            }
          }));
        }

        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'retry_success', 'Fallback retry succeeded', {
          localKey
        });

        return {
          success: true,
          localKey,
          message: 'Fallback save synced to blockchain'
        };
      } else {
        // Emit failure event but keep the key
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('save:retry-failed', {
            detail: {
              localKey,
              error: saveResult.error || 'Unknown error',
              timestamp: Date.now()
            }
          }));
        }

        logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'retry_failed', 'Fallback retry failed', {
          localKey,
          error: saveResult.error
        });

        return {
          success: false,
          localKey,
          error: saveResult.error || 'Retry failed'
        };
      }
    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'retry_error', 'Error during fallback retry', {
        localKey,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      });

      return {
        success: false,
        localKey,
        error: error.message || 'Retry error'
      };
    }
  }

  /**
   * Automatically retry all fallback saves on app startup
   * Waits for wallet connection before attempting retries
   */
  async autoRetryFallbacksOnStartup() {
    try {
      // Wait for wallet to be ready (max 5 seconds)
      let attempts = 0;
      while (!this.isWalletConnected() && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!this.isWalletConnected()) {
        logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'startup_retry_no_wallet', 'Wallet not connected - skipping auto-retry');
        return;
      }

      // Get all fallback keys
      const fallbackKeys = Object.keys(localStorage).filter(key =>
        key.startsWith('walsheetz_fallback_')
      );

      if (fallbackKeys.length === 0) {
        logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'startup_retry_none', 'No fallback saves to retry');
        return;
      }

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'startup_retry_start', 'Starting auto-retry of fallback saves', {
        count: fallbackKeys.length
      });

      let successCount = 0;
      let failureCount = 0;

      // Retry each fallback sequentially with delay
      for (const key of fallbackKeys) {
        const result = await this.retryFallbackSave(key);
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }
        // Small delay between retries
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'startup_retry_complete', 'Auto-retry of fallback saves complete', {
        successCount,
        failureCount,
        total: fallbackKeys.length
      });

      // Emit summary event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('save:startup-retry-complete', {
          detail: {
            successCount,
            failureCount,
            total: fallbackKeys.length,
            timestamp: Date.now()
          }
        }));
      }
    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'startup_retry_error', 'Error during startup auto-retry', {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      });
    }
  }

  /**
   * Check for stale fallback keys (older than 7 days)
   * @returns {Array} Array of stale fallback info objects
   */
  checkStaleFallbacks(maxAgeDays = 7) {
    try {
      const staleList = [];
      const now = Date.now();
      const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

      const fallbackKeys = Object.keys(localStorage).filter(key =>
        key.startsWith('walsheetz_fallback_')
      );

      for (const key of fallbackKeys) {
        // Extract timestamp from key (format: walsheetz_fallback_TIMESTAMP)
        const timestamp = parseInt(key.replace('walsheetz_fallback_', ''), 10);

        if (isNaN(timestamp)) {
          logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'stale_parse_error', 'Invalid fallback key format', { key });
          continue;
        }

        const age = now - timestamp;
        if (age > maxAgeMs) {
          staleList.push({
            key,
            timestamp,
            ageMs: age,
            ageDays: Math.floor(age / (24 * 60 * 60 * 1000)),
            size: localStorage.getItem(key).length
          });
        }
      }

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'stale_check_complete', 'Stale fallback check complete', {
        staleCount: staleList.length,
        totalFallbacks: fallbackKeys.length
      });

      return staleList;
    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'stale_check_error', 'Error checking stale fallbacks', {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Delete stale fallback keys
   * @param {Array<string>} keys - Array of localStorage keys to delete
   * @returns {Object} Deletion result
   */
  deleteStaleFallbacks(keys) {
    try {
      let deletedCount = 0;
      const errors = [];

      for (const key of keys) {
        try {
          localStorage.removeItem(key);
          deletedCount++;

          logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'stale_deleted', 'Deleted stale fallback', { key });
        } catch (e) {
          errors.push({ key, error: e.message });
          logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'stale_delete_error', 'Failed to delete stale fallback', {
            key,
            error: e.message
          });
        }
      }

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'stale_cleanup_complete', 'Stale fallback cleanup complete', {
        deletedCount,
        errorCount: errors.length
      });

      return {
        success: errors.length === 0,
        deletedCount,
        errors
      };
    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'stale_cleanup_error', 'Error during stale fallback cleanup', {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Export fallback data as JSON
   * @param {string} key - localStorage key of the fallback
   * @returns {string} JSON string of fallback data, or null if not found
   */
  exportFallbackAsJSON(key) {
    try {
      const data = localStorage.getItem(key);
      if (!data) {
        logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'export_not_found', 'Fallback key not found for export', { key });
        return null;
      }

      // Parse and re-stringify for clean JSON
      const parsed = JSON.parse(data);
      const exportData = {
        exportedAt: new Date().toISOString(),
        originalKey: key,
        timestamp: parseInt(key.replace('walsheetz_fallback_', ''), 10),
        data: parsed
      };

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'export_complete', 'Exported fallback as JSON', { key });

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'export_error', 'Error exporting fallback', {
        key,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Setup event listeners for retry requests
   * This should be called during app initialization
   */
  setupRetryEventListeners() {
    if (typeof window !== 'undefined') {
      // Listen for manual retry button clicks
      window.addEventListener('save:retry-fallbacks', async (event) => {
        const { fallbackKeys = [] } = event.detail || {};

        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'manual_retry_triggered', 'Manual fallback retry triggered', {
          count: fallbackKeys.length
        });

        for (const key of fallbackKeys) {
          await this.retryFallbackSave(key);
        }
      });

      logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'retry_listeners_setup', 'Fallback retry event listeners setup');
    }
  }

  /**
   * Retry blockchain commit for a partial save (Walrus succeeded, blockchain failed)
   * Uses stored blob data to avoid re-uploading to Walrus
   * @returns {Object} Retry result with success status and details
   */
  async retryBlockchainCommit() {
    logger.startTimer('blockchain_retry');
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'retry_blockchain_start', 'Starting blockchain commit retry (no Walrus re-upload)');

    try {
      // Get pending partial save data from storage adapter
      const pendingData = this.storageAdapter?.getPartialSaveInfo()?.pendingBlockchainData;
      if (!pendingData) {
        throw new Error('No pending blockchain data to retry');
      }

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'retry_blockchain_pending_data', 'Retrieved pending blockchain data', {
        walrusBlobId: pendingData.walrusBlobId,
        spreadsheetObjectId: pendingData.spreadsheetObjectId
      });

      // Create storage transaction with existing blob ID (no Walrus upload)
      const tx = await this.suiService.createStorageTransaction(pendingData);

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'retry_blockchain_transaction_created', 'Storage transaction created for retry');

      // Execute the transaction
      const result = await this.suiService.executeTransaction(tx);

      if (result.success) {
        // Clear partial save state now that blockchain succeeded
        this.storageAdapter?.clearPartialSaveInfo();

        // Emit success event
        transactionEventBus.emit('save:retry-success', {
          transactionDigest: result.digest,
          blobId: pendingData.walrusBlobId,
          timestamp: Date.now()
        });

        const duration = logger.endTimer('blockchain_retry');
        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'retry_blockchain_success', '✅ Blockchain commit retry succeeded', {
          transactionDigest: result.digest,
          duration,
          blobId: pendingData.walrusBlobId
        });

        return {
          success: true,
          digest: result.digest,
          blobId: pendingData.walrusBlobId,
          duration
        };
      } else {
        throw new Error(result.error || 'Blockchain execution failed');
      }
    } catch (error) {
      logger.endTimer('blockchain_retry');
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'retry_blockchain_failed', 'Blockchain commit retry failed', {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      });

      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      };
    }
  }

  /**
   * Check Walrus storage health
   * Memoizes result for 30 seconds to avoid spamming endpoint
   * @returns {Promise<{ok: boolean, error?: string, publisherAvailable?: boolean, aggregatorAvailable?: boolean}>}
   */
  async checkWalrusHealth() {
    try {
      if (!this.walrusService) {
        return { ok: false, error: 'Walrus service not initialized' };
      }

      // Memoization: check if we have recent health data (< 30s old)
      const now = Date.now();
      if (this._cachedHealthCheck && (now - this._cachedHealthCheck.timestamp < 30000)) {
        logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'health_check_cached', 'Using cached Walrus health check', {
          age: now - this._cachedHealthCheck.timestamp,
          result: this._cachedHealthCheck.result
        });
        return this._cachedHealthCheck.result;
      }

      // Actually check health (calls browserWalrusService.checkHealth())
      const health = await this.walrusService.checkHealth();

      const result = {
        ok: health.isHealthy,
        publisherAvailable: health.publisherAvailable,
        aggregatorAvailable: health.aggregatorAvailable,
        error: health.lastError,
        lastCheck: health.lastCheck
      };

      // Cache the result
      this._cachedHealthCheck = {
        timestamp: now,
        result
      };

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'health_check_complete', 'Walrus health check completed', result);
      return result;

    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'health_check_failed', 'Walrus health check threw exception', {
        error: error.message,
        stack: error.stack
      });
      return { ok: false, error: error.message };
    }
  }
}

// Export for global debugging (development only)
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.WalSheetzDebug = {
    getTransactionState: () => {
      const adapter = window.spreadsheetEngine?.blockchainService;
      return adapter ? adapter.getTransactionState() : 'No blockchain adapter available';
    },
    resetTransactionState: () => {
      const adapter = window.spreadsheetEngine?.blockchainService;
      if (adapter) {
        adapter.resetTransactionState();
        console.log('Transaction state reset successfully');
      } else {
        console.log('No blockchain adapter available');
      }
    },
    validateObject: async (objectId = null) => {
      const adapter = window.spreadsheetEngine?.blockchainService;
      if (adapter) {
        const id = objectId || adapter.spreadsheetObjectId;
        if (!id) {
          console.log('No object ID specified and no active spreadsheet');
          return;
        }
        const result = await adapter.suiService.validateSpreadsheetObjectExists(id);
        console.log('Validation result:', result);
        return result;
      } else {
        console.log('No blockchain adapter available');
      }
    },
    help: () => {
      console.log(`
WalSheetz Debug Tools:
- WalSheetzDebug.getTransactionState() - Show current transaction state
- WalSheetzDebug.resetTransactionState() - Reset transaction state to clear errors
- WalSheetzDebug.validateObject([objectId]) - Validate if spreadsheet object exists
- WalSheetzDebug.help() - Show this help

Current state:`, window.WalSheetzDebug.getTransactionState());
    }
  };

  console.log('🛠️ WalSheetz Debug Tools loaded. Type WalSheetzDebug.help() for commands.');

  // Also expose the blockchain adapter globally for error recovery
  if (window.spreadsheetEngine?.blockchainService) {
    window.walSheetzBlockchainAdapter = window.spreadsheetEngine.blockchainService;
  }
}

// Also expose blockchain adapter globally in production for error recovery
if (typeof window !== 'undefined') {
  // Check periodically for spreadsheet engine availability
  const exposeAdapter = () => {
    // Guard against window being undefined during test teardown
    if (typeof window !== 'undefined' && window && window.spreadsheetEngine?.blockchainService) {
      window.walSheetzBlockchainAdapter = window.spreadsheetEngine.blockchainService
    }
  }

  // Try immediately
  exposeAdapter()

  // Also try after a brief delay to handle async initialization
  setTimeout(exposeAdapter, 100)
}
