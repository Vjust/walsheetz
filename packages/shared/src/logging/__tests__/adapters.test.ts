/**
 * Tests for platform adapters
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { BrowserLoggerAdapter } from '../adapters/browser.js'
import { NodeLoggerAdapter } from '../adapters/node.js'

describe('BrowserLoggerAdapter', () => {
  let adapter: BrowserLoggerAdapter

  beforeEach(() => {
    adapter = new BrowserLoggerAdapter()
    // Clear localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
  })

  afterEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
  })

  it('should get and set debug mode', () => {
    adapter.setDebugMode(true)
    expect(adapter.getDebugMode()).toBe(true)

    adapter.setDebugMode(false)
    expect(adapter.getDebugMode()).toBe(false)
  })

  it('should save error logs to localStorage', () => {
    const errorLog = {
      level: 'error',
      message: 'Test error',
      timestamp: new Date().toISOString(),
    }

    adapter.saveErrorLog(errorLog)
    const logs = adapter.getErrorLogs()

    expect(logs).toHaveLength(1)
    expect(logs[0]).toEqual(errorLog)
  })

  it('should respect max error logs limit', () => {
    const adapter2 = new BrowserLoggerAdapter({ maxErrorLogs: 3 })

    for (let i = 0; i < 5; i++) {
      adapter2.saveErrorLog({ id: i })
    }

    const logs = adapter2.getErrorLogs()
    expect(logs).toHaveLength(3)
    // Should keep most recent logs (remove oldest)
    expect(logs[0]).toHaveProperty('id', 2)
  })

  it('should start and end performance mark', () => {
    vi.useFakeTimers()

    adapter.startMark('test-operation')
    vi.advanceTimersByTime(100)
    const duration = adapter.endMark('test-operation')

    expect(duration).toBe(100)
    vi.useRealTimers()
  })

  it('should return null for ending non-existent mark', () => {
    const duration = adapter.endMark('non-existent')
    expect(duration).toBeNull()
  })

  it('should clear error logs', () => {
    adapter.saveErrorLog({ test: 'log' })
    expect(adapter.getErrorLogs()).toHaveLength(1)

    adapter.clearErrorLogs()
    expect(adapter.getErrorLogs()).toHaveLength(0)
  })

  it('should handle disabled localStorage gracefully', () => {
    const adapter2 = new BrowserLoggerAdapter({ enableLocalStorage: false })

    // Should not throw
    adapter2.saveErrorLog({ test: 'log' })
    adapter2.setDebugMode(true)

    expect(adapter2.getDebugMode()).toBe(false)
    expect(adapter2.getErrorLogs()).toEqual([])
  })
})

describe('NodeLoggerAdapter', () => {
  let adapter: NodeLoggerAdapter

  beforeEach(() => {
    adapter = new NodeLoggerAdapter()
  })

  it('should colorize text when colors enabled', () => {
    const adapter2 = new NodeLoggerAdapter({ useColors: true })
    const colored = adapter2.colorize('test', '\x1b[32m')

    expect(colored).toContain('\x1b[32m')
    expect(colored).toContain('\x1b[0m')
  })

  it('should not colorize text when colors disabled', () => {
    const adapter2 = new NodeLoggerAdapter({ useColors: false })
    const colored = adapter2.colorize('test', '\x1b[32m')

    expect(colored).toBe('test')
  })

  it('should format message with level, emoji, and metadata', () => {
    const adapter2 = new NodeLoggerAdapter({
      useColors: false,
      useEmojis: true,
      timestamps: false,
    })

    const message = adapter2.formatMessage('info', 'Test message', { key: 'value' })

    expect(message).toContain('INFO')
    expect(message).toContain('Test message')
    expect(message).toContain('key')
  })

  it('should format message without emojis when disabled', () => {
    const adapter2 = new NodeLoggerAdapter({
      useColors: false,
      useEmojis: false,
      timestamps: false,
    })

    const message = adapter2.formatMessage('info', 'Test message')

    expect(message).not.toContain('ℹ️')
    expect(message).toContain('INFO')
  })

  it('should include timestamp when enabled', () => {
    const adapter2 = new NodeLoggerAdapter({
      useColors: false,
      timestamps: true,
    })

    const message = adapter2.formatMessage('info', 'Test')

    expect(message).toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('should get environment variable', () => {
    const value = adapter.getEnvVar('PATH')
    // PATH should exist in most environments
    expect(typeof value).toBe('string')
  })

  it('should return default for missing environment variable', () => {
    const value = adapter.getEnvVar('__NON_EXISTENT_VAR__', 'default')
    expect(value).toBe('default')
  })

  it('should check TTY status', () => {
    const isTTY = adapter.isTTY()
    expect(typeof isTTY).toBe('boolean')
  })

  it('should get memory usage info', () => {
    const memUsage = adapter.getMemoryUsage()

    if (memUsage) {
      expect(memUsage).toHaveProperty('rss')
      expect(memUsage).toHaveProperty('heapUsed')
      expect(memUsage).toHaveProperty('heapTotal')
      expect(memUsage.rss).toMatch(/MB$/)
    }
  })
})
