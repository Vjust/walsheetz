/**
 * Minimal EventBus for Transaction Events
 *
 * A lightweight, focused event bus specifically for transaction lifecycle events
 * in WalSheetz. This replaces scattered event handling with a centralized,
 * validated event system.
 *
 * Features:
 * - Event validation and sanitization at entry point
 * - Type-safe event schema definitions
 * - Automatic cleanup and memory management
 * - Debug logging integration
 * - Circular reference prevention
 *
 * Scope: ONLY transaction/save events initially
 * Future: Can be extended for other event types as needed
 */

import { logger, LogComponent } from "./Logger.js";

/**
 * Event schemas for validation
 */
const EVENT_SCHEMAS = {
  // Transaction lifecycle events
  'transaction:start': {
    required: ['spreadsheetId', 'transactionId', 'transactionType'],
    optional: ['metadata'],
    types: {
      spreadsheetId: 'string',
      transactionId: 'string',
      transactionType: 'string',
      metadata: 'object'
    }
  },

  'transaction:state_change': {
    required: ['spreadsheetId', 'transactionId', 'oldState', 'newState'],
    optional: ['metadata'],
    types: {
      spreadsheetId: 'string',
      transactionId: 'string',
      oldState: 'string',
      newState: 'string',
      metadata: 'object'
    }
  },

  'transaction:complete': {
    required: ['spreadsheetId', 'transactionId', 'duration'],
    optional: ['result'],
    types: {
      spreadsheetId: 'string',
      transactionId: 'string',
      duration: 'number',
      result: 'object'
    }
  },

  'transaction:failed': {
    required: ['spreadsheetId', 'transactionId', 'error'],
    optional: ['duration', 'failureCount', 'recovery'],
    types: {
      spreadsheetId: 'string',
      transactionId: 'string',
      error: 'object',
      duration: 'number',
      failureCount: 'number',
      recovery: 'object'
    }
  },

  'transaction:timeout': {
    required: ['spreadsheetId', 'elapsed'],
    optional: ['lastTransaction'],
    types: {
      spreadsheetId: 'string',
      elapsed: 'number',
      lastTransaction: 'object'
    }
  },

  // Save operation events
  'save:start': {
    required: ['spreadsheetId', 'saveId'],
    optional: ['dataSize', 'cellCount', 'options'],
    types: {
      spreadsheetId: 'string',
      saveId: 'string',
      dataSize: 'number',
      cellCount: 'number',
      options: 'object'
    }
  },

  'save:walrus_complete': {
    required: ['spreadsheetId', 'saveId', 'blobId'],
    optional: ['size', 'duration'],
    types: {
      spreadsheetId: 'string',
      saveId: 'string',
      blobId: 'string',
      size: 'number',
      duration: 'number'
    }
  },

  'save:blockchain_complete': {
    required: ['spreadsheetId', 'saveId', 'transactionDigest'],
    optional: ['gasUsed', 'duration'],
    types: {
      spreadsheetId: 'string',
      saveId: 'string',
      transactionDigest: 'string',
      gasUsed: 'number',
      duration: 'number'
    }
  },

  'save:complete': {
    required: ['spreadsheetId', 'saveId', 'success'],
    optional: ['totalDuration', 'result'],
    types: {
      spreadsheetId: 'string',
      saveId: 'string',
      success: 'boolean',
      totalDuration: 'number',
      result: 'object'
    }
  },

  'save:failed': {
    required: ['spreadsheetId', 'saveId', 'error'],
    optional: ['stage', 'recovery'],
    types: {
      spreadsheetId: 'string',
      saveId: 'string',
      error: 'object',
      stage: 'string',
      recovery: 'object'
    }
  },

  // Cell edit events
  'cell:edit_start': {
    required: ['spreadsheetId', 'cellRef'],
    optional: ['userId', 'oldValue'],
    types: {
      spreadsheetId: 'string',
      cellRef: 'string',
      userId: 'string',
      oldValue: ['string', 'number', 'boolean', 'null', 'undefined']
    }
  },

  'cell:edit_complete': {
    required: ['spreadsheetId', 'cellRef', 'newValue'],
    optional: ['userId', 'oldValue'],
    types: {
      spreadsheetId: 'string',
      cellRef: 'string',
      newValue: ['string', 'number', 'boolean', 'null', 'undefined'],
      userId: 'string',
      oldValue: ['string', 'number', 'boolean', 'null', 'undefined']
    }
  }
};

/**
 * Main EventBus class
 */
export class EventBus {
  constructor(options = {}) {
    this.listeners = new Map(); // Map<event, Set<handler>>
    this.eventHistory = []; // For debugging
    this.maxHistorySize = options.maxHistorySize || 100;
    this.validateEvents = options.validateEvents !== false; // Default to true
    this.logEvents = options.logEvents !== false; // Default to true
    this.name = options.name || 'EventBus';

    // Stats for monitoring
    this.stats = {
      totalEvents: 0,
      validationErrors: 0,
      eventsPerType: new Map(),
      listenersPerType: new Map()
    };

    if (this.logEvents) {
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_init',
      `EventBus initialized: ${this.name}`, {
        validateEvents: this.validateEvents,
        maxHistorySize: this.maxHistorySize
      });
    }
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {function} handler - Event handler function
   * @param {object} options - Subscription options
   * @returns {function} Unsubscribe function
   */
  on(event, handler, options = {}) {
    if (typeof event !== 'string' || !event) {
      throw new Error('Event name must be a non-empty string');
    }

    if (typeof handler !== 'function') {
      throw new Error('Event handler must be a function');
    }

    // Validate event type is supported
    if (this.validateEvents && !this._isValidEventType(event)) {
      logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_unknown_event',
      `Subscribing to unknown event type: ${event}`, { event });
    }

    // Initialize listeners set for this event
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
      this.stats.listenersPerType.set(event, 0);
    }

    // Add handler with metadata
    const handlerWithMeta = {
      handler,
      subscribedAt: Date.now(),
      callCount: 0,
      lastCalled: null,
      options
    };

    this.listeners.get(event).add(handlerWithMeta);
    this.stats.listenersPerType.set(event, this.listeners.get(event).size);

    if (this.logEvents) {
      logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_subscribe',
      `Subscribed to event: ${event}`, {
        event,
        listenerCount: this.listeners.get(event).size,
        options
      });
    }

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(event);
      if (listeners) {
        listeners.delete(handlerWithMeta);
        this.stats.listenersPerType.set(event, listeners.size);

        if (listeners.size === 0) {
          this.listeners.delete(event);
          this.stats.listenersPerType.delete(event);
        }

        if (this.logEvents) {
          logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_unsubscribe',
          `Unsubscribed from event: ${event}`, {
            event,
            remainingListeners: listeners.size
          });
        }
      }
    };
  }

  /**
   * Subscribe to an event only once
   * @param {string} event - Event name
   * @param {function} handler - Event handler function
   * @param {object} options - Subscription options
   * @returns {function} Unsubscribe function
   */
  once(event, handler, options = {}) {
    const unsubscribe = this.on(event, (data) => {
      unsubscribe();
      handler(data);
    }, { ...options, once: true });

    return unsubscribe;
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {object} data - Event data
   * @param {object} options - Emission options
   */
  emit(event, data = {}, options = {}) {
    if (typeof event !== 'string' || !event) {
      throw new Error('Event name must be a non-empty string');
    }

    // Validate event data if validation is enabled
    if (this.validateEvents) {
      const validation = this._validateEventData(event, data);
      if (!validation.valid) {
        this.stats.validationErrors++;
        logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_validation_error',
        `Event validation failed: ${event}`, {
          event,
          errors: validation.errors,
          data: this._sanitizeDataForLogging(data)
        });

        if (options.strict !== false) {
          throw new Error(`Event validation failed for ${event}: ${validation.errors.join(', ')}`);
        }
      }
    }

    // Update stats
    this.stats.totalEvents++;
    if (!this.stats.eventsPerType.has(event)) {
      this.stats.eventsPerType.set(event, 0);
    }
    this.stats.eventsPerType.set(event, this.stats.eventsPerType.get(event) + 1);

    // Add to history for debugging
    const eventRecord = {
      event,
      data: this._sanitizeDataForLogging(data),
      timestamp: Date.now(),
      listeners: this.listeners.has(event) ? this.listeners.get(event).size : 0
    };

    this.eventHistory.push(eventRecord);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Emit to listeners
    const listeners = this.listeners.get(event);
    if (listeners && listeners.size > 0) {
      if (this.logEvents) {
        logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_emit',
        `Emitting event: ${event}`, {
          event,
          listenerCount: listeners.size,
          data: this._sanitizeDataForLogging(data)
        });
      }

      // Call each handler
      listeners.forEach((handlerWithMeta) => {
        try {
          handlerWithMeta.callCount++;
          handlerWithMeta.lastCalled = Date.now();
          handlerWithMeta.handler(data, event);
        } catch (error) {
          logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_handler_error',
          `Error in event handler for ${event}`, {
            event,
            error: error.message,
            stack: error.stack,
            handlerCallCount: handlerWithMeta.callCount
          });

          // Don't let one handler failure stop others
          if (options.stopOnError) {
            throw error;
          }
        }
      });
    } else if (this.logEvents) {
      logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_emit_no_listeners',
      `No listeners for event: ${event}`, { event });
    }
  }

  /**
   * Remove all listeners for an event or all events
   * @param {string} [event] - Specific event to clear, or undefined for all
   */
  removeAllListeners(event = null) {
    if (event) {
      this.listeners.delete(event);
      this.stats.listenersPerType.delete(event);
      if (this.logEvents) {
        logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_clear_event',
        `Cleared all listeners for event: ${event}`, { event });
      }
    } else {
      this.listeners.clear();
      this.stats.listenersPerType.clear();
      if (this.logEvents) {
        logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_clear_all',
        'Cleared all event listeners');
      }
    }
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      ...this.stats,
      activeListeners: this.listeners.size,
      eventHistorySize: this.eventHistory.length,
      supportedEvents: Object.keys(EVENT_SCHEMAS)
    };
  }

  /**
   * Get event history for debugging
   */
  getEventHistory(eventType = null, limit = null) {
    let history = eventType ?
    this.eventHistory.filter((record) => record.event === eventType) :
    this.eventHistory;

    if (limit) {
      history = history.slice(-limit);
    }

    return history;
  }

  /**
   * Get listeners for an event
   */
  getListeners(event) {
    const listeners = this.listeners.get(event);
    if (!listeners) return [];

    return Array.from(listeners).map((handlerWithMeta) => ({
      subscribedAt: handlerWithMeta.subscribedAt,
      callCount: handlerWithMeta.callCount,
      lastCalled: handlerWithMeta.lastCalled,
      options: handlerWithMeta.options
    }));
  }

  /**
   * Check if event type is supported
   */
  _isValidEventType(event) {
    return EVENT_SCHEMAS.hasOwnProperty(event);
  }

  /**
   * Validate event data against schema
   */
  _validateEventData(event, data) {
    const schema = EVENT_SCHEMAS[event];
    if (!schema) {
      return { valid: true, errors: [] }; // Unknown events pass validation
    }

    const errors = [];

    // Check required fields
    for (const field of schema.required) {
      if (!(field in data)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Check field types
    for (const [field, value] of Object.entries(data)) {
      const expectedType = schema.types[field];
      if (expectedType) {
        if (!this._isValidType(value, expectedType)) {
          errors.push(`Invalid type for ${field}: expected ${expectedType}, got ${typeof value}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Type validation helper
   */
  _isValidType(value, expectedType) {
    if (Array.isArray(expectedType)) {
      return expectedType.includes(typeof value) ||
      expectedType.includes('null') && value === null ||
      expectedType.includes('undefined') && value === undefined;
    }

    if (expectedType === 'null') return value === null;
    if (expectedType === 'undefined') return value === undefined;

    return typeof value === expectedType;
  }

  /**
   * Sanitize data for logging (remove circular references, limit size)
   */
  _sanitizeDataForLogging(data) {
    try {
      // Simple circular reference prevention
      const seen = new WeakSet();
      const sanitized = JSON.parse(JSON.stringify(data, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular]';
          }
          seen.add(value);
        }
        return value;
      }));

      // Limit size for logging
      const str = JSON.stringify(sanitized);
      if (str.length > 1000) {
        return `${str.substring(0, 1000)}... [truncated]`;
      }

      return sanitized;
    } catch (error) {
      return '[Unable to serialize]';
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.removeAllListeners();
    this.eventHistory = [];
    this.stats = {
      totalEvents: 0,
      validationErrors: 0,
      eventsPerType: new Map(),
      listenersPerType: new Map()
    };

    if (this.logEvents) {
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_destroyed',
      `EventBus destroyed: ${this.name}`);
    }
  }
}

/**
 * Create singleton instance for transaction events
 */
export const transactionEventBus = new EventBus({
  name: 'TransactionEventBus',
  validateEvents: true,
  logEvents: true,
  maxHistorySize: 50
});

/**
 * Convenience functions for common events
 */
export const emitTransactionStart = (spreadsheetId, transactionId, transactionType, metadata = {}) => {
  transactionEventBus.emit('transaction:start', {
    spreadsheetId,
    transactionId,
    transactionType,
    metadata
  });
};

export const emitTransactionStateChange = (spreadsheetId, transactionId, oldState, newState, metadata = {}) => {
  transactionEventBus.emit('transaction:state_change', {
    spreadsheetId,
    transactionId,
    oldState,
    newState,
    metadata
  });
};

export const emitTransactionComplete = (spreadsheetId, transactionId, duration, result = {}) => {
  transactionEventBus.emit('transaction:complete', {
    spreadsheetId,
    transactionId,
    duration,
    result
  });
};

export const emitTransactionFailed = (spreadsheetId, transactionId, error, duration = null, failureCount = null, recovery = {}) => {
  transactionEventBus.emit('transaction:failed', {
    spreadsheetId,
    transactionId,
    error,
    duration,
    failureCount,
    recovery
  });
};

export const emitSaveStart = (spreadsheetId, saveId, dataSize = null, cellCount = null, options = {}) => {
  transactionEventBus.emit('save:start', {
    spreadsheetId,
    saveId,
    dataSize,
    cellCount,
    options
  });
};

export const emitSaveComplete = (spreadsheetId, saveId, success, totalDuration = null, result = {}) => {
  transactionEventBus.emit('save:complete', {
    spreadsheetId,
    saveId,
    success,
    totalDuration,
    result
  });
};

export const emitCellEditStart = (spreadsheetId, cellRef, userId = null, oldValue = null) => {
  transactionEventBus.emit('cell:edit_start', {
    spreadsheetId,
    cellRef,
    userId,
    oldValue
  });
};

export const emitCellEditComplete = (spreadsheetId, cellRef, newValue, userId = null, oldValue = null) => {
  transactionEventBus.emit('cell:edit_complete', {
    spreadsheetId,
    cellRef,
    newValue,
    userId,
    oldValue
  });
};

// Export schemas for external validation
export { EVENT_SCHEMAS };

// Export singleton as 'eventBus' for convenience (most common use case)
export { transactionEventBus as eventBus };

export default EventBus;