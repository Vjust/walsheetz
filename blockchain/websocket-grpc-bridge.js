// WebSocket to gRPC bridge for browser-backend communication
// Enables real-time collaboration without direct gRPC-Web

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { WebSocketServer } = require('ws');
import { grpcService } from './grpc-service.js';
import { grpcTransactionBuilder } from './grpc-transaction-builder.js';
import { getCurrentConfig } from './config.js';
import { EventEmitter } from 'events';
import http from 'http';
import RateLimiter from './utils/rateLimiter.js';
import { GraphQLEventSubscriber } from './graphql-event-subscriber.js';

// Enhanced logging utility for the bridge
class BridgeLogger {
  constructor() {
    this.sessionId = `bridge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.startTime = Date.now();
    this.logLevel = process.env.BRIDGE_LOG_LEVEL || 'INFO';
    this.logLevels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, CRITICAL: 4 };
  }

  shouldLog(level) {
    return this.logLevels[level] >= this.logLevels[this.logLevel];
  }

  log(level, component, action, message, metadata = {}) {
    if (!this.shouldLog(level)) return;

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      component,
      action,
      message,
      sessionId: this.sessionId,
      uptime: Date.now() - this.startTime,
      ...metadata
    };

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
}

const logger = new BridgeLogger();

export class WebSocketGrpcBridge extends EventEmitter {
  constructor(port) {
    super();
    this.config = getCurrentConfig();
    this.port = port || this.config.websocket.port;
    this.wss = null;
    this.httpServer = null;
    this.clients = new Map(); // Track connected clients
    this.subscriptions = new Map(); // Track client subscriptions
    this.startupTime = Date.now();
    
    // Initialize rate limiters
    this.rateLimiterEnabled = this.config.sui?.features?.rateLimiterEnabled !== false;
    this.limiters = {};
    
    if (this.rateLimiterEnabled) {
      const rateLimits = this.config.sui?.rateLimits || {};

      // Sui transaction limiter - use config values with fallbacks
      const suiLimits = rateLimits.sui || {};
      this.limiters.sui = new RateLimiter({
        name: 'bridge-sui-tx',
        maxRPS: suiLimits.maxRPS || 3,
        burst: suiLimits.burst || 6,
        maxConcurrent: suiLimits.maxConcurrent || 4
      });
      
      // Per-client burst limiter
      this.clientLimiters = new Map();
      this.maxQueueLength = 100; // Maximum queue length before rejecting
      
      logger.info('BRIDGE', 'rate_limiter_init', 'Rate limiters initialized', {
        enabled: true,
        suiLimits: rateLimits.sui
      });
    }
    
    // Performance metrics
    this.metrics = {
      connections: { total: 0, active: 0, failed: 0 },
      messages: { sent: 0, received: 0, errors: 0 },
      grpc: { calls: 0, successes: 0, failures: 0 },
      locks: { created: 0, released: 0, expired: 0 }
    };
    
    // Track collaboration state
    this.collaborationState = {
      activeUsers: new Map(),
      lockedCells: new Map(),
      spreadsheets: new Map()
    };

    // Initialize GraphQL fallback subscriber
    this.graphqlSubscriber = new GraphQLEventSubscriber();
    this.streamState = {
      active: 'none', // 'grpc', 'graphql', or 'none'
      lastActivity: null,
      grpcFailures: 0,
      graphqlFailures: 0
    };

    // Setup GraphQL event handlers
    this.graphqlSubscriber.on('VersionSaved', (event) => {
      this.broadcastToClients({
        type: 'blockchain_event',
        eventType: 'VersionSaved',
        data: event.data,
        source: 'graphql'
      });
    });

    this.graphqlSubscriber.on('SpreadsheetCreated', (event) => {
      this.broadcastToClients({
        type: 'blockchain_event',
        eventType: 'SpreadsheetCreated',
        data: event.data,
        source: 'graphql'
      });
    });

    this.graphqlSubscriber.on('checkpoint', (event) => {
      // Emit checkpoint event similar to gRPC service
      this.broadcastToClients({
        type: 'checkpoint',
        data: event.data,
        source: 'graphql'
      });

      // Also update stream state to show activity
      this.streamState.lastActivity = Date.now();
    });

    logger.info('BRIDGE', 'constructor', 'WebSocket-gRPC bridge initializing', {
      port: this.port,
      config: {
        sui: { grpcUrl: this.config.sui?.grpcUrl, graphqlUrl: this.config.sui?.graphqlUrl },
        environment: process.env.NODE_ENV
      },
      startupTime: this.startupTime,
      graphqlFallbackEnabled: true
    });
  }

  // Start the WebSocket server
  start() {
    logger.startTimer('bridge_start');
    logger.info('BRIDGE', 'start', 'Starting WebSocket-gRPC bridge server', {
      port: this.port,
      compressionEnabled: true,
      maxClients: process.env.BRIDGE_MAX_CLIENTS || 100
    });

    try {
      // Create HTTP server for health checks
      this.httpServer = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      // Create WebSocket server
      this.wss = new WebSocketServer({ 
        server: this.httpServer,
        perMessageDeflate: {
          zlibDeflateOptions: {
            chunkSize: 1024,
            memLevel: 7,
            level: 3
          },
          zlibInflateOptions: {
            chunkSize: 10 * 1024
          },
          clientNoContextTakeover: true,
          serverNoContextTakeover: true,
          serverMaxWindowBits: 10,
          concurrencyLimit: 10,
          threshold: 1024
        }
      });

      this.wss.on('connection', (ws, req) => {
        this.handleConnection(ws, req);
      });

      this.wss.on('error', (error) => {
        logger.error('BRIDGE', 'websocket_server_error', 'WebSocket server error', {
          error: typeof error === 'string' ? error : error.message || 'Unknown error',
          stack: error.stack
        });
      });

      // Start HTTP server
      this.httpServer.listen(this.port, () => {
        const duration = logger.endTimer('bridge_start');
        logger.info('BRIDGE', 'start_complete', 'Bridge server started successfully', {
          port: this.port,
          startupDuration: duration,
          healthCheckEnabled: true,
          compressionEnabled: true
        });
      });

      this.httpServer.on('error', (error) => {
        logger.error('BRIDGE', 'http_server_error', 'HTTP server error', {
          error: typeof error === 'string' ? error : error.message || 'Unknown error',
          code: error.code,
          port: this.port
        });
      });

      // Subscribe to gRPC events
      this.setupGrpcListeners();

      // Start checkpoint subscription with GraphQL fallback
      this.startCheckpointStreams();

      // Start metrics collection
      this.startMetricsCollection();

    } catch (error) {
      const duration = logger.endTimer('bridge_start');
      logger.critical('BRIDGE', 'start_failed', 'Failed to start bridge server', {
        error: typeof error === 'string' ? error : error.message || 'Unknown error',
        stack: error.stack,
        failureDuration: duration
      });
      throw error;
    }
  }

  // Handle HTTP requests for health checks and metrics
  handleHttpRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${this.port}`);
    
    logger.debug('HTTP', 'request', 'HTTP request received', {
      method: req.method,
      path: url.pathname,
      userAgent: req.headers['user-agent']
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    switch (url.pathname) {
      case '/health':
        this.handleHealthCheck(res);
        break;
      case '/ready':
        this.handleReadinessCheck(res);
        break;
      case '/metrics':
        this.handleMetricsEndpoint(res);
        break;
      case '/status':
        this.handleStatusEndpoint(res);
        break;
      default:
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  // Health check endpoint
  handleHealthCheck(res) {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startupTime,
      version: '1.0.0'
    };

    logger.debug('HTTP', 'health_check', 'Health check requested', health);
    res.writeHead(200);
    res.end(JSON.stringify(health));
  }

  // Readiness check endpoint
  handleReadinessCheck(res) {
    const grpcStatus = grpcService.getStatus();
    const grpcHealthy = grpcService.isConnected && grpcStatus.activeStreams.length > 0;
    const graphqlStatus = this.graphqlSubscriber.getStatus();
    const graphqlHealthy = graphqlStatus.isActive;

    // Ready if either gRPC or GraphQL is healthy
    const streamHealthy = grpcHealthy || graphqlHealthy;
    const isReady = this.wss && this.httpServer && streamHealthy;

    const ready = {
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      active_stream: this.streamState.active,
      checks: {
        websocket_server: !!this.wss,
        http_server: !!this.httpServer,
        stream_available: streamHealthy,
        grpc_service: grpcHealthy,
        graphql_fallback: graphqlHealthy,
        grpc_details: {
          connected: grpcService.isConnected,
          active_streams: grpcStatus.activeStreams,
          last_checkpoint: grpcStatus.lastCheckpointCursor
        },
        graphql_details: graphqlStatus,
        stream_state: this.streamState
      }
    };

    logger.debug('HTTP', 'readiness_check', 'Readiness check requested', ready);
    res.writeHead(isReady ? 200 : 503);
    res.end(JSON.stringify(ready));
  }

  // Metrics endpoint
  handleMetricsEndpoint(res) {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startupTime,
      connections: {
        total: this.metrics.connections.total,
        active: this.clients.size,
        failed: this.metrics.connections.failed
      },
      messages: { ...this.metrics.messages },
      grpc: { ...this.metrics.grpc },
      locks: { ...this.metrics.locks },
      collaboration: {
        active_users: this.collaborationState.activeUsers.size,
        locked_cells: this.collaborationState.lockedCells.size,
        spreadsheets: this.collaborationState.spreadsheets.size
      }
    };

    logger.debug('HTTP', 'metrics', 'Metrics requested', { 
      activeConnections: metrics.connections.active,
      totalMessages: metrics.messages.sent + metrics.messages.received
    });
    res.writeHead(200);
    res.end(JSON.stringify(metrics));
  }

  // Status endpoint
  handleStatusEndpoint(res) {
    const status = {
      bridge: {
        status: 'running',
        port: this.port,
        uptime: Date.now() - this.startupTime,
        clients: Array.from(this.clients.entries()).map(([id, client]) => ({
          id,
          connected_at: client.connectedAt,
          address: client.address,
          subscriptions: Array.from(client.subscriptions),
          spreadsheet_id: client.spreadsheetId
        }))
      },
      collaboration: {
        active_users: Array.from(this.collaborationState.activeUsers.entries()),
        locked_cells: Array.from(this.collaborationState.lockedCells.entries()),
        spreadsheets: Object.fromEntries(
          Array.from(this.collaborationState.spreadsheets.entries()).map(([id, clients]) => 
            [id, Array.from(clients)]
          )
        )
      }
    };

    logger.debug('HTTP', 'status', 'Status requested', { 
      clientCount: this.clients.size,
      activeUsers: this.collaborationState.activeUsers.size
    });
    res.writeHead(200);
    res.end(JSON.stringify(status));
  }

  // Start metrics collection
  startMetricsCollection() {
    setInterval(() => {
      logger.debug('METRICS', 'collection', 'Collecting metrics', {
        activeConnections: this.clients.size,
        totalMessages: this.metrics.messages.sent + this.metrics.messages.received,
        lockedCells: this.collaborationState.lockedCells.size
      });
    }, 30000); // Log metrics every 30 seconds
  }

  // Handle new WebSocket connection
  handleConnection(ws, req) {
    logger.startTimer(`connection_${ws}`);

    // Enforce client limits
    const maxClients = parseInt(process.env.BRIDGE_MAX_CLIENTS || '100');
    if (this.clients.size >= maxClients) {
      logger.warn('CONNECTION', 'max_clients_reached', 'Rejecting connection due to client limit', {
        currentClients: this.clients.size,
        maxClients: maxClients,
        address: req.socket.remoteAddress
      });
      ws.close(1008, 'Max clients reached');
      return;
    }

    const clientId = this.generateClientId();
    const clientInfo = {
      id: clientId,
      ws: ws,
      address: req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      connectedAt: Date.now(),
      subscriptions: new Set(),
      user: null,
      spreadsheetId: null,
      messageCount: 0,
      lastActivity: Date.now()
    };

    this.clients.set(clientId, clientInfo);
    this.metrics.connections.total++;
    this.metrics.connections.active++;

    logger.info('CONNECTION', 'client_connected', 'New client connected', {
      clientId: clientId,
      address: clientInfo.address,
      userAgent: clientInfo.userAgent,
      totalClients: this.clients.size,
      connectionStats: this.metrics.connections
    });

    // Send welcome message
    const welcomeMessage = {
      type: 'welcome',
      clientId: clientId,
      timestamp: Date.now(),
      serverInfo: {
        version: '1.0.0',
        features: ['collaboration', 'blockchain', 'persistence']
      }
    };

    this.sendToClient(ws, welcomeMessage);
    logger.debug('CONNECTION', 'welcome_sent', 'Welcome message sent to client', {
      clientId: clientId,
      message: welcomeMessage
    });

    // Handle messages from client
    ws.on('message', (data) => {
      try {
        logger.startTimer(`message_${clientId}`);
        clientInfo.messageCount++;
        clientInfo.lastActivity = Date.now();
        this.metrics.messages.received++;
        
        logger.debug('MESSAGE', 'received', 'Message received from client', {
          clientId: clientId,
          size: data.length,
          clientMessageCount: clientInfo.messageCount
        });
        
        this.handleClientMessage(clientId, data);
        
        const processingTime = logger.endTimer(`message_${clientId}`);
        logger.debug('MESSAGE', 'processed', 'Message processing completed', {
          clientId: clientId,
          processingTime: processingTime
        });
      } catch (error) {
        this.metrics.messages.errors++;
        logger.error('MESSAGE', 'processing_error', 'Error processing client message', {
          clientId: clientId,
          error: typeof error === 'string' ? error : error.message || 'Unknown error',
          stack: error.stack
        });
      }
    });

    // Handle client disconnect
    ws.on('close', (code, reason) => {
      const connectionDuration = logger.endTimer(`connection_${ws}`);
      logger.info('CONNECTION', 'client_disconnected', 'Client disconnected', {
        clientId: clientId,
        code: code,
        reason: reason?.toString(),
        connectionDuration: connectionDuration,
        messageCount: clientInfo.messageCount,
        remainingClients: this.clients.size - 1
      });
      
      this.handleDisconnect(clientId);
    });

    // Handle errors
    ws.on('error', (error) => {
      this.metrics.connections.failed++;
      logger.error('CONNECTION', 'websocket_error', 'WebSocket error for client', {
        clientId: clientId,
        error: typeof error === 'string' ? error : error.message || 'Unknown error',
        stack: error.stack,
        address: clientInfo.address
      });
    });

    // Enhanced ping with logging
    const pingInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.ping();
        logger.debug('CONNECTION', 'ping_sent', 'Ping sent to client', {
          clientId: clientId,
          lastActivity: Date.now() - clientInfo.lastActivity
        });
      } else {
        clearInterval(pingInterval);
        logger.debug('CONNECTION', 'ping_stopped', 'Ping interval stopped for disconnected client', {
          clientId: clientId
        });
      }
    }, 30000);

    ws.on('pong', () => {
      logger.debug('CONNECTION', 'pong_received', 'Pong received from client', {
        clientId: clientId
      });
    });

    const connectionSetupDuration = logger.endTimer(`connection_${ws}`);
    logger.debug('CONNECTION', 'setup_complete', 'Client connection setup completed', {
      clientId: clientId,
      setupDuration: connectionSetupDuration
    });
  }

  // Handle messages from clients
  async handleClientMessage(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) {
      logger.warn('MESSAGE', 'client_not_found', 'Received message from unknown client', {
        clientId: clientId,
        dataSize: data.length
      });
      return;
    }

    try {
      const message = JSON.parse(data.toString());
      
      logger.info('MESSAGE', 'parsed', 'Message parsed successfully', {
        clientId: clientId,
        type: message.type,
        requestId: message.requestId,
        hasParams: !!message.params,
        messageSize: data.length
      });

      switch (message.type) {
        case 'subscribe':
          logger.debug('MESSAGE', 'subscribe_handler', 'Handling subscribe message', {
            clientId: clientId,
            channel: message.channel,
            spreadsheetId: message.spreadsheetId
          });
          await this.handleSubscribe(clientId, message);
          break;

        case 'unsubscribe':
          logger.debug('MESSAGE', 'unsubscribe_handler', 'Handling unsubscribe message', {
            clientId: clientId,
            channel: message.channel
          });
          await this.handleUnsubscribe(clientId, message);
          break;

        case 'transaction':
          logger.info('MESSAGE', 'transaction_handler', 'Handling transaction message', {
            clientId: clientId,
            action: message.action,
            requestId: message.requestId
          });
          this.metrics.grpc.calls++;
          await this.handleTransaction(clientId, message);
          break;

        case 'lockCell':
          logger.debug('MESSAGE', 'lock_handler', 'Handling cell lock message', {
            clientId: clientId,
            spreadsheetId: message.spreadsheetId,
            cellRef: message.cellRef
          });
          await this.handleCellLock(clientId, message);
          break;

        case 'unlockCell':
          logger.debug('MESSAGE', 'unlock_handler', 'Handling cell unlock message', {
            clientId: clientId,
            spreadsheetId: message.spreadsheetId,
            cellRef: message.cellRef
          });
          await this.handleCellUnlock(clientId, message);
          break;

        case 'presence':
          logger.debug('MESSAGE', 'presence_handler', 'Handling presence update', {
            clientId: clientId,
            user: message.user?.id,
            status: message.status
          });
          await this.handlePresence(clientId, message);
          break;

        case 'query':
          logger.debug('MESSAGE', 'query_handler', 'Handling query message', {
            clientId: clientId,
            queryType: message.queryType,
            requestId: message.requestId
          });
          await this.handleQuery(clientId, message);
          break;

        case 'ping':
          logger.debug('MESSAGE', 'ping_handler', 'Handling ping message', {
            clientId: clientId,
            timestamp: message.data?.timestamp
          });
          this.handlePing(clientId, message);
          break;

        default:
          logger.warn('MESSAGE', 'unknown_type', 'Unknown message type received', {
            clientId: clientId,
            type: message.type,
            requestId: message.requestId,
            availableTypes: ['subscribe', 'unsubscribe', 'transaction', 'lockCell', 'unlockCell', 'presence', 'query', 'ping']
          });
          
          this.sendToClient(client.ws, {
            type: 'error',
            error: `Unknown message type: ${message.type}`,
            requestId: message.requestId,
            timestamp: Date.now()
          });
      }
    } catch (error) {
      this.metrics.messages.errors++;
      logger.error('MESSAGE', 'parsing_error', 'Error parsing or handling client message', {
        clientId: clientId,
        error: typeof error === 'string' ? error : error.message || 'Unknown error',
        stack: error.stack,
        rawData: data.toString().substring(0, 200) // Log first 200 chars for debugging
      });
      
      this.sendToClient(client.ws, {
        type: 'error',
        error: `Message processing error: ${typeof error === 'string' ? error : error.message || 'Unknown error'}`,
        timestamp: Date.now()
      });
    }
  }

  // Handle subscription requests
  async handleSubscribe(clientId, message) {
    const client = this.clients.get(clientId);
    const { channel, spreadsheetId } = message;

    // Store subscription
    client.subscriptions.add(channel);
    
    if (spreadsheetId) {
      client.spreadsheetId = spreadsheetId;
      
      // Add to spreadsheet tracking
      if (!this.collaborationState.spreadsheets.has(spreadsheetId)) {
        this.collaborationState.spreadsheets.set(spreadsheetId, new Set());
      }
      this.collaborationState.spreadsheets.get(spreadsheetId).add(clientId);
    }

    // Subscribe to specific event types
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel).add(clientId);

    this.sendToClient(client.ws, {
      type: 'subscribed',
      channel: channel,
      requestId: message.requestId
    });

    // Send current state for the channel
    await this.sendChannelState(clientId, channel);
  }

  // Handle unsubscribe requests
  async handleUnsubscribe(clientId, message) {
    const client = this.clients.get(clientId);
    const { channel } = message;

    client.subscriptions.delete(channel);
    
    if (this.subscriptions.has(channel)) {
      this.subscriptions.get(channel).delete(clientId);
    }

    this.sendToClient(client.ws, {
      type: 'unsubscribed',
      channel: channel,
      requestId: message.requestId
    });
  }

  // Get or create per-client rate limiter
  getClientLimiter(clientId) {
    if (!this.clientLimiters.has(clientId)) {
      this.clientLimiters.set(clientId, new RateLimiter({
        name: `client-${clientId}`,
        maxRPS: 1,
        burst: 2,
        maxConcurrent: 1,
      }));
    }
    return this.clientLimiters.get(clientId);
  }

  // Handle transaction requests
  async handleTransaction(clientId, message) {
    const client = this.clients.get(clientId);
    const { action, params, requestId } = message;
    
    // Check rate limiter queue length
    if (this.rateLimiterEnabled && this.limiters.sui) {
      const metrics = this.limiters.sui.getMetrics();
      if (metrics.currentQueueLength > this.maxQueueLength) {
        logger.warn('BRIDGE', 'rate_limit_queue_full', 'Transaction queue full, rejecting request', {
          clientId,
          action,
          queueLength: metrics.currentQueueLength,
          maxLength: this.maxQueueLength
        });
        
        this.sendToClient(client.ws, {
          type: 'transaction_error',
          requestId,
          error: 'Service temporarily unavailable - too many pending requests'
        });
        return;
      }
    }

    try {
      let transaction;
      
      // Build transaction based on action
      switch (action) {
        case 'createSpreadsheet':
          transaction = grpcTransactionBuilder.buildCreateSpreadsheetTransaction(
            params.title,
            params.sender
          );
          break;

        case 'saveVersion':
          transaction = grpcTransactionBuilder.buildSaveVersionTransaction(
            params.spreadsheetId,
            params.blobId,
            params.contentHash,
            params.cellCount,
            params.description,
            params.sender
          );
          break;

        case 'lockCell':
          transaction = grpcTransactionBuilder.buildLockCellTransaction(
            params.spreadsheetId,
            params.cellRef,
            params.sender
          );
          break;

        case 'unlockCell':
          transaction = grpcTransactionBuilder.buildUnlockCellTransaction(
            params.spreadsheetId,
            params.cellRef,
            params.sender
          );
          break;

        default:
          throw new Error(`Unknown transaction action: ${action}`);
      }

      // Execute via gRPC with per-client and global rate limiting
      let result;
      const clientLimiter = this.getClientLimiter(clientId);
      const keyClient = `client-tx:${action}:${clientId}`;
      const keyGlobal = `tx:${action}:${params.spreadsheetId || params.title || requestId}`;
      
      result = await clientLimiter.schedule(keyClient, async () => {
        if (this.rateLimiterEnabled && this.limiters.sui) {
          return await this.limiters.sui.schedule(keyGlobal, async () => {
            return await grpcService.executeMoveCall(
              transaction,
              params.sender,
              { signTransaction: async (tx) => params.signature } // Mock signer
            );
          });
        }
        return await grpcService.executeMoveCall(
          transaction,
          params.sender,
          { signTransaction: async (tx) => params.signature } // Mock signer
        );
      });

      // Send success response
      this.sendToClient(client.ws, {
        type: 'transactionResult',
        requestId: requestId,
        success: true,
        result: result
      });

    } catch (error) {
      console.error(`Transaction error for client ${clientId}:`, error);
      this.sendToClient(client.ws, {
        type: 'transactionResult',
        requestId: requestId,
        success: false,
        error: typeof error === 'string' ? error : error.message || 'Unknown error'
      });
    }
  }

  // Handle cell lock requests
  async handleCellLock(clientId, message) {
    const client = this.clients.get(clientId);
    const { spreadsheetId, cellRef, requestId } = message;

    // Check if cell is already locked
    const lockKey = `${spreadsheetId}:${cellRef}`;
    if (this.collaborationState.lockedCells.has(lockKey)) {
      const existingLock = this.collaborationState.lockedCells.get(lockKey);
      
      this.sendToClient(client.ws, {
        type: 'cellLockResult',
        requestId: requestId,
        success: false,
        lockedBy: existingLock.clientId,
        error: 'Cell is already locked'
      });
      return;
    }

    // Create lock
    const lock = {
      clientId: clientId,
      spreadsheetId: spreadsheetId,
      cellRef: cellRef,
      lockedAt: Date.now(),
      expiresAt: Date.now() + 60000 // 1 minute timeout
    };

    this.collaborationState.lockedCells.set(lockKey, lock);

    // Notify all clients in the spreadsheet
    this.broadcastToSpreadsheet(spreadsheetId, {
      type: 'cellLocked',
      spreadsheetId: spreadsheetId,
      cellRef: cellRef,
      clientId: clientId,
      timestamp: lock.lockedAt
    });

    this.sendToClient(client.ws, {
      type: 'cellLockResult',
      requestId: requestId,
      success: true
    });
  }

  // Handle cell unlock requests
  async handleCellUnlock(clientId, message) {
    const { spreadsheetId, cellRef, requestId } = message;
    const lockKey = `${spreadsheetId}:${cellRef}`;

    if (!this.collaborationState.lockedCells.has(lockKey)) {
      this.sendToClient(this.clients.get(clientId).ws, {
        type: 'cellUnlockResult',
        requestId: requestId,
        success: false,
        error: 'Cell is not locked'
      });
      return;
    }

    const lock = this.collaborationState.lockedCells.get(lockKey);
    
    // Verify ownership
    if (lock.clientId !== clientId) {
      this.sendToClient(this.clients.get(clientId).ws, {
        type: 'cellUnlockResult',
        requestId: requestId,
        success: false,
        error: 'You do not own this lock'
      });
      return;
    }

    // Remove lock
    this.collaborationState.lockedCells.delete(lockKey);

    // Notify all clients
    this.broadcastToSpreadsheet(spreadsheetId, {
      type: 'cellUnlocked',
      spreadsheetId: spreadsheetId,
      cellRef: cellRef,
      clientId: clientId,
      timestamp: Date.now()
    });

    this.sendToClient(this.clients.get(clientId).ws, {
      type: 'cellUnlockResult',
      requestId: requestId,
      success: true
    });
  }

  // Handle presence updates
  async handlePresence(clientId, message) {
    const client = this.clients.get(clientId);
    const { user, status, cursor } = message;

    // Update user info
    client.user = user;
    
    // Update active users
    this.collaborationState.activeUsers.set(clientId, {
      user: user,
      status: status,
      cursor: cursor,
      lastSeen: Date.now()
    });

    // Broadcast to all clients in the same spreadsheet
    if (client.spreadsheetId) {
      this.broadcastToSpreadsheet(client.spreadsheetId, {
        type: 'presenceUpdate',
        clientId: clientId,
        user: user,
        status: status,
        cursor: cursor,
        timestamp: Date.now()
      }, clientId); // Exclude sender
    }
  }

  // Handle query requests
  async handleQuery(clientId, message) {
    const client = this.clients.get(clientId);
    const { queryType, params, requestId } = message;

    try {
      let result;
      
      switch (queryType) {
        case 'balance':
          result = await grpcService.getBalance(params.owner, params.coinType);
          break;

        case 'spreadsheetInfo':
          // This would query the blockchain for spreadsheet info
          result = { /* mock data */ };
          break;

        case 'activeUsers':
          result = this.getActiveUsersForSpreadsheet(client.spreadsheetId);
          break;

        case 'lockedCells':
          result = this.getLockedCellsForSpreadsheet(client.spreadsheetId);
          break;

        case 'estimateGas':
          result = await this.estimateGas(params.transaction);
          break;

        default:
          throw new Error(`Unknown query type: ${queryType}`);
      }

      this.sendToClient(client.ws, {
        type: 'queryResult',
        requestId: requestId,
        result: result
      });

    } catch (error) {
      console.error(`Query error for client ${clientId}:`, error);
      this.sendToClient(client.ws, {
        type: 'queryResult',
        requestId: requestId,
        error: typeof error === 'string' ? error : error.message || 'Unknown error'
      });
    }
  }

  // Handle ping messages from clients
  handlePing(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) {
      logger.warn('MESSAGE', 'ping_client_not_found', 'Ping received from unknown client', {
        clientId: clientId
      });
      return;
    }

    // Send pong response with original timestamp for latency calculation
    const pongResponse = {
      type: 'pong',
      data: message.data, // Echo back the original data including timestamp
      timestamp: Date.now()
    };

    this.sendToClient(client.ws, pongResponse);

    logger.debug('MESSAGE', 'pong_sent', 'Pong response sent to client', {
      clientId: clientId,
      originalTimestamp: message.data?.timestamp,
      responseTimestamp: pongResponse.timestamp
    });
  }

  // Setup gRPC event listeners
  setupGrpcListeners() {
    // Listen for blockchain events
    grpcService.on('cellLocked', (event) => {
      this.broadcastToChannel('blockchain', {
        type: 'blockchainEvent',
        eventType: 'cellLocked',
        data: event
      });
    });

    grpcService.on('cellUnlocked', (event) => {
      this.broadcastToChannel('blockchain', {
        type: 'blockchainEvent',
        eventType: 'cellUnlocked',
        data: event
      });
    });

    grpcService.on('versionSaved', (event) => {
      this.broadcastToChannel('blockchain', {
        type: 'blockchainEvent',
        eventType: 'versionSaved',
        data: event
      });
    });

    grpcService.on('spreadsheetCreated', (event) => {
      this.broadcastToChannel('blockchain', {
        type: 'blockchainEvent',
        eventType: 'spreadsheetCreated',
        data: event
      });
    });

    // Listen for stream errors and UNIMPLEMENTED errors
    grpcService.on('streamError', (event) => {
      logger.warn('BRIDGE', 'grpc_stream_error', 'gRPC stream error occurred', {
        streamName: event.streamName,
        error: event.error,
        failures: this.streamState.grpcFailures
      });
      this.streamState.grpcFailures++;
    });

    grpcService.on('streamUnimplemented', (event) => {
      logger.error('BRIDGE', 'grpc_unimplemented', 'gRPC endpoint not implemented, switching to GraphQL fallback', {
        streamName: event.streamName,
        errorCode: event.code,
        error: event.error
      });

      // Immediately switch to GraphQL fallback for UNIMPLEMENTED endpoints
      if (event.streamName === 'checkpoints') {
        this.startGraphQLFallback();
      }
    });
  }

  // Handle client disconnect
  handleDisconnect(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    console.log(`Client ${clientId} disconnected`);

    // Release all locks held by this client
    for (const [lockKey, lock] of this.collaborationState.lockedCells) {
      if (lock.clientId === clientId) {
        this.collaborationState.lockedCells.delete(lockKey);
        
        // Notify others
        this.broadcastToSpreadsheet(lock.spreadsheetId, {
          type: 'cellUnlocked',
          spreadsheetId: lock.spreadsheetId,
          cellRef: lock.cellRef.split(':')[1],
          clientId: clientId,
          timestamp: Date.now()
        });
      }
    }

    // Remove from active users
    this.collaborationState.activeUsers.delete(clientId);

    // Remove from spreadsheet tracking
    if (client.spreadsheetId) {
      const spreadsheetClients = this.collaborationState.spreadsheets.get(client.spreadsheetId);
      if (spreadsheetClients) {
        spreadsheetClients.delete(clientId);
        
        // Notify others of disconnect
        this.broadcastToSpreadsheet(client.spreadsheetId, {
          type: 'userDisconnected',
          clientId: clientId,
          user: client.user,
          timestamp: Date.now()
        });
      }
    }

    // Remove from all subscriptions
    for (const channel of client.subscriptions) {
      if (this.subscriptions.has(channel)) {
        this.subscriptions.get(channel).delete(clientId);
      }
    }

    // Remove client
    this.clients.delete(clientId);
  }

  // Send message to specific client
  sendToClient(ws, message) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  // Broadcast to all clients in a channel
  broadcastToChannel(channel, message, excludeClientId = null) {
    const subscribers = this.subscriptions.get(channel);
    if (!subscribers) return;

    for (const clientId of subscribers) {
      if (clientId === excludeClientId) continue;
      
      const client = this.clients.get(clientId);
      if (client) {
        this.sendToClient(client.ws, message);
      }
    }
  }

  // Broadcast to all clients in a spreadsheet
  broadcastToSpreadsheet(spreadsheetId, message, excludeClientId = null) {
    const spreadsheetClients = this.collaborationState.spreadsheets.get(spreadsheetId);
    if (!spreadsheetClients) return;

    for (const clientId of spreadsheetClients) {
      if (clientId === excludeClientId) continue;
      
      const client = this.clients.get(clientId);
      if (client) {
        this.sendToClient(client.ws, message);
      }
    }
  }

  // Send current channel state to a client
  async sendChannelState(clientId, channel) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (channel) {
      case 'collaboration':
        // Send current collaboration state
        this.sendToClient(client.ws, {
          type: 'channelState',
          channel: channel,
          activeUsers: Array.from(this.collaborationState.activeUsers.values()),
          lockedCells: this.getLockedCellsForSpreadsheet(client.spreadsheetId)
        });
        break;

      case 'blockchain':
        // Send recent blockchain events if cached
        // This would be implemented with event history
        break;
    }
  }

  // Get active users for a spreadsheet
  getActiveUsersForSpreadsheet(spreadsheetId) {
    const spreadsheetClients = this.collaborationState.spreadsheets.get(spreadsheetId);
    if (!spreadsheetClients) return [];

    const users = [];
    for (const clientId of spreadsheetClients) {
      const userInfo = this.collaborationState.activeUsers.get(clientId);
      if (userInfo) {
        users.push({
          clientId: clientId,
          ...userInfo
        });
      }
    }
    return users;
  }

  // Get locked cells for a spreadsheet
  getLockedCellsForSpreadsheet(spreadsheetId) {
    const locks = [];
    for (const [lockKey, lock] of this.collaborationState.lockedCells) {
      if (lock.spreadsheetId === spreadsheetId) {
        locks.push({
          cellRef: lockKey.split(':')[1],
          ...lock
        });
      }
    }
    return locks;
  }

  // Estimate gas for a transaction
  async estimateGas(transaction) {
    try {
      // For now, return a reasonable gas estimate
      // In a production environment, this would call the actual blockchain service
      return {
        gasUsed: '100000',
        gasPrice: '1000',
        totalCost: '100000000'
      };
    } catch (error) {
      console.error('Gas estimation error:', error);
      throw error;
    }
  }

  // Generate unique client ID
  generateClientId() {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Clean up expired locks periodically
  startCleanupTimer() {
    setInterval(() => {
      const now = Date.now();
      for (const [lockKey, lock] of this.collaborationState.lockedCells) {
        if (lock.expiresAt < now) {
          this.collaborationState.lockedCells.delete(lockKey);
          
          // Notify clients
          this.broadcastToSpreadsheet(lock.spreadsheetId, {
            type: 'cellUnlocked',
            spreadsheetId: lock.spreadsheetId,
            cellRef: lockKey.split(':')[1],
            reason: 'timeout',
            timestamp: now
          });
        }
      }
    }, 10000); // Check every 10 seconds
  }

  // Start checkpoint streams with fallback logic
  startCheckpointStreams() {
    logger.info('BRIDGE', 'stream_start', 'Starting checkpoint streams');

    // Try gRPC first
    try {
      grpcService.subscribeToCheckpoints();
      this.streamState.active = 'grpc';
      this.streamState.lastActivity = Date.now();
      this.streamState.grpcFailures = 0;
      logger.info('BRIDGE', 'grpc_subscription', 'gRPC checkpoint subscription started successfully');
    } catch (error) {
      this.streamState.grpcFailures++;
      logger.error('BRIDGE', 'grpc_subscription_failed', 'Failed to start gRPC checkpoint subscription', {
        error: error.message,
        failures: this.streamState.grpcFailures
      });

      // Start GraphQL fallback
      this.startGraphQLFallback();
    }

    // Setup gRPC disconnect handler for fallback
    grpcService.on('disconnect', () => {
      logger.warn('BRIDGE', 'grpc_disconnected', 'gRPC disconnected, starting GraphQL fallback');
      this.startGraphQLFallback();
    });

    // Setup gRPC reconnect handler
    grpcService.on('reconnect', () => {
      logger.info('BRIDGE', 'grpc_reconnected', 'gRPC reconnected, stopping GraphQL fallback');
      this.stopGraphQLFallback();
      this.streamState.active = 'grpc';
      this.streamState.lastActivity = Date.now();
    });
  }

  // Start GraphQL fallback
  startGraphQLFallback() {
    if (this.streamState.active === 'graphql') {
      logger.debug('BRIDGE', 'graphql_already_active', 'GraphQL fallback already active');
      return;
    }

    logger.info('BRIDGE', 'graphql_fallback_start', 'Starting GraphQL fallback');

    try {
      this.graphqlSubscriber.start();
      this.streamState.active = 'graphql';
      this.streamState.lastActivity = Date.now();
      this.streamState.graphqlFailures = 0;

      logger.info('BRIDGE', 'graphql_fallback_active', 'GraphQL fallback started successfully');
    } catch (error) {
      this.streamState.graphqlFailures++;
      this.streamState.active = 'none';

      logger.error('BRIDGE', 'graphql_fallback_failed', 'Failed to start GraphQL fallback', {
        error: error.message,
        failures: this.streamState.graphqlFailures
      });
    }
  }

  // Stop GraphQL fallback
  stopGraphQLFallback() {
    if (this.streamState.active !== 'graphql') {
      return;
    }

    logger.info('BRIDGE', 'graphql_fallback_stop', 'Stopping GraphQL fallback');

    try {
      this.graphqlSubscriber.stop();
      logger.info('BRIDGE', 'graphql_fallback_stopped', 'GraphQL fallback stopped successfully');
    } catch (error) {
      logger.error('BRIDGE', 'graphql_fallback_stop_failed', 'Failed to stop GraphQL fallback', {
        error: error.message
      });
    }
  }

  // Broadcast message to all connected clients
  broadcastToClients(message) {
    const messageStr = JSON.stringify(message);
    let successCount = 0;
    let failureCount = 0;

    for (const client of this.clients.values()) {
      try {
        if (client.ws.readyState === 1) { // WebSocket.OPEN
          client.ws.send(messageStr);
          successCount++;
        }
      } catch (error) {
        failureCount++;
        logger.warn('BRIDGE', 'broadcast_failed', 'Failed to send message to client', {
          clientId: client.id,
          error: error.message
        });
      }
    }

    if (successCount > 0) {
      logger.debug('BRIDGE', 'broadcast_success', 'Message broadcasted to clients', {
        messageType: message.type,
        successCount,
        failureCount,
        totalClients: this.clients.size
      });
    }
  }

  // Stop the bridge
  stop() {
    logger.info('BRIDGE', 'stop', 'Stopping WebSocket-gRPC bridge');

    // Stop GraphQL fallback
    this.stopGraphQLFallback();

    if (this.wss) {
      // Close all client connections
      for (const client of this.clients.values()) {
        client.ws.close();
      }

      this.wss.close();
      logger.info('BRIDGE', 'stopped', 'WebSocket-gRPC bridge stopped');
    }
  }
}

// Export singleton instance
export const wsGrpcBridge = new WebSocketGrpcBridge();
