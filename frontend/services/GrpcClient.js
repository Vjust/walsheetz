// Frontend gRPC client that connects through WebSocket bridge
import { EventEmitter } from 'events';

class GrpcClient extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.connected = false;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.subscriptions = new Set();
    this.resubscribing = false; // Prevent resubscribe loops
    this.activeSubscriptions = new Map(); // Track active subscriptions to prevent duplicates
    
    // Configuration
    this.config = {
      wsUrl: import.meta.env.VITE_WS_URL || 'ws://localhost:8080',
      reconnectDelay: 1000,
      maxReconnectDelay: 30000,
      heartbeatInterval: 30000,
      requestTimeout: 30000,
      maxReconnectAttempts: 5,
      enableFallbackMode: true
    };
    
    this.reconnectDelay = this.config.reconnectDelay;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.reconnectAttempts = 0;
    this.fallbackMode = false;
  }

  // Connect to WebSocket bridge
  async connect() {
    if (this.connected) {
      console.log('[GrpcClient] Already connected to gRPC bridge');
      return true;
    }

    console.log('[GrpcClient] Connection attempt:', {
      url: this.config.wsUrl,
      reconnectAttempts: this.reconnectAttempts,
      fallbackMode: this.fallbackMode
    });

    return new Promise((resolve, reject) => {
      try {
        console.log(`[GrpcClient] 🔄 Connecting to gRPC bridge at ${this.config.wsUrl}...`);
        this.ws = new WebSocket(this.config.wsUrl);

        this.ws.onopen = () => {
          console.log('[GrpcClient] ✅ Connected to gRPC bridge');
          console.log('[GrpcClient] Connection details:', {
            clientId: this.clientId,
            subscriptions: this.subscriptions.size,
            pendingRequests: this.pendingRequests.size
          });
          
          this.connected = true;
          this.reconnectDelay = this.config.reconnectDelay;
          this.reconnectAttempts = 0;  // Reset attempts on successful connection
          this.fallbackMode = false;
          
          // Start heartbeat
          this.startHeartbeat();
          
          // Re-subscribe to channels
          this.resubscribe();
          
          this.emit('connected');
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error('[GrpcClient] ❌ WebSocket error:', {
            message: error.message || 'Connection failed',
            type: error.type,
            readyState: this.ws?.readyState,
            url: this.config.wsUrl
          });
          
          // Create a proper Error object to avoid uncaught error
          const errorObj = new Error('WebSocket connection failed');
          errorObj.originalError = error;
          
          // Only emit if there are listeners
          if (this.listenerCount('error') > 0) {
            this.emit('error', errorObj);
          }
        };

        this.ws.onclose = (event) => {
          console.warn('[GrpcClient] ⚠️ Disconnected from gRPC bridge:', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
            pendingRequests: this.pendingRequests.size
          });
          
          this.connected = false;
          this.stopHeartbeat();
          
          // Clear pending requests
          for (const [id, request] of this.pendingRequests) {
            request.reject(new Error('Connection closed'));
          }
          this.pendingRequests.clear();
          
          // Clear active subscriptions on disconnect
          this.activeSubscriptions.clear();
          
          this.emit('disconnected');
          
          // Auto-reconnect
          this.scheduleReconnect();
        };

      } catch (error) {
        console.error('[GrpcClient] ❌ Failed to connect to gRPC bridge:', {
          error: error.message,
          stack: error.stack,
          url: this.config.wsUrl
        });
        reject(error);
      }
    });
  }

  // Handle incoming messages
  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      // Only log important messages, not every single one
      if (message.type !== 'heartbeat' && message.type !== 'ping') {
        // Reduced logging for performance
        if (message.error || message.type === 'error') {
          console.error('[GrpcClient] Error message:', message);
        }
      }
      
      // Handle different message types
      switch (message.type) {
        case 'welcome':
          this.handleWelcome(message);
          break;
          
        case 'transactionResult':
          this.handleTransactionResult(message);
          break;
          
        case 'queryResult':
          this.handleQueryResult(message);
          break;
          
        case 'cellLockResult':
        case 'cellUnlockResult':
          this.handleCellResult(message);
          break;
          
        case 'subscribed':
        case 'unsubscribed':
          this.handleSubscriptionResult(message);
          break;
          
        case 'channelState':
          this.handleChannelState(message);
          break;
          
        case 'blockchainEvent':
          this.handleBlockchainEvent(message);
          break;
          
        case 'cellLocked':
        case 'cellUnlocked':
          this.handleCellEvent(message);
          break;
          
        case 'presenceUpdate':
        case 'userDisconnected':
          this.handlePresenceEvent(message);
          break;
          
        case 'error':
          this.handleError(message);
          break;
          
        default:
          console.warn('[GrpcClient] Unknown message type:', message.type);
      }
      
    } catch (error) {
      console.error('[GrpcClient] ❌ Failed to parse message:', {
        error: error.message,
        data: data?.substring(0, 100)
      });
    }
  }

  // Send a message to the bridge
  send(message) {
    if (this.fallbackMode) {
      // In fallback mode, simulate success but do nothing
      return;
    }
    
    if (!this.connected || !this.ws) {
      throw new Error('Not connected to gRPC bridge');
    }
    
    // Only log errors, not every message
    this.ws.send(JSON.stringify(message));
  }

  // Make a request and wait for response
  async request(type, params) {
    // Reduced logging - only log errors
    
    // In fallback mode, return mock data
    if (this.fallbackMode) {
      return this.handleFallbackRequest(type, params);
    }
    
    return new Promise((resolve, reject) => {
      const requestId = ++this.requestId;
      
      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request ${requestId} timed out`));
      }, this.config.requestTimeout);
      
      // Store pending request
      this.pendingRequests.set(requestId, {
        resolve: (data) => {
          clearTimeout(timeout);
          resolve(data);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
      
      // Send request
      this.send({
        type,
        requestId,
        ...params
      });
    });
  }
  
  // Handle requests in fallback mode
  handleFallbackRequest(type, params) {
    console.log(`[GrpcClient] ⚠️ Fallback mode: Handling ${type} request locally`);
    
    // Return mock successful responses
    switch (type) {
      case 'transaction':
        return Promise.resolve({
          success: true,
          transactionDigest: 'fallback-' + Date.now(),
          gasUsed: 0,
          spreadsheetId: 'fallback-spreadsheet-' + Date.now()
        });
        
      case 'query':
        return Promise.resolve({
          result: { 
            balance: '0',
            activeUsers: [],
            lockedCells: []
          }
        });
        
      case 'subscribe':
      case 'unsubscribe':
        return Promise.resolve({ success: true });
        
      case 'lockCell':
      case 'unlockCell':
        return Promise.resolve({ success: true });
        
      default:
        return Promise.resolve({ success: true });
    }
  }

  // Transaction methods
  async createSpreadsheet(title, sender, signature) {
    return this.request('transaction', {
      action: 'createSpreadsheet',
      params: {
        title,
        sender,
        signature
      }
    });
  }

  async saveVersion(spreadsheetId, blobId, description, cellCount, sender, signature) {
    return this.request('transaction', {
      action: 'saveVersion',
      params: {
        spreadsheetId,
        blobId,
        description,
        cellCount,
        sender,
        signature
      }
    });
  }

  async lockCell(spreadsheetId, cellRef) {
    return this.request('lockCell', {
      spreadsheetId,
      cellRef
    });
  }

  async unlockCell(spreadsheetId, cellRef) {
    return this.request('unlockCell', {
      spreadsheetId,
      cellRef
    });
  }

  // Query methods
  async getBalance(owner, coinType = '0x2::sui::SUI') {
    return this.request('query', {
      queryType: 'balance',
      params: {
        owner,
        coinType
      }
    });
  }

  // Gas estimation method
  async estimateGas(transaction) {
    console.log('[GrpcClient] 🔍 Estimating gas for transaction:', transaction.type);
    
    return this.request('query', {
      queryType: 'estimateGas',
      params: {
        transaction: transaction
      }
    });
  }

  async getSpreadsheetInfo(spreadsheetId) {
    return this.request('query', {
      queryType: 'spreadsheetInfo',
      params: {
        spreadsheetId
      }
    });
  }

  async getActiveUsers() {
    return this.request('query', {
      queryType: 'activeUsers',
      params: {}
    });
  }

  async getLockedCells() {
    return this.request('query', {
      queryType: 'lockedCells',
      params: {}
    });
  }

  // Subscription methods
  async subscribe(channel, spreadsheetId = null) {
    // Create a unique key for this subscription
    const subKey = `${channel}-${spreadsheetId || 'null'}`;
    
    // Check if already subscribed
    if (this.activeSubscriptions.has(subKey)) {
      console.log(`[GrpcClient] Already subscribed to ${subKey}`);
      return { success: true, channel, spreadsheetId };
    }
    
    // Add to subscription tracking
    this.subscriptions.add({ channel, spreadsheetId });
    this.activeSubscriptions.set(subKey, { channel, spreadsheetId, timestamp: Date.now() });
    
    try {
      const result = await this.request('subscribe', {
        channel,
        spreadsheetId
      });
      return result;
    } catch (error) {
      // Remove from active subscriptions on error
      this.activeSubscriptions.delete(subKey);
      throw error;
    }
  }

  async unsubscribe(channel, spreadsheetId = null) {
    const subKey = `${channel}-${spreadsheetId || 'null'}`;
    
    // Remove from tracking
    this.activeSubscriptions.delete(subKey);
    this.subscriptions.delete(
      Array.from(this.subscriptions).find(s => s.channel === channel && s.spreadsheetId === spreadsheetId)
    );
    
    return this.request('unsubscribe', {
      channel,
      spreadsheetId
    });
  }

  // Presence methods
  updatePresence(user, status, cursor = null) {
    this.send({
      type: 'presence',
      user,
      status,
      cursor
    });
  }

  // Message handlers
  handleWelcome(message) {
    this.clientId = message.clientId;
    console.log('Received welcome, client ID:', this.clientId);
    this.emit('welcome', message);
  }

  handleTransactionResult(message) {
    const request = this.pendingRequests.get(message.requestId);
    if (request) {
      this.pendingRequests.delete(message.requestId);
      
      if (message.success) {
        request.resolve(message.result);
      } else {
        request.reject(new Error(message.error || 'Transaction failed'));
      }
    }
    
    this.emit('transactionResult', message);
  }

  handleQueryResult(message) {
    const request = this.pendingRequests.get(message.requestId);
    if (request) {
      this.pendingRequests.delete(message.requestId);
      
      if (message.error) {
        request.reject(new Error(message.error));
      } else {
        request.resolve(message.result);
      }
    }
    
    this.emit('queryResult', message);
  }

  handleCellResult(message) {
    const request = this.pendingRequests.get(message.requestId);
    if (request) {
      this.pendingRequests.delete(message.requestId);
      
      if (message.success) {
        request.resolve(message);
      } else {
        request.reject(new Error(message.error || 'Cell operation failed'));
      }
    }
    
    this.emit(message.type, message);
  }

  handleSubscriptionResult(message) {
    const request = this.pendingRequests.get(message.requestId);
    if (request) {
      this.pendingRequests.delete(message.requestId);
      request.resolve(message);
    }
    
    this.emit(message.type, message);
  }

  handleChannelState(message) {
    this.emit('channelState', message);
    
    // Emit specific events for different channel states
    if (message.channel === 'collaboration') {
      this.emit('collaborationState', {
        activeUsers: message.activeUsers,
        lockedCells: message.lockedCells
      });
    }
  }

  handleBlockchainEvent(message) {
    this.emit('blockchainEvent', message);
    
    // Also emit specific event types
    if (message.eventType) {
      this.emit(message.eventType, message.data);
    }
  }

  handleCellEvent(message) {
    this.emit(message.type, message);
    
    // Update local state
    if (message.type === 'cellLocked') {
      this.emit('cellLock', {
        cellRef: message.cellRef,
        clientId: message.clientId,
        timestamp: message.timestamp
      });
    } else if (message.type === 'cellUnlocked') {
      this.emit('cellUnlock', {
        cellRef: message.cellRef,
        clientId: message.clientId,
        timestamp: message.timestamp
      });
    }
  }

  handlePresenceEvent(message) {
    this.emit(message.type, message);
  }

  handleError(message) {
    console.error('Server error:', message.error);
    
    // Check if this is for a pending request
    if (message.requestId) {
      const request = this.pendingRequests.get(message.requestId);
      if (request) {
        this.pendingRequests.delete(message.requestId);
        request.reject(new Error(message.error));
      }
    }
    
    this.emit('error', message);
  }

  // Reconnection logic
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    // Check if we've exceeded max attempts
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.warn(`[GrpcClient] ⚠️ Max reconnection attempts (${this.config.maxReconnectAttempts}) reached`);
      
      if (this.config.enableFallbackMode && !this.fallbackMode) {
        console.log('[GrpcClient] 🔄 Switching to fallback mode - operating without gRPC bridge');
        this.fallbackMode = true;
        this.emit('fallbackMode', { reason: 'max_reconnect_attempts' });
      }
      return;
    }
    
    this.reconnectAttempts++;
    console.log(`[GrpcClient] 🔄 Reconnecting in ${this.reconnectDelay}ms... (Attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
        // Exponential backoff
        this.reconnectDelay = Math.min(
          this.reconnectDelay * 2,
          this.config.maxReconnectDelay
        );
        this.scheduleReconnect();
      });
    }, this.reconnectDelay);
  }

  // Re-subscribe to channels after reconnection
  resubscribe() {
    // Prevent resubscribe if already in progress
    if (this.resubscribing) {
      console.log('[GrpcClient] Resubscribe already in progress, skipping');
      return;
    }
    
    this.resubscribing = true;
    console.log(`[GrpcClient] Resubscribing to ${this.subscriptions.size} channels`);
    
    // Use setTimeout to avoid blocking and rate-limit subscriptions
    let delay = 0;
    for (const subscription of this.subscriptions) {
      setTimeout(() => {
        // Only subscribe if still connected
        if (this.connected) {
          this.subscribe(subscription.channel, subscription.spreadsheetId)
            .catch(error => {
              console.error('[GrpcClient] Failed to resubscribe:', error);
            });
        }
      }, delay);
      delay += 100; // Space out subscriptions by 100ms
    }
    
    // Clear flag after all subscriptions are scheduled
    setTimeout(() => {
      this.resubscribing = false;
    }, delay + 1000);
  }

  // Heartbeat to keep connection alive
  startHeartbeat() {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      if (this.connected && this.ws) {
        // Send ping frame
        if (this.ws.readyState === WebSocket.OPEN) {
          // WebSocket ping is handled at protocol level
          // We can send a custom ping message if needed
        }
      }
    }, this.config.heartbeatInterval);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // Disconnect
  disconnect() {
    this.connected = false;
    
    // Clear timers
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    // Clear pending requests
    for (const [id, request] of this.pendingRequests) {
      request.reject(new Error('Client disconnected'));
    }
    this.pendingRequests.clear();
    
    this.emit('disconnected');
  }

  // Check connection status
  isConnected() {
    return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

// Export singleton instance
export const grpcClient = new GrpcClient();