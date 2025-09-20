// Collaboration service using browser-compatible services for real-time features
import { grpcService } from './BrowserGrpcService.js';
import { getCurrentConfig } from '../../blockchain/config.js';

class CollaborationService {
  constructor() {
    console.log('[CollaborationService] Initializing...');
    
    this.isInitialized = false;
    this.currentUser = null;
    this.collaborationEnabled = false;
    this.cellLockCache = new Map();
    this.userColors = ['#FF6B6B', '#4ECDC4', '#FFCE54', '#AC7BFF', '#FF9AA2'];
    this.config = getCurrentConfig();
    this.mockUsers = new Map(); // For simulation mode
    
    console.log('[CollaborationService] Config:', {
      network: this.config.network,
      simulationMode: grpcService.simulationMode
    });
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    console.log('[CollaborationService] Setting up event listeners...');
    
    // Listen to browser gRPC service events
    grpcService.on('cellLocked', (data) => {
      console.log('[CollaborationService] Cell locked event:', data);
      this.handleCellLocked(data);
    });

    grpcService.on('cellUnlocked', (data) => {
      console.log('[CollaborationService] Cell unlocked event:', data);
      this.handleCellUnlocked(data);
    });

    grpcService.on('versionSaved', (data) => {
      console.log('[CollaborationService] Version saved event:', data);
      this.handleVersionSaved(data);
    });
    
    console.log('[CollaborationService] Event listeners configured');
  }

  // Initialize collaboration service
  async initialize() {
    if (this.isInitialized) {
      console.log('[CollaborationService] Already initialized');
      return true;
    }

    try {
      console.log('[CollaborationService] Starting initialization...');
      console.log('[CollaborationService] gRPC service status:', {
        isConnected: grpcService.isConnected,
        simulationMode: grpcService.simulationMode
      });
      
      // Browser gRPC service auto-initializes
      this.isInitialized = true;
      console.log('[CollaborationService] ✅ Initialization complete');
      
      return true;
    } catch (error) {
      console.error('[CollaborationService] ❌ Failed to initialize:', {
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  // Connect user to collaboration session (browser simulation mode)
  async connectUser(userId = 'demo-user', userName = 'Demo User') {
    console.log('[CollaborationService] Connecting user:', { userId, userName });
    
    if (this.collaborationEnabled) {
      console.log('[CollaborationService] User already connected');
      return this.currentUser;
    }

    try {
      // Create mock user object for demo
      this.currentUser = {
        userId: userId,
        userName: userName,
        color: this.generateUserColor(userId),
        address: userId,
        activeCell: null,
        joinedAt: Date.now()
      };

      this.collaborationEnabled = true;
      console.log('[CollaborationService] ✅ User connected (demo mode):', this.currentUser);
      
      return this.currentUser;
    } catch (error) {
      console.error('Failed to connect user to collaboration:', error);
      throw error;
    }
  }

  // Disconnect user from collaboration session
  async disconnectUser() {
    if (!this.collaborationEnabled || !this.currentUser) {
      return;
    }

    try {
      // Clean up in simulation mode
      this.mockUsers.delete(this.currentUser.userId);
      
      this.currentUser = null;
      this.collaborationEnabled = false;
      
      console.log('User disconnected from collaboration');
    } catch (error) {
      console.error('Failed to disconnect user from collaboration:', error);
    }
  }

  // Lock a cell for editing (simulation mode)
  async lockCell(cellRef) {
    if (!this.collaborationEnabled || !this.currentUser) {
      throw new Error('User not connected to collaboration');
    }

    try {
      // Check if cell can be locked locally
      if (this.cellLockCache.has(cellRef)) {
        const lockStatus = this.cellLockCache.get(cellRef);
        throw new Error(`Cell ${cellRef} is locked by ${lockStatus.userId}`);
      }

      // Simulate cell locking
      this.cellLockCache.set(cellRef, {
        userId: this.currentUser.userId,
        color: this.currentUser.color,
        timestamp: Date.now()
      });

      // Trigger mock event
      grpcService.triggerMockEvent('cellLocked', {
        cellRef: cellRef,
        userId: this.currentUser.userId,
        color: this.currentUser.color
      });
      
      console.log(`Cell ${cellRef} locked successfully (demo mode)`);
      return { success: true };
    } catch (error) {
      console.error('Failed to lock cell:', error);
      throw error;
    }
  }

  // Unlock a cell (simulation mode)
  async unlockCell(cellRef) {
    if (!this.collaborationEnabled || !this.currentUser) {
      return;
    }

    try {
      const lockStatus = this.cellLockCache.get(cellRef);
      
      if (!lockStatus || lockStatus.userId !== this.currentUser.userId) {
        console.log(`Cell ${cellRef} not locked by current user`);
        return;
      }

      console.log(`Unlocking cell ${cellRef} (demo mode)`);

      // Remove from local cache
      this.cellLockCache.delete(cellRef);

      // Trigger mock event
      grpcService.triggerMockEvent('cellUnlocked', {
        cellRef,
        userId: this.currentUser.userId
      });

    } catch (error) {
      console.error('Failed to unlock cell:', error);
    }
  }

  // Handle cell locked event from stream
  handleCellLocked(data) {
    console.log('Cell locked event received:', data);
    
    // Update cache
    this.cellLockCache.set(data.cellRef, {
      userId: data.userId,
      color: data.color,
      timestamp: data.timestamp,
      pending: false
    });

    // Apply visual highlighting to DOM
    this.applyCellHighlighting(data.cellRef, data.color, data.userId);
  }

  // Handle cell unlocked event from stream
  handleCellUnlocked(data) {
    console.log('Cell unlocked event received:', data);
    
    // Remove from cache
    this.cellLockCache.delete(data.cellRef);

    // Remove visual highlighting from DOM
    this.removeCellHighlighting(data.cellRef);
  }

  // Handle user joined event
  handleUserJoined(data) {
    console.log('User joined collaboration:', data.userName);
    // UI will be updated via the collaboration component
  }

  // Handle user left event
  handleUserLeft(data) {
    console.log('User left collaboration:', data.userName);
    // UI will be updated via the collaboration component
  }

  // Handle version saved event
  handleVersionSaved(data) {
    console.log('Version saved:', data.version);
    // Notify UI about successful save
    this.emit('versionSaved', data);
  }

  // Handle network update event
  handleNetworkUpdate(data) {
    console.log(`Network update: checkpoint ${data.checkpoint}`);
    // Update network status in UI
    this.emit('networkUpdate', data);
  }

  // Handle stream error
  handleStreamError(error) {
    console.error('Stream error:', error);
    this.emit('error', error);
  }

  // Handle stream reconnection
  handleStreamReconnected(data) {
    console.log('Stream reconnected:', data.stream);
    this.emit('reconnected', data);
  }

  // Handle wallet connected
  handleWalletConnected(data) {
    console.log('Wallet connected, can join collaboration');
    this.emit('walletConnected', data);
  }

  // Handle wallet disconnected
  handleWalletDisconnected() {
    console.log('Wallet disconnected, leaving collaboration');
    this.disconnectUser();
    this.emit('walletDisconnected');
  }

  // Apply visual highlighting to a cell
  applyCellHighlighting(cellRef, color, userId) {
    try {
      const cellElement = this.findCellElement(cellRef);
      if (cellElement) {
        cellElement.classList.add('collaboration-cell-locked');
        cellElement.style.borderColor = color;
        cellElement.style.backgroundColor = `${color}20`; // 20% opacity
        cellElement.setAttribute('data-locked-by', userId);
        
        // Add tooltip showing who locked the cell
        const userName = this.getUserName(userId);
        cellElement.title = `Locked by ${userName}`;
      }
    } catch (error) {
      console.error('Failed to apply cell highlighting:', error);
    }
  }

  // Remove visual highlighting from a cell
  removeCellHighlighting(cellRef) {
    try {
      const cellElement = this.findCellElement(cellRef);
      if (cellElement) {
        cellElement.classList.remove('collaboration-cell-locked');
        cellElement.style.borderColor = '';
        cellElement.style.backgroundColor = '';
        cellElement.removeAttribute('data-locked-by');
        cellElement.title = '';
      }
    } catch (error) {
      console.error('Failed to remove cell highlighting:', error);
    }
  }

  // Find cell element in DOM (needs to be adapted for the actual spreadsheet library)
  findCellElement(cellRef) {
    // This would need to be adapted for the specific spreadsheet library being used
    // For Luckysheet: document.querySelector(`[data-cell="${cellRef}"]`)
    // For other libraries, the selector would be different
    return document.querySelector(`[data-cell="${cellRef}"]`);
  }

  // Generate user name from address
  generateUserName(address) {
    const shortAddress = address.slice(0, 6) + '...' + address.slice(-4);
    return `User ${shortAddress}`;
  }

  // Generate consistent color for user
  generateUserColor(address) {
    const hash = address.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return this.userColors[Math.abs(hash) % this.userColors.length];
  }

  // Get user name by ID (simulation mode)
  getUserName(userId) {
    const user = this.mockUsers.get(userId) || this.currentUser;
    return user?.userName || this.generateUserName(userId);
  }

  // Get spreadsheet ID (would be set when spreadsheet is created/loaded)
  getSpreadsheetId() {
    // This would come from the blockchain adapter or spreadsheet state
    return '0x123'; // Placeholder
  }

  // Get current collaboration state (simulation mode)
  getCollaborationState() {
    return {
      activeUsers: this.mockUsers.size > 0 ? Array.from(this.mockUsers.values()) : [this.currentUser].filter(Boolean),
      lockedCells: Object.fromEntries(this.cellLockCache),
      currentUser: this.currentUser,
      collaborationEnabled: this.collaborationEnabled,
      isInitialized: this.isInitialized
    };
  }

  // Get cell lock status (simulation mode)
  getCellLockStatus(cellRef) {
    return this.cellLockCache.get(cellRef) || null;
  }

  // Check if current user can edit cell (simulation mode)
  canEditCell(cellRef) {
    if (!this.currentUser) return false;
    const lockStatus = this.cellLockCache.get(cellRef);
    return !lockStatus || lockStatus.userId === this.currentUser.userId;
  }

  // Event emitter functionality
  on(event, callback) {
    if (!this.eventListeners) {
      this.eventListeners = new Map();
    }
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.eventListeners && this.eventListeners.has(event)) {
      const callbacks = this.eventListeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.eventListeners && this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in event listener:', error);
        }
      });
    }
  }

  // Cleanup resources
  destroy() {
    console.log('Destroying collaboration service...');
    
    // Disconnect user
    this.disconnectUser();
    
    // Unsubscribe from event stream events
    this.eventSubscriptions.forEach(unsubscribe => {
      try {
        unsubscribe();
      } catch (error) {
        console.error('Error unsubscribing from event:', error);
      }
    });
    this.eventSubscriptions = [];
    
    // Stop event stream
    stopEventStream();
    
    // Clear state
    this.isInitialized = false;
    this.currentUser = null;
    this.collaborationEnabled = false;
    this.cellLockCache.clear();
    
    if (this.eventListeners) {
      this.eventListeners.clear();
    }
  }

  // Get service status (simulation mode)
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      collaborationEnabled: this.collaborationEnabled,
      currentUser: this.currentUser,
      grpcStatus: grpcService.getStatus(),
      cacheSize: this.cellLockCache.size
    };
  }
}

// Create singleton instance
export const collaborationService = new CollaborationService();

// Convenience functions
export const initializeCollaboration = () => collaborationService.initialize();
export const connectToCollaboration = () => collaborationService.connectUser();
export const disconnectFromCollaboration = () => collaborationService.disconnectUser();
export const lockCell = (cellRef) => collaborationService.lockCell(cellRef);
export const unlockCell = (cellRef) => collaborationService.unlockCell(cellRef);
export const getCollaborationState = () => collaborationService.getCollaborationState();
export const canEditCell = (cellRef) => collaborationService.canEditCell(cellRef);
export const getCellLockStatus = (cellRef) => collaborationService.getCellLockStatus(cellRef);