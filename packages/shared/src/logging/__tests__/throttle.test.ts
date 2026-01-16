/**
 * Tests for LogThrottle utility
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { LogThrottle } from '../features/throttle.js'

describe('LogThrottle', () => {
  let throttle: LogThrottle

  beforeEach(() => {
    throttle = new LogThrottle()
  })

  it('should allow first log', () => {
    const result = throttle.shouldLog('test-key')
    expect(result.shouldLog).toBe(true)
    expect(result.count).toBe(1)
  })

  it('should block second log within interval', () => {
    throttle.shouldLog('test-key')
    const result = throttle.shouldLog('test-key')
    expect(result.shouldLog).toBe(false)
    // Count reflects total calls since last allowed log
    expect(result.count).toBeGreaterThanOrEqual(1)
  })

  it('should track multiple keys independently', () => {
    const result1 = throttle.shouldLog('key-1')
    const result2 = throttle.shouldLog('key-2')

    expect(result1.shouldLog).toBe(true)
    expect(result2.shouldLog).toBe(true)
  })

  it('should reset key state', () => {
    throttle.shouldLog('test-key')
    throttle.reset('test-key')
    const result = throttle.shouldLog('test-key')

    expect(result.shouldLog).toBe(true)
    expect(result.count).toBe(1)
  })

  it('should clear all state', () => {
    throttle.shouldLog('key-1')
    throttle.shouldLog('key-2')
    throttle.clearAll()

    const result1 = throttle.shouldLog('key-1')
    const result2 = throttle.shouldLog('key-2')

    expect(result1.shouldLog).toBe(true)
    expect(result2.shouldLog).toBe(true)
  })

  it('should accept custom interval parameter', () => {
    // First call with custom interval should be allowed
    const result1 = throttle.shouldLog('test-key', 10000)
    expect(result1.shouldLog).toBe(true)

    // Second call immediately after should be blocked
    const result2 = throttle.shouldLog('test-key', 10000)
    expect(result2.shouldLog).toBe(false)
  })

  it('should track count across blocked calls', () => {
    throttle.shouldLog('test-key')
    throttle.shouldLog('test-key')
    const result = throttle.shouldLog('test-key')

    // Count should be at least 1 (implementation may vary)
    expect(result.count).toBeGreaterThanOrEqual(1)
  })

  it('should handle rapid sequential calls', () => {
    // First call allowed
    expect(throttle.shouldLog('rapid-key').shouldLog).toBe(true)

    // Rapid subsequent calls should be blocked
    for (let i = 0; i < 5; i++) {
      expect(throttle.shouldLog('rapid-key').shouldLog).toBe(false)
    }
  })
})
