/**
 * Unified logging interface for SDK packages
 */

import type { LogLevel } from '../types/index.js'

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, error?: Error, meta?: Record<string, unknown>): void
  child(context: Record<string, unknown>): Logger
  startTimer?(label: string): void
  endTimer?(label: string): number | null
  throttle?(key: string, level: LogLevel, message: string, intervalMs?: number): void
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level?: LogLevel
  prefix?: string
  enabled?: boolean
  context?: Record<string, unknown>
}

/**
 * Default console logger implementation
 */
export class ConsoleLogger implements Logger {
  private level: LogLevel
  private prefix: string
  private enabled: boolean
  private context: Record<string, unknown>

  private static readonly LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  }

  constructor(config: LoggerConfig = {}) {
    this.level = config.level || 'info'
    this.prefix = config.prefix || ''
    this.enabled = config.enabled !== false
    this.context = config.context || {}
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.enabled) return false
    return ConsoleLogger.LEVELS[level] >= ConsoleLogger.LEVELS[this.level]
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString()
    const prefixPart = this.prefix ? `[${this.prefix}]` : ''
    return `${timestamp} ${level.toUpperCase()} ${prefixPart} ${message}`
  }

  private formatMeta(meta?: Record<string, unknown>): Record<string, unknown> {
    return { ...this.context, ...meta }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog('debug')) return
    console.debug(this.formatMessage('debug', message), this.formatMeta(meta))
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog('info')) return
    console.info(this.formatMessage('info', message), this.formatMeta(meta))
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog('warn')) return
    console.warn(this.formatMessage('warn', message), this.formatMeta(meta))
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    if (!this.shouldLog('error')) return
    const errorMeta = error
      ? { ...this.formatMeta(meta), error: error.message, stack: error.stack }
      : this.formatMeta(meta)
    console.error(this.formatMessage('error', message), errorMeta)
  }

  child(context: Record<string, unknown>): Logger {
    return new ConsoleLogger({
      level: this.level,
      prefix: this.prefix,
      enabled: this.enabled,
      context: { ...this.context, ...context },
    })
  }
}

/**
 * No-op logger for testing or disabled logging
 */
export class NoOpLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
  child(): Logger {
    return this
  }
}

/**
 * Create a logger instance
 */
export function createLogger(config?: LoggerConfig): Logger {
  return new ConsoleLogger(config)
}

/**
 * Create a no-op logger
 */
export function createNoOpLogger(): Logger {
  return new NoOpLogger()
}
