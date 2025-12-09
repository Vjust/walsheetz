// Pure gRPC implementation of Sui service (no SDK dependencies)
import { grpcService } from './grpc-service.js';
import { grpcTransactionBuilder } from './grpc-transaction-builder.js';
import { getCurrentConfig } from './config.js';

export class SuiGrpcService {
  config: any;
  grpcService: any;
  transactionBuilder: any;

  constructor() {
    this.config = getCurrentConfig();
    this.grpcService = grpcService;
    this.transactionBuilder = grpcTransactionBuilder;
  }

  // Initialize the service
  async initialize() {
    try {
      await this.grpcService.connect();
      console.log('Sui gRPC service initialized');
      return true;
    } catch (error) {
      const err = error as Error;
      console.error('Failed to initialize Sui gRPC service:', err);
      throw err;
    }
  }

  // Create a new spreadsheet
  async createSpreadsheet(title: string, sender: string, signer: any) {
    try {
      // Build the transaction
      const transaction = this.transactionBuilder.buildCreateSpreadsheetTransaction(
        title,
        sender
      );

      // Execute via gRPC
      const result = await this.grpcService.executeMoveCall(
        transaction,
        sender,
        signer
      );

      // Extract spreadsheet ID from events
      const spreadsheetId = this.extractSpreadsheetIdFromEvents(result.transaction?.events);

      return {
        success: true,
        spreadsheetId: spreadsheetId,
        transactionDigest: result.transaction?.digest,
        gasUsed: result.transaction?.effects?.gasUsed
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to create spreadsheet:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }

  // Save a version
  // save_version(spreadsheet, walrus_blob_id, content_hash, cell_count, description, clock)
  async saveVersion(spreadsheetId: string, blobId: string, contentHash: string, cellCount: number, description: string, sender: string, signer: any) {
    try {
      // Build the transaction
      const transaction = this.transactionBuilder.buildSaveVersionTransaction(
        spreadsheetId,
        blobId,
        contentHash,
        cellCount,
        description,
        sender
      );

      // Execute via gRPC
      const result = await this.grpcService.executeMoveCall(
        transaction,
        sender,
        signer
      );

      // Extract version ID from events
      const versionId = this.extractVersionIdFromEvents(result.transaction?.events);

      return {
        success: true,
        versionId: versionId,
        transactionDigest: result.transaction?.digest,
        gasUsed: result.transaction?.effects?.gasUsed
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to save version:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }

  // Lock a cell for editing
  async lockCell(spreadsheetId: string, cellRef: string, sender: string, signer: any) {
    try {
      // Build the transaction
      const transaction = this.transactionBuilder.buildLockCellTransaction(
        spreadsheetId,
        cellRef,
        sender
      );

      // Execute via gRPC
      const result = await this.grpcService.executeMoveCall(
        transaction,
        sender,
        signer
      );

      return {
        success: true,
        locked: true,
        transactionDigest: result.transaction?.digest,
        gasUsed: result.transaction?.effects?.gasUsed
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to lock cell:', err);
      return {
        success: false,
        locked: false,
        error: err.message
      };
    }
  }

  // Unlock a cell
  async unlockCell(spreadsheetId: string, cellRef: string, sender: string, signer: any) {
    try {
      // Build the transaction
      const transaction = this.transactionBuilder.buildUnlockCellTransaction(
        spreadsheetId,
        cellRef,
        sender
      );

      // Execute via gRPC
      const result = await this.grpcService.executeMoveCall(
        transaction,
        sender,
        signer
      );

      return {
        success: true,
        unlocked: true,
        transactionDigest: result.transaction?.digest,
        gasUsed: result.transaction?.effects?.gasUsed
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to unlock cell:', err);
      return {
        success: false,
        unlocked: false,
        error: err.message
      };
    }
  }

  // Get balance via gRPC
  async getBalance(address: string, coinType: string = '0x2::sui::SUI') {
    try {
      const balance = await this.grpcService.getBalance(address, coinType);
      return {
        success: true,
        totalBalance: balance.balance?.balance || '0',
        coinObjectCount: 1, // gRPC v2beta2 doesn't provide this field
        lockedBalance: '0' // gRPC v2beta2 doesn't provide this field
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to get balance:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }

  // Get owned objects via gRPC
  async getOwnedObjects(address: string, options: any = {}) {
    try {
      const objects = await this.grpcService.getOwnedObjects(address, options);
      return {
        success: true,
        objects: objects,
        hasNextPage: objects.hasNextPage || false,
        nextCursor: objects.nextCursor || null
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to get owned objects:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }

  // Get object by ID via gRPC
  async getObject(objectId: string, options: any = {}) {
    try {
      const object = await this.grpcService.getObject(objectId, options);
      return {
        success: true,
        object: object
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to get object:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }

  // Subscribe to events
  subscribeToEvents(filter: any, callback: (event: any) => void) {
    // Subscribe to checkpoint stream with event filtering
    this.grpcService.on('spreadsheetEvent', (event: any) => {
      if (this.matchesFilter(event, filter)) {
        callback(event);
      }
    });

    // Subscribe to specific event types
    if (filter.eventType) {
      this.grpcService.on(filter.eventType.toLowerCase(), callback);
    }
  }

  // Unsubscribe from events
  unsubscribeFromEvents(callback: (event: any) => void) {
    this.grpcService.removeListener('spreadsheetEvent', callback);
  }

  // Helper: Extract spreadsheet ID from events
  extractSpreadsheetIdFromEvents(events: any) {
    if (!events || events.length === 0) return null;

    for (const event of events) {
      const parsedEvent = this.grpcService.parseEventData(event);
      if (parsedEvent && parsedEvent.type === 'SpreadsheetCreated') {
        return parsedEvent.data.spreadsheet_id;
      }
    }
    return null;
  }

  // Helper: Extract version ID from events
  extractVersionIdFromEvents(events: any) {
    if (!events || events.length === 0) return null;

    for (const event of events) {
      const parsedEvent = this.grpcService.parseEventData(event);
      if (parsedEvent && parsedEvent.type === 'VersionSaved') {
        return parsedEvent.data.version_id;
      }
    }
    return null;
  }

  // Helper: Match event against filter
  matchesFilter(event: any, filter: any) {
    if (!filter) return true;

    if (filter.eventType && event.type !== filter.eventType) {
      return false;
    }

    if (filter.spreadsheetId && event.data?.spreadsheet_id !== filter.spreadsheetId) {
      return false;
    }

    if (filter.sender && event.data?.sender !== filter.sender) {
      return false;
    }

    return true;
  }

  // Dry run a transaction (simulate without executing)
  async dryRunTransaction(transaction: any, sender: string) {
    try {
      // In a real implementation, this would use gRPC's dry run endpoint
      // For now, we'll just validate the transaction structure
      const isValid = this.validateTransaction(transaction);

      return {
        success: isValid,
        effects: {
          status: isValid ? 'success' : 'failure',
          gasUsed: {
            computationCost: '1000000',
            storageCost: '1000000',
            storageRebate: '0'
          }
        }
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to dry run transaction:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }

  // Validate transaction structure
  validateTransaction(transaction: any) {
    if (!transaction) return false;
    if (!transaction.kind) return false;
    if (!transaction.inputs) return false;
    if (!transaction.transactions) return false;

    // Validate inputs
    for (const input of transaction.inputs) {
      if (!input.type) return false;
    }

    // Validate transactions
    for (const tx of transaction.transactions) {
      if (!tx.MoveCall) return false;
      if (!tx.MoveCall.package) return false;
      if (!tx.MoveCall.module) return false;
      if (!tx.MoveCall.function) return false;
    }

    return true;
  }

  // Get gas price estimate
  async getGasPrice() {
    try {
      const gasPrice = await this.grpcService.getReferenceGasPrice();
      return {
        success: true,
        gasPrice: gasPrice
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to get gas price:', err);
      return {
        success: false,
        error: err.message,
        gasPrice: 1000 // Default fallback
      };
    }
  }

  // Estimate gas for a transaction
  async estimateGas(transaction: any, sender: string) {
    try {
      // Dry run to get gas estimate
      const dryRunResult = await this.dryRunTransaction(transaction, sender);

      if (dryRunResult.success) {
        const computationCost = BigInt(dryRunResult.effects.gasUsed.computationCost);
        const storageCost = BigInt(dryRunResult.effects.gasUsed.storageCost);
        const total = computationCost + storageCost;

        // Add 50% buffer
        const withBuffer = (total * 150n) / 100n;

        return {
          success: true,
          estimatedGas: withBuffer.toString(),
          breakdown: {
            computation: computationCost.toString(),
            storage: storageCost.toString(),
            buffer: ((total * 50n) / 100n).toString()
          }
        };
      }

      return {
        success: false,
        error: 'Failed to estimate gas'
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to estimate gas:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }

  // Wait for transaction confirmation
  async waitForTransaction(digest: string, options: any = {}) {
    const timeout = options.timeout || 30000; // 30 seconds default
    const pollInterval = options.pollInterval || 1000; // 1 second default
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const result = await this.grpcService.getTransaction(digest);
        if (result && result.effects?.status === 'success') {
          return {
            success: true,
            transaction: result
          };
        }
      } catch (error) {
        // Transaction might not be available yet
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return {
      success: false,
      error: 'Transaction confirmation timeout'
    };
  }

  // Get checkpoint for a transaction
  async getCheckpointForTransaction(digest: string) {
    try {
      const transaction = await this.grpcService.getTransaction(digest);
      if (transaction && transaction.checkpoint) {
        return {
          success: true,
          checkpoint: transaction.checkpoint
        };
      }

      return {
        success: false,
        error: 'Checkpoint not found'
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to get checkpoint:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }
}

// Export singleton instance
export const suiGrpcService = new SuiGrpcService();
