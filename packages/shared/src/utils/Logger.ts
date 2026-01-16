/**
 * Centralized Logging Service for WalSheetz Spreadsheet Application
 * Provides structured logging with contextual metadata and performance tracking
 */

import { LogLevel, logConfig } from './LogConfig.js';

export const LogComponent = {
  SPREADSHEET_ENGINE: 'SpreadsheetEngine',
  BLOCKCHAIN_ADAPTER: 'BlockchainAdapter',
  BLOCKCHAIN: 'Blockchain',
  UI_COMPONENT: 'UIComponent',
  UI: 'UI',
  WALLET_MANAGER: 'WalletManager',
  STORAGE_SERVICE: 'StorageService',
  STORAGE: 'Storage',
  PERFORMANCE: 'Performance',
  BUSINESS_LOGIC: 'BusinessLogic',
  WALRUS: 'WalrusService',
} as const;

export type LogComponentType = (typeof LogComponent)[keyof typeof LogComponent];

export const ErrorCategory = {
  NETWORK: 'network',
  WALLET: 'wallet',
  BLOCKCHAIN: 'blockchain',
  STORAGE: 'storage',
  VALIDATION: 'validation',
  PERMISSION: 'permission',
  RATE_LIMIT: 'rate_limit',
  UNKNOWN: 'unknown',
} as const;

export type ErrorCategoryType = (typeof ErrorCategory)[keyof typeof ErrorCategory];

interface LogEntry {
  timestamp: string;
  level: string;
  component: string;
  action: string;
  message: string;
  sessionId: string;
  userId: string | null;
  spreadsheetId: string | null;
  metadata: Record<string, unknown>;
}

interface LogFilter {
  component?: string;
  level?: number;
  action?: string;
  since?: Date;
}

interface RecoverySuggestion {
  action: string;
  message: string;
  delay: number;
  maxRetries: number;
  userMessage: string;
}

interface QueueItem<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

// Simple throttle utility to prevent excessive requests
class RequestThrottle {
  private maxConcurrent: number;
  private delayMs: number;
  private activeRequests: number;
  private queue: QueueItem<unknown>[];

  constructor(maxConcurrent = 5, delayMs = 100) {
    this.maxConcurrent = maxConcurrent;
    this.delayMs = delayMs;
    this.activeRequests = 0;
    this.queue = [];
  }

  async throttle<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject } as QueueItem<unknown>);
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.activeRequests >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.activeRequests++;
    const item = this.queue.shift()!;

    try {
      const result = await item.fn();
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    } finally {
      this.activeRequests--;
      setTimeout(() => this.processQueue(), this.delayMs);
    }
  }
}

// Global request throttler
const globalThrottle = new RequestThrottle(3, 200);

class LogThrottle {
  private lastLogTimes: Map<string, number>;
  private logCounts: Map<string, number>;

  constructor() {
    this.lastLogTimes = new Map();
    this.logCounts = new Map();
  }

  shouldLog(key: string, intervalMs = 30000): { shouldLog: boolean; count: number } {
    const now = Date.now();
    const lastTime = this.lastLogTimes.get(key) || 0;
    const count = (this.logCounts.get(key) || 0) + 1;

    if (now - lastTime >= intervalMs) {
      this.lastLogTimes.set(key, now);
      this.logCounts.set(key, 0);
      return { shouldLog: true, count };
    } else {
      this.logCounts.set(key, count);
      return { shouldLog: false, count };
    }
  }

  reset(key: string): void {
    this.lastLogTimes.delete(key);
    this.logCounts.delete(key);
  }

  clearAll(): void {
    this.lastLogTimes.clear();
    this.logCounts.clear();
  }
}

interface LogMetrics {
  operationCounts: Map<string, number>;
  operationTimes: Map<string, number[]>;
  errorCounts: Map<string, number>;
  userActions: Map<string, number>;
}

class Logger {
  private logLevel: number;
  private sessionId: string;
  private userId: string | null;
  private spreadsheetId: string | null;
  private logs: LogEntry[];
  private maxLogHistory: number;
  private debugMode: boolean;
  private performanceMarks: Map<string, number>;
  private logThrottle: LogThrottle;
  private metrics: LogMetrics;

  constructor() {
    this.logLevel = logConfig.getGlobalLogLevel();
    this.sessionId = this.generateSessionId();
    this.userId = null;
    this.spreadsheetId = null;
    this.logs = [];
    this.maxLogHistory = 1000;
    this.debugMode = this.getDebugModeFromStorage();
    this.performanceMarks = new Map();
    this.logThrottle = new LogThrottle();
    this.metrics = {
      operationCounts: new Map(),
      operationTimes: new Map(),
      errorCounts: new Map(),
      userActions: new Map(),
    };

    if (this.shouldLog(LogLevel.INFO)) {
      console.log(`Logger initialized - Session: ${this.sessionId}, Debug Mode: ${this.debugMode}`);
    }
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getDebugModeFromStorage(): boolean {
    try {
      return (
        typeof localStorage !== 'undefined' &&
        localStorage.getItem('walsheetz_debug_mode') === 'true'
      );
    } catch {
      return false;
    }
  }

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('walsheetz_debug_mode', enabled.toString());
      }
    } catch {
      // Ignore storage errors
    }
    this.info(LogComponent.PERFORMANCE, 'debug_mode_changed', 'Debug mode changed', {
      debugMode: enabled,
    });
  }

  setContext(userId: string | null, spreadsheetId: string | null): void {
    this.userId = userId;
    this.spreadsheetId = spreadsheetId;
    this.info(LogComponent.PERFORMANCE, 'context_updated', 'Context updated', {
      userId,
      spreadsheetId,
    });
  }

  log(
    level: number,
    component: string,
    action: string,
    message: string,
    metadata: Record<string, unknown> = {}
  ): void {
    // Use logConfig to determine if this level should be logged
    if (!logConfig.shouldLog(level)) {
      return;
    }

    // For DEBUG level, check component-specific override
    if (level === LogLevel.DEBUG && !logConfig.isDebugEnabled(component)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: Object.keys(LogLevel)[level],
      component,
      action,
      message,
      sessionId: this.sessionId,
      userId: this.userId,
      spreadsheetId: this.spreadsheetId,
      metadata: {
        ...metadata,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        url: typeof window !== 'undefined' ? window.location.href : 'unknown',
      },
    };

    // Add to internal log history
    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogHistory) {
      this.logs.shift();
    }

    // Update metrics
    this.updateMetrics(component, action, level);

    // Console output with appropriate styling
    this.outputToConsole(logEntry);

    // In production, could send to external logging service
    this.sendToExternalLogger(logEntry);
  }

  private updateMetrics(component: string, action: string, level: number): void {
    const operationKey = `${component}.${action}`;
    this.metrics.operationCounts.set(
      operationKey,
      (this.metrics.operationCounts.get(operationKey) || 0) + 1
    );

    if (level >= LogLevel.ERROR) {
      this.metrics.errorCounts.set(component, (this.metrics.errorCounts.get(component) || 0) + 1);
    }

    if (component === LogComponent.UI_COMPONENT) {
      this.metrics.userActions.set(action, (this.metrics.userActions.get(action) || 0) + 1);
    }
  }

  private outputToConsole(logEntry: LogEntry): void {
    const { level, component, action, message, metadata } = logEntry;
    const prefix = `[${logEntry.timestamp.split('T')[1].split('.')[0]}] ${component}`;

    const hasImportantMetadata = Object.keys(metadata).length > 3; // More than basic metadata

    switch (level) {
      case 'DEBUG':
        if (this.debugMode) {
          console.debug(`${prefix} ${action}: ${message}`, hasImportantMetadata ? metadata : '');
        }
        break;
      case 'INFO':
        console.info(`${prefix} ${action}: ${message}`, hasImportantMetadata ? metadata : '');
        break;
      case 'WARN':
        console.warn(`${prefix} ${action}: ${message}`, metadata);
        break;
      case 'ERROR':
        console.error(`${prefix} ${action}: ${message}`, metadata);
        break;
      case 'CRITICAL':
        console.error(`[CRITICAL] ${prefix} ${action}: ${message}`, metadata);
        break;
    }
  }

  private sendToExternalLogger(logEntry: LogEntry): void {
    if (logEntry.level === 'ERROR' || logEntry.level === 'CRITICAL') {
      try {
        if (typeof localStorage !== 'undefined') {
          const errorLogs = JSON.parse(localStorage.getItem('walsheetz_error_logs') || '[]');
          errorLogs.push(logEntry);
          if (errorLogs.length > 50) errorLogs.shift();
          localStorage.setItem('walsheetz_error_logs', JSON.stringify(errorLogs));
        }
      } catch {
        // Ignore storage errors
      }
    }
  }

  debug(
    component: string,
    action: string,
    message: string,
    metadata: Record<string, unknown> = {}
  ): void {
    this.log(LogLevel.DEBUG, component, action, message, metadata);
  }

  info(
    component: string,
    action: string,
    message: string,
    metadata: Record<string, unknown> = {}
  ): void {
    this.log(LogLevel.INFO, component, action, message, metadata);
  }

  warn(
    component: string,
    action: string,
    message: string,
    metadata: Record<string, unknown> = {}
  ): void {
    this.log(LogLevel.WARN, component, action, message, metadata);
  }

  error(
    component: string,
    action: string,
    message: string,
    metadata: Record<string, unknown> = {}
  ): void {
    this.log(LogLevel.ERROR, component, action, message, metadata);
  }

  critical(
    component: string,
    action: string,
    message: string,
    metadata: Record<string, unknown> = {}
  ): void {
    this.log(LogLevel.CRITICAL, component, action, message, metadata);
  }

  throttle(
    throttleKey: string,
    level: number,
    component: string,
    action: string,
    message: string,
    metadata: Record<string, unknown> = {},
    intervalMs = 30000
  ): void {
    const { shouldLog, count } = this.logThrottle.shouldLog(throttleKey, intervalMs);

    if (shouldLog) {
      const enrichedMetadata =
        count > 1 ? { ...metadata, throttledCount: count, throttleKey } : metadata;

      const enrichedMessage =
        count > 1
          ? `${message} (${count - 1} similar events throttled in last ${intervalMs / 1000}s)`
          : message;

      this.log(level, component, action, enrichedMessage, enrichedMetadata);
    }
  }

  throttleDebug(
    throttleKey: string,
    component: string,
    action: string,
    message: string,
    metadata: Record<string, unknown> = {},
    intervalMs = 30000
  ): void {
    this.throttle(throttleKey, LogLevel.DEBUG, component, action, message, metadata, intervalMs);
  }

  throttleInfo(
    throttleKey: string,
    component: string,
    action: string,
    message: string,
    metadata: Record<string, unknown> = {},
    intervalMs = 30000
  ): void {
    this.throttle(throttleKey, LogLevel.INFO, component, action, message, metadata, intervalMs);
  }

  isDebugEnabled(component: string): boolean {
    return logConfig.isDebugEnabled(component);
  }

  shouldLog(level: number): boolean {
    return logConfig.shouldLog(level);
  }

  startTimer(operation: string): void {
    const markName = `${operation}-start`;
    this.performanceMarks.set(operation, Date.now());

    if (typeof performance !== 'undefined') {
      performance.mark(markName);
    }

    this.debug(LogComponent.PERFORMANCE, 'timer_start', `Started timing ${operation}`, {
      operation,
    });
  }

  endTimer(operation: string, metadata: Record<string, unknown> = {}): number | null {
    const startTime = this.performanceMarks.get(operation);
    if (!startTime) {
      this.debug(
        LogComponent.PERFORMANCE,
        'timer_end_no_start',
        `No start time found for operation: ${operation}`,
        {
          operation,
          availableTimers: Array.from(this.performanceMarks.keys()),
          metadata,
        }
      );
      return null;
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    this.performanceMarks.delete(operation);

    const times = this.metrics.operationTimes.get(operation) || [];
    times.push(duration);
    if (times.length > 100) times.shift();
    this.metrics.operationTimes.set(operation, times);

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

    this.info(LogComponent.PERFORMANCE, 'timer_end', `${operation} completed`, {
      duration: `${duration}ms`,
      averageTime: `${avgTime.toFixed(2)}ms`,
      operationCount: times.length,
      ...metadata,
    });

    if (typeof performance !== 'undefined') {
      const markName = `${operation}-end`;
      performance.mark(markName);
      try {
        performance.measure(operation, `${operation}-start`, markName);
      } catch {
        // Ignore performance measurement errors
      }
    }

    return duration;
  }

  logUserAction(action: string, metadata: Record<string, unknown> = {}): void {
    this.info(LogComponent.UI_COMPONENT, action, 'User action performed', {
      timestamp: Date.now(),
      ...metadata,
    });
  }

  logCellOperation(
    operation: string,
    cellRef: string,
    oldValue: unknown,
    newValue: unknown,
    metadata: Record<string, unknown> = {}
  ): void {
    this.info(LogComponent.SPREADSHEET_ENGINE, operation, `Cell ${cellRef} ${operation}`, {
      cellRef,
      oldValue,
      newValue,
      valueChanged: oldValue !== newValue,
      ...metadata,
    });
  }

  logBlockchainOperation(
    operation: string,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): void {
    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    const message = `Blockchain ${operation} ${success ? 'succeeded' : 'failed'}`;

    this.log(level, LogComponent.BLOCKCHAIN_ADAPTER, operation, message, {
      success,
      ...metadata,
    });
  }

  getMetrics(): Record<string, unknown> {
    const operationTimes: Record<
      string,
      { count: number; average: number; min: number; max: number }
    > = {};
    for (const [operation, times] of this.metrics.operationTimes.entries()) {
      operationTimes[operation] = {
        count: times.length,
        average: times.reduce((a, b) => a + b, 0) / times.length,
        min: Math.min(...times),
        max: Math.max(...times),
      };
    }

    return {
      sessionId: this.sessionId,
      operationCounts: Object.fromEntries(this.metrics.operationCounts),
      operationTimes,
      errorCounts: Object.fromEntries(this.metrics.errorCounts),
      userActions: Object.fromEntries(this.metrics.userActions),
      totalLogs: this.logs.length,
      debugMode: this.debugMode,
    };
  }

  exportLogs(filter: LogFilter | null = null): Record<string, unknown> {
    let logsToExport = this.logs;

    if (filter) {
      logsToExport = this.logs.filter((log) => {
        if (filter.component && log.component !== filter.component) return false;
        if (filter.level && LogLevel[log.level as keyof typeof LogLevel] < filter.level)
          return false;
        if (filter.action && !log.action.includes(filter.action)) return false;
        if (filter.since && new Date(log.timestamp) < filter.since) return false;
        return true;
      });
    }

    return {
      exportedAt: new Date().toISOString(),
      sessionId: this.sessionId,
      filter,
      logs: logsToExport,
      metrics: this.getMetrics(),
    };
  }

  categorizeError(error: Error & { code?: number; status?: number }): ErrorCategoryType {
    const message = error.message?.toLowerCase() || '';
    const code = error.code || error.status;

    // Network errors
    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      (code !== undefined && code >= 500)
    ) {
      return ErrorCategory.NETWORK;
    }

    // Wallet errors
    if (
      message.includes('wallet') ||
      message.includes('signer') ||
      message.includes('signature') ||
      message.includes('user rejected') ||
      message.includes('cancelled')
    ) {
      return ErrorCategory.WALLET;
    }

    // Blockchain errors
    if (
      message.includes('transaction') ||
      message.includes('blockchain') ||
      message.includes('gas') ||
      message.includes('insufficient') ||
      message.includes('nonce')
    ) {
      return ErrorCategory.BLOCKCHAIN;
    }

    // Storage errors
    if (
      message.includes('storage') ||
      message.includes('walrus') ||
      message.includes('blob') ||
      message.includes('upload') ||
      message.includes('download')
    ) {
      return ErrorCategory.STORAGE;
    }

    // Validation errors
    if (
      message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('required') ||
      message.includes('format')
    ) {
      return ErrorCategory.VALIDATION;
    }

    // Permission errors
    if (
      message.includes('permission') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('access denied')
    ) {
      return ErrorCategory.PERMISSION;
    }

    // Rate limit errors
    if (
      message.includes('rate') ||
      message.includes('limit') ||
      message.includes('too many') ||
      message.includes('429') ||
      code === 429
    ) {
      return ErrorCategory.RATE_LIMIT;
    }

    return ErrorCategory.UNKNOWN;
  }

  getRecoverySuggestion(category: ErrorCategoryType): RecoverySuggestion {
    const suggestions: Record<ErrorCategoryType, RecoverySuggestion> = {
      [ErrorCategory.NETWORK]: {
        action: 'retry',
        message: 'Check your internet connection and try again',
        delay: 2000,
        maxRetries: 3,
        userMessage: 'Connection issue detected. Retrying automatically...',
      },
      [ErrorCategory.WALLET]: {
        action: 'reconnect',
        message: 'Please reconnect your wallet and try again',
        delay: 0,
        maxRetries: 1,
        userMessage: 'Please check your wallet connection and try again',
      },
      [ErrorCategory.BLOCKCHAIN]: {
        action: 'retry',
        message: 'Blockchain congestion detected, please wait and try again',
        delay: 5000,
        maxRetries: 2,
        userMessage: 'Network is busy. Please wait a moment and try again',
      },
      [ErrorCategory.STORAGE]: {
        action: 'retry',
        message: 'Storage service temporarily unavailable, will retry automatically',
        delay: 3000,
        maxRetries: 3,
        userMessage: 'Storage service is temporarily unavailable. Retrying...',
      },
      [ErrorCategory.PERMISSION]: {
        action: 'none',
        message: 'You do not have permission to perform this action',
        delay: 0,
        maxRetries: 0,
        userMessage: 'You do not have permission to perform this action',
      },
      [ErrorCategory.RATE_LIMIT]: {
        action: 'delay',
        message: 'Too many requests, please wait before trying again',
        delay: 10000,
        maxRetries: 1,
        userMessage: 'Too many requests. Please wait a moment before trying again',
      },
      [ErrorCategory.VALIDATION]: {
        action: 'fix_input',
        message: 'Please check your input and try again',
        delay: 0,
        maxRetries: 0,
        userMessage: 'Please check your input data and try again',
      },
      [ErrorCategory.UNKNOWN]: {
        action: 'retry',
        message: 'An unexpected error occurred, please try again',
        delay: 1000,
        maxRetries: 2,
        userMessage: 'An unexpected error occurred. Please try again',
      },
    };

    return suggestions[category] || suggestions[ErrorCategory.UNKNOWN];
  }

  logErrorWithRecovery(
    component: string,
    action: string,
    error: Error,
    context: Record<string, unknown> = {}
  ): { category: ErrorCategoryType; recovery: RecoverySuggestion } {
    const category = this.categorizeError(error);
    const recovery = this.getRecoverySuggestion(category);

    this.error(component, action, `Error in ${component}: ${error.message}`, {
      error: error.message,
      stack: error.stack,
      category,
      recovery,
      userMessage: recovery.userMessage,
      ...context,
    });

    return { category, recovery };
  }

  logOperationWithRecovery(
    component: string,
    action: string,
    operation: string,
    error: Error | null,
    context: Record<string, unknown> = {}
  ): {
    success: boolean;
    category?: ErrorCategoryType;
    recovery?: RecoverySuggestion;
    userMessage?: string;
  } {
    if (error) {
      const { category, recovery } = this.logErrorWithRecovery(component, action, error, {
        operation,
        ...context,
      });

      return {
        success: false,
        category,
        recovery,
        userMessage: recovery.userMessage,
      };
    } else {
      this.info(component, action, `${operation} completed successfully`, context);
      return { success: true };
    }
  }

  createErrorBoundary(error: Error, componentStack: string): Record<string, unknown> {
    return {
      error: error.message,
      stack: error.stack,
      componentStack,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      userId: this.userId,
      spreadsheetId: this.spreadsheetId,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
      category: this.categorizeError(error),
      metrics: this.getMetrics(),
    };
  }

  clearLogs(): void {
    this.logs = [];
    this.metrics = {
      operationCounts: new Map(),
      operationTimes: new Map(),
      errorCounts: new Map(),
      userActions: new Map(),
    };
    this.info(LogComponent.PERFORMANCE, 'logs_cleared', 'All logs and metrics cleared');
  }
}

// Create singleton instance
export const logger = new Logger();

// Export throttle utilities
export { RequestThrottle, globalThrottle };

// Extend window type for global access
declare global {
  interface Window {
    walSheetzLogger: Logger;
  }
  interface Performance {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  }
}

// Add global access for debugging (DEV only)
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  window.walSheetzLogger = logger;

  window.addEventListener('load', () => {
    logger.info(LogComponent.PERFORMANCE, 'page_load', 'Page fully loaded', {
      loadTime: performance.now(),
    });
  });

  if (performance.memory) {
    setInterval(() => {
      logger.debug(LogComponent.PERFORMANCE, 'memory_usage', 'Memory usage snapshot', {
        usedJSHeapSize: performance.memory!.usedJSHeapSize,
        totalJSHeapSize: performance.memory!.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory!.jsHeapSizeLimit,
        usedPercent: (
          (performance.memory!.usedJSHeapSize / performance.memory!.jsHeapSizeLimit) *
          100
        ).toFixed(2),
      });
    }, 30000);
  }

  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            logger.warn(LogComponent.PERFORMANCE, 'long_task', 'Long task detected', {
              duration: entry.duration,
              startTime: entry.startTime,
              name: entry.name,
            });
          }
        }
      });
      observer.observe({ entryTypes: ['longtask'] as unknown as string[] });
    } catch {
      // Ignore if PerformanceObserver doesn't support longtask
    }
  }
}
