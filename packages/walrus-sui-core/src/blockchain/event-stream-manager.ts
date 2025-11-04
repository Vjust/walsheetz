// Event stream manager for real-time collaboration via Sui gRPC
import { grpcService } from './grpc-service.js';
import { getCurrentConfig } from './config.js';

class EventStreamManager {
  constructor() {
    this.isRunning = false;
    this.subscribers = new Map();
    this.eventHistory = [];
    this.maxHistorySize = 1000;
    this.collaborationState = {
      activeUsers: new Map(),
      lockedCells: new Map(),
      userPresence: new Map()
    };
    
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // Listen to gRPC service events
    grpcService.on('checkpoint', (data) => {
      this.handleCheckpoint(data);
    });

    grpcService.on('spreadsheetEvent', (event) => {
      this.handleSpreadsheetEvent(event);
    });

    grpcService.on('cellLocked', (data) => {
      this.handleCellLocked(data);
    });

    grpcService.on('cellUnlocked', (data) => {
      this.handleCellUnlocked(data);
    });

    grpcService.on('versionSaved', (data) => {
      this.handleVersionSaved(data);
    });

    grpcService.on('streamError', (error) => {
      this.handleStreamError(error);
    });

    grpcService.on('streamReconnected', (data) => {
      this.handleStreamReconnected(data);
    });
  }

  // Start the event stream
  async start() {
    if (this.isRunning) {
      console.log('Event stream manager already running');
      return;
    }

    try {
      console.log('Starting event stream manager...');
      
      // Start checkpoint subscription with optimized field mask
      grpcService.subscribeToCheckpoints({
        fieldMask: [
          'sequence_number',
          'digest',
          'transactions.digest',
          'transactions.events',
          'transactions.effects.status',
          'transactions.effects.created',
          'transactions.effects.mutated'
        ]
      });

      this.isRunning = true;
      console.log('Event stream manager started successfully');
      
      // Emit started event
      this.emit('started');
    } catch (error) {
      console.error('Failed to start event stream manager:', error);
      throw error;
    }
  }

  // Stop the event stream
  stop() {
    if (!this.isRunning) return;

    console.log('Stopping event stream manager...');
    this.isRunning = false;
    
    // Clear collaboration state
    this.collaborationState.activeUsers.clear();
    this.collaborationState.lockedCells.clear();
    this.collaborationState.userPresence.clear();
    
    this.emit('stopped');
  }

  // Subscribe to specific events
  subscribe(eventType, callback) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType).add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscribers.get(eventType);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  // Emit events to subscribers
  emit(eventType, data) {
    const callbacks = this.subscribers.get(eventType);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event callback for ${eventType}:`, error);
        }
      });
    }
  }

  // Handle checkpoint data
  handleCheckpoint(checkpoint) {
    console.log(`Processing checkpoint ${checkpoint.sequenceNumber}`);
    
    // Update network status
    this.emit('networkUpdate', {
      checkpoint: checkpoint.sequenceNumber,
      timestamp: checkpoint.timestamp,
      transactionCount: checkpoint.transactionCount
    });

    // Add to history
    this.addToHistory('checkpoint', checkpoint);
  }

  // Handle spreadsheet-specific events
  handleSpreadsheetEvent(event) {
    console.log('Spreadsheet event:', event.eventType);
    
    this.addToHistory('spreadsheetEvent', event);
    this.emit('spreadsheetEvent', event);
  }

  // Handle cell locking events
  handleCellLocked(data) {
    const { cellRef, userId, color } = data;
    
    console.log(`Cell ${cellRef} locked by user ${userId}`);
    
    // Update collaboration state
    this.collaborationState.lockedCells.set(cellRef, {
      userId,
      color,
      timestamp: Date.now()
    });

    // Update user presence
    if (this.collaborationState.userPresence.has(userId)) {
      const user = this.collaborationState.userPresence.get(userId);
      user.activeCell = cellRef;
      user.lastActivity = Date.now();
    }

    // Emit to UI
    this.emit('cellLocked', {
      cellRef,
      userId,
      color,
      timestamp: Date.now()
    });

    this.addToHistory('cellLocked', data);
  }

  // Handle cell unlocking events  
  handleCellUnlocked(data) {
    const { cellRef, userId } = data;
    
    console.log(`Cell ${cellRef} unlocked by user ${userId}`);
    
    // Update collaboration state
    this.collaborationState.lockedCells.delete(cellRef);

    // Update user presence
    if (this.collaborationState.userPresence.has(userId)) {
      const user = this.collaborationState.userPresence.get(userId);
      user.activeCell = null;
      user.lastActivity = Date.now();
    }

    // Emit to UI
    this.emit('cellUnlocked', {
      cellRef,
      userId,
      timestamp: Date.now()
    });

    this.addToHistory('cellUnlocked', data);
  }

  // Handle version saved events
  handleVersionSaved(data) {
    console.log('Version saved:', data.version);
    
    this.emit('versionSaved', {
      ...data,
      timestamp: Date.now()
    });

    this.addToHistory('versionSaved', data);
  }

  // Handle stream errors
  handleStreamError(error) {
    console.error('Stream error:', error);
    
    this.emit('error', {
      type: 'streamError',
      message: error.error,
      stream: error.streamName,
      timestamp: Date.now()
    });
  }

  // Handle stream reconnection
  handleStreamReconnected(data) {
    console.log('Stream reconnected:', data.streamName);
    
    this.emit('reconnected', {
      stream: data.streamName,
      timestamp: Date.now()
    });
  }

  // Add user to collaboration session
  addUser(userId, userName, color) {
    this.collaborationState.userPresence.set(userId, {
      userId,
      userName,
      color,
      activeCell: null,
      lastActivity: Date.now(),
      isOnline: true
    });

    this.collaborationState.activeUsers.set(userId, {
      userId,
      userName,
      color,
      joinedAt: Date.now()
    });

    this.emit('userJoined', {
      userId,
      userName,
      color,
      timestamp: Date.now()
    });

    console.log(`User ${userName} joined collaboration`);
  }

  // Remove user from collaboration session
  removeUser(userId) {
    const user = this.collaborationState.userPresence.get(userId);
    if (!user) return;

    // Unlock any cells this user had locked
    for (const [cellRef, lockData] of this.collaborationState.lockedCells) {
      if (lockData.userId === userId) {
        this.collaborationState.lockedCells.delete(cellRef);
        this.emit('cellUnlocked', {
          cellRef,
          userId,
          timestamp: Date.now()
        });
      }
    }

    this.collaborationState.userPresence.delete(userId);
    this.collaborationState.activeUsers.delete(userId);

    this.emit('userLeft', {
      userId,
      userName: user.userName,
      timestamp: Date.now()
    });

    console.log(`User ${user.userName} left collaboration`);
  }

  // Update user activity
  updateUserActivity(userId, cellRef = null) {
    const user = this.collaborationState.userPresence.get(userId);
    if (user) {
      user.lastActivity = Date.now();
      user.activeCell = cellRef;
      
      this.emit('userActivity', {
        userId,
        cellRef,
        timestamp: Date.now()
      });
    }
  }

  // Get current collaboration state
  getCollaborationState() {
    return {
      activeUsers: Array.from(this.collaborationState.activeUsers.values()),
      lockedCells: Object.fromEntries(this.collaborationState.lockedCells),
      userPresence: Array.from(this.collaborationState.userPresence.values()),
      isRunning: this.isRunning,
      lastCheckpoint: grpcService.lastCheckpointCursor
    };
  }

  // Get event history
  getEventHistory(eventType = null, limit = 100) {
    let events = this.eventHistory;
    
    if (eventType) {
      events = events.filter(event => event.type === eventType);
    }
    
    return events.slice(-limit);
  }

  // Add event to history
  addToHistory(type, data) {
    this.eventHistory.push({
      type,
      data,
      timestamp: Date.now()
    });

    // Trim history if too large
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  // Check if user can edit cell
  canEditCell(cellRef, userId) {
    const lockData = this.collaborationState.lockedCells.get(cellRef);
    
    // Cell is not locked
    if (!lockData) return true;
    
    // Cell is locked by the same user
    if (lockData.userId === userId) return true;
    
    // Cell is locked by someone else
    return false;
  }

  // Get cell lock status
  getCellLockStatus(cellRef) {
    return this.collaborationState.lockedCells.get(cellRef) || null;
  }

  // Clean up inactive users
  cleanupInactiveUsers(timeoutMs = 300000) { // 5 minutes default
    const now = Date.now();
    const inactiveUsers = [];

    for (const [userId, user] of this.collaborationState.userPresence) {
      if (now - user.lastActivity > timeoutMs) {
        inactiveUsers.push(userId);
      }
    }

    inactiveUsers.forEach(userId => {
      this.removeUser(userId);
    });

    if (inactiveUsers.length > 0) {
      console.log(`Cleaned up ${inactiveUsers.length} inactive users`);
    }

    return inactiveUsers.length;
  }

  // Get stream status
  getStatus() {
    return {
      isRunning: this.isRunning,
      grpcStatus: grpcService.getStatus(),
      collaborationState: this.getCollaborationState(),
      eventHistorySize: this.eventHistory.length
    };
  }
}

// Create singleton instance
export const eventStreamManager = new EventStreamManager();

// Convenience functions
export const startEventStream = () => eventStreamManager.start();
export const stopEventStream = () => eventStreamManager.stop();
export const subscribeToEvents = (eventType, callback) => eventStreamManager.subscribe(eventType, callback);
export const getCollaborationState = () => eventStreamManager.getCollaborationState();
export const canEditCell = (cellRef, userId) => eventStreamManager.canEditCell(cellRef, userId);
export const getCellLockStatus = (cellRef) => eventStreamManager.getCellLockStatus(cellRef);