import { IBlockchainService } from '../interfaces/IBlockchainService.js';
// Use browser-compatible services in frontend
import { browserWalletManager } from '../services/BrowserWalletManager.js';
import { browserSuiService } from '../services/BrowserSuiService.js';
import { browserWalrusService } from '../services/BrowserWalrusService.js';
// Collaboration disabled for single-user MVP
// import { collaborationService } from '../services/CollaborationService.js';
import { errorRecoveryService } from '../services/ErrorRecoveryService.js';
import { progressiveEnhancementService } from '../services/ProgressiveEnhancementService.js';
import { offlineModeService } from '../services/OfflineModeService.js';
import { logger, LogComponent, ErrorCategory } from '../utils/Logger.js';
import { configLoader } from '../utils/ConfigLoader.js';
import { validationGuards } from '../utils/ValidationGuards.js';
import { transactionManager } from '../services/TransactionManager.js';
import { transactionEventBus } from '../utils/EventBus.js';
import { NetworkError, WalletError, ContractError, ValidationError, StorageError, ErrorFactory } from '../utils/errors.js';
import { standardizedErrorHandler } from '../utils/StandardizedErrorHandler.js';
import { transactionExperienceManager } from '../utils/TransactionExperience.js';

/**
 * Atomic Operation Manager - Ensures operations can be rolled back if any step fails
 */
class AtomicOperationManager {
  constructor() {
    this.operations = [];
    this.resources = new Map(); // Track resources that need cleanup
  }

  /**
   * Execute operations atomically with rollback support and dependency handling
   */
  async executeAtomic(operations, context = {}) {
    const operationId = `atomic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_start', `Starting atomic operation [${operationId}]`, {
      operations: operations.length,
      context: Object.keys(context)
    });

    // Ensure this is visible to both try and catch
    let lastOperation = { name: 'initialization', type: 'setup' };

    try {
      const results = [];
      const operationResults = new Map(); // Store results by operation name

      // Separate operations into parallel and sequential groups
      const parallelOperations = operations.filter(op => !op.dependencies);
      const sequentialOperations = operations.filter(op => op.dependencies);

      // Execute parallel operations first
      if (parallelOperations.length > 0) {
        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_parallel', `Executing ${parallelOperations.length} parallel operations [${operationId}]`);

        // Emit progress event for parallel operations
        transactionExperienceManager.emitTransactionEvent('atomic:progress', {
          operationId,
          stage: 'parallel_operations',
          parallelOperations: parallelOperations.length,
          description: 'Processing operations in parallel for better performance'
        });

        const parallelPromises = parallelOperations.map(async (operation, i) => {
          try {
            lastOperation = operation;

            logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_step', `Executing parallel operation: ${operation.name} [${operationId}]`, {
              operationName: operation.name,
              operationId
            });

            // Prepare transaction experience for this operation
            const txExperience = transactionExperienceManager.prepareTransaction(
              operation.name,
              context
            );

            // Execute with transaction experience
            const result = await transactionExperienceManager.executeWithExperience(
              { execute: operation.execute.bind(operation) },
              operation.name,
              context
            );

            // Annotate result so downstream can find by name
            const namedResult = { name: operation.name, ...result };
            operationResults.set(operation.name, namedResult);

            // Register cleanup handler if operation provides one
            if (operation.getCleanupHandler) {
              const cleanupHandler = operation.getCleanupHandler(namedResult);
              if (cleanupHandler) {
                this.operations.push({
                  operationId,
                  step: i,
                  cleanup: cleanupHandler,
                  result: namedResult
                });
              }
            }

            return namedResult;
          } catch (operationError) {
            // Enhance error with operation context
            const enhancedError = new Error(`Operation ${operation.name} failed: ${typeof operationError === 'string' ? operationError : operationError.message || 'Unknown error'}`);
            enhancedError.operationName = operation.name;
            enhancedError.originalError = operationError;
            throw enhancedError;
          }
        });

        const parallelResults = await Promise.allSettled(parallelPromises);

        // Check if any parallel operations failed
        for (let i = 0; i < parallelResults.length; i++) {
          const result = parallelResults[i];
          if (result.status === 'rejected') {
            throw new Error(`Parallel operation failed: ${parallelOperations[i].name} - ${result.reason}`);
          }
          results.push(result.value);
        }

        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_parallel_success', `All parallel operations completed [${operationId}]`, {
          completed: parallelOperations.length
        });
      }

      // Execute sequential operations that depend on parallel ones
      if (sequentialOperations.length > 0) {
        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_sequential', `Executing ${sequentialOperations.length} sequential operations [${operationId}]`);

        for (const operation of sequentialOperations) {
          try {
            lastOperation = operation;

            // Build context with results from dependencies
            const dependencyContext = {
              ...context,
              results: Array.from(operationResults.values()),
              operationResults: Object.fromEntries(operationResults)
            };

            logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_step', `Executing sequential operation: ${operation.name} [${operationId}]`, {
              operationName: operation.name,
              dependencies: operation.dependencies,
              operationId
            });

            const result = await operation.execute(dependencyContext, operationId);
            const namedResult = { name: operation.name, ...result };
            results.push(namedResult);

            // Register cleanup handler if operation provides one
            if (operation.getCleanupHandler) {
              const cleanupHandler = operation.getCleanupHandler(namedResult);
              if (cleanupHandler) {
                this.operations.push({
                  operationId,
                  step: operations.indexOf(operation),
                  cleanup: cleanupHandler,
                  result: namedResult
                });
              }
            }
          } catch (operationError) {
            // Enhance error with operation context
            const enhancedError = new Error(`Sequential operation ${operation.name} failed: ${typeof operationError === 'string' ? operationError : operationError.message || 'Unknown error'}`);
            enhancedError.operationName = operation.name;
            enhancedError.originalError = operationError;
            throw enhancedError;
          }
        }

        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_sequential_success', `All sequential operations completed [${operationId}]`, {
          completed: sequentialOperations.length
        });
      }

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_success', `Atomic operation completed successfully [${operationId}]`, {
        operations: operations.length,
        parallel: parallelOperations.length,
        sequential: sequentialOperations.length,
        operationId
      });

      return { success: true, results, operationId };

    } catch (error) {
      // Safely handle missing/undefined lastOperation
      const safeLastOperation = lastOperation || { name: 'unknown', type: 'unknown' };

      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_failed', `Atomic operation failed, initiating rollback [${operationId}]`, {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        operationId,
        operations: operations.length,
        lastOperation: safeLastOperation.name
      });

      await this.rollback(operationId, error);

      // Use standardized error handler for consistent error processing
      const errorResult = await standardizedErrorHandler.processError(error, {
        operationId,
        operations: operations.length,
        lastOperation: safeLastOperation.name
      });

      return {
        success: false,
        error: errorResult.userMessage,
        technicalError: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        operationId,
        rollbackCompleted: true,
        category: errorResult.category,
        recoveryActions: errorResult.recoveryActions,
        requiresUserAction: errorResult.requiresUserAction
      };
    }
  }

  /**
   * Rollback operations in reverse order
   */
  async rollback(operationId, originalError) {
    const operationsToRollback = this.operations.filter(op => op.operationId === operationId);

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'rollback_start', `Starting rollback for operation [${operationId}]`, {
      operationsToRollback: operationsToRollback.length,
      originalError: typeof originalError === 'string' ? originalError : originalError.message || 'Unknown error'
    });

    // Rollback in reverse order
    const rollbackOperations = operationsToRollback.reverse();

    for (const op of rollbackOperations) {
      try {
        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'rollback_step', `Rolling back step ${op.step} [${operationId}]`, {
          step: op.step,
          operationId
        });

        await op.cleanup(op.result);
      } catch (rollbackError) {
        logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'rollback_failed', `Rollback failed for step ${op.step} [${operationId}]`, {
          step: op.step,
          rollbackError: typeof rollbackError === 'string' ? rollbackError : rollbackError.message || 'Unknown error',
          operationId
        });

        // Continue with other rollbacks even if one fails
      }
    }

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'rollback_complete', `Rollback completed [${operationId}]`, {
      operationId,
      operationsRolledBack: rollbackOperations.length
    });
  }

  /**
   * Clean up operation tracking
   */
  cleanup(operationId) {
    this.operations = this.operations.filter(op => op.operationId !== operationId);
    logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_cleanup', `Cleaned up operation tracking [${operationId}]`);
  }
}

// Global atomic operation manager instance
const atomicOperationManager = new AtomicOperationManager();

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
    
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'constructor', 'Services initialized', {
      walletManager: !!this.walletManager,
      suiService: !!this.suiService,
      walrusService: !!this.walrusService,
      collaborationService: !!this.collaborationService,
      editTrackerSize: this.editTracker.size,
      syncQueueSize: this.syncQueue.length
    });
    
    // Listen to wallet events
    this.setupEventListeners();
    
    // Initialize collaboration service
    this.initializeServices();
    
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'constructor', 'BlockchainAdapter initialization completed');
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
      logger.info(LogComponent.STORAGE_SERVICE, 'walrus_store_optimized', 'Storing spreadsheet data in Walrus');

      await this.walrusService.connect();

      const walrusResult = await this.walrusService.storeBlob(spreadsheetData, {
        epochs: 50,
        contentType: 'application/json'
      });

      if (!walrusResult.success) {
        logger.endTimer('walrus_storage_optimized');
        throw new Error(`Walrus storage failed: ${walrusResult.error}`);
      }

      logger.endTimer('walrus_storage_optimized');
      logger.info(LogComponent.STORAGE_SERVICE, 'walrus_store_optimized', 'Data stored in Walrus', {
        blobId: walrusResult.blobId,
        size: walrusResult.size
      });

      // Step 3: Create SINGLE combined transaction (NEW APPROACH)
      logger.startTimer('combined_transaction_create');
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'combined_transaction', 'Creating single combined transaction for creation + version save');

      const cellCount = Object.keys(spreadsheetData.cells || {}).length;
      const description = `Initial version created ${new Date().toLocaleString()}`;
      
      // Execute the two separate transactions (createSpreadsheetWithInitialVersion handles this now)
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'wallet_prompt_combined', 'Two wallet prompts: Create spreadsheet + save initial version');
      
      const combinedResult = await this.suiService.createSpreadsheetWithInitialVersion(
        title,
        walrusResult.blobId,
        walrusResult.contentHash?.hash,
        cellCount,
        description
      );

      if (!combinedResult.success) {
        logger.endTimer('combined_transaction_create');
        throw new Error(`Failed to create spreadsheet with initial version: ${combinedResult.error || 'Unknown error'}`);
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
        throw new Error(`Failed to get spreadsheet object ID from two-transaction result`);
      }

      this.spreadsheetObjectId = spreadsheetObjectId;
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

      return {
        success: true,
        spreadsheetId: this.spreadsheetObjectId,
        walrusBlobId: walrusResult.blobId,
        title,
        data: spreadsheetData,
        transactionId: combinedResult.digest, // Single transaction ID
        timestamp: Date.now(),
        optimized: true,
        ultraOptimized: true, // NEW FLAG!
        walletPrompts: 1, // Reduced from 2 to 1!
        // Gas usage metrics not available for two-transaction path here; omit for now
      };

    } catch (error) {
      logger.endTimer('create_optimized_spreadsheet');
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'create_optimized_failed', 'Optimized spreadsheet creation failed', {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        stack: error.stack
      });

      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
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
        redundantBlobIds: walrusResult.allBlobIds?.slice(1) || [],
        compressionInfo: walrusResult.compressionInfo,
        transactionDigest,
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

  // Enhanced blockchain save method with progressive enhancement and transaction modal support
  async saveToBlockchain(data, options = {}) {
    logger.startTimer('blockchain_save');
    const saveId = `save-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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

        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'save_completed', 'Parallel save operation completed successfully', {
          duration: logger.endTimer('blockchain_save'),
          walrusSuccess: walrusResult.success,
          blockchainSuccess: blockchainResult.success,
          method: 'parallel_atomic_processing'
        });

        return {
          success: true,
          walrusBlobId: walrusResult.blobId,
          transactionId: blockchainResult.blockchainResult?.digest,
          spreadsheetId: this.spreadsheetObjectId,
          timestamp: Date.now(),
          method: 'parallel_atomic_processing',
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
   * Create atomic operations for the save process with parallel processing
   */
  _createAtomicSaveOperations(data, options) {
    return [
      // Parallel operations that can run concurrently
      {
        name: 'walrus_storage',
        execute: async (context, operationId) => {
          logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_walrus', `Executing Walrus storage [${operationId}]`);

          // Connect to Walrus if not already connected
          await this.walrusService.connect();

          const walrusResult = await this.walrusService.storeBlob(data, {
            epochs: 50,
            contentType: 'application/json'
          });

          if (!walrusResult.success) {
            throw new Error(`Walrus storage failed: ${walrusResult.error}`);
          }

          logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_walrus_success', `Walrus storage completed [${operationId}]`, {
            blobId: walrusResult.blobId
          });

          return walrusResult;
        },
        getCleanupHandler: (result) => {
          // Return cleanup function for Walrus blob if needed
          return async () => {
            logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_walrus_cleanup', 'Cleaning up Walrus blob', {
              blobId: result.blobId
            });
            // Note: In practice, Walrus blobs are immutable and can't be deleted
            // This is mainly for logging and state cleanup
          };
        }
      },
      {
        name: 'transaction_preparation',
        execute: async (context, operationId) => {
          logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_tx_prep', `Preparing blockchain transaction metadata [${operationId}]`);

          // This runs in parallel with Walrus storage
          // We prepare the transaction metadata but don't create the actual transaction yet
          const versionData = {
            spreadsheetObjectId: context.spreadsheetObjectId || this.spreadsheetObjectId,
            version: data.version || this.generateVersion(),
            cellCount: Object.keys(data.cells || {}).length,
            description: data.metadata?.title || data.title || 'Untitled Spreadsheet'
          };

          // Just prepare metadata - don't create transaction without blob ID
          logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_tx_prep_success', `Transaction metadata prepared [${operationId}]`, {
            cellCount: versionData.cellCount,
            description: versionData.description
          });

          return {
            versionData,
            prepared: true
          };
        },
        getCleanupHandler: (result) => {
          // Return cleanup function for prepared transaction
          return async () => {
            logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_tx_prep_cleanup', 'Cleaning up prepared transaction');
            // No specific cleanup needed for prepared transactions
          };
        }
      },
      // Final operation that depends on both previous operations
      {
        name: 'blockchain_execution',
        dependencies: ['walrus_storage', 'transaction_preparation'],
        execute: async (context, operationId) => {
          logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_blockchain', `Executing blockchain transaction [${operationId}]`);

          const walrusResult = context.results.find(r => r.name === 'walrus_storage');
          const txPrepResult = context.results.find(r => r.name === 'transaction_preparation');

          if (!walrusResult || !txPrepResult) {
            const availableResults = context.results.map(r => r.name).join(', ');
            throw new Error(`Missing required results from parallel operations. Available: ${availableResults}`);
          }

          // Debug log the results structure
          logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_blockchain_debug', 'Results structure', {
            walrusResult: walrusResult ? Object.keys(walrusResult) : 'missing',
            txPrepResult: txPrepResult ? Object.keys(txPrepResult) : 'missing',
            operationId
          });

          // Safely access versionData with fallback
          if (!txPrepResult.versionData) {
            throw new Error(`Transaction preparation result missing versionData: ${JSON.stringify(txPrepResult)}`);
          }

          if (!walrusResult.blobId) {
            throw new Error(`Walrus result missing blobId: ${JSON.stringify(walrusResult)}`);
          }

          // Create transaction with actual Walrus blob ID
          const finalVersionData = {
            ...txPrepResult.versionData,
            walrusBlobId: walrusResult.blobId,
            contentHash: walrusResult.contentHash?.hash || 'unknown'
          };

          // Create and execute the storage transaction with actual blob ID
          const storageTx = await this.suiService.createStorageTransaction(finalVersionData);

          // Estimate gas for the actual transaction
          const storageGasEstimate = await this.suiService.estimateGas(storageTx);
          const storageBalanceCheck = await this.suiService.checkSufficientBalance(storageGasEstimate);

          if (!storageBalanceCheck.sufficient) {
            throw new Error(`Insufficient balance: ${storageBalanceCheck.message}`);
          }

          // Execute the transaction
          const blockchainResult = await this.suiService.executeTransaction(storageTx);

          if (!blockchainResult.success) {
            throw new Error(`Blockchain transaction failed: ${blockchainResult.error}`);
          }

          logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_blockchain_success', `Blockchain transaction completed [${operationId}]`, {
            transactionDigest: blockchainResult.digest
          });

          return {
            success: true,
            walrusResult,
            blockchainResult,
            operationId
          };
        },
        getCleanupHandler: (result) => {
          // Return cleanup function for blockchain operations if needed
          return async () => {
            logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_blockchain_cleanup', 'Cleaning up blockchain operations', {
              transactionDigest: result.blockchainResult?.digest
            });
            // Note: Blockchain transactions are immutable once confirmed
            // This is mainly for state cleanup
          };
        }
      }
    ];
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
      logger.info(LogComponent.STORAGE_SERVICE, 'fallback_save_local', 'Using local storage fallback');

      // Save to local storage
      const localKey = `walsheetz_fallback_${Date.now()}`;
      localStorage.setItem(localKey, JSON.stringify(data));

      // Update sync status
      this.syncStatus.lastSync = Date.now();
      this.syncStatus.pendingChanges = 0;
      this.editTracker.clear();

      return {
        success: true,
        method: 'local_fallback',
        localKey,
        message: 'Saved locally - will sync to blockchain when services are available',
        fallback: true,
        reason: 'Service degradation'
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
          logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'version_mismatch', 'Spreadsheet version mismatch detected', {
            spreadsheetId,
            spreadsheetVersion: versionCompatibility.spreadsheetVersion,
            moduleVersion: versionCompatibility.moduleVersion,
            needsMigration: versionCompatibility.needsMigration
          });
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
    if (window.spreadsheetEngine?.blockchainService) {
      window.walSheetzBlockchainAdapter = window.spreadsheetEngine.blockchainService;
    }
  };

  // Try immediately
  exposeAdapter();

  // Also try after a brief delay to handle async initialization
  setTimeout(exposeAdapter, 100);
}
