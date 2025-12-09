// Sui gRPC service for WalSheetz real-time collaboration
import fs from 'fs';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { getCurrentConfig } from './config.js';

const isNodeRuntime = typeof process !== 'undefined' && !!process.versions?.node;

const safeFileURLToPath = (value: unknown): string => {
  if (typeof fileURLToPath === 'function') {
    try {
      return fileURLToPath(value as string);
    } catch (error) {
      const err = error as Error;
      console.warn('grpc-service: fileURLToPath invocation failed, returning raw value', err);
    }
  }

  if (typeof value === 'string' && value.startsWith('file://')) {
    return value.replace(/^file:\/\//, '');
  }

  return value as string;
};

const __filename = safeFileURLToPath(import.meta.url);
const __dirname = path?.dirname ? path.dirname(__filename) : '';
const safeCwd = typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '';

const googleProtosRoot = (() => {
  if (!isNodeRuntime || typeof createRequire !== 'function') return '';

  try {
    const nodeRequire = createRequire(import.meta.url);
    const resolved = nodeRequire.resolve('google-proto-files/package.json');
    return path.dirname(resolved);
  } catch (error) {
    const err = error as Error;
    console.warn('grpc-service: unable to resolve google-proto-files package', err);
    return '';
  }
})();

const protoVersionedCandidates = [
  __dirname ? path.join(__dirname, '..', 'protos', 'sui', 'rpc', 'v2beta2') : null,
  __dirname ? path.join(__dirname, '..', '..', 'protos', 'sui', 'rpc', 'v2beta2') : null,
  safeCwd ? path.join(safeCwd, 'protos', 'sui', 'rpc', 'v2beta2') : null
].filter(Boolean);

const protoRootCandidates = [
  __dirname ? path.join(__dirname, '..', 'protos') : null,
  __dirname ? path.join(__dirname, '..', '..', 'protos') : null,
  safeCwd ? path.join(safeCwd, 'protos') : null
].filter(Boolean);

const hasFsAccess = typeof fs?.existsSync === 'function';

const isTestRuntime = (() => {
  if (typeof globalThis !== 'undefined' && (globalThis as any).__walrusTest__) return true;
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.NODE_ENV === 'test') return true;
    if (process.env.VITEST) return true;
    if (process.env.BUN_TEST) return true;
    if (process.env.TEST === 'true') return true;
    if (process.env.VITEST_WORKER_ID) return true;
  }
  if (typeof (globalThis as any).Bun !== 'undefined' && (globalThis as any).Bun?.env) {
    if ((globalThis as any).Bun.env.TEST) return true;
    if ((globalThis as any).Bun.env.VITEST) return true;
  }
  if (typeof import.meta !== 'undefined' && (import.meta as any)?.vitest) return true;
  if (typeof process !== 'undefined' && Array.isArray(process.argv)) {
    if (process.argv.some((arg) => typeof arg === 'string' && arg.includes('vitest'))) return true;
    if (process.argv.includes('bun') && process.argv.includes('test')) return true;
  }
  return false;
})();

// Enhanced gRPC logging utility
class GrpcLogger {
  private sessionId: string;
  private startTime: number;
  private logLevel: string;
  private logLevels: Record<string, number>;
  private metrics: Record<string, Record<string, number>>;

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

  shouldLog(level: string): boolean {
    return this.logLevels[level] >= this.logLevels[this.logLevel];
  }

  log(level: string, component: string, action: string, message: string, metadata: Record<string, unknown> = {}): void {
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

  debug(component: string, action: string, message: string, metadata: Record<string, unknown> = {}): void {
    this.log('DEBUG', component, action, message, metadata);
  }

  info(component: string, action: string, message: string, metadata: Record<string, unknown> = {}): void {
    this.log('INFO', component, action, message, metadata);
  }

  warn(component: string, action: string, message: string, metadata: Record<string, unknown> = {}): void {
    this.log('WARN', component, action, message, metadata);
  }

  error(component: string, action: string, message: string, metadata: Record<string, unknown> = {}): void {
    this.log('ERROR', component, action, message, metadata);
  }

  critical(component: string, action: string, message: string, metadata: Record<string, unknown> = {}): void {
    this.log('CRITICAL', component, action, message, metadata);
  }

  startTimer(label: string): void {
    (this as any)[`timer_${label}`] = Date.now();
  }

  endTimer(label: string): number {
    const startTime = (this as any)[`timer_${label}`];
    if (startTime) {
      const duration = Date.now() - startTime;
      delete (this as any)[`timer_${label}`];
      return duration;
    }
    return 0;
  }

  updateMetrics(type: string, operation: string, success = true): void {
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

const resolveProtoPath = (fileName: string): string => {
  const candidates = protoVersionedCandidates.length > 0 ? protoVersionedCandidates : [''];

  if (!hasFsAccess) {
    return path.resolve(candidates[0] as string, fileName);
  }

  for (const candidateDir of candidates) {
    const resolvedPath = path.resolve(candidateDir as string, fileName);
    if (fs.existsSync(resolvedPath)) {
      return resolvedPath;
    }
  }

  throw new Error(
    `Unable to locate proto file "${fileName}". Checked: ${candidates.join(', ')}`
  );
};

const getProtoIncludeDirs = (): string[] => {
  const dirs = new Set<string>();

  if (!hasFsAccess) {
    if (protoVersionedCandidates[0]) dirs.add(protoVersionedCandidates[0]);
    if (protoRootCandidates[0]) dirs.add(protoRootCandidates[0]);
    if (googleProtosRoot) dirs.add(googleProtosRoot);
    return Array.from(dirs);
  }

  protoVersionedCandidates.forEach((dir) => {
    if (dir && fs.existsSync(dir)) {
      dirs.add(dir);
    }
  });

  protoRootCandidates.forEach((dir) => {
    if (dir && fs.existsSync(dir)) {
      dirs.add(dir);
    }
  });

  if (googleProtosRoot) {
    dirs.add(googleProtosRoot);
  }

  return Array.from(dirs);
};

class SuiGrpcService {
  private options: { autoConnect: boolean };
  private autoConnect: boolean;
  private clients: Record<string, unknown>;
  private streams: Map<string, unknown>;
  private isConnected: boolean;
  private lastCheckpointCursor: string | null;
  private eventListeners: Map<string, Function[]>;
  private reconnectDelay: number;
  private maxReconnectDelay: number;
  private initTime: number;
  private unimplementedStreams: Set<string>;
  private disabledStreams: Set<string>;
  private scheduledTimeouts: Set<NodeJS.Timeout>;

  constructor(options: Record<string, unknown> = {}) {
    this.options = {
      autoConnect: (options.autoConnect as boolean) !== undefined ? (options.autoConnect as boolean) : !isTestRuntime
    };

    this.autoConnect = this.options.autoConnect;
    this.clients = {};
    this.streams = new Map();
    this.isConnected = false;
    this.lastCheckpointCursor = null;
    this.eventListeners = new Map();
    this.reconnectDelay = 1000; // Start with 1 second
    this.maxReconnectDelay = 30000; // Max 30 seconds
    this.initTime = Date.now();
    this.unimplementedStreams = new Set(); // Track streams that returned UNIMPLEMENTED
    this.disabledStreams = new Set(); // Track streams permanently disabled this session
    this.scheduledTimeouts = new Set();
    
    grpcLogger.info('GRPC_SERVICE', 'constructor', 'Initializing Sui gRPC service', {
      reconnectDelay: this.reconnectDelay,
      maxReconnectDelay: this.maxReconnectDelay,
      sessionId: (grpcLogger as any).sessionId
    });

    if (this.autoConnect) {
      this.setupClients();
    } else {
      grpcLogger.debug('GRPC_SERVICE', 'constructor_autoconnect_skip', 'Auto-connect disabled for current runtime', {
        autoConnect: this.autoConnect,
        isTestRuntime: isTestRuntime
      });
    }
  }

  // Event handling for collaboration
  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);

    grpcLogger.debug('GRPC_SERVICE', 'event_listener_added', 'Event listener registered', {
      event,
      listenerCount: this.eventListeners.get(event)!.length,
      allEvents: Array.from(this.eventListeners.keys())
    });
  }

  off(event: string, callback: Function): void {
    if (this.eventListeners.has(event)) {
      const callbacks = this.eventListeners.get(event)!;
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

  emit(event: string, data?: unknown): void {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event)!;
      grpcLogger.debug('GRPC_SERVICE', 'event_emit', `Emitting event: ${event}`, {
        event,
        listenerCount: listeners.length,
        dataKeys: data ? Object.keys(data as object) : []
      });

      listeners.forEach((callback, index) => {
        try {
          callback(data);
        } catch (error) {
          const err = error as Error;
          grpcLogger.error('GRPC_SERVICE', 'event_listener_error', `Error in event listener for ${event}`, {
            event,
            listenerIndex: index,
            error: err.message,
            stack: err.stack
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

  async connect(): Promise<void> {
    // Alias for setupClients for compatibility
    return this.setupClients();
  }

  async disconnect(): Promise<void> {
    // Alias for close for compatibility
    this.close();
  }

  async setupClients(): Promise<void> {
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
      
      const subscriptionProtoPath = resolveProtoPath('subscription_service.proto');
      const includeDirs = getProtoIncludeDirs();

      grpcLogger.debug('GRPC_SERVICE', 'proto_loading', 'Loading protocol buffer definitions', {
        subscriptionProtoPath,
        includeDirs
      });

      // Load subscription service proto only for initial testing
      const packageDefinition = protoLoader.loadSync([subscriptionProtoPath], {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
        includeDirs
      });

      const suiProto = grpc.loadPackageDefinition(packageDefinition);
      const credentials = grpc.credentials.createSsl();

      grpcLogger.debug('GRPC_SERVICE', 'proto_loaded', 'Protocol buffers loaded successfully', {
        services: Object.keys((suiProto as any).sui?.rpc?.v2beta2 || {}),
        credentialsType: 'SSL'
      });

      // Create subscription client first
      if ((suiProto as any).sui?.rpc?.v2beta2?.SubscriptionService) {
        this.clients.subscription = new (suiProto as any).sui.rpc.v2beta2.SubscriptionService(
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
        const liveDataProtoPath = resolveProtoPath('live_data_service.proto');
        const liveDataDef = protoLoader.loadSync([liveDataProtoPath], {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true,
          includeDirs
        });

        const liveDataProto = grpc.loadPackageDefinition(liveDataDef);
        if ((liveDataProto as any).sui?.rpc?.v2beta2?.LiveDataService) {
          this.clients.liveData = new (liveDataProto as any).sui.rpc.v2beta2.LiveDataService(
            grpcUrl,
            credentials
          );
          console.log('Live data service client created');
        }
      } catch (error) {
        const err = error as Error;
        grpcLogger.warn('GRPC_SERVICE', 'live_data_service_unavailable', 'Live data service not available', {
          error: err.message
        });
      }

      // Try to load transaction execution service
      try {
        grpcLogger.debug('GRPC_SERVICE', 'transaction_execution_loading', 'Attempting to load TransactionExecutionService');
        const txExecProtoPath = resolveProtoPath('transaction_execution_service.proto');
        const txExecDef = protoLoader.loadSync([txExecProtoPath], {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true,
          includeDirs
        });

        const txExecProto = grpc.loadPackageDefinition(txExecDef);
        if ((txExecProto as any).sui?.rpc?.v2beta2?.TransactionExecutionService) {
          this.clients.transactionExecution = new (txExecProto as any).sui.rpc.v2beta2.TransactionExecutionService(
            grpcUrl,
            credentials
          );
          grpcLogger.info('GRPC_SERVICE', 'client_created', 'Transaction execution service client created', {
            service: 'TransactionExecutionService',
            grpcUrl
          });
        }
      } catch (error) {
        const err = error as Error;
        grpcLogger.warn('GRPC_SERVICE', 'transaction_execution_service_unavailable', 'Transaction execution service not available', {
          error: err.message
        });
      }

      // Try to load ledger service
      try {
        grpcLogger.debug('GRPC_SERVICE', 'ledger_loading', 'Attempting to load LedgerService');
        const ledgerProtoPath = resolveProtoPath('ledger_service.proto');
        const ledgerDef = protoLoader.loadSync([ledgerProtoPath], {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true,
          includeDirs
        });

        const ledgerProto = grpc.loadPackageDefinition(ledgerDef);
        if ((ledgerProto as any).sui?.rpc?.v2beta2?.LedgerService) {
          this.clients.ledger = new (ledgerProto as any).sui.rpc.v2beta2.LedgerService(
            grpcUrl,
            credentials
          );
          grpcLogger.info('GRPC_SERVICE', 'client_created', 'Ledger service client created', {
            service: 'LedgerService',
            grpcUrl
          });
        }
      } catch (error) {
        const err = error as Error;
        grpcLogger.warn('GRPC_SERVICE', 'ledger_service_unavailable', 'Ledger service not available', {
          error: err.message
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
      const err = error as Error;
      const setupDuration = grpcLogger.endTimer('setup_clients');
      grpcLogger.error('GRPC_SERVICE', 'setup_failed', 'Failed to setup gRPC clients', {
        error: err.message,
        stack: err.stack,
        setupDuration,
        isConnected: false
      } as Record<string, unknown>);

      this.isConnected = false;
      grpcLogger.updateMetrics('connections', 'failures');
      throw err;
    }
  }

  // Subscribe to checkpoint stream for real-time events
  subscribeToCheckpoints(options: Record<string, unknown> = {}): any {
    if (!this.clients.subscription) {
      throw new Error('Subscription client not initialized');
    }

    const sequence = this.lastCheckpointCursor ? parseInt(this.lastCheckpointCursor, 10) : ((options.startSequence as number) ?? 0);
    const request = {
      start_sequence: sequence.toString(),
      include_full_transactions: (options.includeFullTransactions as boolean) ?? true
    };

    grpcLogger.debug('GRPC_SERVICE', 'checkpoint_subscribe', 'Starting checkpoint subscription');

    const stream = (this.clients.subscription as any).subscribeToCheckpoints(request);
    this.streams.set('checkpoints', stream);

    stream.on('data', (response: unknown) => {
      try {
        this.handleCheckpointData(response);
        const nextCursor = this.extractCheckpointCursor(response);
        if (typeof nextCursor === 'number') {
          this.lastCheckpointCursor = nextCursor.toString();
        }
        this.reconnectDelay = 1000; // Reset delay on successful data
      } catch (error) {
        const err = error as Error;
        grpcLogger.error('GRPC_SERVICE', 'checkpoint_data_error', 'Error processing checkpoint data', { error: err.message });
      }
    });

    stream.on('error', (error: unknown) => {
      // Error is already logged in handleStreamError
      this.handleStreamError('checkpoints', error);
    });

    stream.on('end', () => {
      // Stream end is already logged in handleStreamEnd
      this.handleStreamEnd('checkpoints');
    });

    return stream;
  }

  handleCheckpointData(response: unknown): void {
    const checkpoint = (response as any).checkpoint ?? response;
    if (!checkpoint) return;

    const sequenceNumber = (checkpoint as any).sequence_number ?? (checkpoint as any).summary?.sequence_number;
    if (sequenceNumber !== undefined) {
      grpcLogger.debug('GRPC_SERVICE', 'checkpoint_received', `Received checkpoint ${sequenceNumber}`);
    }

    // Process transactions for spreadsheet events
    if ((checkpoint as any).transactions) {
      (checkpoint as any).transactions.forEach((tx: unknown) => {
        this.processTransactionEvents(tx);
      });
    }

    // Emit checkpoint event for collaboration features
    this.emit('checkpoint', {
      sequenceNumber: sequenceNumber,
      digest: (checkpoint as any).digest ?? (checkpoint as any).summary?.digest,
      timestamp: (checkpoint as any).timestamp ?? (checkpoint as any).summary?.timestamp_ms ?? (checkpoint as any).summary?.timestamp,
      transactionCount: ((checkpoint as any).transactions?.length) || 0
    } as Record<string, unknown>);
  }

  extractCheckpointCursor(response: unknown): number | undefined {
    if (!response) return undefined;

    if (typeof (response as any).sequence_number === 'number') {
      return (response as any).sequence_number;
    }

    if (typeof (response as any).cursor === 'number') {
      return (response as any).cursor;
    }

    if ((response as any).checkpoint?.summary?.sequence_number !== undefined) {
      return (response as any).checkpoint.summary.sequence_number;
    }

    if ((response as any).checkpoint?.sequence_number !== undefined) {
      return (response as any).checkpoint.sequence_number;
    }

    return undefined;
  }

  processTransactionEvents(transaction: unknown): void {
    if (!(transaction as any).events) return;

    (transaction as any).events.forEach((event: unknown) => {
      try {
        // Parse event for spreadsheet-specific events
        const eventData = this.parseEventData(event);
        if (eventData) {
          this.emit('spreadsheetEvent', {
            transactionDigest: (transaction as any).digest,
            eventType: eventData.type,
            data: eventData.data,
            timestamp: Date.now()
          });

          // Handle specific collaboration events
          if (eventData.type === 'CellLocked') {
            this.emit('cellLocked', {
              cellRef: (eventData.data as any).cellRef,
              userId: (eventData.data as any).userId,
              color: (eventData.data as any).color || '#FF6B6B'
            });
          } else if (eventData.type === 'CellUnlocked') {
            this.emit('cellUnlocked', {
              cellRef: (eventData.data as any).cellRef,
              userId: (eventData.data as any).userId
            });
          } else if (eventData.type === 'VersionSaved') {
            this.emit('versionSaved', {
              spreadsheetId: (eventData.data as any).spreadsheetId,
              walrusBlobId: (eventData.data as any).walrusBlobId,
              version: (eventData.data as any).version
            });
          }
        }
      } catch (error) {
        const err = error as Error;
        console.error('Error parsing event data:', err);
      }
    });
  }

  parseEventData(event: unknown): any {
    try {
      const config = getCurrentConfig();
      const packageId = config.sui.packageId;

      // Check if this event is from our contract
      const eventType = (event as any).type || '';

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
            data: this.parseEventPayload((event as any).parsed_json || (event as any).bcs),
            timestamp: (event as any).timestamp || Date.now()
          };
        }
      }

      return null;
    } catch (error) {
      const err = error as Error;
      console.error('Failed to parse event data:', err);
      return null;
    }
  }

  extractEventType(eventTypeString: string): string {
    // Extract event type from Move event type string
    // Example: "0xpackage::spreadsheet::CellLocked" -> "CellLocked"
    const parts = eventTypeString.split('::');
    return parts[parts.length - 1];
  }

  parseEventPayload(payload: unknown): Record<string, unknown> {
    if (typeof payload === 'string') {
      try {
        return JSON.parse(payload);
      } catch {
        return { raw: payload };
      }
    }
    return (payload as Record<string, unknown>) || {};
  }

  _scheduleTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    const handle = setTimeout(() => {
      this.scheduledTimeouts.delete(handle);
      callback();
    }, delay);
    this.scheduledTimeouts.add(handle);
    return handle;
  }

  handleStreamError(streamName: string, error: unknown): void {
    // Remove the failed stream
    this.streams.delete(streamName);

    // Check if this is an UNIMPLEMENTED error (gRPC status code 12)
    const isUnimplemented = (error as any).code === 12 || (error as any).message?.includes('12 UNIMPLEMENTED');

    if (isUnimplemented) {
      // Only log once per stream to prevent spam
      if (!this.disabledStreams.has(streamName)) {
        grpcLogger.error('GRPC_SERVICE', 'unimplemented_error', `Stream ${streamName} not supported by server`, {
          streamName,
          errorCode: (error as any).code,
          errorMessage: (error as any).message,
          metadata: (error as any).metadata ? Object.keys((error as any).metadata.internalRepr || {}) : []
        });
      }

      // Mark stream as permanently UNIMPLEMENTED and disabled
      this.unimplementedStreams.add(streamName);
      this.disabledStreams.add(streamName);

      // Emit dedicated event for checkpoint stream disable
      if (streamName === 'checkpoints') {
        this.emit('checkpointStreamDisabled', { streamName, error: (error as any).message, code: (error as any).code });
      }

      // Emit general event for UNIMPLEMENTED errors - don't retry
      this.emit('streamUnimplemented', { streamName, error: (error as any).message, code: (error as any).code });
      return; // Don't attempt reconnection for UNIMPLEMENTED errors
    }

    // For other errors, log and emit
    grpcLogger.error('GRPC_SERVICE', 'stream_error', `Stream ${streamName} error`, {
      streamName,
      error: (error as any).message
    });

    // Emit error for listeners
    this.emit('streamError', { streamName, error: (error as any).message });

    // Attempt reconnection with exponential backoff
    this._scheduleTimeout(() => {
      this.reconnectStream(streamName);
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  handleStreamEnd(streamName: string): void {
    grpcLogger.info('GRPC_SERVICE', 'stream_ended', `Stream ${streamName} ended, attempting reconnection`);
    this.streams.delete(streamName);

    // Attempt immediate reconnection
    this._scheduleTimeout(() => {
      this.reconnectStream(streamName);
    }, 1000);
  }

  reconnectStream(streamName: string): void {
    // Don't attempt to reconnect streams that are UNIMPLEMENTED
    if (this.unimplementedStreams.has(streamName)) {
      grpcLogger.debug('GRPC_SERVICE', 'reconnect_skipped', `Skipping reconnection for UNIMPLEMENTED stream: ${streamName}`, {
        streamName,
        unimplementedStreams: Array.from(this.unimplementedStreams)
      });
      return;
    }

    grpcLogger.info('GRPC_SERVICE', 'stream_reconnecting', `Reconnecting ${streamName} stream`);

    if (streamName === 'checkpoints') {
      try {
        this.subscribeToCheckpoints();
        this.emit('streamReconnected', { streamName });
      } catch (error) {
        const err = error as Error;
        grpcLogger.error('GRPC_SERVICE', 'reconnect_failed', 'Failed to reconnect checkpoint stream', { error: err.message });
        // Try again after delay
        this._scheduleTimeout(() => {
          this.reconnectStream(streamName);
        }, this.reconnectDelay);
      }
    }
  }

  // Execute transaction via gRPC with proper field masks
  async executeTransaction(transactionBytes: unknown, signatures: unknown[], options: Record<string, unknown> = {}): Promise<any> {
    if (!this.clients.transactionExecution) {
      throw new Error('Transaction execution client not initialized');
    }

    return new Promise((resolve, reject) => {
      const request = {
        transaction: transactionBytes,
        signatures: signatures,
        read_mask: {
          paths: (options.fieldMask as string[]) || [
            'finality',
            'transaction.digest',
            'transaction.effects',
            'transaction.events',
            'transaction.object_changes'
          ]
        }
      };

      (this.clients.transactionExecution as any).executeTransaction(request, (error: unknown, response: any) => {
        if (error) {
          console.error('Transaction execution failed:', error);
          reject(error);
        } else {
          // Parse and emit relevant events from the transaction
          if (response.transaction?.events) {
            response.transaction.events.forEach((event: unknown) => {
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
  async executeMoveCall(moveCallData: unknown, sender: string, signer: any): Promise<any> {
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
      const err = error as Error;
      console.error('Failed to execute Move call:', err);
      throw err;
    }
  }

  // Get gas payment objects for a sender
  async getGasPaymentObjects(owner: string): Promise<any> {
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
  serializeTransaction(transaction: unknown): Buffer {
    // This would use BCS serialization in production
    // For now, return a simplified version
    return Buffer.from(JSON.stringify(transaction));
  }

  // Get reference gas price
  async getReferenceGasPrice(): Promise<number> {
    // In production, this would query the current gas price
    // For now, return a default value
    return 1000; // 1000 MIST per gas unit
  }

  // Get live data via gRPC
  async getBalance(owner: string, coinType = '0x2::sui::SUI'): Promise<any> {
    if (!this.clients.liveData) {
      throw new Error('Live data client not initialized');
    }

    return new Promise((resolve, reject) => {
      const request = {
        owner: owner,
        coin_type: coinType
      };

      (this.clients.liveData as any).getBalance(request, (error: unknown, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  }

  // Get owned objects via gRPC
  async getOwnedObjects(owner: string, options: Record<string, unknown> = {}): Promise<any> {
    if (!this.clients.liveData) {
      throw new Error('Live data client not initialized');
    }

    return new Promise((resolve, reject) => {
      const request = {
        owner: owner,
        page_size: (options.pageSize as number) || 50,
        page_token: options.pageToken,
        read_mask: {
          paths: (options.fieldMask as string[]) || ['object_id', 'type', 'owner', 'version']
        }
      };

      (this.clients.liveData as any).listOwnedObjects(request, (error: unknown, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  }

  // Get transaction details via gRPC
  async getTransaction(digest: string, options: Record<string, unknown> = {}): Promise<any> {
    if (!this.clients.ledger) {
      throw new Error('Ledger client not initialized');
    }

    return new Promise((resolve, reject) => {
      const request = {
        digest: digest,
        read_mask: {
          paths: (options.fieldMask as string[]) || ['digest', 'effects', 'events', 'object_changes']
        }
      };

      (this.clients.ledger as any).getTransaction(request, (error: unknown, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  }

  // Close all streams and connections
  close(): void {
    console.log('Closing gRPC service...');

    // Close all active streams
    for (const [streamName, stream] of this.streams) {
      try {
        (stream as any).cancel();
        console.log(`Closed ${streamName} stream`);
      } catch (error) {
        const err = error as Error;
        console.error(`Error closing ${streamName} stream:`, err);
      }
    }

    this.streams.clear();
    this.isConnected = false;

    this.scheduledTimeouts.forEach((handle) => clearTimeout(handle));
    this.scheduledTimeouts.clear();

    // Close gRPC clients
    for (const [clientName, client] of Object.entries(this.clients)) {
      try {
        if (client && typeof (client as any).close === 'function') {
          (client as any).close();
        }
      } catch (error) {
        const err = error as Error;
        console.error(`Error closing ${clientName} client:`, err);
      }
    }

    this.emit('disconnected');
  }

  // Get connection status
  getStatus(): Record<string, unknown> {
    return {
      isConnected: this.isConnected,
      activeStreams: Array.from(this.streams.keys()),
      lastCheckpointCursor: this.lastCheckpointCursor,
      reconnectDelay: this.reconnectDelay
    };
  }

  static create(options: Record<string, unknown> = {}): SuiGrpcService {
    return new SuiGrpcService(options as any);
  }
}

// Create singleton instance
export const grpcService = new SuiGrpcService({ autoConnect: !isTestRuntime });
export const createGrpcService = (options: Record<string, unknown> = {}) => SuiGrpcService.create(options);

// Convenience functions for external use
export const subscribeToCheckpoints = (options?: Record<string, unknown>) => grpcService.subscribeToCheckpoints(options);
export const executeTransaction = (tx: unknown, sigs: unknown[]) => grpcService.executeTransaction(tx, sigs);
export const getBalance = (owner: string, coinType?: string) => grpcService.getBalance(owner, coinType);
export const getOwnedObjects = (owner: string, options?: Record<string, unknown>) => grpcService.getOwnedObjects(owner, options);
export const getTransaction = (digest: string, options?: Record<string, unknown>) => grpcService.getTransaction(digest, options);