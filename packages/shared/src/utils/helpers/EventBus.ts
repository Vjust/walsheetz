/**
 * Minimal EventBus for Transaction Events
 */

import { logger, LogComponent } from "../Logger.js";

type EventType = keyof typeof EVENT_SCHEMAS | string;
type CellValue = string | number | boolean | null | undefined;

interface EventSchema {
  required: string[];
  optional: string[];
  types: Record<string, string | string[]>;
}

const EVENT_SCHEMAS: Record<string, EventSchema> = {
  'transaction:start': {
    required: ['spreadsheetId', 'transactionId', 'transactionType'],
    optional: ['metadata'],
    types: { spreadsheetId: 'string', transactionId: 'string', transactionType: 'string', metadata: 'object' }
  },
  'transaction:state_change': {
    required: ['spreadsheetId', 'transactionId', 'oldState', 'newState'],
    optional: ['metadata'],
    types: { spreadsheetId: 'string', transactionId: 'string', oldState: 'string', newState: 'string', metadata: 'object' }
  },
  'transaction:complete': {
    required: ['spreadsheetId', 'transactionId', 'duration'],
    optional: ['result'],
    types: { spreadsheetId: 'string', transactionId: 'string', duration: 'number', result: 'object' }
  },
  'transaction:failed': {
    required: ['spreadsheetId', 'transactionId', 'error'],
    optional: ['duration', 'failureCount', 'recovery'],
    types: { spreadsheetId: 'string', transactionId: 'string', error: 'object', duration: 'number', failureCount: 'number', recovery: 'object' }
  },
  'transaction:timeout': {
    required: ['spreadsheetId', 'elapsed'],
    optional: ['lastTransaction'],
    types: { spreadsheetId: 'string', elapsed: 'number', lastTransaction: 'object' }
  },
  'save:start': {
    required: ['spreadsheetId', 'saveId'],
    optional: ['dataSize', 'cellCount', 'options'],
    types: { spreadsheetId: 'string', saveId: 'string', dataSize: 'number', cellCount: 'number', options: 'object' }
  },
  'save:walrus_complete': {
    required: ['spreadsheetId', 'saveId', 'blobId'],
    optional: ['size', 'duration'],
    types: { spreadsheetId: 'string', saveId: 'string', blobId: 'string', size: 'number', duration: 'number' }
  },
  'save:blockchain_complete': {
    required: ['spreadsheetId', 'saveId', 'transactionDigest'],
    optional: ['gasUsed', 'duration'],
    types: { spreadsheetId: 'string', saveId: 'string', transactionDigest: 'string', gasUsed: 'number', duration: 'number' }
  },
  'save:complete': {
    required: ['spreadsheetId', 'saveId', 'success'],
    optional: ['totalDuration', 'result'],
    types: { spreadsheetId: 'string', saveId: 'string', success: 'boolean', totalDuration: 'number', result: 'object' }
  },
  'save:failed': {
    required: ['spreadsheetId', 'saveId', 'error'],
    optional: ['stage', 'recovery'],
    types: { spreadsheetId: 'string', saveId: 'string', error: 'object', stage: 'string', recovery: 'object' }
  },
  'cell:edit_start': {
    required: ['spreadsheetId', 'cellRef'],
    optional: ['userId', 'oldValue'],
    types: { spreadsheetId: 'string', cellRef: 'string', userId: 'string', oldValue: ['string', 'number', 'boolean', 'null', 'undefined'] }
  },
  'cell:edit_complete': {
    required: ['spreadsheetId', 'cellRef', 'newValue'],
    optional: ['userId', 'oldValue'],
    types: { spreadsheetId: 'string', cellRef: 'string', newValue: ['string', 'number', 'boolean', 'null', 'undefined'], userId: 'string', oldValue: ['string', 'number', 'boolean', 'null', 'undefined'] }
  }
};

interface EventBusOptions {
  maxHistorySize?: number;
  validateEvents?: boolean;
  logEvents?: boolean;
  name?: string;
}

interface HandlerMeta {
  handler: (data: Record<string, unknown>, event?: string) => void;
  subscribedAt: number;
  callCount: number;
  lastCalled: number | null;
  options: Record<string, unknown>;
}

interface EventRecord {
  event: string;
  data: unknown;
  timestamp: number;
  listeners: number;
}

interface EventBusStats {
  totalEvents: number;
  validationErrors: number;
  eventsPerType: Map<string, number>;
  listenersPerType: Map<string, number>;
}

export class EventBus {
  private listeners: Map<string, Set<HandlerMeta>>;
  private eventHistory: EventRecord[];
  private maxHistorySize: number;
  private validateEvents: boolean;
  private logEvents: boolean;
  private name: string;
  private stats: EventBusStats;

  constructor(options: EventBusOptions = {}) {
    this.listeners = new Map();
    this.eventHistory = [];
    this.maxHistorySize = options.maxHistorySize || 100;
    this.validateEvents = options.validateEvents !== false;
    this.logEvents = options.logEvents !== false;
    this.name = options.name || 'EventBus';
    this.stats = {
      totalEvents: 0,
      validationErrors: 0,
      eventsPerType: new Map(),
      listenersPerType: new Map()
    };

    if (this.logEvents) {
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_init',
        `EventBus initialized: ${this.name}`, { validateEvents: this.validateEvents, maxHistorySize: this.maxHistorySize });
    }
  }

  on(event: string, handler: (data: Record<string, unknown>, event?: string) => void, options: Record<string, unknown> = {}): () => void {
    if (typeof event !== 'string' || !event) throw new Error('Event name must be a non-empty string');
    if (typeof handler !== 'function') throw new Error('Event handler must be a function');

    if (this.validateEvents && !this._isValidEventType(event)) {
      logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_unknown_event', `Subscribing to unknown event type: ${event}`, { event });
    }

    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
      this.stats.listenersPerType.set(event, 0);
    }

    const handlerWithMeta: HandlerMeta = { handler, subscribedAt: Date.now(), callCount: 0, lastCalled: null, options };
    this.listeners.get(event)!.add(handlerWithMeta);
    this.stats.listenersPerType.set(event, this.listeners.get(event)!.size);

    if (this.logEvents) {
      logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_subscribe', `Subscribed to event: ${event}`, { event, listenerCount: this.listeners.get(event)!.size, options });
    }

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
          logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_unsubscribe', `Unsubscribed from event: ${event}`, { event, remainingListeners: listeners.size });
        }
      }
    };
  }

  once(event: string, handler: (data: Record<string, unknown>, event?: string) => void, options: Record<string, unknown> = {}): () => void {
    const unsubscribe = this.on(event, (data) => {
      unsubscribe();
      handler(data);
    }, { ...options, once: true });
    return unsubscribe;
  }

  emit(event: string, data: Record<string, unknown> = {}, options: { strict?: boolean; stopOnError?: boolean } = {}): void {
    if (typeof event !== 'string' || !event) throw new Error('Event name must be a non-empty string');

    if (this.validateEvents) {
      const validation = this._validateEventData(event, data);
      if (!validation.valid) {
        this.stats.validationErrors++;
        logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_validation_error', `Event validation failed: ${event}`, { event, errors: validation.errors, data: this._sanitizeDataForLogging(data) });
        if (options.strict !== false) throw new Error(`Event validation failed for ${event}: ${validation.errors.join(', ')}`);
      }
    }

    this.stats.totalEvents++;
    if (!this.stats.eventsPerType.has(event)) this.stats.eventsPerType.set(event, 0);
    this.stats.eventsPerType.set(event, this.stats.eventsPerType.get(event)! + 1);

    const eventRecord: EventRecord = {
      event,
      data: this._sanitizeDataForLogging(data),
      timestamp: Date.now(),
      listeners: this.listeners.has(event) ? this.listeners.get(event)!.size : 0
    };

    this.eventHistory.push(eventRecord);
    if (this.eventHistory.length > this.maxHistorySize) this.eventHistory.shift();

    const listeners = this.listeners.get(event);
    if (listeners && listeners.size > 0) {
      if (this.logEvents) {
        logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_emit', `Emitting event: ${event}`, { event, listenerCount: listeners.size, data: this._sanitizeDataForLogging(data) });
      }
      listeners.forEach((handlerWithMeta) => {
        try {
          handlerWithMeta.callCount++;
          handlerWithMeta.lastCalled = Date.now();
          handlerWithMeta.handler(data, event);
        } catch (error) {
          const err = error as Error;
          logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_handler_error', `Error in event handler for ${event}`, { event, error: err.message, stack: err.stack, handlerCallCount: handlerWithMeta.callCount });
          if (options.stopOnError) throw error;
        }
      });
    } else if (this.logEvents) {
      logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_emit_no_listeners', `No listeners for event: ${event}`, { event });
    }
  }

  removeAllListeners(event: string | null = null): void {
    if (event) {
      this.listeners.delete(event);
      this.stats.listenersPerType.delete(event);
      if (this.logEvents) logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_clear_event', `Cleared all listeners for event: ${event}`, { event });
    } else {
      this.listeners.clear();
      this.stats.listenersPerType.clear();
      if (this.logEvents) logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_clear_all', 'Cleared all event listeners');
    }
  }

  getStats(): Record<string, unknown> {
    return { ...this.stats, activeListeners: this.listeners.size, eventHistorySize: this.eventHistory.length, supportedEvents: Object.keys(EVENT_SCHEMAS) };
  }

  getEventHistory(eventType: string | null = null, limit: number | null = null): EventRecord[] {
    let history = eventType ? this.eventHistory.filter((record) => record.event === eventType) : this.eventHistory;
    if (limit) history = history.slice(-limit);
    return history;
  }

  getListeners(event: string): Array<{ subscribedAt: number; callCount: number; lastCalled: number | null; options: Record<string, unknown> }> {
    const listeners = this.listeners.get(event);
    if (!listeners) return [];
    return Array.from(listeners).map((h) => ({ subscribedAt: h.subscribedAt, callCount: h.callCount, lastCalled: h.lastCalled, options: h.options }));
  }

  private _isValidEventType(event: string): boolean {
    return Object.prototype.hasOwnProperty.call(EVENT_SCHEMAS, event);
  }

  private _validateEventData(event: string, data: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const schema = EVENT_SCHEMAS[event];
    if (!schema) return { valid: true, errors: [] };

    const errors: string[] = [];
    for (const field of schema.required) {
      if (!(field in data)) errors.push(`Missing required field: ${field}`);
    }
    for (const [field, value] of Object.entries(data)) {
      const expectedType = schema.types[field];
      if (expectedType && !this._isValidType(value, expectedType)) {
        errors.push(`Invalid type for ${field}: expected ${expectedType}, got ${typeof value}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  private _isValidType(value: unknown, expectedType: string | string[]): boolean {
    if (Array.isArray(expectedType)) {
      return expectedType.includes(typeof value) ||
        (expectedType.includes('null') && value === null) ||
        (expectedType.includes('undefined') && value === undefined);
    }
    if (expectedType === 'null') return value === null;
    if (expectedType === 'undefined') return value === undefined;
    return typeof value === expectedType;
  }

  private _sanitizeDataForLogging(data: unknown): unknown {
    try {
      const seen = new WeakSet();
      const sanitized = JSON.parse(JSON.stringify(data, (_key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '[Circular]';
          seen.add(value);
        }
        return value;
      }));
      const str = JSON.stringify(sanitized);
      if (str.length > 1000) return `${str.substring(0, 1000)}... [truncated]`;
      return sanitized;
    } catch {
      return '[Unable to serialize]';
    }
  }

  destroy(): void {
    this.removeAllListeners();
    this.eventHistory = [];
    this.stats = { totalEvents: 0, validationErrors: 0, eventsPerType: new Map(), listenersPerType: new Map() };
    if (this.logEvents) logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'eventbus_destroyed', `EventBus destroyed: ${this.name}`);
  }
}

export const transactionEventBus = new EventBus({ name: 'TransactionEventBus', validateEvents: true, logEvents: true, maxHistorySize: 50 });

export const emitTransactionStart = (spreadsheetId: string, transactionId: string, transactionType: string, metadata: Record<string, unknown> = {}): void => {
  transactionEventBus.emit('transaction:start', { spreadsheetId, transactionId, transactionType, metadata });
};

export const emitTransactionStateChange = (spreadsheetId: string, transactionId: string, oldState: string, newState: string, metadata: Record<string, unknown> = {}): void => {
  transactionEventBus.emit('transaction:state_change', { spreadsheetId, transactionId, oldState, newState, metadata });
};

export const emitTransactionComplete = (spreadsheetId: string, transactionId: string, duration: number, result: Record<string, unknown> = {}): void => {
  transactionEventBus.emit('transaction:complete', { spreadsheetId, transactionId, duration, result });
};

export const emitTransactionFailed = (spreadsheetId: string, transactionId: string, error: unknown, duration: number | null = null, failureCount: number | null = null, recovery: Record<string, unknown> = {}): void => {
  transactionEventBus.emit('transaction:failed', { spreadsheetId, transactionId, error, duration, failureCount, recovery });
};

export const emitSaveStart = (spreadsheetId: string, saveId: string, dataSize: number | null = null, cellCount: number | null = null, options: Record<string, unknown> = {}): void => {
  transactionEventBus.emit('save:start', { spreadsheetId, saveId, dataSize, cellCount, options });
};

export const emitSaveComplete = (spreadsheetId: string, saveId: string, success: boolean, totalDuration: number | null = null, result: Record<string, unknown> = {}): void => {
  transactionEventBus.emit('save:complete', { spreadsheetId, saveId, success, totalDuration, result });
};

export const emitCellEditStart = (spreadsheetId: string, cellRef: string, userId: string | null = null, oldValue: CellValue = null): void => {
  transactionEventBus.emit('cell:edit_start', { spreadsheetId, cellRef, userId, oldValue });
};

export const emitCellEditComplete = (spreadsheetId: string, cellRef: string, newValue: CellValue, userId: string | null = null, oldValue: CellValue = null): void => {
  transactionEventBus.emit('cell:edit_complete', { spreadsheetId, cellRef, newValue, userId, oldValue });
};

export { EVENT_SCHEMAS };
export { transactionEventBus as eventBus };
export default EventBus;
