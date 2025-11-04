// WebSocket service - DISABLED for single-user MVP
// Kept as stub to maintain interface compatibility

export class WebSocketService {
  constructor() {
    this.isConnected = false;
    this.eventListeners = new Map();
  }

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

  async connect(spreadsheetId, userId, wsUrl) {
    // No-op: single-user mode doesn't use WebSocket
    this.isConnected = false;
    return Promise.resolve();
  }

  disconnect() {
    this.isConnected = false;
  }

  sendMessage(type, data) {
    return false; // No messages sent in single-user mode
  }

  lockCell(cellRef) {
    return false;
  }

  unlockCell(cellRef) {
    return false;
  }

  updatePresence(cellRef) {
    return false;
  }

  sendCellEdit(cellRef, value, oldValue) {
    return true;
  }

  getStatus() {
    return {
      isConnected: false,
      spreadsheetId: null,
      userId: null,
      lockedCells: [],
      userCount: 0,
      users: []
    };
  }

  isCellLocked(cellRef) {
    return false;
  }

  getActiveUsers() {
    return [];
  }

  setErrorNotificationHandler(handler) {
    // No-op
  }

  markListenersReady() {
    // No-op
  }
}

// Create singleton instance
export const webSocketService = new WebSocketService();
