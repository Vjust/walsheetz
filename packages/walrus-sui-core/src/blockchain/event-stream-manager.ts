// Event stream manager for real-time collaboration via Sui gRPC
import { grpcService } from './grpc-service.js';
import { getCurrentConfig } from './config.js';

class EventStreamManager {
  private isRunning: boolean;
  private subscribers: Map<string, Set<(data: unknown) => void>>;
  private eventHistory: unknown[];
  private maxHistorySize: number;
  private collaborationState: {
    activeUsers: Map<string, unknown>;
    lockedCells: Map<string, unknown>;
    userPresence: Map<string, unknown>;
  };

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

  setupEventHandlers(): void {
    // Listen to gRPC service events
    grpcService.on('checkpoint', (data: unknown) => {
      this.handleCheckpoint(data);
    });

    grpcService.on('spreadsheetEvent', (event: unknown) => {
      this.handleSpreadsheetEvent(event);
    });

    grpcService.on('cellLocked', (data: unknown) => {
      this.handleCellLocked(data);
    });

    grpcService.on('cellUnlocked', (data: unknown) => {
      this.handleCellUnlocked(data);
    });

    grpcService.on('versionSaved', (data: unknown) => {
      this.handleVersionSaved(data);
    });

    grpcService.on('streamError', (error: unknown) => {
      this.handleStreamError(error);
    });

    grpcService.on('streamReconnected', (data: unknown) => {
      this.handleStreamReconnected(data);
    });
  }

  // Start the event stream
  async start(): Promise<void> {
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
      const err = error as Error;
      console.error('Failed to start event stream manager:', err);
      throw err;
    }
  }

  // Stop the event stream
  stop(): void {
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
  subscribe(eventType: string, callback: (data: unknown) => void): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    const callbacks = this.subscribers.get(eventType);
    callbacks!.add(callback);

    // Return unsubscribe function
    return () => {
      const cbs = this.subscribers.get(eventType);
      if (cbs) {
        cbs.delete(callback);
      }
    };
  }

  // Emit events to subscribers
  emit(eventType: string, data?: unknown): void {
    const callbacks = this.subscribers.get(eventType);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          const err = error as Error;
          console.error(`Error in event callback for ${eventType}:`, err);
        }
      });
    }
  }

  // Handle checkpoint data
  handleCheckpoint(checkpoint: unknown): void {
    const cp = checkpoint as any;
    console.log(`Processing checkpoint ${cp.sequenceNumber}`);

    // Update network status
    this.emit('networkUpdate', {
      checkpoint: cp.sequenceNumber,
      timestamp: cp.timestamp,
      transactionCount: cp.transactionCount
    });

    // Add to history
    this.addToHistory('checkpoint', checkpoint);
  }

  // Handle spreadsheet-specific events
  handleSpreadsheetEvent(event: unknown): void {
    const evt = event as any;
    console.log('Spreadsheet event:', evt.eventType);

    this.addToHistory('spreadsheetEvent', event);
    this.emit('spreadsheetEvent', event);
  }

  // Handle cell locking events
  handleCellLocked(data: unknown): void {
    const d = data as any;
    const { cellRef, userId, color } = d;

    console.log(`Cell ${cellRef} locked by user ${userId}`);

    // Update collaboration state
    this.collaborationState.lockedCells.set(cellRef, {
      userId,
      color,
      timestamp: Date.now()
    });

    // Update user presence
    if (this.collaborationState.userPresence.has(userId)) {
      const user = this.collaborationState.userPresence.get(userId) as any;
      if (user) {
        user.activeCell = cellRef;
        user.lastActivity = Date.now();
      }
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
  handleCellUnlocked(data: unknown): void {
    const d = data as any;
    const { cellRef, userId } = d;

    console.log(`Cell ${cellRef} unlocked by user ${userId}`);

    // Update collaboration state
    this.collaborationState.lockedCells.delete(cellRef);

    // Update user presence
    if (this.collaborationState.userPresence.has(userId)) {
      const user = this.collaborationState.userPresence.get(userId) as any;
      if (user) {
        user.activeCell = null;
        user.lastActivity = Date.now();
      }
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
  handleVersionSaved(data: unknown): void {
    const d = data as any;
    console.log('Version saved:', d.version);

    this.emit('versionSaved', {
      ...(d || {}),
      timestamp: Date.now()
    });

    this.addToHistory('versionSaved', data);
  }

  // Handle stream errors
  handleStreamError(error: unknown): void {
    const err = error as any;
    console.error('Stream error:', err);

    this.emit('error', {
      type: 'streamError',
      message: err.error,
      stream: err.streamName,
      timestamp: Date.now()
    });
  }

  // Handle stream reconnection
  handleStreamReconnected(data: unknown): void {
    const d = data as any;
    console.log('Stream reconnected:', d.streamName);

    this.emit('reconnected', {
      stream: d.streamName,
      timestamp: Date.now()
    });
  }

  // Add user to collaboration session
  addUser(userId: string, userName: string, color: string): void {
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
  removeUser(userId: string): void {
    const user = this.collaborationState.userPresence.get(userId);
    if (!user) return;

    // Unlock any cells this user had locked
    for (const [cellRef, lockData] of this.collaborationState.lockedCells) {
      const ld = lockData as any;
      if (ld.userId === userId) {
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

    const u = user as any;
    this.emit('userLeft', {
      userId,
      userName: u.userName,
      timestamp: Date.now()
    });

    console.log(`User ${u.userName} left collaboration`);
  }

  // Update user activity
  updateUserActivity(userId: string, cellRef: string | null = null): void {
    const user = this.collaborationState.userPresence.get(userId);
    if (user) {
      const u = user as any;
      u.lastActivity = Date.now();
      u.activeCell = cellRef;

      this.emit('userActivity', {
        userId,
        cellRef,
        timestamp: Date.now()
      });
    }
  }

  // Get current collaboration state
  getCollaborationState(): any {
    return {
      activeUsers: Array.from(this.collaborationState.activeUsers.values()),
      lockedCells: Object.fromEntries(this.collaborationState.lockedCells),
      userPresence: Array.from(this.collaborationState.userPresence.values()),
      isRunning: this.isRunning,
      lastCheckpoint: (grpcService as any).lastCheckpointCursor
    };
  }

  // Get event history
  getEventHistory(eventType: string | null = null, limit: number = 100): unknown[] {
    let events = this.eventHistory;

    if (eventType) {
      events = events.filter((event: any) => event.type === eventType);
    }

    return events.slice(-limit);
  }

  // Add event to history
  addToHistory(type: string, data: unknown): void {
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
  canEditCell(cellRef: string, userId: string): boolean {
    const lockData = this.collaborationState.lockedCells.get(cellRef);

    // Cell is not locked
    if (!lockData) return true;

    // Cell is locked by the same user
    const ld = lockData as any;
    if (ld.userId === userId) return true;

    // Cell is locked by someone else
    return false;
  }

  // Get cell lock status
  getCellLockStatus(cellRef: string): unknown {
    return this.collaborationState.lockedCells.get(cellRef) || null;
  }

  // Clean up inactive users
  cleanupInactiveUsers(timeoutMs: number = 300000): number { // 5 minutes default
    const now = Date.now();
    const inactiveUsers: string[] = [];

    for (const [userId, user] of this.collaborationState.userPresence) {
      const u = user as any;
      if (now - u.lastActivity > timeoutMs) {
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
  getStatus(): any {
    return {
      isRunning: this.isRunning,
      grpcStatus: (grpcService as any).getStatus(),
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