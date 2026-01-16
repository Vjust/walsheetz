// Rate limiter utility with token bucket algorithm, exponential backoff, and deduplication
import { logger } from "./Logger.js";

interface RateLimiterOptions {
  name: string;
  maxRPS?: number;
  burst?: number;
  maxConcurrent?: number;
}

interface QueuedRequest<T> {
  key: string;
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  timeoutMs: number;
  ttlMs: number;
  enqueuedAt: number;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

interface RateLimiterMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  queuedRequests: number;
  dedupedRequests: number;
  cacheHits: number;
  totalWaitTime: number;
  last429At: number | null;
  lastError: string | null;
}

interface CachedEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

class RateLimiter {
  private name: string;
  private maxRPS: number;
  private burst: number;
  private maxConcurrent: number;
  private tokens: number;
  private lastRefill: number;
  private refillRate: number;
  private currentConcurrent: number;
  private queue: QueuedRequest<unknown>[];
  private processing: boolean;
  private inflight: Map<string, Promise<unknown>>;
  private cache: Map<string, CachedEntry<unknown>>;
  private backoffUntil: number;
  private consecutiveFailures: number;
  private baseBackoffMs: number;
  private maxBackoffMs: number;
  private metrics: RateLimiterMetrics;
  private isPaused: boolean;
  private pauseUntil: number;

  constructor({ name, maxRPS, burst, maxConcurrent }: RateLimiterOptions) {
    this.name = name;
    this.maxRPS = maxRPS || 3;
    this.burst = burst || this.maxRPS * 2;
    this.maxConcurrent = maxConcurrent || 4;

    // Token bucket state
    this.tokens = this.burst;
    this.lastRefill = Date.now();
    this.refillRate = 1000 / this.maxRPS; // ms per token

    // Concurrency control
    this.currentConcurrent = 0;

    // Request queue
    this.queue = [];
    this.processing = false;

    // Deduplication map
    this.inflight = new Map();

    // Cache for short-TTL storage
    this.cache = new Map();

    // Backoff state
    this.backoffUntil = 0;
    this.consecutiveFailures = 0;
    this.baseBackoffMs = 500;
    this.maxBackoffMs = 30000;

    // Metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      queuedRequests: 0,
      dedupedRequests: 0,
      cacheHits: 0,
      totalWaitTime: 0,
      last429At: null,
      lastError: null
    };

    // Pause state for domain-specific backoff
    this.isPaused = false;
    this.pauseUntil = 0;

    logger.info('RateLimiter', 'init', `RateLimiter[${name}] initialized`, {
      maxRPS,
      burst,
      maxConcurrent
    });
  }

  // Schedule a function call with rate limiting
  async schedule<T>(key: string, fn: () => Promise<T>, options: { timeoutMs?: number; ttlMs?: number; skipCache?: boolean } = {}): Promise<T> {
    const { timeoutMs = 30000, ttlMs = 0, skipCache = false } = options;

    this.metrics.totalRequests++;

    // Check cache first if TTL is provided
    if (!skipCache && ttlMs > 0) {
      const cached = this.getCached(key, ttlMs);
      if (cached !== undefined) {
        this.metrics.cacheHits++;
        logger.debug('RateLimiter', 'cache_hit', `Cache hit for key: ${key}`);
        return cached as T;
      }
    }

    // Check for inflight duplicate requests
    if (this.inflight.has(key)) {
      this.metrics.dedupedRequests++;
      logger.debug('RateLimiter', 'dedup', `Deduping request for key: ${key}`);
      return this.inflight.get(key) as Promise<T>;
    }

    // Create promise for this request
    const promise = new Promise<T>((resolve, reject) => {
      const request: QueuedRequest<T> = {
        key,
        fn,
        resolve,
        reject,
        timeoutMs,
        ttlMs,
        enqueuedAt: Date.now(),
        timeoutId: null
      };

      // Set timeout if specified
      if (timeoutMs > 0) {
        request.timeoutId = setTimeout(() => {
          const index = this.queue.indexOf(request as QueuedRequest<unknown>);
          if (index !== -1) {
            this.queue.splice(index, 1);
            reject(new Error(`Request timeout after ${timeoutMs}ms`));
          }
        }, timeoutMs);
      }

      this.queue.push(request as QueuedRequest<unknown>);
      this.metrics.queuedRequests = this.queue.length;
    });

    // Store in inflight map
    this.inflight.set(key, promise);

    // Clean up inflight on completion
    promise.finally(() => {
      this.inflight.delete(key);
    });

    // Start processing queue if not already running
    if (!this.processing) {
      // Use microtask to avoid dependency on fake timers in tests
      queueMicrotask(() => this.processQueue());
    }

    return promise;
  }

  // Process queued requests
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      // Check if we're in backoff period
      const now = Date.now();
      if (this.isPaused && now < this.pauseUntil) {
        const waitTime = this.pauseUntil - now;
        logger.debug('RateLimiter', 'paused', `Paused for ${waitTime}ms`);
        this.processing = false;
        setTimeout(() => this.processQueue(), waitTime);
        return;
      }

      // Check global backoff
      if (now < this.backoffUntil) {
        const waitTime = this.backoffUntil - now;
        this.processing = false;
        setTimeout(() => this.processQueue(), Math.min(waitTime, 1000));
        return;
      }

      // Refill tokens
      this.refillTokens();

      // Check token availability
      if (this.tokens < 1) {
        this.processing = false;
        setTimeout(() => this.processQueue(), this.refillRate);
        return;
      }

      // Check concurrency limit
      if (this.currentConcurrent >= this.maxConcurrent) {
        this.processing = false;
        setTimeout(() => this.processQueue(), 0);
        return;
      }

      // Process next request
      const request = this.queue.shift();
      if (!request) continue;

      // Clear timeout since we're processing it
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }

      // Check if request already timed out
      if (Date.now() - request.enqueuedAt > request.timeoutMs) {
        request.reject(new Error('Request expired in queue'));
        continue;
      }

      // Consume token and increment concurrent count
      this.tokens--;
      this.currentConcurrent++;

      // Track wait time
      const waitTime = Date.now() - request.enqueuedAt;
      this.metrics.totalWaitTime += waitTime;

      // Execute the function
      this.executeRequest(request);
    }

    this.processing = false;
    this.metrics.queuedRequests = this.queue.length;
  }

  // Execute a single request
  private async executeRequest(request: QueuedRequest<unknown>): Promise<void> {
    try {
      const result = await request.fn();

      // Cache result if TTL specified
      if (request.ttlMs > 0) {
        this.setCached(request.key, result, request.ttlMs);
      }

      this.recordSuccess();
      request.resolve(result);
    } catch (error) {
      this.recordFailure(error as Error | null);
      request.reject(error);
    } finally {
      this.currentConcurrent--;

      // Continue processing queue
      if (!this.processing && this.queue.length > 0) {
        this.processQueue();
      }
    }
  }

  // Refill tokens based on elapsed time
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.refillRate);

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.burst, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  // Handle HTTP response for backoff logic
  onHttpResponse(response: { status: number; headers?: { get?: (name: string) => string | null } } | null): void {
    if (!response) return;

    const status = response.status;

    // Check for rate limit or service unavailable
    if (status === 429 || status === 503) {
      this.metrics.last429At = Date.now();

      // Check for Retry-After header
      const retryAfter = response.headers?.get?.('Retry-After');
      if (retryAfter) {
        const retryMs = this.parseRetryAfter(retryAfter);
        this.pause(retryMs);
        logger.warn('RateLimiter', 'rate_limit', `Got ${status}, pausing for ${retryMs}ms (Retry-After)`);
      } else {
        // Exponential backoff with jitter
        const backoffMs = this.calculateBackoff();
        this.pause(backoffMs);
        logger.warn('RateLimiter', 'backoff', `Got ${status}, backing off for ${backoffMs}ms`);
      }
    } else if (status >= 200 && status < 300) {
      // Success - reset consecutive failures
      this.consecutiveFailures = 0;
    }
  }

  // Parse Retry-After header (seconds or HTTP date)
  private parseRetryAfter(retryAfter: string): number {
    // Check if it's a number (seconds)
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }

    // Try to parse as HTTP date
    const retryDate = new Date(retryAfter);
    if (!isNaN(retryDate.getTime())) {
      return Math.max(0, retryDate.getTime() - Date.now());
    }

    // Default to 5 seconds if we can't parse
    return 5000;
  }

  // Calculate exponential backoff with full jitter
  calculateBackoff(): number {
    const failures = Math.max(1, this.consecutiveFailures);
    const exponential = Math.min(
      this.maxBackoffMs,
      this.baseBackoffMs * Math.pow(2, failures - 1)
    );
    // Full jitter
    return Math.floor(Math.random() * exponential);
  }

  // Pause the limiter for specified milliseconds
  pause(ms: number): void {
    const until = Date.now() + ms;
    this.isPaused = true;
    this.pauseUntil = until;
    this.backoffUntil = until;

    // Auto-resume after pause
    setTimeout(() => {
      this.isPaused = false;
      if (!this.processing && this.queue.length > 0) {
        this.processQueue();
      }
    }, ms);
  }

  // Record successful request
  private recordSuccess(): void {
    this.metrics.successfulRequests++;
    this.consecutiveFailures = 0;
  }

  // Record failed request
  private recordFailure(error: Error | null): void {
    this.metrics.failedRequests++;
    this.metrics.lastError = error?.message || 'Unknown error';
    this.consecutiveFailures++;
  }

  // Get cached value if still valid
  private getCached(key: string, ttlMs: number): unknown {
    const cached = this.cache.get(key);
    if (!cached) return undefined;

    const age = Date.now() - cached.timestamp;
    if (age > ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    return cached.value;
  }

  // Set cached value
  private setCached(key: string, value: unknown, ttlMs: number): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttlMs
    });

    // Auto-cleanup after TTL
    setTimeout(() => {
      this.cache.delete(key);
    }, ttlMs);
  }

  // Sleep helper
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Get current metrics
  getMetrics(): Record<string, unknown> {
    return {
      ...this.metrics,
      currentQueueLength: this.queue.length,
      currentConcurrent: this.currentConcurrent,
      tokens: this.tokens,
      backoffActive: Date.now() < this.backoffUntil,
      avgWaitMs: this.metrics.totalRequests > 0 ?
      Math.round(this.metrics.totalWaitTime / this.metrics.totalRequests) :
      0,
      requestsPerSec: this.maxRPS,
      cacheSize: this.cache.size,
      inflightSize: this.inflight.size
    };
  }

  // Clear the queue (emergency use)
  clearQueue(): void {
    while (this.queue.length > 0) {
      const request = this.queue.shift();
      if (request) {
        if (request.timeoutId) {
          clearTimeout(request.timeoutId);
        }
        request.reject(new Error('Queue cleared'));
      }
    }
    this.metrics.queuedRequests = 0;
  }

  // Reset limiter state
  reset(): void {
    this.clearQueue();
    this.tokens = this.burst;
    this.lastRefill = Date.now();
    this.currentConcurrent = 0;
    this.consecutiveFailures = 0;
    this.backoffUntil = 0;
    this.isPaused = false;
    this.pauseUntil = 0;
    this.inflight.clear();
    this.cache.clear();
    this.processing = false;

    logger.info('RateLimiter', 'reset', `RateLimiter[${this.name}] Reset`);
  }
}

export default RateLimiter;