#!/usr/bin/env node

/**
 * Shared Logger Utility for Node/Bun Scripts
 * Provides consistent, structured logging across CLI tools and backend services
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4
};

const LOG_LEVEL_NAMES = Object.keys(LOG_LEVELS);

// ANSI color codes for terminal output
const COLORS = {
  RESET: '\x1b[0m',
  BRIGHT: '\x1b[1m',
  DIM: '\x1b[2m',

  // Foreground colors
  BLACK: '\x1b[30m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',

  // Background colors
  BG_RED: '\x1b[41m',
  BG_YELLOW: '\x1b[43m',
};

// Emoji indicators for each log level
const EMOJI_INDICATORS = {
  DEBUG: '🔍',
  INFO: 'ℹ️ ',
  WARN: '⚠️ ',
  ERROR: '❌',
  CRITICAL: '🚨'
};

/**
 * Create a logger instance
 * @param {string} component - Component name (e.g., 'GraphQLSubscriber', 'Bridge', 'ScriptName')
 * @param {object} options - Logger options
 * @param {string} options.logLevel - Minimum log level (DEBUG, INFO, WARN, ERROR, CRITICAL)
 * @param {boolean} options.useColors - Whether to use ANSI colors (default: true in TTY)
 * @param {boolean} options.useEmojis - Whether to use emoji indicators (default: true)
 * @param {boolean} options.timestamps - Whether to include timestamps (default: true)
 * @returns {object} Logger instance
 */
export function createLogger(component, options = {}) {
  // Determine log level from options or environment variable
  // Support both Node.js and browser environments
  const envLogLevel = (typeof process !== 'undefined' && process.env)
    ? (process.env.LOG_LEVEL?.toUpperCase() || process.env.BRIDGE_LOG_LEVEL?.toUpperCase())
    : undefined;
  const configuredLevel = options.logLevel?.toUpperCase() || envLogLevel || 'INFO';
  const logLevel = LOG_LEVELS[configuredLevel] !== undefined ? LOG_LEVELS[configuredLevel] : LOG_LEVELS.INFO;

  // Determine if we should use colors (default: true if stdout is a TTY)
  // In browser environments, default to false since ANSI colors don't work in console
  const useColors = options.useColors !== undefined
    ? options.useColors
    : (typeof process !== 'undefined' && process.stdout?.isTTY) ?? false;

  const useEmojis = options.useEmojis !== undefined ? options.useEmojis : true;
  const timestamps = options.timestamps !== undefined ? options.timestamps : true;

  // Throttle state
  const throttleState = {
    lastLogTimes: new Map(),
    logCounts: new Map()
  };

  /**
   * Check if a log should be emitted based on level
   */
  function shouldLog(level) {
    return level >= logLevel;
  }

  /**
   * Format timestamp in ISO format
   */
  function formatTimestamp() {
    return new Date().toISOString();
  }

  /**
   * Colorize text if colors are enabled
   */
  function colorize(text, color) {
    if (!useColors) return text;
    return `${color}${text}${COLORS.RESET}`;
  }

  /**
   * Format a log message
   */
  function formatMessage(level, message, metadata = {}) {
    const levelName = LOG_LEVEL_NAMES[level] || 'INFO';
    const emoji = useEmojis ? EMOJI_INDICATORS[levelName] : '';

    // Color by level
    let levelColor = COLORS.WHITE;
    switch (level) {
      case LOG_LEVELS.DEBUG:
        levelColor = COLORS.DIM + COLORS.CYAN;
        break;
      case LOG_LEVELS.INFO:
        levelColor = COLORS.GREEN;
        break;
      case LOG_LEVELS.WARN:
        levelColor = COLORS.YELLOW;
        break;
      case LOG_LEVELS.ERROR:
        levelColor = COLORS.RED;
        break;
      case LOG_LEVELS.CRITICAL:
        levelColor = COLORS.BRIGHT + COLORS.RED;
        break;
    }

    // Build message parts
    const parts = [];

    if (timestamps) {
      parts.push(colorize(`[${formatTimestamp()}]`, COLORS.DIM));
    }

    parts.push(colorize(`${levelName}`, levelColor));
    parts.push(colorize(`[${component}]`, COLORS.CYAN));
    parts.push(emoji);
    parts.push(message);

    // Add metadata if present
    if (Object.keys(metadata).length > 0) {
      parts.push(colorize(`| ${JSON.stringify(metadata)}`, COLORS.DIM));
    }

    return parts.join(' ');
  }

  /**
   * Core log function
   */
  function log(level, message, metadata = {}) {
    if (!shouldLog(level)) {
      return;
    }

    const formattedMessage = formatMessage(level, message, metadata);

    // Output to appropriate stream
    if (level >= LOG_LEVELS.ERROR) {
      console.error(formattedMessage);
    } else {
      console.log(formattedMessage);
    }
  }

  /**
   * Throttled log function
   */
  function throttle(key, level, message, metadata = {}, intervalMs = 30000) {
    const now = Date.now();
    const lastTime = throttleState.lastLogTimes.get(key) || 0;
    const count = (throttleState.logCounts.get(key) || 0) + 1;

    if (now - lastTime >= intervalMs) {
      // Time to log again
      throttleState.lastLogTimes.set(key, now);
      throttleState.logCounts.set(key, 0);

      // Include throttled count if > 1
      const enrichedMetadata = count > 1
        ? { ...metadata, throttledCount: count }
        : metadata;

      const enrichedMessage = count > 1
        ? `${message} (${count - 1} similar events throttled in last ${intervalMs / 1000}s)`
        : message;

      log(level, enrichedMessage, enrichedMetadata);
    } else {
      // Still within throttle interval, accumulate count
      throttleState.logCounts.set(key, count);
    }
  }

  // Return logger API
  return {
    debug(message, metadata = {}) {
      log(LOG_LEVELS.DEBUG, message, metadata);
    },

    info(message, metadata = {}) {
      log(LOG_LEVELS.INFO, message, metadata);
    },

    warn(message, metadata = {}) {
      log(LOG_LEVELS.WARN, message, metadata);
    },

    error(message, metadata = {}) {
      log(LOG_LEVELS.ERROR, message, metadata);
    },

    critical(message, metadata = {}) {
      log(LOG_LEVELS.CRITICAL, message, metadata);
    },

    // Throttled variants
    throttleDebug(key, message, metadata = {}, intervalMs = 30000) {
      throttle(key, LOG_LEVELS.DEBUG, message, metadata, intervalMs);
    },

    throttleInfo(key, message, metadata = {}, intervalMs = 30000) {
      throttle(key, LOG_LEVELS.INFO, message, metadata, intervalMs);
    },

    throttleWarn(key, message, metadata = {}, intervalMs = 30000) {
      throttle(key, LOG_LEVELS.WARN, message, metadata, intervalMs);
    },

    // Utility methods
    shouldLog(level) {
      return shouldLog(level);
    },

    getLevel() {
      return logLevel;
    },

    getLevelName() {
      return LOG_LEVEL_NAMES[logLevel];
    }
  };
}

/**
 * Legacy compatibility wrapper - mimics GraphQLLogger from graphql-event-subscriber.js
 * Can be used as a drop-in replacement
 */
export class GraphQLLogger {
  constructor() {
    this.logger = createLogger('GraphQLEventSubscriber');
    this.logLevel = (typeof process !== 'undefined' && process.env?.BRIDGE_LOG_LEVEL) || 'INFO';
    this.logLevels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
  }

  shouldLog(level) {
    const currentLevel = this.logLevels[this.logLevel] || 1;
    const requestedLevel = this.logLevels[level] || 1;
    return requestedLevel >= currentLevel;
  }

  debug(message) {
    this.logger.debug(message);
  }

  info(message) {
    this.logger.info(message);
  }

  warn(message) {
    this.logger.warn(message);
  }

  error(message) {
    this.logger.error(message);
  }
}

// Export log levels for convenience
export const LogLevels = LOG_LEVELS;

