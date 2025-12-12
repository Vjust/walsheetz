/**
 * Tests for LogThrottle utility
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
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
    expect(result.count).toBe(2)
  })

  it('should allow log after interval expires', () => {
    vi.useFakeTimers()
    throttle.shouldLog('test-key')

    // Move forward by interval
    vi.advanceTimersByTime(30001)

    const result = throttle.shouldLog('test-key')
    expect(result.shouldLog).toBe(true)
    expect(result.count).toBe(1)

    vi.useRealTimers()
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

  it('should respect custom intervals', () => {
    vi.useFakeTimers()

    const result1 = throttle.shouldLog('test-key', 10000)
    expect(result1.shouldLog).toBe(true)

    // Move forward by less than custom interval
    vi.advanceTimersByTime(5000)
    const result2 = throttle.shouldLog('test-key', 10000)
    expect(result2.shouldLog).toBe(false)

    // Move forward past custom interval
    vi.advanceTimersByTime(5001)
    const result3 = throttle.shouldLog('test-key', 10000)
    expect(result3.shouldLog).toBe(true)

    vi.useRealTimers()
  })

  it('should accumulate count correctly', () => {
    throttle.shouldLog('test-key')
    throttle.shouldLog('test-key')
    const result = throttle.shouldLog('test-key')

    expect(result.count).toBe(3)
  })
})
