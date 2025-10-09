import { logger, LogComponent } from '../utils/Logger.js';
import { isAuthBypassed } from '../utils/testMode.js';

/**
 * WebSocket service for real-time collaboration features
 * Handles cell locking, user presence, and live updates
 */
export class WebSocketService {
  constructor() {
    logger.info(LogComponent.WEBSOCKET_SERVICE, 'constructor', 'Initializing WebSocket service');
    
    this.ws = null;
    this.isConnected = false;
    this.spreadsheetId = null;
    this.userId = null;
    this.eventListeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
    this.lockedCells = new Set();
    this.userPresence = new Map(); // Track other users and their active cells
    this.messageQueue = []; // Queue messages when disconnected
    this.connectionStartTime = null;
    
    // Enhanced connection management
    this.pingInterval = null;
    this.pingIntervalMs = 30000; // Ping every 30 seconds
    this.lastPongTime = null;
    this.connectionHealth = {
      latency: null,
      lastHealthCheck: null,
      consecutiveFailures: 0,
      isHealthy: true
    };
    this.pendingMessages = new Map(); // Track messages awaiting acknowledgment
    this.messageIdCounter = 0;

    // Event buffering to prevent early warnings
    this.earlyEventQueue = [];
    this.listenersReady = false;
    
    logger.info(LogComponent.WEBSOCKET_SERVICE, 'constructor', 'WebSocket service initialized', {
      maxReconnectAttempts: this.maxReconnectAttempts,
      reconnectDelay: this.reconnectDelay,
      lockedCellsSize: this.lockedCells.size,
      userPresenceSize: this.userPresence.size
    });
  }

  // Event handling
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
    
    logger.debug(LogComponent.WEBSOCKET_SERVICE, 'event_listener_added', 'Event listener registered', {
      event,
      totalListeners: this.eventListeners.get(event).length,
      allEvents: Array.from(this.eventListeners.keys())
    });
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
        logger.debug(LogComponent.WEBSOCKET_SERVICE, 'event_listener_removed', 'Event listener unregistered', {
          event,
          remainingListeners: listeners.length
        });
      }
    }
  }

  emit(event, data) {
    // Buffer events until listeners are ready
    if (!this.listenersReady) {
      this.earlyEventQueue.push({ event, data, timestamp: Date.now() });
      logger.debug(LogComponent.WEBSOCKET_SERVICE, 'event_buffered', `Event buffered until listeners ready: ${event}`, {
        event,
        queueSize: this.earlyEventQueue.length
      });
      return;
    }

    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);

      logger.debug(LogComponent.WEBSOCKET_SERVICE, 'event_emit', `Emitting event: ${event}`, {
        event,
        listenerCount: listeners.length,
        dataKeys: data ? Object.keys(data) : [],
        timestamp: Date.now()
      });

      listeners.forEach((callback, index) => {
        try {
          callback(data);
        } catch (error) {
          logger.error(LogComponent.WEBSOCKET_SERVICE, 'event_listener_error', `Error in event listener for ${event}`, {
            event,
            listenerIndex: index,
            error: typeof error === 'string' ? error : error.message || 'Unknown error',
            stack: error.stack
          });
        }
      });
    } else {
      // Change to debug level in development to reduce noise
      const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';
      const logLevel = isDev ? 'debug' : 'warn';

      logger[logLevel](LogComponent.WEBSOCKET_SERVICE, 'event_emit_no_listeners', `No listeners registered for event: ${event}`, {
        event,
        availableEvents: Array.from(this.eventListeners.keys())
      });
    }
  }

  // Mark that event listeners are ready and flush buffered events
  markListenersReady() {
    this.listenersReady = true;

    logger.debug(LogComponent.WEBSOCKET_SERVICE, 'listeners_ready', `Flushing ${this.earlyEventQueue.length} buffered events`);

    // Flush buffered events
    const eventsToFlush = [...this.earlyEventQueue];
    this.earlyEventQueue = [];

    eventsToFlush.forEach(({ event, data }) => {
      this.emit(event, data);
    });
  }

  // Connect to WebSocket server
  connect(spreadsheetId, userId, wsUrl = 'ws://localhost:8081') {
    logger.startTimer('websocket_connect');

    // Test mode: skip WebSocket connection, return immediate success
    if (isAuthBypassed()) {
      logger.info(LogComponent.WEBSOCKET_SERVICE, 'test_mode_connect', '🧪 Test mode active: skipping WebSocket connection', {
        spreadsheetId,
        userId
      });
      this.isConnected = true;
      this.spreadsheetId = spreadsheetId;
      this.userId = userId;
      this.connectionHealth.isHealthy = true;

      // Emit connected event for compatibility
      this.emit('connected', { spreadsheetId, userId, testMode: true });

      return Promise.resolve();
    }

    logger.info(LogComponent.WEBSOCKET_SERVICE, 'connect_request', 'WebSocket connection requested', {
      spreadsheetId,
      userId,
      wsUrl,
      currentConnection: this.isConnected,
      reconnectAttempts: this.reconnectAttempts
    });

    if (this.isConnected && this.spreadsheetId === spreadsheetId) {
      logger.info(LogComponent.WEBSOCKET_SERVICE, 'already_connected', 'Already connected to this spreadsheet');
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        this.spreadsheetId = spreadsheetId;
        this.userId = userId;
        this.connectionStartTime = Date.now();

        // Store reject function for use in error handling
        this.connectionReject = reject;

        logger.info(LogComponent.WEBSOCKET_SERVICE, 'real_connection', 'Establishing real WebSocket connection', {
          fullUrl: `${wsUrl}/spreadsheet/${spreadsheetId}?userId=${userId}`
        });
        
        this.ws = new WebSocket(`${wsUrl}/spreadsheet/${spreadsheetId}?userId=${userId}`);
        
        this.ws.onopen = () => {
          const connectionDuration = logger.endTimer('websocket_connect');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
          this.lastPongTime = Date.now();
          this.connectionHealth.isHealthy = true;
          this.connectionHealth.consecutiveFailures = 0;
          
          logger.info(LogComponent.WEBSOCKET_SERVICE, 'connected', 'WebSocket connected successfully', {
            spreadsheetId,
            userId,
            connectionDuration,
            totalReconnectAttempts: this.reconnectAttempts,
            wsUrl
          });
          
          // Start health monitoring
          this.startHealthMonitoring();
          
          // Process any queued messages
          this.processMessageQueue();
          
          // Subscribe to collaboration and blockchain channels
          logger.debug(LogComponent.WEBSOCKET_SERVICE, 'subscribe_collaboration', 'Subscribing to collaboration channel');
          this.sendMessage('subscribe', {
            channel: 'collaboration',
            spreadsheetId: this.spreadsheetId,
            userId: this.userId,
            requestId: `sub_collab_${Date.now()}`
          });

          logger.debug(LogComponent.WEBSOCKET_SERVICE, 'subscribe_blockchain', 'Subscribing to blockchain channel');
          this.sendMessage('subscribe', {
            channel: 'blockchain',
            spreadsheetId: this.spreadsheetId,
            userId: this.userId,
            requestId: `sub_blockchain_${Date.now()}`
          });
          
          this.emit('connected', { spreadsheetId, userId });

          // Clear reject function since connection was successful
          this.connectionReject = null;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            // Log raw message for debugging
            logger.debug(LogComponent.WEBSOCKET_SERVICE, 'raw_message', 'Raw WebSocket message received', {
              dataType: typeof event.data,
              messageSize: event.data?.length || 0,
              isString: typeof event.data === 'string',
              firstChars: typeof event.data === 'string' ? event.data.substring(0, 100) : 'not-string'
            });

            // Handle non-string messages
            if (typeof event.data !== 'string') {
              logger.debug(LogComponent.WEBSOCKET_SERVICE, 'non_string_message', 'Ignoring non-string WebSocket message', {
                dataType: typeof event.data,
                constructor: event.data?.constructor?.name
              });
              return;
            }

            // Handle empty messages
            if (!event.data || event.data.trim() === '') {
              logger.debug(LogComponent.WEBSOCKET_SERVICE, 'empty_message', 'Ignoring empty WebSocket message');
              return;
            }

            // Check if message looks like JSON
            const trimmed = event.data.trim();
            if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
              logger.debug(LogComponent.WEBSOCKET_SERVICE, 'non_json_message', 'Ignoring non-JSON WebSocket message', {
                message: trimmed.substring(0, 100)
              });
              return;
            }

            const message = JSON.parse(event.data);
            logger.debug(LogComponent.WEBSOCKET_SERVICE, 'message_received', 'WebSocket message received', {
              messageType: message.type,
              messageSize: event.data.length,
              timestamp: Date.now()
            });
            this.handleMessage(message);
          } catch (parseError) {
            logger.error(LogComponent.WEBSOCKET_SERVICE, 'message_parse_error', 'Failed to parse WebSocket message', {
              rawMessage: typeof event.data === 'string' ? event.data.substring(0, 200) : 'non-string',
              dataType: typeof event.data,
              error: parseError.message,
              stack: parseError.stack
            });
          }
        };

        this.ws.onclose = (event) => {
          this.isConnected = false;
          
          const connectionDuration = this.connectionStartTime ? 
            Date.now() - this.connectionStartTime : null;
          
          logger.warn(LogComponent.WEBSOCKET_SERVICE, 'disconnected', 'WebSocket disconnected', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
            connectionDuration,
            lockedCells: this.lockedCells.size,
            userPresence: this.userPresence.size
          });
          
          this.emit('disconnected', {
            code: event.code,
            reason: event.reason,
            connectionDuration
          });
          
          this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
          logger.endTimer('websocket_connect');
          logger.error(LogComponent.WEBSOCKET_SERVICE, 'connection_error', 'WebSocket connection error', {
            error: typeof error === 'string' ? error : error.message || 'Unknown error' || 'Unknown WebSocket error',
            wsUrl,
            spreadsheetId,
            userId
          });
          
          this.emit('error', error);
          reject(error);
        };

      } catch (error) {
        reject(error);
      }
    });
  }


  // Disconnect WebSocket
  disconnect() {
    logger.info(LogComponent.WEBSOCKET_SERVICE, 'disconnect', 'Disconnecting WebSocket', {
      isConnected: this.isConnected,
      lockedCells: this.lockedCells.size,
      userPresence: this.userPresence.size,
      hasWebSocket: !!this.ws,
      spreadsheetId: this.spreadsheetId,
      queuedMessages: this.messageQueue.length,
      pendingMessages: this.pendingMessages.size
    });
    
    // Stop health monitoring
    this.stopHealthMonitoring();
    
    if (this.ws && this.isConnected) {
      logger.debug(LogComponent.WEBSOCKET_SERVICE, 'leave_message', 'Sending leave message');
      this.sendMessage('leave', {
        userId: this.userId,
        timestamp: Date.now()
      });
      
      this.ws.close();
    }
    
    const clearedLocks = this.lockedCells.size;
    const clearedUsers = this.userPresence.size;
    const clearedQueue = this.messageQueue.length;
    const clearedPending = this.pendingMessages.size;
    
    // Clean up all connection state
    this.isConnected = false;
    this.ws = null;
    this.spreadsheetId = null;
    this.lockedCells.clear();
    this.userPresence.clear();
    this.messageQueue = [];
    this.pendingMessages.clear();
    this.lastPongTime = null;
    this.connectionHealth = {
      latency: null,
      lastHealthCheck: null,
      consecutiveFailures: 0,
      isHealthy: true
    };
    
    logger.info(LogComponent.WEBSOCKET_SERVICE, 'disconnect_complete', 'WebSocket disconnected and cleaned up', {
      clearedLocks,
      clearedUsers,
      clearedQueue,
      clearedPending
    });
  }

  // Handle incoming messages
  handleMessage(message) {
    const { type, data, id } = message;

    switch (type) {
      case 'cellLocked':
        this.handleCellLocked(data);
        break;
        
      case 'cellUnlocked':
        this.handleCellUnlocked(data);
        break;
        
      case 'userJoined':
        this.handleUserJoined(data);
        break;
        
      case 'userLeft':
        this.handleUserLeft(data);
        break;
        
      case 'userPresence':
        this.handleUserPresence(data);
        break;
        
      case 'cellEdit':
        this.handleCellEdit(data);
        break;
        
      case 'pong':
        this.handlePong(data);
        break;
        
      case 'ack':
        this.handleAck(id);
        break;

      case 'welcome':
        this.handleWelcome(data);
        break;

      case 'error':
        this.handleError(data);
        break;

      case 'blockchain_event':
      case 'blockchainEvent':
        this.handleBlockchainEvent(message);
        break;

      case 'checkpoint':
        this.handleCheckpoint(data);
        break;

      case 'subscribed':
        this.handleSubscribed(data);
        break;

      case 'channelState':
        this.handleChannelState(data);
        break;

      default:
        // Reduce warning spam for development - only warn about truly unexpected types
        const expectedTypes = [
          'cellLocked', 'cellUnlocked', 'userJoined', 'userLeft', 'userPresence',
          'cellEdit', 'pong', 'ack', 'welcome', 'error', 'blockchain_event',
          'blockchainEvent', 'checkpoint', 'subscribed', 'channelState'
        ];

        if (!expectedTypes.includes(type)) {
          logger.warn(LogComponent.WEBSOCKET_SERVICE, 'unknown_message_type', 'Unknown message type received', {
            type,
            hasData: !!data,
            expectedTypes: expectedTypes.slice(0, 5) // Only show first 5 for brevity
          });
        } else {
          // This was an expected type that we just don't handle yet
          logger.debug(LogComponent.WEBSOCKET_SERVICE, 'unhandled_message_type', 'Message type not yet implemented', {
            type,
            hasData: !!data
          });
        }
    }
  }

  // Handle cell locked event
  handleCellLocked(data) {
    const { cellRef, userId, userName, color } = data;
    
    if (userId !== this.userId) {
      this.lockedCells.add(cellRef);
      
      this.emit('cellLocked', {
        cellRef,
        userId,
        userName,
        color,
        timestamp: Date.now()
      });
    }
  }

  // Handle cell unlocked event
  handleCellUnlocked(data) {
    const { cellRef, userId } = data;
    
    if (userId !== this.userId) {
      this.lockedCells.delete(cellRef);
      
      this.emit('cellUnlocked', {
        cellRef,
        userId,
        timestamp: Date.now()
      });
    }
  }

  // Handle user joined
  handleUserJoined(data) {
    const { userId, userName, color } = data;
    
    this.userPresence.set(userId, {
      userId,
      userName,
      color,
      activeCell: null,
      lastSeen: Date.now()
    });

    this.emit('userJoined', data);
  }

  // Handle user left
  handleUserLeft(data) {
    const { userId } = data;
    
    // Unlock any cells this user had locked
    for (const cellRef of this.lockedCells) {
      this.emit('cellUnlocked', { cellRef, userId });
    }
    
    this.userPresence.delete(userId);
    this.emit('userLeft', data);
  }

  // Handle user presence update
  handleUserPresence(data) {
    const { userId, activeCell } = data;
    
    if (this.userPresence.has(userId)) {
      const user = this.userPresence.get(userId);
      user.activeCell = activeCell;
      user.lastSeen = Date.now();
      
      this.emit('userPresenceUpdate', {
        userId,
        activeCell,
        users: Array.from(this.userPresence.values())
      });
    }
  }

  // Handle cell edit event
  handleCellEdit(data) {
    this.emit('cellEdit', data);
  }

  // Handle pong response for health monitoring
  handlePong(data) {
    const now = Date.now();
    this.lastPongTime = now;
    
    if (data && data.timestamp) {
      this.connectionHealth.latency = now - data.timestamp;
    }
    
    this.connectionHealth.lastHealthCheck = now;
    this.connectionHealth.consecutiveFailures = 0;
    this.connectionHealth.isHealthy = true;
    
    logger.debug(LogComponent.WEBSOCKET_SERVICE, 'pong_received', 'Pong response received', {
      latency: this.connectionHealth.latency,
      timestamp: now
    });
  }

  // Handle message acknowledgment
  handleAck(messageId) {
    if (this.pendingMessages.has(messageId)) {
      this.pendingMessages.delete(messageId);
      logger.debug(LogComponent.WEBSOCKET_SERVICE, 'message_ack', 'Message acknowledged', {
        messageId,
        pendingCount: this.pendingMessages.size
      });
    }
  }

  // Handle welcome message from server
  handleWelcome(data) {
    logger.info(LogComponent.WEBSOCKET_SERVICE, 'welcome_received', 'Welcome message received from server', {
      data,
      connectionTime: Date.now() - this.connectionStartTime
    });
  }

  // Handle error message from server
  handleError(data) {
    logger.error(LogComponent.WEBSOCKET_SERVICE, 'server_error', 'Error message received from server', {
      data,
      connectionTime: Date.now() - this.connectionStartTime
    });

    // Update connection health
    this.connectionHealth.consecutiveFailures++;
    this.connectionHealth.isHealthy = false;
    this.connectionHealth.lastHealthCheck = Date.now();

    // Check if this is a fatal error that should reject the connection promise
    const isFatalError = data && (
      data.fatal === true ||
      data.type === 'fatal' ||
      data.code === 'FATAL' ||
      (typeof data.message === 'string' && data.message.toLowerCase().includes('fatal'))
    );

    if (isFatalError && this.connectionReject) {
      logger.error(LogComponent.WEBSOCKET_SERVICE, 'fatal_server_error', 'Fatal server error - rejecting connection', {
        errorData: data
      });

      const error = new Error(`Fatal server error: ${data.message || data.error || 'Unknown fatal error'}`);
      error.serverError = data;
      this.connectionReject(error);
      this.connectionReject = null; // Clear to prevent multiple rejections
    }

    // Emit error for UI consumption (with optional toast notification support)
    this.emit('error', {
      type: 'server_error',
      data,
      timestamp: Date.now(),
      fatal: isFatalError
    });

    // Optional toast notification hook for UI integration
    if (this.onServerError && typeof this.onServerError === 'function') {
      try {
        this.onServerError({
          type: 'server_error',
          message: data.message || data.error || 'Server error occurred',
          data,
          fatal: isFatalError
        });
      } catch (toastError) {
        logger.debug(LogComponent.WEBSOCKET_SERVICE, 'toast_error', 'Error calling toast notification handler', {
          error: toastError.message
        });
      }
    }
  }

  // Handle blockchain events from bridge (both formats)
  handleBlockchainEvent(message) {
    const { type, data, eventType, source } = message;

    // Normalize the event format
    const normalizedEvent = {
      type: eventType || type, // eventType from blockchain_event, type from blockchainEvent
      data: data,
      source: source || 'unknown',
      receivedAt: Date.now()
    };

    logger.debug(LogComponent.WEBSOCKET_SERVICE, 'blockchain_event', 'Blockchain event received and normalized', {
      originalType: type,
      normalizedType: normalizedEvent.type,
      source: normalizedEvent.source,
      hasData: !!normalizedEvent.data
    });

    // Emit normalized event for app consumption
    this.emit('blockchainEvent', normalizedEvent);
  }

  // Handle checkpoint events
  handleCheckpoint(data) {
    logger.debug(LogComponent.WEBSOCKET_SERVICE, 'checkpoint', 'Checkpoint event received', {
      hasData: !!data,
      dataKeys: data ? Object.keys(data) : []
    });

    this.emit('checkpoint', {
      data,
      timestamp: Date.now()
    });
  }

  // Handle subscription confirmations
  handleSubscribed(data) {
    const { channel, requestId } = data;

    logger.info(LogComponent.WEBSOCKET_SERVICE, 'subscribed', 'Subscription confirmed', {
      channel,
      requestId
    });

    this.emit('subscribed', {
      channel,
      requestId,
      timestamp: Date.now()
    });
  }

  // Handle channel state updates
  handleChannelState(data) {
    const { channel, ...stateData } = data;

    logger.debug(LogComponent.WEBSOCKET_SERVICE, 'channel_state', 'Channel state received', {
      channel,
      stateKeys: Object.keys(stateData)
    });

    this.emit('channelState', {
      channel,
      state: stateData,
      timestamp: Date.now()
    });
  }

  // Start health monitoring with ping/pong
  startHealthMonitoring() {
    this.stopHealthMonitoring(); // Clean up any existing monitoring
    
    logger.info(LogComponent.WEBSOCKET_SERVICE, 'health_monitoring_start', 'Starting health monitoring', {
      pingIntervalMs: this.pingIntervalMs
    });
    
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, this.pingIntervalMs);
    
    // Initialize health check timestamp
    this.connectionHealth.lastHealthCheck = Date.now();
  }

  // Stop health monitoring
  stopHealthMonitoring() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
      
      logger.debug(LogComponent.WEBSOCKET_SERVICE, 'health_monitoring_stop', 'Health monitoring stopped');
    }
  }

  // Send ping to check connection health
  sendPing() {
    if (!this.isConnected || !this.ws) {
      logger.warn(LogComponent.WEBSOCKET_SERVICE, 'ping_skip', 'Skipping ping - not connected');
      return;
    }
    
    const pingData = {
      timestamp: Date.now(),
      userId: this.userId
    };
    
    try {
      this.ws.send(JSON.stringify({ type: 'ping', data: pingData }));
      
      // Check if previous pong was received
      const timeSinceLastPong = Date.now() - (this.lastPongTime || 0);
      if (timeSinceLastPong > this.pingIntervalMs * 2) {
        this.connectionHealth.consecutiveFailures++;
        this.connectionHealth.isHealthy = this.connectionHealth.consecutiveFailures < 3;
        
        logger.warn(LogComponent.WEBSOCKET_SERVICE, 'health_degraded', 'Connection health degraded', {
          timeSinceLastPong,
          consecutiveFailures: this.connectionHealth.consecutiveFailures,
          isHealthy: this.connectionHealth.isHealthy
        });
        
        if (!this.connectionHealth.isHealthy) {
          logger.error(LogComponent.WEBSOCKET_SERVICE, 'connection_unhealthy', 'Connection marked as unhealthy');
          this.attemptReconnect();
        }
      }
      
      logger.debug(LogComponent.WEBSOCKET_SERVICE, 'ping_sent', 'Ping sent for health check', {
        timestamp: pingData.timestamp,
        timeSinceLastPong
      });
      
    } catch (error) {
      logger.error(LogComponent.WEBSOCKET_SERVICE, 'ping_error', 'Error sending ping', {
        error: typeof error === 'string' ? error : error.message || 'Unknown error'
      });
      
      this.connectionHealth.consecutiveFailures++;
      this.connectionHealth.isHealthy = false;
    }
  }

  // Process queued messages after reconnection
  processMessageQueue() {
    if (this.messageQueue.length === 0) {
      logger.debug(LogComponent.WEBSOCKET_SERVICE, 'queue_empty', 'No queued messages to process');
      return;
    }
    
    logger.info(LogComponent.WEBSOCKET_SERVICE, 'queue_processing', 'Processing queued messages', {
      queueLength: this.messageQueue.length
    });
    
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    
    let successCount = 0;
    let failureCount = 0;
    
    messages.forEach(({ type, data }, index) => {
      try {
        const success = this.sendMessage(type, data);
        if (success) {
          successCount++;
        } else {
          failureCount++;
          logger.warn(LogComponent.WEBSOCKET_SERVICE, 'queue_message_failed', 'Queued message failed to send', {
            index,
            type,
            dataKeys: data ? Object.keys(data) : []
          });
        }
      } catch (error) {
        failureCount++;
        logger.error(LogComponent.WEBSOCKET_SERVICE, 'queue_message_error', 'Error processing queued message', {
          index,
          type,
          error: typeof error === 'string' ? error : error.message || 'Unknown error'
        });
      }
    });
    
    logger.info(LogComponent.WEBSOCKET_SERVICE, 'queue_processed', 'Finished processing queued messages', {
      total: messages.length,
      successful: successCount,
      failed: failureCount
    });
  }

  // Send message to server
  sendMessage(type, data) {
    // Test mode: log and return success without sending
    if (isAuthBypassed()) {
      logger.debug(LogComponent.WEBSOCKET_SERVICE, 'test_mode_send', '🧪 Test mode: simulating message send', {
        type,
        dataKeys: data ? Object.keys(data) : []
      });
      return true; // Return success in test mode
    }

    // Gracefully ignore unrecognized message types to avoid breaking the bridge
    const recognizedTypes = [
      'subscribe', 'unsubscribe', 'lockCell', 'unlockCell', 'presence',
      'ping', 'pong', 'ack', 'leave', 'join', 'query', 'transaction'
      // Note: 'cellEdit' is commented out in sendCellEdit method until bridge supports it
    ];

    if (!recognizedTypes.includes(type)) {
      logger.debug(LogComponent.WEBSOCKET_SERVICE, 'unrecognized_message_type', 'Ignoring unrecognized message type to prevent bridge errors', {
        type,
        recognizedTypes: recognizedTypes.slice(0, 3) // Show first 3 for brevity
      });
      return true; // Return success to avoid breaking caller logic
    }

    // Queue message if not connected
    if (!this.isConnected) {
      if (this.messageQueue.length < 100) { // Prevent memory leaks with max queue size
        this.messageQueue.push({ type, data, timestamp: Date.now() });
        logger.debug(LogComponent.WEBSOCKET_SERVICE, 'message_queued', 'Message queued for later delivery', {
          type,
          queueSize: this.messageQueue.length,
          dataKeys: data ? Object.keys(data) : []
        });
      } else {
        logger.warn(LogComponent.WEBSOCKET_SERVICE, 'queue_full', 'Message queue full, dropping message', {
          type,
          queueSize: this.messageQueue.length
        });
      }
      return false;
    }

    if (!this.ws) {
      logger.warn(LogComponent.WEBSOCKET_SERVICE, 'no_websocket', 'No WebSocket connection available', {
        type,
        isConnected: this.isConnected
      });
      return false;
    }

    try {
      // Generate message ID for acknowledgment tracking
      const messageId = `msg_${this.messageIdCounter++}_${Date.now()}`;
      const message = {
        id: messageId,
        type,
        ...data,  // Spread data fields at top level for bridge compatibility
        timestamp: Date.now()
      };
      
      // Track pending message for acknowledgment
      this.pendingMessages.set(messageId, {
        type,
        data,
        timestamp: Date.now()
      });
      
      this.ws.send(JSON.stringify(message));
      
      logger.debug(LogComponent.WEBSOCKET_SERVICE, 'message_sent', 'Message sent successfully', {
        messageId,
        type,
        pendingCount: this.pendingMessages.size
      });
      
      return true;
    } catch (error) {
      logger.error(LogComponent.WEBSOCKET_SERVICE, 'send_error', 'Failed to send WebSocket message', {
        type,
        error: typeof error === 'string' ? error : error.message || 'Unknown error',
        isConnected: this.isConnected,
        hasWebSocket: !!this.ws
      });
      return false;
    }
  }


  // Lock a cell
  lockCell(cellRef) {
    logger.info(LogComponent.WEBSOCKET_SERVICE, 'lock_cell', 'Locking cell for editing', {
      cellRef,
      userId: this.userId,
      spreadsheetId: this.spreadsheetId,
      currentLocks: this.lockedCells.size,
      isConnected: this.isConnected
    });

    const result = this.sendMessage('lockCell', {
      cellRef,
      userId: this.userId,
      spreadsheetId: this.spreadsheetId,
      timestamp: Date.now()
    });
    
    this.lockedCells.add(cellRef);
    
    logger.debug(LogComponent.WEBSOCKET_SERVICE, 'lock_cell', 'Cell lock request sent', {
      cellRef,
      totalLocks: this.lockedCells.size
    });
    
    return result;
  }

  // Unlock a cell
  unlockCell(cellRef) {
    logger.info(LogComponent.WEBSOCKET_SERVICE, 'unlock_cell', 'Unlocking cell', {
      cellRef,
      userId: this.userId,
      spreadsheetId: this.spreadsheetId,
      wasLocked: this.lockedCells.has(cellRef),
      currentLocks: this.lockedCells.size
    });

    const result = this.sendMessage('unlockCell', {
      cellRef,
      userId: this.userId,
      spreadsheetId: this.spreadsheetId,
      timestamp: Date.now()
    });
    
    this.lockedCells.delete(cellRef);
    
    logger.debug(LogComponent.WEBSOCKET_SERVICE, 'unlock_cell', 'Cell unlock request sent', {
      cellRef,
      totalLocks: this.lockedCells.size
    });
    
    return result;
  }

  // Update user presence (active cell)
  updatePresence(cellRef) {
    logger.debug(LogComponent.WEBSOCKET_SERVICE, 'update_presence', 'Updating user presence', {
      cellRef,
      userId: this.userId,
      spreadsheetId: this.spreadsheetId,
      previousCell: this.getCurrentUserCell(),
      userPresenceSize: this.userPresence.size
    });

    const result = this.sendMessage('presence', {
      user: {
        id: this.userId,
        name: this.userName || `User ${this.userId}`,
        color: this.userColor || '#007BFF'
      },
      status: 'active',
      cursor: {
        cellRef: cellRef,
        timestamp: Date.now()
      },
      spreadsheetId: this.spreadsheetId
    });
    
    // Update local presence
    if (this.userPresence.has(this.userId)) {
      const userInfo = this.userPresence.get(this.userId);
      userInfo.activeCell = cellRef;
      userInfo.lastSeen = Date.now();
    }
    
    return result;
  }
  
  getCurrentUserCell() {
    const userInfo = this.userPresence.get(this.userId);
    return userInfo ? userInfo.activeCell : null;
  }

  // Send cell edit
  sendCellEdit(cellRef, value, oldValue) {
    logger.logCellOperation('websocket_edit', cellRef, oldValue, value, {
      userId: this.userId,
      isConnected: this.isConnected,
      valueChanged: oldValue !== value,
      oldValueLength: String(oldValue || '').length,
      newValueLength: String(value || '').length
    });

    // TODO: Re-enable when bridge supports cellEdit handler
    // Currently bridge does not have a handler for 'cellEdit' message type
    logger.debug(LogComponent.WEBSOCKET_SERVICE, 'cell_edit_skipped', 'Cell edit skipped - awaiting bridge handler implementation', {
      cellRef,
      value: value !== undefined ? String(value).substring(0, 50) : undefined,
      oldValue: oldValue !== undefined ? String(oldValue).substring(0, 50) : undefined
    });

    return true; // Return success to avoid breaking existing functionality

    /*
    const result = this.sendMessage('cellEdit', {
      cellRef,
      value,
      oldValue,
      userId: this.userId,
      spreadsheetId: this.spreadsheetId,
      timestamp: Date.now()
    });

    logger.debug(LogComponent.WEBSOCKET_SERVICE, 'cell_edit_sent', 'Cell edit sent via WebSocket', {
      cellRef,
      success: !!result
    });

    return result;
    */
  }

  // Reconnection logic
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('reconnectFailed', {});
      return;
    }

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(() => {
      this.connect(this.spreadsheetId, this.userId)
        .catch(error => {
          console.error('Reconnection failed:', error);
          this.reconnectDelay *= 2; // Exponential backoff
        });
    }, this.reconnectDelay);
  }

  // Get current connection status
  getStatus() {
    return {
      isConnected: this.isConnected,
      spreadsheetId: this.spreadsheetId,
      userId: this.userId,
      lockedCells: Array.from(this.lockedCells),
      userCount: this.userPresence.size,
      users: Array.from(this.userPresence.values()),
      
      // Connection health metrics
      health: {
        isHealthy: this.connectionHealth.isHealthy,
        latency: this.connectionHealth.latency,
        lastHealthCheck: this.connectionHealth.lastHealthCheck,
        consecutiveFailures: this.connectionHealth.consecutiveFailures,
        lastPongTime: this.lastPongTime
      },
      
      // Queue and message status
      messageQueue: {
        queuedMessages: this.messageQueue.length,
        pendingMessages: this.pendingMessages.size,
        maxQueueSize: 100
      },
      
      // Reconnection status
      reconnection: {
        attempts: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts,
        currentDelay: this.reconnectDelay
      },
      
      // Connection timing
      connectionStartTime: this.connectionStartTime,
      uptime: this.connectionStartTime ? Date.now() - this.connectionStartTime : null
    };
  }

  // Check if a cell is locked by another user
  isCellLocked(cellRef) {
    return this.lockedCells.has(cellRef);
  }

  // Get users currently active
  getActiveUsers() {
    return Array.from(this.userPresence.values());
  }

  // Set error notification handler for UI integration
  setErrorNotificationHandler(handler) {
    if (typeof handler === 'function') {
      this.onServerError = handler;
      logger.debug(LogComponent.WEBSOCKET_SERVICE, 'error_handler_set', 'Error notification handler registered');
    } else {
      this.onServerError = null;
      logger.debug(LogComponent.WEBSOCKET_SERVICE, 'error_handler_cleared', 'Error notification handler cleared');
    }
  }
}

// Create singleton instance
export const webSocketService = new WebSocketService();