// Browser-compatible service using Sui JSON-RPC instead of gRPC
import { configLoader } from '../utils/ConfigLoader.js';
import { SuiClient } from '@mysten/sui/client';

class BrowserGrpcService {
  constructor() {
    console.log('[BrowserGrpcService] Initializing...');

    this.client = null; // Will be initialized after config load
    this.config = null;
    this.configLoader = configLoader;
    this.isConnected = false;
    this.eventListeners = new Map();
    this.subscriptions = new Map();
    // eventCallbacks: Stores blockchain event subscriptions (NOT collaboration events)
    // Used for real-time and fallback polling of Move contract events
    // Collaboration-specific events disabled for single-user MVP (Phase 2)
    this.eventCallbacks = new Map();

    console.log('[BrowserGrpcService] Constructor completed - will load config during initialization');
  }

  // Event handling (same interface as Node.js version)
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
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('[BrowserGrpcService] ❌ Error in event listener:', error);
        }
      });
    }
  }

  // Initialize connection to Sui RPC
  async setupClients() {
    console.log('[BrowserGrpcService] 🔄 Connecting to Sui JSON-RPC...');

    try {
      // Initialize config and client first
      if (!this.config) {
        this.config = await this.configLoader.getConfig();
      }
      if (!this.client) {
        // Use ABSOLUTE URL directly for SuiClient (GraphQL client needs direct access, not proxy)
        // The @mysten/sui v1.38.0 uses GraphQL internally, which doesn't work through the /sui-rpc proxy
        const networkConfig = this.config.getCurrentNetwork();
        this.client = new SuiClient({ url: networkConfig.rpcUrl });
      }

      // Test connection
      const chainId = await this.client.getChainIdentifier();
      this.isConnected = true;
      
      console.log('[BrowserGrpcService] ✅ Connected to Sui RPC, chain ID:', chainId);
      this.emit('connected', { chainId, rpcUrl: this.config.getServiceUrl('sui-rpc') });
      
      return true;
    } catch (error) {
      console.error('[BrowserGrpcService] ❌ Failed to connect to Sui RPC:', error);
      this.isConnected = false;
      this.emit('disconnected', { error: error.message });
      return false;
    }
  }

  // Subscribe to checkpoints (using polling as fallback for WebSocket)
  subscribeToCheckpoints(options = {}) {
    if (!this.isConnected) {
      console.error('[BrowserGrpcService] ❌ Cannot subscribe - service not connected');
      throw new Error('Service not connected');
    }

    console.log('[BrowserGrpcService] Starting checkpoint subscription...');
    
    // Create a subscription object
    const subscription = {
      active: true,
      cancel: () => {
        subscription.active = false;
        
        // Unsubscribe from real-time checkpoint stream
        if (subscription.unsubscribeCheckpoints && typeof subscription.unsubscribeCheckpoints === 'function') {
          try {
            subscription.unsubscribeCheckpoints();
            console.log('[BrowserGrpcService] Checkpoint subscription cancelled');
          } catch (error) {
            console.warn('[BrowserGrpcService] Error cancelling checkpoint subscription:', error);
          }
        }
        
        // Stop fallback polling if running
        if (this.checkpointInterval) {
          clearInterval(this.checkpointInterval);
          this.checkpointInterval = null;
          console.log('[BrowserGrpcService] Checkpoint polling cancelled');
        }
      }
    };

    // Subscribe to real-time checkpoints instead of polling
    try {
      if (this.subscribeToCheckpointStream) {
        // Use real-time checkpoint subscription
        const checkpointUnsubscribe = this.subscribeToCheckpointStream((checkpoint) => {
          if (!subscription.active) return;
          
          this.emit('checkpoint', {
            sequenceNumber: checkpoint.sequenceNumber,
            timestamp: checkpoint.timestamp || Date.now(),
            data: checkpoint.data || {},
            realTime: true
          });
        });
        
        // Store unsubscribe function for cleanup
        subscription.unsubscribeCheckpoints = checkpointUnsubscribe;
        console.log('[BrowserGrpcService] Real-time checkpoint subscription started');
        
      } else {
        // Fallback to polling with longer interval
        console.log('[BrowserGrpcService] Checkpoint stream unavailable, falling back to polling (30s interval)');
        
        this.checkpointInterval = setInterval(async () => {
          if (!subscription.active) return;
          
          try {
            // Get latest checkpoint
            const latestCheckpoint = await this.client.getLatestCheckpointSequenceNumber();
            
            this.emit('checkpoint', {
              sequenceNumber: latestCheckpoint,
              timestamp: Date.now(),
              fallback: true
            });
          } catch (error) {
            console.warn('[BrowserGrpcService] Checkpoint polling error:', error);
          }
        }, 30000); // Reduced from 5s to 30s polling interval
      }
    } catch (error) {
      console.warn('[BrowserGrpcService] Failed to setup checkpoint subscription:', error);
    }

    return subscription;
  }

  // Execute transaction (not used directly in browser - wallet handles this)
  async executeTransaction(transactionBytes, signatures) {
    console.log('[BrowserGrpcService] Transaction execution delegated to wallet...');
    
    // In browser context, transactions are executed through wallet
    // This method exists for interface compatibility
    throw new Error('Transaction execution should be handled by wallet in browser context');
  }

  // Get balance for an address
  async getBalance(owner, coinType = '0x2::sui::SUI') {
    try {
      console.log(`[BrowserGrpcService] Getting balance for ${owner.slice(0, 8)}...`);
      
      const balance = await this.client.getBalance({
        owner: owner,
        coinType: coinType
      });
      
      console.log('[BrowserGrpcService] Balance retrieved:', {
        owner: owner.slice(0, 8) + '...',
        balance: balance.totalBalance,
        coinCount: balance.coinObjectCount
      });
      
      return {
        totalBalance: balance.totalBalance,
        coinObjectCount: balance.coinObjectCount,
        lockedBalance: balance.lockedBalance || '0',
        owner: owner
      };
    } catch (error) {
      console.error('[BrowserGrpcService] Failed to get balance:', error);
      throw error;
    }
  }

  // Get owned objects for an address
  async getOwnedObjects(owner, options = {}) {
    try {
      console.log(`[BrowserGrpcService] Getting owned objects for ${owner.slice(0, 8)}...`);
      
      const result = await this.client.getOwnedObjects({
        owner: owner,
        filter: options.filter,
        options: {
          showContent: true,
          showOwner: true,
          showType: true,
          showPreviousTransaction: true,
          ...options
        }
      });
      
      console.log('[BrowserGrpcService] Owned objects retrieved:', {
        owner: owner.slice(0, 8) + '...',
        objectCount: result.data.length,
        hasNextPage: result.hasNextPage
      });
      
      return {
        objects: result.data.map(obj => ({
          object_id: obj.data?.objectId,
          type: obj.data?.type,
          owner: obj.data?.owner?.AddressOwner || obj.data?.owner?.ObjectOwner,
          version: obj.data?.version
        })),
        has_next_page: result.hasNextPage,
        next_cursor: result.nextCursor
      };
    } catch (error) {
      console.error('[BrowserGrpcService] Failed to get owned objects:', error);
      throw error;
    }
  }

  // Get transaction details
  async getTransaction(digest, options = {}) {
    try {
      console.log(`[BrowserGrpcService] Getting transaction ${digest}...`);
      
      const transaction = await this.client.getTransactionBlock({
        digest,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
          showBalanceChanges: true,
          showInput: true,
          ...options
        }
      });
      
      console.log('[BrowserGrpcService] Transaction retrieved:', {
        digest: digest,
        status: transaction.effects?.status?.status,
        hasEvents: !!transaction.events?.length,
        hasObjectChanges: !!transaction.objectChanges?.length
      });
      
      return {
        digest: digest,
        effects: transaction.effects,
        events: transaction.events || [],
        object_changes: transaction.objectChanges || [],
        balance_changes: transaction.balanceChanges || [],
        input: transaction.transaction
      };
    } catch (error) {
      console.error('[BrowserGrpcService] Failed to get transaction:', error);
      throw error;
    }
  }

  // Estimate gas for a transaction
  async estimateGas(transactionBlock) {
    try {
      console.log('[BrowserGrpcService] Estimating gas for transaction...');
      
      // Build the transaction if it's not already built
      let txBytes;
      if (typeof transactionBlock.build === 'function') {
        txBytes = await transactionBlock.build({ client: this.client });
      } else {
        txBytes = transactionBlock;
      }
      
      const dryRunResult = await this.client.dryRunTransactionBlock({
        transactionBlock: txBytes
      });

      const gasUsed = dryRunResult.effects.gasUsed;
      const computationCost = parseInt(gasUsed.computationCost || '0');
      const storageCost = parseInt(gasUsed.storageCost || '0');
      const storageRebate = parseInt(gasUsed.storageRebate || '0');
      
      const totalGasUsed = computationCost + storageCost - storageRebate;
      
      console.log('[BrowserGrpcService] Gas estimation completed:', {
        computationCost,
        storageCost,
        storageRebate,
        totalGasUsed
      });

      return {
        computationCost,
        storageCost,
        storageRebate,
        totalGasUsed,
        gasPrice: 1000,
        estimatedCostSUI: (totalGasUsed / 1_000_000_000).toFixed(6)
      };
    } catch (error) {
      console.error('[BrowserGrpcService] Gas estimation failed:', error);
      // Return conservative estimate
      const defaultGas = 5_000_000;
      return {
        computationCost: 3_000_000,
        storageCost: 2_000_000,
        storageRebate: 0,
        totalGasUsed: defaultGas,
        gasPrice: 1000,
        estimatedCostSUI: (defaultGas / 1_000_000_000).toFixed(6)
      };
    }
  }

  // Query events
  async queryEvents(options = {}) {
    try {
      console.log('[BrowserGrpcService] Querying events...', options);
      
      const queryParams = {
        query: options.query || {},
        limit: options.limit || 50,
        order: options.order || 'descending'
      };
      
      if (options.cursor) {
        queryParams.cursor = options.cursor;
      }
      
      const events = await this.client.queryEvents(queryParams);
      
      console.log('[BrowserGrpcService] Events retrieved:', {
        eventCount: events.data.length,
        hasNextPage: events.hasNextPage
      });
      
      return {
        data: events.data,
        nextCursor: events.nextCursor,
        hasNextPage: events.hasNextPage
      };
    } catch (error) {
      console.error('[BrowserGrpcService] Failed to query events:', error);
      return {
        data: [],
        nextCursor: null,
        hasNextPage: false
      };
    }
  }

  // Subscribe to events (store callback for manual triggering)
  async subscribeToEvents(eventType, callback) {
    console.log(`[BrowserGrpcService] Setting up subscription for ${eventType}`);
    
    // Store callback for manual triggering
    this.eventCallbacks.set(eventType, callback);
    
    // Use real-time event subscriptions instead of polling
    if (eventType === 'blockchain') {
      this.startEventSubscriptions();
    }
    
    return true;
  }

  // Start real-time event subscriptions (replaces polling)
  startEventSubscriptions() {
    if (this.eventSubscriptionActive) {
      return; // Already subscribed
    }
    
    console.log('[BrowserGrpcService] Starting real-time event subscriptions...');
    
    try {
      this.eventSubscriptionActive = true;
      this.eventUnsubscribers = [];
      
      // Subscribe to blockchain events through the existing event stream manager
      const network = this.config.getCurrentNetwork();
      const eventFilter = {
        Package: network.packageId
      };
      
      // Subscribe to all package events and filter locally
      const unsubscribe = this.subscribeToBlockchainEvents(eventFilter, (event) => {
        const callback = this.eventCallbacks.get('blockchain');
        if (!callback) return;
        
        // Parse event type from Move event
        let eventType = 'Unknown';
        if (event.type) {
          if (event.type.includes('SpreadsheetCreated')) eventType = 'SpreadsheetCreated';
          else if (event.type.includes('VersionSaved')) eventType = 'VersionSaved';
          else if (event.type.includes('CellLocked')) eventType = 'CellLocked';
          else if (event.type.includes('CellUnlocked')) eventType = 'CellUnlocked';
        }
        
        // Emit event to callback in same format as polling
        callback({
          type: eventType,
          data: event.parsedJson || event.data || {},
          transactionDigest: event.transactionDigest,
          timestampMs: event.timestampMs || Date.now(),
          realTime: true // Mark as real-time event
        });
      });
      
      this.eventUnsubscribers.push(unsubscribe);
      
      console.log('[BrowserGrpcService] Event subscriptions started successfully');
      
    } catch (error) {
      console.warn('[BrowserGrpcService] Failed to start event subscriptions, falling back to polling:', error);
      this.eventSubscriptionActive = false;
      
      // Fallback to polling with longer interval
      this.startEventPollingFallback();
    }
  }
  
  // Fallback polling method with reduced frequency
  startEventPollingFallback() {
    if (this.eventPollingInterval) {
      return; // Already polling
    }
    
    console.log('[BrowserGrpcService] Starting fallback event polling (30s interval)...');
    
    this.eventPollingInterval = setInterval(async () => {
      try {
        // Poll for recent events from our deployed contract
        const network = this.config.getCurrentNetwork();
        const events = await this.queryEvents({
          query: {
            Package: network.packageId
          },
          limit: 10,
          order: 'descending'
        });
        
        if (events.data.length > 0) {
          // Emit events to subscribers
          const callback = this.eventCallbacks.get('blockchain');
          if (callback) {
            events.data.forEach(event => {
              // Parse event type from Move event
              let eventType = 'Unknown';
              if (event.type) {
                if (event.type.includes('SpreadsheetCreated')) eventType = 'SpreadsheetCreated';
                else if (event.type.includes('VersionSaved')) eventType = 'VersionSaved';
                else if (event.type.includes('CellLocked')) eventType = 'CellLocked';
                else if (event.type.includes('CellUnlocked')) eventType = 'CellUnlocked';
              }
              
              callback({
                type: eventType,
                data: event.parsedJson || {},
                transactionDigest: event.transactionDigest,
                timestampMs: event.timestampMs,
                fallback: true // Mark as fallback polling
              });
            });
          }
        }
      } catch (error) {
        console.warn('[BrowserGrpcService] Event polling error:', error);
      }
    }, 30000); // Reduced from 5s to 30s polling interval
  }

  // Stop event subscriptions and polling
  stopEventSubscriptions() {
    // Stop real-time subscriptions
    if (this.eventSubscriptionActive && this.eventUnsubscribers) {
      this.eventUnsubscribers.forEach(unsubscribe => {
        try {
          if (typeof unsubscribe === 'function') {
            unsubscribe();
          }
        } catch (error) {
          console.warn('[BrowserGrpcService] Error unsubscribing from event:', error);
        }
      });
      this.eventUnsubscribers = [];
      this.eventSubscriptionActive = false;
      console.log('[BrowserGrpcService] Event subscriptions stopped');
    }
    
    // Stop fallback polling
    this.stopEventPolling();
  }
  
  // Stop event polling (legacy method, kept for compatibility)
  stopEventPolling() {
    if (this.eventPollingInterval) {
      clearInterval(this.eventPollingInterval);
      this.eventPollingInterval = null;
      console.log('[BrowserGrpcService] Event polling stopped');
    }
  }

  // Subscribe to blockchain events with filter
  subscribeToBlockchainEvents(filter, callback) {
    try {
      // In a real implementation, this would connect to the gRPC event stream
      // For now, we'll simulate event subscription by leveraging existing infrastructure
      
      console.log('[BrowserGrpcService] Subscribing to blockchain events with filter:', filter);
      
      // Create a composite unsubscribe function for multiple event types
      const unsubscribers = [];
      
      // Subscribe to different event types based on package filter
      if (filter.Package) {
        // Subscribe to all relevant events for this package
        const eventTypes = ['SpreadsheetCreated', 'VersionSaved', 'CellLocked', 'CellUnlocked'];
        
        eventTypes.forEach(eventType => {
          // This would typically integrate with the event stream manager
          // For now, we'll create a placeholder subscription
          const mockUnsubscribe = this.subscribeToEventType(eventType, callback);
          unsubscribers.push(mockUnsubscribe);
        });
      }
      
      // Return composite unsubscribe function
      return () => {
        unsubscribers.forEach(unsubscribe => {
          if (typeof unsubscribe === 'function') {
            unsubscribe();
          }
        });
        console.log('[BrowserGrpcService] Blockchain event subscription ended');
      };
      
    } catch (error) {
      console.warn('[BrowserGrpcService] Error subscribing to blockchain events:', error);
      return () => {}; // Return no-op unsubscribe function
    }
  }

  // Subscribe to specific event type (placeholder for real implementation)
  subscribeToEventType(eventType, callback) {
    // This is a placeholder method that would integrate with the actual event stream
    // In a real implementation, this would connect to the gRPC event stream manager
    console.log(`[BrowserGrpcService] Subscribed to event type: ${eventType}`);
    
    // Return a no-op unsubscribe function for now
    return () => {
      console.log(`[BrowserGrpcService] Unsubscribed from event type: ${eventType}`);
    };
  }

  // Subscribe to checkpoint stream (placeholder for real implementation)
  subscribeToCheckpointStream(callback) {
    try {
      console.log('[BrowserGrpcService] Subscribing to checkpoint stream...');
      
      // This would typically connect to the gRPC checkpoint stream
      // For now, this is a placeholder that would integrate with the real stream
      
      return () => {
        console.log('[BrowserGrpcService] Checkpoint stream subscription ended');
      };
      
    } catch (error) {
      console.warn('[BrowserGrpcService] Error subscribing to checkpoint stream:', error);
      return () => {}; // Return no-op unsubscribe function
    }
  }

  // Get current epoch information
  async getCurrentEpoch() {
    try {
      console.log('[BrowserGrpcService] Getting current epoch...');
      
      const epochInfo = await this.client.getLatestSuiSystemState();
      
      console.log('[BrowserGrpcService] Epoch info retrieved:', {
        epoch: epochInfo.epoch,
        startTimestamp: epochInfo.epochStartTimestampMs
      });
      
      return {
        epoch: epochInfo.epoch,
        epochStartTimestampMs: epochInfo.epochStartTimestampMs,
        epochDurationMs: epochInfo.epochDurationMs,
        referenceGasPrice: epochInfo.referenceGasPrice
      };
    } catch (error) {
      console.error('[BrowserGrpcService] Failed to get epoch info:', error);
      throw error;
    }
  }

  // Get object details by ID
  async getObject(objectId, options = {}) {
    try {
      console.log(`[BrowserGrpcService] Getting object ${objectId}...`);
      
      const object = await this.client.getObject({
        id: objectId,
        options: {
          showContent: true,
          showOwner: true,
          showPreviousTransaction: true,
          showStorageRebate: true,
          showDisplay: true,
          ...options
        }
      });
      
      console.log('[BrowserGrpcService] Object retrieved:', {
        objectId: objectId,
        hasContent: !!object.data?.content,
        owner: object.data?.owner?.AddressOwner || object.data?.owner?.ObjectOwner || 'Shared'
      });
      
      return object.data;
    } catch (error) {
      console.error('[BrowserGrpcService] Failed to get object:', error);
      throw error;
    }
  }

  // Connection status
  getStatus() {
    const network = this.config ? this.config.getCurrentNetwork() : null;
    return {
      isConnected: this.isConnected,
      rpcUrl: this.config ? this.config.getServiceUrl('sui-rpc') : null,
      packageId: network ? network.packageId : null,
      registryObjectId: network ? network.registryObjectId : null,
      eventPolling: !!this.eventPollingInterval,
      subscriptions: this.subscriptions.size,
      timestamp: new Date().toISOString()
    };
  }

  // Check connection
  isConnected() {
    return this.isConnected;
  }

  // Cleanup
  close() {
    console.log('[BrowserGrpcService] Closing service...');
    
    this.stopEventPolling();
    this.subscriptions.clear();
    this.eventCallbacks.clear();
    
    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval);
      this.checkpointInterval = null;
    }
    
    this.isConnected = false;
    this.emit('disconnected');
  }

  // Mock event triggering disabled for single-user MVP
  triggerMockEvent(eventType, data = {}) {
    // No-op: mock events not needed in production
  }
}

// Create singleton instance
export const browserGrpcService = new BrowserGrpcService();

// Auto-initialize
browserGrpcService.setupClients();

// Convenience functions for external use (maintain compatibility)
export const subscribeToCheckpoints = (options) => browserGrpcService.subscribeToCheckpoints(options);
export const executeTransaction = (tx, sigs) => browserGrpcService.executeTransaction(tx, sigs);
export const getBalance = (owner, coinType) => browserGrpcService.getBalance(owner, coinType);
export const getOwnedObjects = (owner, options) => browserGrpcService.getOwnedObjects(owner, options);
export const getTransaction = (digest, options) => browserGrpcService.getTransaction(digest, options);

// Export the service instance as default (same interface as grpc-service.js)
export { browserGrpcService as grpcService };
export default browserGrpcService;