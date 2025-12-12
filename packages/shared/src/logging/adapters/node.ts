/**
 * Node.js platform adapter for logging
 * Provides Node-specific features like TTY colors and process environment
 */

import type { LogLevel } from '../../types/index.js'

export interface NodeLoggerConfig {
  useColors?: boolean
  useEmojis?: boolean
  timestamps?: boolean
}

/**
 * ANSI color codes for terminal output
 */
const COLORS = {
  RESET: '\x1b[0m',
  BRIGHT: '\x1b[1m',
  DIM: '\x1b[2m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',
} as const

/**
 * Emoji indicators for each log level
 */
const EMOJI_INDICATORS: Record<string, string> = {
  debug: '🔍',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
}

/**
 * Node.js-specific logging utilities
 */
export class NodeLoggerAdapter {
  private useColors: boolean
  private useEmojis: boolean
  private timestamps: boolean

  constructor(config: NodeLoggerConfig = {}) {
    // Determine if we should use colors (default: true if stdout is a TTY)
    this.useColors =
      config.useColors !== undefined
        ? config.useColors
        : typeof process !== 'undefined' && process.stdout?.isTTY === true

    this.useEmojis = config.useEmojis !== undefined ? config.useEmojis : true
    this.timestamps = config.timestamps !== undefined ? config.timestamps : true
  }

  /**
   * Colorize text if colors are enabled
   */
  colorize(text: string, color: string): string {
    if (!this.useColors) return text
    return `${color}${text}${COLORS.RESET}`
  }

  /**
   * Format a log message with colors and emojis
   */
  formatMessage(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
  ): string {
    const levelName = level.toUpperCase()
    const emoji = this.useEmojis ? EMOJI_INDICATORS[level] || '' : ''

    // Color by level
    let levelColor = COLORS.WHITE
    switch (level) {
      case 'debug':
        levelColor = COLORS.DIM + COLORS.CYAN
        break
      case 'info':
        levelColor = COLORS.GREEN
        break
      case 'warn':
        levelColor = COLORS.YELLOW
        break
      case 'error':
        levelColor = COLORS.RED
        break
    }

    // Build message parts
    const parts: string[] = []

    if (this.timestamps) {
      parts.push(this.colorize(`[${new Date().toISOString()}]`, COLORS.DIM))
    }

    parts.push(this.colorize(levelName, levelColor))
    if (emoji) {
      parts.push(emoji)
    }
    parts.push(message)

    // Add metadata if present
    if (meta && Object.keys(meta).length > 0) {
      parts.push(this.colorize(`| ${JSON.stringify(meta)}`, COLORS.DIM))
    }

    return parts.join(' ')
  }

  /**
   * Output to appropriate stream
   */
  output(level: LogLevel, message: string): void {
    if (typeof process === 'undefined') return

    if (level === 'error') {
      console.error(message)
    } else {
      console.log(message)
    }
  }

  /**
   * Get environment variable
   */
  getEnvVar(name: string, defaultValue?: string): string | undefined {
    if (typeof process === 'undefined' || !process.env) {
      return defaultValue
    }
    return process.env[name] || defaultValue
  }

  /**
   * Check if running in TTY
   */
  isTTY(): boolean {
    if (typeof process === 'undefined' || !process.stdout) {
      return false
    }
    return process.stdout.isTTY === true
  }

  /**
   * Get memory usage info
   */
  getMemoryUsage(): { rss: string; heapUsed: string; heapTotal: string } | null {
    if (typeof process === 'undefined' || !process.memoryUsage) {
      return null
    }

    const usage = process.memoryUsage()
    return {
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
    }
  }
}
