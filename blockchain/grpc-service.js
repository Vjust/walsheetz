// Sui gRPC service for WalSheetz real-time collaboration
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { getCurrentConfig } from './config.js';

// Enhanced gRPC logging utility
class GrpcLogger {
  constructor() {
    this.sessionId = `grpc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.startTime = Date.now();
    this.logLevel = process.env.BRIDGE_LOG_LEVEL || 'INFO';
    this.logLevels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, CRITICAL: 4 };
    
    // Metrics
    this.metrics = {
      connections: { attempts: 0, successes: 0, failures: 0 },
      calls: { total: 0, successes: 0, failures: 0 },
      streams: { created: 0, active: 0, closed: 0 }
    };
  }

  shouldLog(level) {
    return this.logLevels[level] >= this.logLevels[this.logLevel];
  }

  log(level, component, action, message, metadata = {}) {
    if (!this.shouldLog(level)) return;

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] ${level} [${component}]`;
    const metaString = Object.keys(metadata).length > 0 ? ` | ${JSON.stringify(metadata)}` : '';
    
    const logMessage = `${prefix} ${action}: ${message}${metaString}`;
    
    switch (level) {
      case 'DEBUG':
        console.debug(`🔍 ${logMessage}`);
        break;
      case 'INFO':
        console.info(`ℹ️ ${logMessage}`);
        break;
      case 'WARN':
        console.warn(`⚠️ ${logMessage}`);
        break;
      case 'ERROR':
        console.error(`❌ ${logMessage}`);
        break;
      case 'CRITICAL':
        console.error(`🚨 ${logMessage}`);
        break;
    }
  }

  debug(component, action, message, metadata = {}) {
    this.log('DEBUG', component, action, message, metadata);
  }

  info(component, action, message, metadata = {}) {
    this.log('INFO', component, action, message, metadata);
  }

  warn(component, action, message, metadata = {}) {
    this.log('WARN', component, action, message, metadata);
  }

  error(component, action, message, metadata = {}) {
    this.log('ERROR', component, action, message, metadata);
  }

  critical(component, action, message, metadata = {}) {
    this.log('CRITICAL', component, action, message, metadata);
  }

  startTimer(label) {
    this[`timer_${label}`] = Date.now();
  }

  endTimer(label) {
    const startTime = this[`timer_${label}`];
    if (startTime) {
      const duration = Date.now() - startTime;
      delete this[`timer_${label}`];
      return duration;
    }
    return 0;
  }

  updateMetrics(type, operation, success = true) {
    if (this.metrics[type] && this.metrics[type][operation] !== undefined) {
      this.metrics[type][operation]++;
    }
    
    if (this.metrics[type] && success !== undefined) {
      if (success && this.metrics[type].successes !== undefined) {
        this.metrics[type].successes++;
      } else if (!success && this.metrics[type].failures !== undefined) {
        this.metrics[type].failures++;
      }
    }
  }
}

const grpcLogger = new GrpcLogger();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const googleProtosRoot = path.dirname(require.resolve('google-proto-files/package.json'));

class SuiGrpcService {
  constructor() {
    this.clients = {};
    this.streams = new Map();
    this.isConnected = false;
    this.lastCheckpointCursor = null;
    this.eventListeners = new Map();
    this.reconnectDelay = 1000; // Start with 1 second
    this.maxReconnectDelay = 30000; // Max 30 seconds
    this.initTime = Date.now();
    this.unimplementedStreams = new Set(); // Track streams that returned UNIMPLEMENTED
    
    grpcLogger.info('GRPC_SERVICE', 'constructor', 'Initializing Sui gRPC service', {
      reconnectDelay: this.reconnectDelay,
      maxReconnectDelay: this.maxReconnectDelay,
      sessionId: grpcLogger.sessionId
    });
    
    this.setupClients();
  }

  // Event handling for collaboration
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
    
    grpcLogger.debug('GRPC_SERVICE', 'event_listener_added', 'Event listener registered', {
      event,
      listenerCount: this.eventListeners.get(event).length,
      allEvents: Array.from(this.eventListeners.keys())
    });
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const callbacks = this.eventListeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
        grpcLogger.debug('GRPC_SERVICE', 'event_listener_removed', 'Event listener unregistered', {
          event,
          remainingListeners: callbacks.length
        });
      }
    }
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      grpcLogger.debug('GRPC_SERVICE', 'event_emit', `Emitting event: ${event}`, {
        event,
        listenerCount: listeners.length,
        dataKeys: data ? Object.keys(data) : []
      });
      
      listeners.forEach((callback, index) => {
        try {
          callback(data);
        } catch (error) {
          grpcLogger.error('GRPC_SERVICE', 'event_listener_error', `Error in event listener for ${event}`, {
            event,
            listenerIndex: index,
            error: error.message,
            stack: error.stack
          });
        }
      });
    } else {
      grpcLogger.warn('GRPC_SERVICE', 'event_emit_no_listeners', `No listeners for event: ${event}`, {
        event,
        availableEvents: Array.from(this.eventListeners.keys())
      });
    }
  }

  async connect() {
    // Alias for setupClients for compatibility
    return this.setupClients();
  }

  async disconnect() {
    // Alias for close for compatibility
    this.close();
  }

  async setupClients() {
    grpcLogger.startTimer('setup_clients');
    grpcLogger.updateMetrics('connections', 'attempts');
    
    try {
      const config = getCurrentConfig();
      const grpcUrl = config.sui.grpcUrl || 'fullnode.testnet.sui.io:443';
      
      grpcLogger.info('GRPC_SERVICE', 'setup_clients', 'Setting up gRPC clients', {
        grpcUrl,
        config: {
          keepAliveTimeMs: config.grpc?.keepAliveTimeMs,
          maxReceiveMessageLength: config.grpc?.maxReceiveMessageLength,
          enableRetry: config.grpc?.enableRetry
        }
      });
      
      // Start with just subscription service for now
      const protoPath = path.join(__dirname, '..', 'protos', 'sui', 'rpc', 'v2beta2');
      const subscriptionProtoPath = path.join(protoPath, 'subscription_service.proto');

      grpcLogger.debug('GRPC_SERVICE', 'proto_loading', 'Loading protocol buffer definitions', {
        protoPath,
        subscriptionProtoPath
      });

      // Load subscription service proto only for initial testing
      const packageDefinition = protoLoader.loadSync([subscriptionProtoPath], {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
        includeDirs: [
          protoPath,
          path.join(__dirname, '..', 'protos'),
          googleProtosRoot
        ]
      });

      const suiProto = grpc.loadPackageDefinition(packageDefinition);
      const credentials = grpc.credentials.createSsl();

      grpcLogger.debug('GRPC_SERVICE', 'proto_loaded', 'Protocol buffers loaded successfully', {
        services: Object.keys(suiProto.sui?.rpc?.v2beta2 || {}),
        credentialsType: 'SSL'
      });

      // Create subscription client first
      if (suiProto.sui?.rpc?.v2beta2?.SubscriptionService) {
        this.clients.subscription = new suiProto.sui.rpc.v2beta2.SubscriptionService(
          grpcUrl,
          credentials
        );
        grpcLogger.info('GRPC_SERVICE', 'client_created', 'Subscription service client created', {
          service: 'SubscriptionService',
          grpcUrl
        });
      } else {
        throw new Error('SubscriptionService not found in proto definition');
      }

      // Try to load other services but don't fail if they're missing
      try {
        grpcLogger.debug('GRPC_SERVICE', 'live_data_loading', 'Attempting to load LiveDataService');
        const liveDataProtoPath = path.join(protoPath, 'live_data_service.proto');
        const liveDataDef = protoLoader.loadSync([liveDataProtoPath], {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true,
          includeDirs: [protoPath, path.join(__dirname, '..', 'protos'), googleProtosRoot]
        });
        
        const liveDataProto = grpc.loadPackageDefinition(liveDataDef);
        if (liveDataProto.sui?.rpc?.v2beta2?.LiveDataService) {
          this.clients.liveData = new liveDataProto.sui.rpc.v2beta2.LiveDataService(
            grpcUrl,
            credentials
          );
          console.log('Live data service client created');
        }
      } catch (error) {
        grpcLogger.warn('GRPC_SERVICE', 'live_data_service_unavailable', 'Live data service not available', {
          error: error.message
        });
      }

      // Try to load transaction execution service
      try {
        grpcLogger.debug('GRPC_SERVICE', 'transaction_execution_loading', 'Attempting to load TransactionExecutionService');
        const txExecProtoPath = path.join(protoPath, 'transaction_execution_service.proto');
        const txExecDef = protoLoader.loadSync([txExecProtoPath], {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true,
          includeDirs: [protoPath, path.join(__dirname, '..', 'protos'), googleProtosRoot]
        });

        const txExecProto = grpc.loadPackageDefinition(txExecDef);
        if (txExecProto.sui?.rpc?.v2beta2?.TransactionExecutionService) {
          this.clients.transactionExecution = new txExecProto.sui.rpc.v2beta2.TransactionExecutionService(
            grpcUrl,
            credentials
          );
          grpcLogger.info('GRPC_SERVICE', 'client_created', 'Transaction execution service client created', {
            service: 'TransactionExecutionService',
            grpcUrl
          });
        }
      } catch (error) {
        grpcLogger.warn('GRPC_SERVICE', 'transaction_execution_service_unavailable', 'Transaction execution service not available', {
          error: error.message
        });
      }

      // Try to load ledger service
      try {
        grpcLogger.debug('GRPC_SERVICE', 'ledger_loading', 'Attempting to load LedgerService');
        const ledgerProtoPath = path.join(protoPath, 'ledger_service.proto');
        const ledgerDef = protoLoader.loadSync([ledgerProtoPath], {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true,
          includeDirs: [protoPath, path.join(__dirname, '..', 'protos'), googleProtosRoot]
        });

        const ledgerProto = grpc.loadPackageDefinition(ledgerDef);
        if (ledgerProto.sui?.rpc?.v2beta2?.LedgerService) {
          this.clients.ledger = new ledgerProto.sui.rpc.v2beta2.LedgerService(
            grpcUrl,
            credentials
          );
          grpcLogger.info('GRPC_SERVICE', 'client_created', 'Ledger service client created', {
            service: 'LedgerService',
            grpcUrl
          });
        }
      } catch (error) {
        grpcLogger.warn('GRPC_SERVICE', 'ledger_service_unavailable', 'Ledger service not available', {
          error: error.message
        });
      }

      const setupDuration = grpcLogger.endTimer('setup_clients');
      grpcLogger.info('GRPC_SERVICE', 'setup_complete', 'gRPC clients initialized successfully', {
        setupDuration,
        clientsCreated: Object.keys(this.clients),
        isConnected: true
      });
      
      this.isConnected = true;
      grpcLogger.updateMetrics('connections', 'successes');
    } catch (error) {
      const setupDuration = grpcLogger.endTimer('setup_clients');
      grpcLogger.error('GRPC_SERVICE', 'setup_failed', 'Failed to setup gRPC clients', {
        error: error.message,
        stack: error.stack,
        setupDuration,
        isConnected: false
      });
      
      this.isConnected = false;
      grpcLogger.updateMetrics('connections', 'failures');
      throw error; // Re-throw to let caller handle
    }
  }

  // Subscribe to checkpoint stream for real-time events
  subscribeToCheckpoints(options = {}) {
    if (!this.clients.subscription) {
      throw new Error('Subscription client not initialized');
    }

    const request = {
      start_sequence: this.lastCheckpointCursor ?? options.startSequence ?? 0,
      include_full_transactions: options.includeFullTransactions ?? true
    };

    console.log('Starting checkpoint subscription...');
    
    const stream = this.clients.subscription.subscribeToCheckpoints(request);
    this.streams.set('checkpoints', stream);

    stream.on('data', (response) => {
      try {
        this.handleCheckpointData(response);
        const nextCursor = this.extractCheckpointCursor(response);
        if (typeof nextCursor === 'number') {
          this.lastCheckpointCursor = nextCursor;
        }
        this.reconnectDelay = 1000; // Reset delay on successful data
      } catch (error) {
        console.error('Error processing checkpoint data:', error);
      }
    });

    stream.on('error', (error) => {
      console.error('Checkpoint stream error:', error);
      this.handleStreamError('checkpoints', error);
    });

    stream.on('end', () => {
      console.log('Checkpoint stream ended');
      this.handleStreamEnd('checkpoints');
    });

    return stream;
  }

  handleCheckpointData(response) {
    const checkpoint = response.checkpoint ?? response;
    if (!checkpoint) return;

    const sequenceNumber = checkpoint.sequence_number ?? checkpoint.summary?.sequence_number;
    if (sequenceNumber !== undefined) {
      console.log(`Received checkpoint ${sequenceNumber}`);
    }

    // Process transactions for spreadsheet events
    if (checkpoint.transactions) {
      checkpoint.transactions.forEach(tx => {
        this.processTransactionEvents(tx);
      });
    }

    // Emit checkpoint event for collaboration features
    this.emit('checkpoint', {
      sequenceNumber: sequenceNumber,
      digest: checkpoint.digest ?? checkpoint.summary?.digest,
      timestamp: checkpoint.timestamp ?? checkpoint.summary?.timestamp_ms ?? checkpoint.summary?.timestamp,
      transactionCount: checkpoint.transactions?.length || 0
    });
  }

  extractCheckpointCursor(response) {
    if (!response) return undefined;

    if (typeof response.sequence_number === 'number') {
      return response.sequence_number;
    }

    if (typeof response.cursor === 'number') {
      return response.cursor;
    }

    if (response.checkpoint?.summary?.sequence_number !== undefined) {
      return response.checkpoint.summary.sequence_number;
    }

    if (response.checkpoint?.sequence_number !== undefined) {
      return response.checkpoint.sequence_number;
    }

    return undefined;
  }

  processTransactionEvents(transaction) {
    if (!transaction.events) return;

    transaction.events.forEach(event => {
      try {
        // Parse event for spreadsheet-specific events
        const eventData = this.parseEventData(event);
        if (eventData) {
          this.emit('spreadsheetEvent', {
            transactionDigest: transaction.digest,
            eventType: eventData.type,
            data: eventData.data,
            timestamp: Date.now()
          });

          // Handle specific collaboration events
          if (eventData.type === 'CellLocked') {
            this.emit('cellLocked', {
              cellRef: eventData.data.cellRef,
              userId: eventData.data.userId,
              color: eventData.data.color || '#FF6B6B'
            });
          } else if (eventData.type === 'CellUnlocked') {
            this.emit('cellUnlocked', {
              cellRef: eventData.data.cellRef,
              userId: eventData.data.userId
            });
          } else if (eventData.type === 'VersionSaved') {
            this.emit('versionSaved', {
              spreadsheetId: eventData.data.spreadsheetId,
              walrusBlobId: eventData.data.walrusBlobId,
              version: eventData.data.version
            });
          }
        }
      } catch (error) {
        console.error('Error parsing event data:', error);
      }
    });
  }

  parseEventData(event) {
    try {
      const config = getCurrentConfig();
      const packageId = config.sui.packageId;
      
      // Check if this event is from our contract
      const eventType = event.type || '';
      
      // Match events from our specific package
      // Format: 0xpackageId::spreadsheet::EventName
      if (eventType.includes(packageId)) {
        // Extract the event name (e.g., CellLocked, CellUnlocked, VersionSaved)
        const eventName = this.extractEventType(eventType);
        
        // Only process known event types from our contract
        const knownEvents = ['CellLocked', 'CellUnlocked', 'VersionSaved', 'SpreadsheetCreated'];
        if (knownEvents.includes(eventName)) {
          return {
            type: eventName,
            packageId: packageId,
            data: this.parseEventPayload(event.parsed_json || event.bcs),
            timestamp: event.timestamp || Date.now()
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error('Failed to parse event data:', error);
      return null;
    }
  }

  extractEventType(eventTypeString) {
    // Extract event type from Move event type string
    // Example: "0xpackage::spreadsheet::CellLocked" -> "CellLocked"
    const parts = eventTypeString.split('::');
    return parts[parts.length - 1];
  }

  parseEventPayload(payload) {
    if (typeof payload === 'string') {
      try {
        return JSON.parse(payload);
      } catch {
        return { raw: payload };
      }
    }
    return payload || {};
  }

  handleStreamError(streamName, error) {
    console.error(`Stream ${streamName} error:`, error);

    // Remove the failed stream
    this.streams.delete(streamName);

    // Check if this is an UNIMPLEMENTED error (gRPC status code 12)
    const isUnimplemented = error.code === 12 || error.message?.includes('12 UNIMPLEMENTED');

    if (isUnimplemented) {
      grpcLogger.error('GRPC_SERVICE', 'unimplemented_error', `Stream ${streamName} not supported by server`, {
        streamName,
        errorCode: error.code,
        errorMessage: error.message,
        metadata: error.metadata ? Object.keys(error.metadata.internalRepr || {}) : []
      });

      // Mark stream as permanently UNIMPLEMENTED
      this.unimplementedStreams.add(streamName);

      // Emit special event for UNIMPLEMENTED errors - don't retry
      this.emit('streamUnimplemented', { streamName, error: error.message, code: error.code });
      return; // Don't attempt reconnection for UNIMPLEMENTED errors
    }

    // Emit error for listeners
    this.emit('streamError', { streamName, error: error.message });

    // Attempt reconnection with exponential backoff
    setTimeout(() => {
      this.reconnectStream(streamName);
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  handleStreamEnd(streamName) {
    console.log(`Stream ${streamName} ended, attempting reconnection...`);
    this.streams.delete(streamName);
    
    // Attempt immediate reconnection
    setTimeout(() => {
      this.reconnectStream(streamName);
    }, 1000);
  }

  reconnectStream(streamName) {
    // Don't attempt to reconnect streams that are UNIMPLEMENTED
    if (this.unimplementedStreams.has(streamName)) {
      grpcLogger.debug('GRPC_SERVICE', 'reconnect_skipped', `Skipping reconnection for UNIMPLEMENTED stream: ${streamName}`, {
        streamName,
        unimplementedStreams: Array.from(this.unimplementedStreams)
      });
      return;
    }

    console.log(`Reconnecting ${streamName} stream...`);

    if (streamName === 'checkpoints') {
      try {
        this.subscribeToCheckpoints();
        this.emit('streamReconnected', { streamName });
      } catch (error) {
        console.error('Failed to reconnect checkpoint stream:', error);
        // Try again after delay
        setTimeout(() => {
          this.reconnectStream(streamName);
        }, this.reconnectDelay);
      }
    }
  }

  // Execute transaction via gRPC with proper field masks
  async executeTransaction(transactionBytes, signatures, options = {}) {
    if (!this.clients.transactionExecution) {
      throw new Error('Transaction execution client not initialized');
    }

    return new Promise((resolve, reject) => {
      const request = {
        transaction: transactionBytes,
        signatures: signatures,
        read_mask: {
          paths: options.fieldMask || [
            'finality',
            'transaction.digest',
            'transaction.effects',
            'transaction.events',
            'transaction.object_changes'
          ]
        }
      };

      this.clients.transactionExecution.executeTransaction(request, (error, response) => {
        if (error) {
          console.error('Transaction execution failed:', error);
          reject(error);
        } else {
          // Parse and emit relevant events from the transaction
          if (response.transaction?.events) {
            response.transaction.events.forEach(event => {
              const parsedEvent = this.parseEventData(event);
              if (parsedEvent) {
                this.emit(parsedEvent.type.toLowerCase(), parsedEvent);
                this.emit('spreadsheetEvent', parsedEvent);
              }
            });
          }
          resolve(response);
        }
      });
    });
  }

  // Build and execute a Move call transaction
  async executeMoveCall(moveCallData, sender, signer) {
    try {
      // Get gas payment objects
      const gasPayment = await this.getGasPaymentObjects(sender);
      
      // Build the transaction
      const transaction = {
        data: {
          messageVersion: 'v1',
          transaction: moveCallData,
          sender: sender,
          gasData: {
            payment: gasPayment.objects,
            owner: sender,
            price: gasPayment.price,
            budget: gasPayment.budget
          }
        }
      };

      // Serialize for signing
      const transactionBytes = this.serializeTransaction(transaction);
      
      // Sign the transaction
      const signature = await signer.signTransaction(transactionBytes);
      
      // Execute via gRPC
      return await this.executeTransaction(transactionBytes, [signature]);
    } catch (error) {
      console.error('Failed to execute Move call:', error);
      throw error;
    }
  }

  // Get gas payment objects for a sender
  async getGasPaymentObjects(owner) {
    const balance = await this.getBalance(owner);
    const gasPrice = await this.getReferenceGasPrice();
    
    // Calculate gas budget based on operation
    const estimatedGas = 10000000; // 10 million MIST
    const budget = Math.floor(estimatedGas * 1.5); // 50% buffer
    
    return {
      objects: [], // Will be filled by the network
      price: gasPrice.toString(),
      budget: budget.toString()
    };
  }

  // Serialize transaction for gRPC
  serializeTransaction(transaction) {
    // This would use BCS serialization in production
    // For now, return a simplified version
    return Buffer.from(JSON.stringify(transaction));
  }

  // Get reference gas price
  async getReferenceGasPrice() {
    // In production, this would query the current gas price
    // For now, return a default value
    return 1000; // 1000 MIST per gas unit
  }

  // Get live data via gRPC
  async getBalance(owner, coinType = '0x2::sui::SUI') {
    if (!this.clients.liveData) {
      throw new Error('Live data client not initialized');
    }

    return new Promise((resolve, reject) => {
      const request = {
        owner: owner,
        coin_type: coinType
      };

      this.clients.liveData.getBalance(request, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  }

  // Get owned objects via gRPC
  async getOwnedObjects(owner, options = {}) {
    if (!this.clients.liveData) {
      throw new Error('Live data client not initialized');
    }

    return new Promise((resolve, reject) => {
      const request = {
        owner: owner,
        page_size: options.pageSize || 50,
        page_token: options.pageToken,
        read_mask: {
          paths: options.fieldMask || ['object_id', 'type', 'owner', 'version']
        }
      };

      this.clients.liveData.listOwnedObjects(request, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  }

  // Get transaction details via gRPC
  async getTransaction(digest, options = {}) {
    if (!this.clients.ledger) {
      throw new Error('Ledger client not initialized');
    }

    return new Promise((resolve, reject) => {
      const request = {
        digest: digest,
        read_mask: {
          paths: options.fieldMask || ['digest', 'effects', 'events', 'object_changes']
        }
      };

      this.clients.ledger.getTransaction(request, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  }

  // Close all streams and connections
  close() {
    console.log('Closing gRPC service...');
    
    // Close all active streams
    for (const [streamName, stream] of this.streams) {
      try {
        stream.cancel();
        console.log(`Closed ${streamName} stream`);
      } catch (error) {
        console.error(`Error closing ${streamName} stream:`, error);
      }
    }
    
    this.streams.clear();
    this.isConnected = false;
    
    // Close gRPC clients
    for (const [clientName, client] of Object.entries(this.clients)) {
      try {
        if (client && typeof client.close === 'function') {
          client.close();
        }
      } catch (error) {
        console.error(`Error closing ${clientName} client:`, error);
      }
    }
    
    this.emit('disconnected');
  }

  // Get connection status
  getStatus() {
    return {
      isConnected: this.isConnected,
      activeStreams: Array.from(this.streams.keys()),
      lastCheckpointCursor: this.lastCheckpointCursor,
      reconnectDelay: this.reconnectDelay
    };
  }
}

// Create singleton instance
export const grpcService = new SuiGrpcService();

// Convenience functions for external use
export const subscribeToCheckpoints = (options) => grpcService.subscribeToCheckpoints(options);
export const executeTransaction = (tx, sigs) => grpcService.executeTransaction(tx, sigs);
export const getBalance = (owner, coinType) => grpcService.getBalance(owner, coinType);
export const getOwnedObjects = (owner, options) => grpcService.getOwnedObjects(owner, options);
export const getTransaction = (digest, options) => grpcService.getTransaction(digest, options);