/**
 * Centralized Logging Service for WalSheetz Spreadsheet Application
 * Provides structured logging with contextual metadata and performance tracking
 */

export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4
};

export const LogComponent = {
  SPREADSHEET_ENGINE: 'SpreadsheetEngine',
  BLOCKCHAIN_ADAPTER: 'BlockchainAdapter',
  WEBSOCKET_SERVICE: 'WebSocketService',
  UI_COMPONENT: 'UIComponent',
  WALLET_MANAGER: 'WalletManager',
  STORAGE_SERVICE: 'StorageService',
  COLLABORATION: 'Collaboration',
  PERFORMANCE: 'Performance'
};

export const ErrorCategory = {
  NETWORK: 'network',
  WALLET: 'wallet',
  BLOCKCHAIN: 'blockchain',
  STORAGE: 'storage',
  VALIDATION: 'validation',
  PERMISSION: 'permission',
  RATE_LIMIT: 'rate_limit',
  UNKNOWN: 'unknown'
};

// Simple throttle utility to prevent excessive requests
class RequestThrottle {
  constructor(maxConcurrent = 5, delayMs = 100) {
    this.maxConcurrent = maxConcurrent;
    this.delayMs = delayMs;
    this.activeRequests = 0;
    this.queue = [];
  }

  async throttle(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });

      this.processQueue();
    });
  }

  async processQueue() {
    if (this.activeRequests >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.activeRequests++;
    const { fn, resolve, reject } = this.queue.shift();

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.activeRequests--;
      // Add delay before processing next request
      setTimeout(() => this.processQueue(), this.delayMs);
    }
  }
}

// Global request throttler
const globalThrottle = new RequestThrottle(3, 200);

class Logger {
  constructor() {
    this.logLevel = LogLevel.INFO;
    this.sessionId = this.generateSessionId();
    this.userId = null;
    this.spreadsheetId = null;
    this.logs = [];
    this.maxLogHistory = 1000;
    this.debugMode = this.getDebugModeFromStorage();
    this.performanceMarks = new Map();
    
    // Performance monitoring
    this.metrics = {
      operationCounts: new Map(),
      operationTimes: new Map(),
      errorCounts: new Map(),
      userActions: new Map()
    };

    console.log(`🔧 Logger initialized - Session: ${this.sessionId}, Debug Mode: ${this.debugMode}`);
  }

  generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getDebugModeFromStorage() {
    try {
      return localStorage.getItem('walsheetz_debug_mode') === 'true';
    } catch (error) {
      return false;
    }
  }

  setDebugMode(enabled) {
    this.debugMode = enabled;
    try {
      localStorage.setItem('walsheetz_debug_mode', enabled.toString());
    } catch (error) {
      // Ignore storage errors
    }
    this.info(LogComponent.PERFORMANCE, 'Debug mode changed', { debugMode: enabled });
  }

  setContext(userId, spreadsheetId) {
    this.userId = userId;
    this.spreadsheetId = spreadsheetId;
    this.info(LogComponent.PERFORMANCE, 'Context updated', { userId, spreadsheetId });
  }

  log(level, component, action, message, metadata = {}) {
    if (level < this.logLevel) return;

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
        url: typeof window !== 'undefined' ? window.location.href : 'unknown'
      }
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

  updateMetrics(component, action, level) {
    // Track operation counts
    const operationKey = `${component}.${action}`;
    this.metrics.operationCounts.set(
      operationKey,
      (this.metrics.operationCounts.get(operationKey) || 0) + 1
    );

    // Track error counts
    if (level >= LogLevel.ERROR) {
      this.metrics.errorCounts.set(
        component,
        (this.metrics.errorCounts.get(component) || 0) + 1
      );
    }

    // Track user actions
    if (component === LogComponent.UI_COMPONENT) {
      this.metrics.userActions.set(
        action,
        (this.metrics.userActions.get(action) || 0) + 1
      );
    }
  }

  outputToConsole(logEntry) {
    const { level, component, action, message, metadata } = logEntry;
    const prefix = `[${logEntry.timestamp.split('T')[1].split('.')[0]}] ${component}`;
    
    const hasImportantMetadata = Object.keys(metadata).length > 3; // More than basic metadata
    
    switch (level) {
      case 'DEBUG':
        if (this.debugMode) {
          console.debug(`🔍 ${prefix} ${action}: ${message}`, hasImportantMetadata ? metadata : '');
        }
        break;
      case 'INFO':
        console.info(`ℹ️ ${prefix} ${action}: ${message}`, hasImportantMetadata ? metadata : '');
        break;
      case 'WARN':
        console.warn(`⚠️ ${prefix} ${action}: ${message}`, metadata);
        break;
      case 'ERROR':
        console.error(`❌ ${prefix} ${action}: ${message}`, metadata);
        break;
      case 'CRITICAL':
        console.error(`🚨 ${prefix} ${action}: ${message}`, metadata);
        break;
    }
  }

  sendToExternalLogger(logEntry) {
    // In production, this could send logs to a service like LogRocket, Sentry, etc.
    // For now, we'll just store in localStorage for debugging
    if (logEntry.level === 'ERROR' || logEntry.level === 'CRITICAL') {
      try {
        const errorLogs = JSON.parse(localStorage.getItem('walsheetz_error_logs') || '[]');
        errorLogs.push(logEntry);
        if (errorLogs.length > 50) errorLogs.shift(); // Keep only last 50 errors
        localStorage.setItem('walsheetz_error_logs', JSON.stringify(errorLogs));
      } catch (error) {
        // Ignore storage errors
      }
    }
  }

  // Convenience methods for different log levels
  debug(component, action, message, metadata = {}) {
    this.log(LogLevel.DEBUG, component, action, message, metadata);
  }

  info(component, action, message, metadata = {}) {
    this.log(LogLevel.INFO, component, action, message, metadata);
  }

  warn(component, action, message, metadata = {}) {
    this.log(LogLevel.WARN, component, action, message, metadata);
  }

  error(component, action, message, metadata = {}) {
    this.log(LogLevel.ERROR, component, action, message, metadata);
  }

  critical(component, action, message, metadata = {}) {
    this.log(LogLevel.CRITICAL, component, action, message, metadata);
  }

  // Performance monitoring methods
  startTimer(operation) {
    const markName = `${operation}-start`;
    this.performanceMarks.set(operation, Date.now());
    
    if (typeof performance !== 'undefined') {
      performance.mark(markName);
    }
    
    this.debug(LogComponent.PERFORMANCE, 'timer_start', `Started timing ${operation}`, { operation });
  }

  endTimer(operation, metadata = {}) {
    const startTime = this.performanceMarks.get(operation);
    if (!startTime) {
      this.warn(LogComponent.PERFORMANCE, 'timer_end', `No start time found for operation: ${operation}`);
      return null;
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    this.performanceMarks.delete(operation);

    // Update operation times
    const times = this.metrics.operationTimes.get(operation) || [];
    times.push(duration);
    if (times.length > 100) times.shift(); // Keep only last 100 measurements
    this.metrics.operationTimes.set(operation, times);

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

    this.info(LogComponent.PERFORMANCE, 'timer_end', `${operation} completed`, {
      duration: `${duration}ms`,
      averageTime: `${avgTime.toFixed(2)}ms`,
      operationCount: times.length,
      ...metadata
    });

    if (typeof performance !== 'undefined') {
      const markName = `${operation}-end`;
      performance.mark(markName);
      try {
        performance.measure(operation, `${operation}-start`, markName);
      } catch (error) {
        // Ignore performance measurement errors
      }
    }

    return duration;
  }

  // Log user interactions
  logUserAction(action, metadata = {}) {
    this.info(LogComponent.UI_COMPONENT, action, 'User action performed', {
      timestamp: Date.now(),
      ...metadata
    });
  }

  // Log cell operations
  logCellOperation(operation, cellRef, oldValue, newValue, metadata = {}) {
    this.info(LogComponent.SPREADSHEET_ENGINE, operation, `Cell ${cellRef} ${operation}`, {
      cellRef,
      oldValue,
      newValue,
      valueChanged: oldValue !== newValue,
      ...metadata
    });
  }

  // Log blockchain operations
  logBlockchainOperation(operation, success, metadata = {}) {
    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    const message = `Blockchain ${operation} ${success ? 'succeeded' : 'failed'}`;
    
    this.log(level, LogComponent.BLOCKCHAIN_ADAPTER, operation, message, {
      success,
      ...metadata
    });
  }

  // Get aggregated metrics
  getMetrics() {
    const operationTimes = {};
    for (const [operation, times] of this.metrics.operationTimes.entries()) {
      operationTimes[operation] = {
        count: times.length,
        average: times.reduce((a, b) => a + b, 0) / times.length,
        min: Math.min(...times),
        max: Math.max(...times)
      };
    }

    return {
      sessionId: this.sessionId,
      operationCounts: Object.fromEntries(this.metrics.operationCounts),
      operationTimes,
      errorCounts: Object.fromEntries(this.metrics.errorCounts),
      userActions: Object.fromEntries(this.metrics.userActions),
      totalLogs: this.logs.length,
      debugMode: this.debugMode
    };
  }

  // Export logs for debugging
  exportLogs(filter = null) {
    let logsToExport = this.logs;
    
    if (filter) {
      logsToExport = this.logs.filter(log => {
        if (filter.component && log.component !== filter.component) return false;
        if (filter.level && LogLevel[log.level] < filter.level) return false;
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
      metrics: this.getMetrics()
    };
  }

  // Enhanced error categorization and recovery
  categorizeError(error) {
    const message = error.message?.toLowerCase() || '';
    const code = error.code || error.status;

    // Network errors
    if (message.includes('network') || message.includes('fetch') || message.includes('connection') ||
        message.includes('timeout') || code >= 500) {
      return ErrorCategory.NETWORK;
    }

    // Wallet errors
    if (message.includes('wallet') || message.includes('signer') || message.includes('signature') ||
        message.includes('user rejected') || message.includes('cancelled')) {
      return ErrorCategory.WALLET;
    }

    // Blockchain errors
    if (message.includes('transaction') || message.includes('blockchain') || message.includes('gas') ||
        message.includes('insufficient') || message.includes('nonce')) {
      return ErrorCategory.BLOCKCHAIN;
    }

    // Storage errors
    if (message.includes('storage') || message.includes('walrus') || message.includes('blob') ||
        message.includes('upload') || message.includes('download')) {
      return ErrorCategory.STORAGE;
    }

    // Validation errors
    if (message.includes('validation') || message.includes('invalid') || message.includes('required') ||
        message.includes('format')) {
      return ErrorCategory.VALIDATION;
    }

    // Permission errors
    if (message.includes('permission') || message.includes('unauthorized') || message.includes('forbidden') ||
        message.includes('access denied')) {
      return ErrorCategory.PERMISSION;
    }

    // Rate limit errors
    if (message.includes('rate') || message.includes('limit') || message.includes('too many') ||
        message.includes('429') || code === 429) {
      return ErrorCategory.RATE_LIMIT;
    }

    return ErrorCategory.UNKNOWN;
  }

  // Get recovery suggestions based on error category
  getRecoverySuggestion(category, error) {
    const suggestions = {
      [ErrorCategory.NETWORK]: {
        action: 'retry',
        message: 'Check your internet connection and try again',
        delay: 2000,
        maxRetries: 3,
        userMessage: 'Connection issue detected. Retrying automatically...'
      },
      [ErrorCategory.WALLET]: {
        action: 'reconnect',
        message: 'Please reconnect your wallet and try again',
        delay: 0,
        maxRetries: 1,
        userMessage: 'Please check your wallet connection and try again'
      },
      [ErrorCategory.BLOCKCHAIN]: {
        action: 'retry',
        message: 'Blockchain congestion detected, please wait and try again',
        delay: 5000,
        maxRetries: 2,
        userMessage: 'Network is busy. Please wait a moment and try again'
      },
      [ErrorCategory.STORAGE]: {
        action: 'retry',
        message: 'Storage service temporarily unavailable, will retry automatically',
        delay: 3000,
        maxRetries: 3,
        userMessage: 'Storage service is temporarily unavailable. Retrying...'
      },
      [ErrorCategory.PERMISSION]: {
        action: 'none',
        message: 'You do not have permission to perform this action',
        delay: 0,
        maxRetries: 0,
        userMessage: 'You do not have permission to perform this action'
      },
      [ErrorCategory.RATE_LIMIT]: {
        action: 'delay',
        message: 'Too many requests, please wait before trying again',
        delay: 10000,
        maxRetries: 1,
        userMessage: 'Too many requests. Please wait a moment before trying again'
      },
      [ErrorCategory.VALIDATION]: {
        action: 'fix_input',
        message: 'Please check your input and try again',
        delay: 0,
        maxRetries: 0,
        userMessage: 'Please check your input data and try again'
      },
      [ErrorCategory.UNKNOWN]: {
        action: 'retry',
        message: 'An unexpected error occurred, please try again',
        delay: 1000,
        maxRetries: 2,
        userMessage: 'An unexpected error occurred. Please try again'
      }
    };

    return suggestions[category] || suggestions[ErrorCategory.UNKNOWN];
  }

  // Enhanced error logging with recovery suggestions
  logErrorWithRecovery(component, action, error, context = {}) {
    const category = this.categorizeError(error);
    const recovery = this.getRecoverySuggestion(category, error);

    this.error(component, action, `Error in ${component}: ${error.message}`, {
      error: error.message,
      stack: error.stack,
      category,
      recovery,
      userMessage: recovery.userMessage,
      ...context
    });

    return { category, recovery };
  }

  // Log operation with error handling and recovery
  logOperationWithRecovery(component, action, operation, error, context = {}) {
    if (error) {
      const { category, recovery } = this.logErrorWithRecovery(component, action, error, {
        operation,
        ...context
      });

      return {
        success: false,
        category,
        recovery,
        userMessage: recovery.userMessage
      };
    } else {
      this.info(component, action, `${operation} completed successfully`, context);
      return { success: true };
    }
  }

  // Create error boundary data for crash reporting
  createErrorBoundary(error, componentStack) {
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
      metrics: this.getMetrics()
    };
  }

  // Clear logs
  clearLogs() {
    this.logs = [];
    this.metrics = {
      operationCounts: new Map(),
      operationTimes: new Map(),
      errorCounts: new Map(),
      userActions: new Map()
    };
    this.info(LogComponent.PERFORMANCE, 'logs_cleared', 'All logs and metrics cleared');
  }
}

// Create singleton instance
export const logger = new Logger();

// Export throttle utilities
export { RequestThrottle, globalThrottle };

// Add global access for debugging
if (typeof window !== 'undefined') {
  window.walSheetzLogger = logger;
  
  // Add global performance monitoring
  window.addEventListener('load', () => {
    logger.info(LogComponent.PERFORMANCE, 'page_load', 'Page fully loaded', {
      loadTime: performance.now(),
      timing: performance.timing ? {
        navigationStart: performance.timing.navigationStart,
        loadEventEnd: performance.timing.loadEventEnd,
        domContentLoaded: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
        totalLoadTime: performance.timing.loadEventEnd - performance.timing.navigationStart
      } : null
    });
  });

  // Monitor memory usage if available
  if (performance.memory) {
    setInterval(() => {
      logger.debug(LogComponent.PERFORMANCE, 'memory_usage', 'Memory usage snapshot', {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        usedPercent: ((performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100).toFixed(2)
      });
    }, 30000); // Every 30 seconds
  }

  // Monitor long tasks (if supported)
  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) { // Tasks longer than 50ms
            logger.warn(LogComponent.PERFORMANCE, 'long_task', 'Long task detected', {
              duration: entry.duration,
              startTime: entry.startTime,
              name: entry.name
            });
          }
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch (error) {
      // Ignore if PerformanceObserver doesn't support longtask
    }
  }
}