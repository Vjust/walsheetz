// Collaboration service - DISABLED for single-user MVP
// Kept as stub to maintain interface compatibility

class CollaborationService {
  constructor() {
    console.log('[CollaborationService] Initializing (collaboration disabled for single-user MVP)...');

    this.isInitialized = true; // Mark as initialized but disabled
    this.currentUser = null;
    this.collaborationEnabled = false; // Always disabled
    this.cellLockCache = new Map();
    this.eventListeners = new Map(); // For minimal event emitter support
  }

  // Minimal event emitter support (events not fired in single-user mode)
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const callbacks = this.eventListeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    // Events disabled for single-user MVP
  }

  // Initialize collaboration service (disabled for single-user MVP)
  async initialize() {
    return false; // Collaboration disabled
  }

  // Placeholder method (old setupEventListeners removed - not needed)

  // Connect user to collaboration session (disabled for single-user MVP)
  async connectUser(userId, userName) {
    throw new Error('Collaboration disabled in single-user MVP');
  }

  // Disconnect user from collaboration session (disabled for single-user MVP)
  async disconnectUser() {
    // No-op
  }

  // Lock a cell for editing (disabled for single-user MVP)
  async lockCell(cellRef) {
    return { success: true }; // Allow locks to succeed locally
  }

  // Unlock a cell (disabled for single-user MVP)
  async unlockCell(cellRef) {
    return { success: true };
  }

  // Stub methods (disabled for single-user MVP)
  getSpreadsheetId() { return null; }

  getCollaborationState() {
    return {
      activeUsers: [],
      lockedCells: {},
      currentUser: null,
      collaborationEnabled: false,
      isInitialized: true,
      enabled: false
    };
  }

  getCellLockStatus(cellRef) { return null; }

  canEditCell(cellRef) { return true; }

  destroy() { /* no-op */ }

  getStatus() {
    return {
      isInitialized: true,
      collaborationEnabled: false,
      currentUser: null,
      cacheSize: 0
    };
  }

  // Stub method for blockchain event subscription (not yet implemented)
  // This prevents errors when called from Collaboration component
  subscribeToBlockchainEvents(spreadsheetId, callbacks) {
    console.log('[CollaborationService] subscribeToBlockchainEvents called but not yet implemented', {
      spreadsheetId,
      hasCallbacks: !!callbacks
    });

    // Return no-op unsubscribe function
    return () => {
      console.log('[CollaborationService] No-op unsubscribe called');
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