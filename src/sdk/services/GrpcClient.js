// Frontend gRPC client - DISABLED for single-user MVP
// Kept as stub to maintain interface compatibility
import { EventEmitter } from 'events';

class GrpcClient extends EventEmitter {
  constructor() {
    super();
    this.connected = false;
    this.config = {
      wsUrl: import.meta.env.VITE_WS_URL || 'ws://localhost:8080'
    };
  }

  // Connect to WebSocket bridge (no-op)
  async connect() {
    this.connected = false;
    return false;
  }

  // Send a message to the bridge (no-op)
  send(message) {
    // No-op
  }

  // Make a request and wait for response
  async request(type, params) {
    return Promise.resolve({ success: true });
  }

  // Transaction methods (no-op)
  async createSpreadsheet(title, sender, signature) {
    return Promise.resolve({ success: true });
  }

  async saveVersion(spreadsheetId, blobId, description, cellCount, sender, signature) {
    return Promise.resolve({ success: true });
  }

  async lockCell(spreadsheetId, cellRef) {
    return Promise.resolve({ success: true });
  }

  async unlockCell(spreadsheetId, cellRef) {
    return Promise.resolve({ success: true });
  }

  // Query methods (no-op)
  async getBalance(owner, coinType = '0x2::sui::SUI') {
    return Promise.resolve({ balance: '0' });
  }

  async estimateGas(transaction) {
    return Promise.resolve({ gasUsed: 0 });
  }

  async getSpreadsheetInfo(spreadsheetId) {
    return Promise.resolve({});
  }

  async getActiveUsers() {
    return Promise.resolve({ users: [] });
  }

  async getLockedCells() {
    return Promise.resolve({ cells: [] });
  }

  // Subscription methods (no-op)
  async subscribe(channel, spreadsheetId = null) {
    return Promise.resolve({ success: true });
  }

  async unsubscribe(channel, spreadsheetId = null) {
    return Promise.resolve({ success: true });
  }

  // Presence methods (no-op)
  updatePresence(user, status, cursor = null) {
    // No-op
  }

  // Disconnect (no-op)
  disconnect() {
    this.connected = false;
  }

  // Check connection status
  isConnected() {
    return false;
  }
}

// Export singleton instance
export const grpcClient = new GrpcClient();
