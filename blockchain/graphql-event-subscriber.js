// GraphQL event subscriber for checkpoint event fallback
import { getCurrentConfig } from './config.js';

export class GraphQLEventSubscriber {
  constructor() {
    this.config = getCurrentConfig();
    this.graphqlUrl = this.config.sui.graphqlUrl;
    this.isActive = false;
    this.pollInterval = null;
    this.pollIntervalMs = 3000; // 3 seconds
    this.lastCheckpoint = null;
    this.backoffMultiplier = 1;
    this.maxBackoffMultiplier = 8;
    this.eventCallbacks = new Map();

    console.log('[GraphQLEventSubscriber] Initialized with GraphQL URL:', this.graphqlUrl);
  }

  /**
   * Start polling for recent events via GraphQL
   */
  start() {
    if (this.isActive) {
      console.warn('[GraphQLEventSubscriber] Already active, ignoring start request');
      return;
    }

    this.isActive = true;
    this.backoffMultiplier = 1;
    console.log('[GraphQLEventSubscriber] Starting GraphQL event polling');

    this.pollInterval = setInterval(() => {
      this.pullRecentEvents().catch(error => {
        console.error('[GraphQLEventSubscriber] Error during event polling:', error.message);
        this.handleError(error);
      });
    }, this.pollIntervalMs * this.backoffMultiplier);
  }

  /**
   * Stop polling for events
   */
  stop() {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    console.log('[GraphQLEventSubscriber] Stopped GraphQL event polling');
  }

  /**
   * Register callback for specific event types
   * @param {string} eventType - Event type to listen for
   * @param {Function} callback - Callback function
   */
  on(eventType, callback) {
    if (!this.eventCallbacks.has(eventType)) {
      this.eventCallbacks.set(eventType, new Set());
    }
    this.eventCallbacks.get(eventType).add(callback);
  }

  /**
   * Remove callback for specific event types
   * @param {string} eventType - Event type
   * @param {Function} callback - Callback function
   */
  off(eventType, callback) {
    if (this.eventCallbacks.has(eventType)) {
      this.eventCallbacks.get(eventType).delete(callback);
    }
  }

  /**
   * Pull recent events from GraphQL endpoint
   */
  async pullRecentEvents() {
    try {
      // Query both events and checkpoint data
      const [eventsResult, checkpointsResult] = await Promise.all([
        this.queryEvents(),
        this.queryCheckpoints()
      ]);

      // Process events
      if (eventsResult.data?.events?.nodes) {
        this.processEvents(eventsResult.data.events.nodes);
      }

      // Process checkpoints
      if (checkpointsResult.data?.checkpoints?.nodes) {
        this.processCheckpoints(checkpointsResult.data.checkpoints.nodes);
      }

      this.resetBackoff(); // Reset backoff on successful poll

    } catch (error) {
      console.error('[GraphQLEventSubscriber] Failed to pull events:', error.message);
      throw error;
    }
  }

  /**
   * Query events from GraphQL
   */
  async queryEvents() {
    const query = this.buildEventQuery();
    const response = await fetch(this.graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(`GraphQL errors: ${result.errors.map(e => e.message).join(', ')}`);
    }

    return result;
  }

  /**
   * Query recent checkpoints from GraphQL
   */
  async queryCheckpoints() {
    const query = this.buildCheckpointQuery();
    const response = await fetch(this.graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      throw new Error(`GraphQL checkpoint request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(`GraphQL checkpoint errors: ${result.errors.map(e => e.message).join(', ')}`);
    }

    return result;
  }

  /**
   * Build GraphQL query for recent events
   */
  buildEventQuery() {
    const packageId = this.config.sui.packageId;

    return `
      query RecentEvents {
        events(
          first: 20
          filter: {
            emittingModule: "${packageId}::spreadsheet"
          }
        ) {
          nodes {
            contents {
              type {
                repr
              }
              json
            }
            timestamp
            bcs
            transactionBlock {
              digest
              effects {
                checkpoint {
                  sequenceNumber
                }
              }
            }
          }
        }
      }
    `;
  }

  /**
   * Build GraphQL query for recent checkpoints
   */
  buildCheckpointQuery() {
    const afterSequence = this.lastCheckpoint || 0;

    return `
      query RecentCheckpoints {
        checkpoints(
          first: 10
        ) {
          nodes {
            sequenceNumber
            timestamp
            transactionBlocks {
              nodes {
                digest
              }
            }
            epoch {
              epochId
            }
            validatorSignatures
            networkTotalTransactions
          }
        }
      }
    `;
  }

  /**
   * Process events and emit to registered callbacks
   * @param {Array} events - Array of events from GraphQL
   */
  processEvents(events) {
    if (!events || events.length === 0) {
      return;
    }

    for (const event of events) {
      try {
        const eventType = this.extractEventType(event);

        if (eventType) {
          // Update last checkpoint if available
          const checkpoint = event.transactionBlock?.effects?.checkpoint?.sequenceNumber;
          if (checkpoint && (!this.lastCheckpoint || checkpoint > this.lastCheckpoint)) {
            this.lastCheckpoint = checkpoint;
          }

          // Emit to registered callbacks
          this.emitEvent(eventType, {
            type: eventType,
            data: this.parseEventContents(event.contents?.json),
            bcs: event.bcs,
            timestamp: event.timestamp,
            transactionDigest: event.transactionBlock?.digest,
            checkpoint: checkpoint
          });
        }
      } catch (error) {
        console.warn('[GraphQLEventSubscriber] Failed to process event:', error.message);
      }
    }

    console.log(`[GraphQLEventSubscriber] Processed ${events.length} events, last checkpoint: ${this.lastCheckpoint}`);
  }

  /**
   * Process checkpoints and emit checkpoint events
   * @param {Array} checkpoints - Array of checkpoints from GraphQL
   */
  processCheckpoints(checkpoints) {
    if (!checkpoints || checkpoints.length === 0) {
      return;
    }

    for (const checkpoint of checkpoints) {
      try {
        const sequenceNumber = parseInt(checkpoint.sequenceNumber);

        // Update last checkpoint if this is newer
        if (!this.lastCheckpoint || sequenceNumber > this.lastCheckpoint) {
          this.lastCheckpoint = sequenceNumber;

          // Emit checkpoint event similar to gRPC stream format
          this.emitEvent('checkpoint', {
            type: 'checkpoint',
            data: {
              sequenceNumber: sequenceNumber,
              timestamp: checkpoint.timestamp || Date.now(),
              transactionCount: checkpoint.transactionBlocks?.nodes?.length || 0,
              networkTotalTransactions: checkpoint.networkTotalTransactions ? parseInt(checkpoint.networkTotalTransactions) : 0,
              epoch: checkpoint.epoch?.epochId ? parseInt(checkpoint.epoch.epochId) : 0,
              source: 'graphql'
            },
            checkpoint: sequenceNumber,
            timestamp: checkpoint.timestamp || Date.now()
          });
        }
      } catch (error) {
        console.warn('[GraphQLEventSubscriber] Failed to process checkpoint:', error.message);
      }
    }

    console.log(`[GraphQLEventSubscriber] Processed ${checkpoints.length} checkpoints, current: ${this.lastCheckpoint}`);
  }

  /**
   * Extract event type from GraphQL event
   * @param {Object} event - GraphQL event object
   * @returns {string|null} - Event type or null
   */
  extractEventType(event) {
    const typeRepr = event.contents?.type?.repr;
    if (!typeRepr) return null;

    // Extract event name from type representation
    // Example: "0x123::walsheetz::VersionSaved" -> "VersionSaved"
    const parts = typeRepr.split('::');
    if (parts.length >= 3) {
      return parts[parts.length - 1];
    }

    return null;
  }

  parseEventContents(contents) {
    if (!contents) return {};

    if (typeof contents === 'string') {
      try {
        return JSON.parse(contents);
      } catch {
        return { raw: contents };
      }
    }

    return contents;
  }

  /**
   * Emit event to registered callbacks
   * @param {string} eventType - Event type
   * @param {Object} eventData - Event data
   */
  emitEvent(eventType, eventData) {
    if (this.eventCallbacks.has(eventType)) {
      for (const callback of this.eventCallbacks.get(eventType)) {
        try {
          callback(eventData);
        } catch (error) {
          console.error(`[GraphQLEventSubscriber] Error in callback for ${eventType}:`, error.message);
        }
      }
    }

    // Also emit to 'all' listeners
    if (this.eventCallbacks.has('all')) {
      for (const callback of this.eventCallbacks.get('all')) {
        try {
          callback(eventData);
        } catch (error) {
          console.error('[GraphQLEventSubscriber] Error in all-events callback:', error.message);
        }
      }
    }
  }

  /**
   * Handle errors and implement backoff
   * @param {Error} error - Error that occurred
   */
  handleError(error) {
    // Increase backoff multiplier
    this.backoffMultiplier = Math.min(this.backoffMultiplier * 2, this.maxBackoffMultiplier);

    console.warn(`[GraphQLEventSubscriber] Error handled, backing off to ${this.pollIntervalMs * this.backoffMultiplier}ms`);

    // Restart with new interval
    if (this.isActive) {
      this.stop();
      setTimeout(() => {
        if (this.isActive) { // Check if still should be active
          this.start();
        }
      }, this.pollIntervalMs * this.backoffMultiplier);
    }
  }

  /**
   * Reset backoff to normal interval
   */
  resetBackoff() {
    if (this.backoffMultiplier > 1) {
      console.log('[GraphQLEventSubscriber] Resetting backoff to normal interval');
      this.backoffMultiplier = 1;

      // Restart with normal interval if needed
      if (this.isActive) {
        this.stop();
        this.start();
      }
    }
  }

  /**
   * Get current status
   * @returns {Object} - Status object
   */
  getStatus() {
    return {
      isActive: this.isActive,
      lastCheckpoint: this.lastCheckpoint,
      backoffMultiplier: this.backoffMultiplier,
      pollIntervalMs: this.pollIntervalMs * this.backoffMultiplier,
      registeredCallbacks: Object.fromEntries(
        Array.from(this.eventCallbacks.entries()).map(([type, callbacks]) => [type, callbacks.size])
      )
    };
  }
}