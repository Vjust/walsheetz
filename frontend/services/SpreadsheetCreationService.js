import { logger, LogComponent } from '../utils/Logger.js';
import { SpreadsheetValidation } from '../utils/spreadsheetValidation.js';

/**
 * Centralized service for handling spreadsheet creation with enhanced UX
 */
export class SpreadsheetCreationService {
  constructor(blockchainAdapter, storageAdapter, spreadsheetEngine) {
    this.blockchainAdapter = blockchainAdapter;
    this.storageAdapter = storageAdapter;
    this.spreadsheetEngine = spreadsheetEngine;
    this.activeCreation = null;
    this.creationHistory = [];
  }

  /**
   * Create a new spreadsheet with enhanced progress tracking and error handling
   */
  async createSpreadsheet(options = {}) {
    const creationId = `creation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const creation = {
      id: creationId,
      title: options.title || 'Untitled Spreadsheet',
      template: options.template || 'blank',
      startTime: Date.now(),
      status: 'initializing',
      currentStep: 0,
      steps: this.getCreationSteps(options),
      onProgress: options.onProgress || (() => {}),
      onError: options.onError || (() => {}),
      onSuccess: options.onSuccess || (() => {}),
      estimatedDuration: this.estimateCreationTime(options),
      retryCount: 0,
      maxRetries: options.maxRetries || 3
    };

    this.activeCreation = creation;
    creation.status = 'loading';
    this.emitProgress(creation);

    try {
      logger.info(LogComponent.UI_COMPONENT, 'creation_start', 'Starting enhanced spreadsheet creation', {
        creationId,
        title: creation.title,
        template: creation.template,
        estimatedDuration: creation.estimatedDuration
      });

      // Execute creation steps
      const result = await this.executeCreationSteps(creation);

      // Track successful creation
      this.creationHistory.push({
        ...creation,
        status: 'completed',
        endTime: Date.now(),
        duration: Date.now() - creation.startTime,
        result
      });

      creation.status = 'success';
      this.emitProgress(creation, { status: 'success' });
      creation.onSuccess(result);
      return result;

    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'creation_error', 'Spreadsheet creation failed', {
        creationId,
        error: error.message,
        retryCount: creation.retryCount
      });

      // Handle retry logic
      if (creation.retryCount < creation.maxRetries && this.isRetryableError(error)) {
        return this.retryCreation(creation, error);
      }

      // Track failed creation
      this.creationHistory.push({
        ...creation,
        status: 'failed',
        endTime: Date.now(),
        duration: Date.now() - creation.startTime,
        error: error.message
      });

      creation.status = 'error';
      this.emitProgress(creation, { status: 'error', error: error.message });
      creation.onError(error);
      throw error;
    } finally {
      this.activeCreation = null;
    }
  }

  /**
   * Execute creation steps with progress tracking
   */
  async executeCreationSteps(creation) {
    // Step 1: Validation
    await this.executeStep(creation, 0, async () => {
      return this.validateCreationRequest(creation);
    });

    // Step 2: Prepare Data
    await this.executeStep(creation, 1, async () => {
      return this.prepareSpreadsheetData(creation);
    });

    // Step 3: Store to Walrus
    await this.executeStep(creation, 2, async () => {
      return this.storeToWalrus(creation);
    });

    // Step 4: Create Blockchain Record
    await this.executeStep(creation, 3, async () => {
      return this.createBlockchainRecord(creation);
    });

    // Step 5: Finalize Setup
    await this.executeStep(creation, 4, async () => {
      return this.finalizeCreation(creation);
    });

    return {
      success: true,
      spreadsheetId: creation.spreadsheetId,
      title: creation.title,
      data: creation.data,
      walrusBlobId: creation.walrusBlobId,
      transactionHash: creation.transactionHash,
      creationTime: Date.now() - creation.startTime
    };
  }

  /**
   * Execute a single creation step with error handling
   */
  async executeStep(creation, stepIndex, stepFunction) {
    const step = creation.steps[stepIndex];
    creation.currentStep = stepIndex;

    // Update step status to current
    step.status = 'current';
    step.startTime = Date.now();
    creation.status = 'loading';
    this.emitProgress(creation);

    try {
      const result = await stepFunction();

      // Mark step as completed
      step.status = 'completed';
      step.endTime = Date.now();
      step.duration = step.endTime - step.startTime;
      step.result = result;

      this.emitProgress(creation);

      return result;

    } catch (error) {
      step.status = 'error';
      step.endTime = Date.now();
      step.duration = step.endTime - step.startTime;
      step.error = error.message;

      creation.status = 'error';
      this.emitProgress(creation, { status: 'error', error: error.message });

      throw error;
    }
  }

  emitProgress(creation, overrides = {}) {
    if (typeof creation.onProgress !== 'function') {
      return;
    }

    creation.onProgress(this.buildProgressState(creation, overrides));
  }

  buildProgressState(creation, overrides = {}) {
    const elapsedMs = Date.now() - creation.startTime;
    const remainingMs = this.calculateRemainingTime(creation);
    const estimatedTotalSeconds = creation.estimatedDuration
      ? Math.ceil(creation.estimatedDuration / 1000)
      : null;
    const remainingSeconds = Number.isFinite(remainingMs)
      ? Math.max(0, Math.ceil(remainingMs / 1000))
      : null;

    const state = {
      id: creation.id,
      title: creation.title,
      status: overrides.status || creation.status || 'loading',
      currentStep: creation.currentStep,
      totalSteps: creation.steps.length,
      steps: creation.steps.map((step) => ({
        title: step.title,
        description: step.description,
        status: step.status,
        estimatedDuration: typeof step.estimatedDuration === 'number'
          ? Math.ceil(step.estimatedDuration / 1000)
          : null,
        duration: typeof step.duration === 'number'
          ? Math.ceil(step.duration / 1000)
          : null,
        error: step.error,
        details: step.details
      })),
      estimatedTime: estimatedTotalSeconds,
      estimatedTimeRemaining: remainingSeconds,
      elapsedTime: Math.max(0, Math.floor(elapsedMs / 1000))
    };

    if (Object.prototype.hasOwnProperty.call(overrides, 'error')) {
      state.error = overrides.error;
    }

    return state;
  }

  /**
   * Validate creation request
   */
  async validateCreationRequest(creation) {
    // Check wallet connection
    if (!this.blockchainAdapter.isWalletConnected()) {
      throw new Error('Wallet not connected. Please connect your wallet before creating a spreadsheet.');
    }

    // Check title validity
    if (!creation.title || creation.title.trim().length === 0) {
      throw new Error('Spreadsheet title cannot be empty.');
    }

    if (creation.title.length > 100) {
      throw new Error('Spreadsheet title cannot exceed 100 characters.');
    }

    // Check for special characters that might cause issues
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(creation.title)) {
      throw new Error('Spreadsheet title contains invalid characters. Please use only letters, numbers, and basic punctuation.');
    }

    // Check network configuration
    const networkConfig = await this.blockchainAdapter.getCurrentNetworkConfig();
    if (!networkConfig?.packageId || !networkConfig?.registryObjectId) {
      throw new Error('Blockchain network not properly configured. Please contact support.');
    }

    // Validate wallet balance (estimate gas costs)
    try {
      const balance = await this.blockchainAdapter.getWalletBalance();
      const estimatedGas = 0.01; // Rough estimate in SUI

      if (balance < estimatedGas) {
        throw new Error(`Insufficient SUI balance. You need at least ${estimatedGas} SUI for transaction fees. Current balance: ${balance.toFixed(4)} SUI.`);
      }
    } catch (error) {
      logger.warn(LogComponent.UI_COMPONENT, 'balance_check_failed', 'Could not verify wallet balance', {
        error: error.message
      });
      // Don't fail creation for balance check failures
    }

    return { validated: true, timestamp: Date.now() };
  }

  /**
   * Prepare spreadsheet data based on template
   */
  async prepareSpreadsheetData(creation) {
    const templateData = this.getTemplateData(creation.template);
    
    // Get current network
    const { getCurrentConfig } = await import('@blockchain/config.js');
    const config = getCurrentConfig();
    const network = config.environment;

    const data = {
      version: `v${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      savedAt: Date.now(),
      title: creation.title,
      template: creation.template,
      network: network, // Track which network this spreadsheet was created on
      cells: templateData.cells || {},
      edits: [],
      metadata: {
        title: creation.title,
        network: network,
        createdOnNetwork: network,
        rows: templateData.rows || 100,
        cols: templateData.cols || 26,
        sheets: templateData.sheets || [{
          name: 'Sheet1',
          index: 0,
          order: 0,
          status: 1
        }],
        template: creation.template,
        createdBy: 'WalSheetz',
        description: templateData.description || `${creation.template} spreadsheet created with WalSheetz`
      }
    };

    creation.data = data;
    return { prepared: true, dataSize: JSON.stringify(data).length, network };
  }

  /**
   * Store data to Walrus
   */
  async storeToWalrus(creation) {
    await this.blockchainAdapter.walrusService.connect();

    const result = await this.blockchainAdapter.walrusService.storeWithQuilt(
      JSON.stringify(creation.data),
      {
        title: creation.title,
        type: 'spreadsheet',
        version: creation.data.version,
        template: creation.template
      }
    );

    if (!result.success || !result.blobId) {
      // Check if this is a WAL coin insufficiency error
      const errorMessage = result.error || 'Unknown error';
      const isWalCoinError = this.blockchainAdapter.walrusService.isWalCoinError?.(errorMessage) || 
                             errorMessage.toLowerCase().includes('wal') && 
                             (errorMessage.toLowerCase().includes('coin') || 
                              errorMessage.toLowerCase().includes('balance'));
      
      if (isWalCoinError) {
        throw new Error(
          'Walrus testnet publisher is temporarily out of WAL coins. ' +
          'This is a testnet infrastructure issue. ' +
          'Your spreadsheet will be saved locally. ' +
          'You can retry uploading to Walrus later when the publisher is refunded.'
        );
      }
      
      throw new Error(`Failed to store data to Walrus: ${errorMessage}`);
    }

    creation.walrusBlobId = result.blobId;
    return { stored: true, blobId: result.blobId, size: result.size };
  }

  /**
   * Create blockchain record
   */
  async createBlockchainRecord(creation) {
    const result = await this.blockchainAdapter.createSpreadsheetRecord({
      title: creation.title,
      walrusBlobId: creation.walrusBlobId,
      template: creation.template,
      isPublic: false // Default to private
    });

    if (!result.success) {
      throw new Error(`Failed to create blockchain record: ${result.error || 'Transaction failed'}`);
    }

    creation.spreadsheetId = result.spreadsheetId;
    creation.transactionHash = result.transactionHash;

    return {
      created: true,
      spreadsheetId: result.spreadsheetId,
      transactionHash: result.transactionHash
    };
  }

  /**
   * Finalize creation setup
   */
  async finalizeCreation(creation) {
    // Load data into spreadsheet engine
    if (this.spreadsheetEngine) {
      await this.spreadsheetEngine.loadData(creation.data);
    }

    // Update storage adapter with new spreadsheet info
    if (this.storageAdapter) {
      this.storageAdapter.setCurrentSpreadsheetId(creation.spreadsheetId);
      this.storageAdapter.setSpreadsheetTitle(creation.title);
      this.storageAdapter.setLastWalrusBlobId(creation.walrusBlobId);
    }

    return {
      finalized: true,
      timestamp: Date.now(),
      totalDuration: Date.now() - creation.startTime
    };
  }

  /**
   * Retry creation with exponential backoff
   */
  async retryCreation(creation, lastError) {
    creation.retryCount++;
    const delay = Math.min(1000 * Math.pow(2, creation.retryCount - 1), 5000); // Max 5 second delay

    logger.info(LogComponent.UI_COMPONENT, 'creation_retry', 'Retrying spreadsheet creation', {
      creationId: creation.id,
      retryCount: creation.retryCount,
      delay,
      lastError: lastError.message
    });

    // Reset failed steps
    creation.steps.forEach(step => {
      if (step.status === 'error') {
        step.status = 'pending';
        delete step.error;
        delete step.endTime;
        delete step.duration;
      }
    });

    creation.currentStep = 0;
    creation.status = 'loading';
    this.emitProgress(creation);

    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, delay));

    // Retry from the beginning
    return this.executeCreationSteps(creation);
  }

  /**
   * Get creation steps definition
   */
  getCreationSteps(options) {
    return [
      {
        title: 'Validating Request',
        description: 'Checking wallet connection and permissions',
        estimatedDuration: 2000,
        status: 'pending'
      },
      {
        title: 'Preparing Data',
        description: 'Setting up spreadsheet structure and template',
        estimatedDuration: 1000,
        status: 'pending'
      },
      {
        title: 'Storing to Walrus',
        description: 'Uploading to decentralized storage network',
        estimatedDuration: 8000,
        status: 'pending'
      },
      {
        title: 'Creating Blockchain Record',
        description: 'Recording ownership on Sui blockchain',
        estimatedDuration: 15000,
        status: 'pending'
      },
      {
        title: 'Finalizing Setup',
        description: 'Loading spreadsheet data and updating session',
        estimatedDuration: 2000,
        status: 'pending'
      }
    ];
  }

  /**
   * Estimate total creation time
   */
  estimateCreationTime(options) {
    const steps = this.getCreationSteps(options);
    return steps.reduce((total, step) => total + step.estimatedDuration, 0);
  }

  /**
   * Calculate remaining time for current creation
   */
  calculateRemainingTime(creation) {
    const elapsed = Date.now() - creation.startTime;
    const steps = creation.steps || [];
    if (!steps.length) {
      const fallback = (creation.estimatedDuration || 0) - elapsed;
      return Math.max(0, fallback);
    }

    const current = steps[creation.currentStep];
    const remainingAfterCurrent = steps
      .slice(creation.currentStep + 1)
      .reduce((sum, step) => sum + (step.estimatedDuration || 0), 0);

    let remainingCurrent = 0;
    if (current) {
      if (current.status === 'current') {
        const estimate = current.estimatedDuration || 0;
        const elapsedInStep = current.startTime ? Date.now() - current.startTime : 0;
        remainingCurrent = Math.max(0, estimate - elapsedInStep);
      } else if (current.status === 'pending') {
        remainingCurrent = current.estimatedDuration || 0;
      }
    }

    const remaining = remainingCurrent + remainingAfterCurrent;
    return Math.max(0, remaining);
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    const retryableMessages = [
      'network error',
      'timeout',
      'connection failed',
      'rate limit',
      'service unavailable',
      'transaction failed',
      'walrus upload failed'
    ];

    return retryableMessages.some(msg =>
      error.message.toLowerCase().includes(msg)
    );
  }

  /**
   * Get template data for different spreadsheet types
   */
  getTemplateData(template) {
    const templates = {
      blank: {
        cells: {},
        rows: 100,
        cols: 26,
        description: 'Empty spreadsheet ready for your data'
      },
      budget: {
        cells: {
          'A1': { v: 'Personal Budget', s: { fontWeight: 'bold', fontSize: 16 } },
          'A3': { v: 'Income' },
          'A4': { v: 'Salary' },
          'A5': { v: 'Freelance' },
          'A6': { v: 'Other' },
          'A8': { v: 'Expenses' },
          'A9': { v: 'Rent/Mortgage' },
          'A10': { v: 'Utilities' },
          'A11': { v: 'Food' },
          'A12': { v: 'Transportation' },
          'A13': { v: 'Entertainment' },
          'B3': { v: 'Amount' },
          'B8': { v: 'Amount' }
        },
        description: 'Pre-structured budget template with income and expense categories'
      },
      project: {
        cells: {
          'A1': { v: 'Project Tracker', s: { fontWeight: 'bold', fontSize: 16 } },
          'A3': { v: 'Task' },
          'B3': { v: 'Status' },
          'C3': { v: 'Assigned To' },
          'D3': { v: 'Due Date' },
          'E3': { v: 'Priority' },
          'A4': { v: 'Project Setup' },
          'A5': { v: 'Requirements Gathering' },
          'A6': { v: 'Design Phase' },
          'A7': { v: 'Development' },
          'A8': { v: 'Testing' },
          'A9': { v: 'Deployment' }
        },
        description: 'Task tracking template for project management'
      },
      inventory: {
        cells: {
          'A1': { v: 'Inventory List', s: { fontWeight: 'bold', fontSize: 16 } },
          'A3': { v: 'Item' },
          'B3': { v: 'SKU' },
          'C3': { v: 'Quantity' },
          'D3': { v: 'Unit Price' },
          'E3': { v: 'Total Value' },
          'F3': { v: 'Supplier' },
          'G3': { v: 'Location' }
        },
        description: 'Inventory management template with pricing and supplier tracking'
      },
      schedule: {
        cells: {
          'A1': { v: 'Schedule Planner', s: { fontWeight: 'bold', fontSize: 16 } },
          'A3': { v: 'Time' },
          'B3': { v: 'Monday' },
          'C3': { v: 'Tuesday' },
          'D3': { v: 'Wednesday' },
          'E3': { v: 'Thursday' },
          'F3': { v: 'Friday' },
          'G3': { v: 'Saturday' },
          'H3': { v: 'Sunday' },
          'A4': { v: '9:00 AM' },
          'A5': { v: '10:00 AM' },
          'A6': { v: '11:00 AM' },
          'A7': { v: '12:00 PM' },
          'A8': { v: '1:00 PM' },
          'A9': { v: '2:00 PM' },
          'A10': { v: '3:00 PM' },
          'A11': { v: '4:00 PM' },
          'A12': { v: '5:00 PM' }
        },
        description: 'Weekly schedule template with hourly time slots'
      },
      contacts: {
        cells: {
          'A1': { v: 'Contact List', s: { fontWeight: 'bold', fontSize: 16 } },
          'A3': { v: 'Name' },
          'B3': { v: 'Email' },
          'C3': { v: 'Phone' },
          'D3': { v: 'Company' },
          'E3': { v: 'Role' },
          'F3': { v: 'Notes' }
        },
        description: 'Contact management template with professional details'
      }
    };

    return templates[template] || templates.blank;
  }

  /**
   * Get creation statistics
   */
  getCreationStats() {
    const total = this.creationHistory.length;
    const successful = this.creationHistory.filter(c => c.status === 'completed').length;
    const failed = this.creationHistory.filter(c => c.status === 'failed').length;
    const avgDuration = this.creationHistory
      .filter(c => c.duration)
      .reduce((sum, c) => sum + c.duration, 0) / (successful || 1);

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      averageDuration: avgDuration,
      isActive: !!this.activeCreation
    };
  }

  /**
   * Cancel active creation
   */
  cancelCreation() {
    if (this.activeCreation) {
      logger.info(LogComponent.UI_COMPONENT, 'creation_cancelled', 'User cancelled spreadsheet creation', {
        creationId: this.activeCreation.id,
        currentStep: this.activeCreation.currentStep
      });

      this.activeCreation.status = 'cancelled';
      this.activeCreation = null;
      return true;
    }
    return false;
  }
}

export default SpreadsheetCreationService;
