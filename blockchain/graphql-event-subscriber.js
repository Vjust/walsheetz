// GraphQL event subscriber for checkpoint event fallback
import { getCurrentConfig } from './config.js';

// Simple logger for GraphQL subscriber
class GraphQLLogger {
  constructor() {
    this.logLevel = process.env.BRIDGE_LOG_LEVEL || 'INFO';
    this.logLevels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
  }

  shouldLog(level) {
    return this.logLevels[level] >= this.logLevels[this.logLevel];
  }

  debug(message) {
    if (this.shouldLog('DEBUG')) {
      console.debug(`🔍 [GraphQLEventSubscriber] ${message}`);
    }
  }

  info(message) {
    if (this.shouldLog('INFO')) {
      console.info(`ℹ️ [GraphQLEventSubscriber] ${message}`);
    }
  }

  warn(message) {
    if (this.shouldLog('WARN')) {
      console.warn(`⚠️ [GraphQLEventSubscriber] ${message}`);
    }
  }

  error(message) {
    if (this.shouldLog('ERROR')) {
      console.error(`❌ [GraphQLEventSubscriber] ${message}`);
    }
  }
}

const gqlLogger = new GraphQLLogger();

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

    // Deduplication caches to prevent replay
    this.seenEventDigests = new Set();
    this.seenCheckpoints = new Set();
    this.maxCacheSize = 1000; // Prevent memory leak

    gqlLogger.debug(`Initialized with GraphQL URL: ${this.graphqlUrl}`);
  }

  /**
   * Start polling for recent events via GraphQL
   * @param {number} fromCheckpoint - Optional starting checkpoint to seed lastCheckpoint
   */
  start(fromCheckpoint = null) {
    if (this.isActive) {
      gqlLogger.warn('Already active, ignoring start request');
      return;
    }

    this.isActive = true;

    // Seed lastCheckpoint from gRPC cursor if provided
    if (fromCheckpoint !== null && fromCheckpoint !== undefined) {
      this.lastCheckpoint = fromCheckpoint;
      gqlLogger.info(`Starting from checkpoint ${fromCheckpoint}`);
    }

    // Only reset backoff on first start - preserve backoff multiplier during restarts
    if (!this.hasOwnProperty('backoffMultiplier') || this.backoffMultiplier === undefined) {
      this.backoffMultiplier = 1;
    }

    gqlLogger.info(`GraphQL event polling active (${this.pollIntervalMs * this.backoffMultiplier}ms interval)`);

    this.pollInterval = setInterval(() => {
      this.pullRecentEvents().catch(error => {
        gqlLogger.error(`Error during event polling: ${error.message}`);
        this.handleError(error);
      });
    }, this.pollIntervalMs * this.backoffMultiplier);
  }

  /**
   * Stop polling for events
   */
  stop() {
    if (!this.isActive && !this.shouldRestart) {
      return;
    }

    this.isActive = false;
    this.shouldRestart = false; // Cancel any pending restarts

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    gqlLogger.info('Stopped GraphQL event polling');
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

      this.resetBackoffMultiplier(); // Reset backoff multiplier on successful poll

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

    // Build incremental filter to only fetch events after lastCheckpoint
    const checkpointFilter = this.lastCheckpoint
      ? `, checkpoint: { sequenceNumber: { greaterThan: "${this.lastCheckpoint}" } }`
      : '';

    return `
      query RecentEvents {
        events(
          first: 20
          filter: {
            emittingModule: "${packageId}::spreadsheet"${checkpointFilter}
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
    // Build incremental filter to only fetch checkpoints after lastCheckpoint
    const checkpointFilter = this.lastCheckpoint
      ? `filter: { sequenceNumber: { greaterThan: "${this.lastCheckpoint}" } }`
      : '';

    return `
      query RecentCheckpoints {
        checkpoints(
          first: 10
          ${checkpointFilter}
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

    let newEventCount = 0;

    for (const event of events) {
      try {
        const checkpoint = event.transactionBlock?.effects?.checkpoint?.sequenceNumber;
        const digest = event.transactionBlock?.digest;

        // Skip events at or before lastCheckpoint
        if (checkpoint && this.lastCheckpoint && checkpoint <= this.lastCheckpoint) {
          continue;
        }

        // Skip duplicate events by digest
        if (digest && this.seenEventDigests.has(digest)) {
          continue;
        }

        const eventType = this.extractEventType(event);

        if (eventType) {
          // Update last checkpoint if available
          if (checkpoint && (!this.lastCheckpoint || checkpoint > this.lastCheckpoint)) {
            this.lastCheckpoint = checkpoint;
          }

          // Mark digest as seen
          if (digest) {
            this.seenEventDigests.add(digest);
            this.trimCache(this.seenEventDigests);
          }

          // Emit to registered callbacks
          this.emitEvent(eventType, {
            type: eventType,
            data: this.parseEventContents(event.contents?.json),
            bcs: event.bcs,
            timestamp: event.timestamp,
            transactionDigest: digest,
            checkpoint: checkpoint
          });

          newEventCount++;
        }
      } catch (error) {
        gqlLogger.warn(`Failed to process event: ${error.message}`);
      }
    }

    // Only log if we actually processed new events
    if (newEventCount > 0) {
      gqlLogger.info(`Processed ${newEventCount} new events, checkpoint: ${this.lastCheckpoint}`);
    }
  }

  /**
   * Process checkpoints and emit checkpoint events
   * @param {Array} checkpoints - Array of checkpoints from GraphQL
   */
  processCheckpoints(checkpoints) {
    if (!checkpoints || checkpoints.length === 0) {
      return;
    }

    let newCheckpointCount = 0;

    for (const checkpoint of checkpoints) {
      try {
        const sequenceNumber = parseInt(checkpoint.sequenceNumber);

        // Skip checkpoints at or before lastCheckpoint
        if (this.lastCheckpoint && sequenceNumber <= this.lastCheckpoint) {
          continue;
        }

        // Skip duplicate checkpoints
        if (this.seenCheckpoints.has(sequenceNumber)) {
          continue;
        }

        // Update last checkpoint if this is newer
        if (!this.lastCheckpoint || sequenceNumber > this.lastCheckpoint) {
          this.lastCheckpoint = sequenceNumber;

          // Mark checkpoint as seen
          this.seenCheckpoints.add(sequenceNumber);
          this.trimCache(this.seenCheckpoints);

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

          newCheckpointCount++;
        }
      } catch (error) {
        gqlLogger.warn(`Failed to process checkpoint: ${error.message}`);
      }
    }

    // Only log if we actually processed new checkpoints
    if (newCheckpointCount > 0) {
      gqlLogger.debug(`Processed ${newCheckpointCount} new checkpoints, current: ${this.lastCheckpoint}`);
    }
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
   * Trim cache to prevent memory leak
   * @param {Set} cache - Cache to trim
   */
  trimCache(cache) {
    if (cache.size > this.maxCacheSize) {
      // Convert to array, remove oldest items, convert back
      const items = Array.from(cache);
      const toRemove = items.slice(0, items.length - this.maxCacheSize);
      toRemove.forEach(item => cache.delete(item));
    }
  }

  /**
   * Handle errors and implement backoff
   * @param {Error} error - Error that occurred
   */
  handleError(error) {
    // Increase backoff multiplier
    this.backoffMultiplier = Math.min(this.backoffMultiplier * 2, this.maxBackoffMultiplier);

    gqlLogger.warn(`Error handled, backing off to ${this.pollIntervalMs * this.backoffMultiplier}ms`);

    // Restart with new interval - preserve active state across stop/start
    if (this.isActive) {
      this.stop();

      // Set a flag to indicate we should restart
      this.shouldRestart = true;
      const delay = this.pollIntervalMs * this.backoffMultiplier;

      setTimeout(() => {
        if (this.shouldRestart) {
          this.shouldRestart = false;
          this.isActive = true;
          this.start();
        }
      }, delay);
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
        this.shouldRestart = true;

        setTimeout(() => {
          if (this.shouldRestart) {
            this.shouldRestart = false;
            this.isActive = true;
            this.start();
          }
        }, 0); // Restart immediately with normal interval
      }
    }
  }

  /**
   * Reset backoff multiplier without restarting the poller
   */
  resetBackoffMultiplier() {
    if (this.backoffMultiplier > 1) {
      console.log('[GraphQLEventSubscriber] Resetting backoff multiplier to normal');
      this.backoffMultiplier = 1;
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