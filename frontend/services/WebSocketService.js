import { logger, LogComponent } from '../utils/Logger.js';

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

        // For demo purposes, we'll simulate WebSocket functionality
        // Only use demo mode for explicit demo URLs, not localhost bridge
        if (wsUrl.includes('demo') || wsUrl === 'ws://demo') {
          logger.info(LogComponent.WEBSOCKET_SERVICE, 'demo_mode', 'Using simulated connection for demo', {
            wsUrl,
            mode: 'simulated'
          });
          this.simulateConnection(resolve);
          return;
        }

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
          
          // Send initial presence
          logger.debug(LogComponent.WEBSOCKET_SERVICE, 'join_message', 'Sending join message');
          this.sendMessage('join', {
            userId: this.userId,
            timestamp: Date.now()
          });
          
          this.emit('connected', { spreadsheetId, userId });
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            logger.debug(LogComponent.WEBSOCKET_SERVICE, 'message_received', 'WebSocket message received', {
              messageType: message.type,
              messageSize: event.data.length,
              timestamp: Date.now()
            });
            this.handleMessage(message);
          } catch (parseError) {
            logger.error(LogComponent.WEBSOCKET_SERVICE, 'message_parse_error', 'Failed to parse WebSocket message', {
              rawMessage: event.data,
              error: parseError.message
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

  // Simulate WebSocket connection for demo
  simulateConnection(resolve) {
    logger.info(LogComponent.WEBSOCKET_SERVICE, 'simulate_start', 'Starting simulated connection for demo', {
      spreadsheetId: this.spreadsheetId,
      userId: this.userId
    });
    this.isConnected = true;
    
    // Simulate connection delay
    setTimeout(() => {
      const connectionDuration = logger.endTimer('websocket_connect');
      logger.info(LogComponent.WEBSOCKET_SERVICE, 'simulate_connected', 'Simulated connection established', {
        connectionDuration,
        mode: 'demo'
      });
      
      this.emit('connected', { 
        spreadsheetId: this.spreadsheetId, 
        userId: this.userId 
      });
      resolve();
    }, 100);

    // Simulate some demo users for testing
    setTimeout(() => {
      logger.info(LogComponent.WEBSOCKET_SERVICE, 'demo_users', 'Adding simulated demo users');
      
      const demoUsers = [
        {
          userId: 'demo-user-1',
          userName: 'Alice',
          activeCell: null,
          color: '#FF6B6B',
          lastSeen: Date.now()
        },
        {
          userId: 'demo-user-2', 
          userName: 'Bob',
          activeCell: null,
          color: '#4ECDC4',
          lastSeen: Date.now()
        }
      ];
      
      demoUsers.forEach(user => {
        this.userPresence.set(user.userId, user);
      });
      
      logger.info(LogComponent.WEBSOCKET_SERVICE, 'demo_users', 'Demo users added successfully', {
        userCount: this.userPresence.size,
        users: demoUsers.map(u => ({ userId: u.userId, userName: u.userName }))
      });
      
      this.emit('userPresenceUpdate', {
        users: Array.from(this.userPresence.values())
      });
    }, 2000);
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

      default:
        logger.warn(LogComponent.WEBSOCKET_SERVICE, 'unknown_message_type', 'Unknown message type received', {
          type,
          hasData: !!data
        });
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

    // Fallback to demo mode if no WebSocket connection is available
    if (!this.ws) {
      this.handleDemoMessage(type, data);
      return true;
    }

    try {
      // Generate message ID for acknowledgment tracking
      const messageId = `msg_${this.messageIdCounter++}_${Date.now()}`;
      const message = { 
        id: messageId,
        type, 
        data,
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

  // Handle demo messages locally
  handleDemoMessage(type, data) {
    switch (type) {
      case 'lockCell':
        // Simulate another user locking the cell after a delay
        setTimeout(() => {
          if (Math.random() > 0.7) { // 30% chance of conflict
            this.handleCellLocked({
              ...data,
              userId: 'demo-user-1',
              userName: 'Alice',
              color: '#FF6B6B'
            });
          }
        }, 500 + Math.random() * 1000);
        break;
    }
  }

  // Lock a cell
  lockCell(cellRef) {
    logger.info(LogComponent.WEBSOCKET_SERVICE, 'lock_cell', 'Locking cell for editing', {
      cellRef,
      userId: this.userId,
      currentLocks: this.lockedCells.size,
      isConnected: this.isConnected
    });
    
    const result = this.sendMessage('lockCell', {
      cellRef,
      userId: this.userId,
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
      wasLocked: this.lockedCells.has(cellRef),
      currentLocks: this.lockedCells.size
    });
    
    const result = this.sendMessage('unlockCell', {
      cellRef,
      userId: this.userId,
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
      previousCell: this.getCurrentUserCell(),
      userPresenceSize: this.userPresence.size
    });
    
    const result = this.sendMessage('updatePresence', {
      cellRef,
      userId: this.userId,
      timestamp: Date.now()
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
    
    const result = this.sendMessage('cellEdit', {
      cellRef,
      value,
      oldValue,
      userId: this.userId,
      timestamp: Date.now()
    });
    
    logger.debug(LogComponent.WEBSOCKET_SERVICE, 'cell_edit_sent', 'Cell edit sent via WebSocket', {
      cellRef,
      success: !!result
    });
    
    return result;
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
}

// Create singleton instance
export const webSocketService = new WebSocketService();