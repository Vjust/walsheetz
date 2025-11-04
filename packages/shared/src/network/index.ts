/**
 * Network utilities including retry logic and rate limiting
 */

import type { RetryOptions, RateLimitOptions, AsyncResult } from '../types/index.js'
import { ok, err } from '../types/index.js'

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: () => true,
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): AsyncResult<T, Error> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options }
  let lastError: Error = new Error('Unknown error')
  let delay = opts.initialDelay

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const result = await fn()
      return ok(result)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Check if we should retry this error
      if (!opts.retryableErrors(lastError)) {
        return err(lastError)
      }

      // If this was the last attempt, don't delay
      if (attempt === opts.maxAttempts) {
        break
      }

      // Wait before retrying
      await sleep(delay)

      // Increase delay for next attempt (exponential backoff)
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelay)
    }
  }

  return err(lastError)
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Rate limiter using token bucket algorithm
 */
export class RateLimiter {
  private tokens: number
  private lastRefill: number
  private readonly maxTokens: number
  private readonly refillRate: number // tokens per millisecond

  constructor(options: RateLimitOptions) {
    this.maxTokens = options.maxRequests
    this.tokens = options.maxRequests
    this.refillRate = options.maxRequests / options.windowMs
    this.lastRefill = Date.now()
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    const tokensToAdd = elapsed * this.refillRate

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd)
    this.lastRefill = now
  }

  /**
   * Try to acquire a token
   */
  async acquire(): Promise<void> {
    this.refill()

    if (this.tokens >= 1) {
      this.tokens -= 1
      return
    }

    // Calculate how long to wait for a token
    const tokensNeeded = 1 - this.tokens
    const waitMs = tokensNeeded / this.refillRate

    await sleep(waitMs)
    this.tokens = 0
  }

  /**
   * Check if a token can be acquired without waiting
   */
  canAcquire(): boolean {
    this.refill()
    return this.tokens >= 1
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.tokens = this.maxTokens
    this.lastRefill = Date.now()
  }
}

/**
 * Create a rate limiter
 */
export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  return new RateLimiter(options)
}

/**
 * Throttle a function to a maximum number of concurrent executions
 */
export class ConcurrencyLimiter {
  private running = 0
  private readonly queue: Array<() => void> = []

  constructor(private readonly maxConcurrency: number) {}

  /**
   * Execute a function with concurrency limiting
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Wait for a slot if at max concurrency
    if (this.running >= this.maxConcurrency) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve)
      })
    }

    this.running++

    try {
      return await fn()
    } finally {
      this.running--

      // Release next queued function
      const next = this.queue.shift()
      if (next) {
        next()
      }
    }
  }

  /**
   * Get current number of running executions
   */
  getRunning(): number {
    return this.running
  }

  /**
   * Get number of queued executions
   */
  getQueued(): number {
    return this.queue.length
  }
}

/**
 * Create a concurrency limiter
 */
export function createConcurrencyLimiter(maxConcurrency: number): ConcurrencyLimiter {
  return new ConcurrencyLimiter(maxConcurrency)
}

/**
 * Timeout wrapper for promises
 */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): AsyncResult<T, Error> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
  })

  try {
    const result = await Promise.race([promise, timeoutPromise])
    return ok(result)
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)))
  }
}
