// Rate limiter utility for blockchain services - Node.js version
// Same API as frontend version for consistency

class RateLimiter {
  private name: string;
  private maxRPS: number;
  private burst: number;
  private maxConcurrent: number;
  private tokens: number;
  private lastRefill: number;
  private refillRate: number;
  private currentConcurrent: number;
  private queue: Array<any>;
  private processing: boolean;
  private inflight: Map<string, Promise<any>>;
  private cache: Map<string, { value: any; timestamp: number; ttl?: number }>;
  private backoffUntil: number;
  private consecutiveFailures: number;
  private baseBackoffMs: number;
  private maxBackoffMs: number;
  private metrics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    queuedRequests: number;
    dedupedRequests: number;
    cacheHits: number;
    totalWaitTime: number;
    last429At: number | null;
    lastError: any;
  };
  private isPaused: boolean;
  private pauseUntil: number;

  constructor({ name, maxRPS, burst, maxConcurrent }: { name: string; maxRPS?: number; burst?: number; maxConcurrent?: number }) {
    this.name = name;
    this.maxRPS = maxRPS || 3;
    this.burst = burst || maxRPS * 2;
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
    
    console.log(`[RateLimiter:${name}] Initialized with maxRPS=${maxRPS}, burst=${burst}, maxConcurrent=${maxConcurrent}`);
  }
  
  // Schedule a function call with rate limiting
  async schedule(key: string, fn: () => Promise<any>, options: { timeoutMs?: number; ttlMs?: number; skipCache?: boolean } = {}) {
    const { timeoutMs = 30000, ttlMs = 0, skipCache = false } = options;
    
    this.metrics.totalRequests++;
    
    // Check cache first if TTL is provided
    if (!skipCache && ttlMs > 0) {
      const cached = this.getCached(key, ttlMs);
      if (cached !== undefined) {
        this.metrics.cacheHits++;
        console.log(`[RateLimiter:${this.name}] Cache hit for key: ${key}`);
        return cached;
      }
    }
    
    // Check for inflight duplicate requests
    if (this.inflight.has(key)) {
      this.metrics.dedupedRequests++;
      console.log(`[RateLimiter:${this.name}] Deduping request for key: ${key}`);
      return this.inflight.get(key);
    }
    
    // Create promise for this request
    const promise = new Promise((resolve, reject) => {
      const request = {
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
          const index = this.queue.indexOf(request);
          if (index !== -1) {
            this.queue.splice(index, 1);
            reject(new Error(`Request timeout after ${timeoutMs}ms`));
          }
        }, timeoutMs);
      }
      
      this.queue.push(request);
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
      this.processQueue();
    }
    
    return promise;
  }
  
  // Process queued requests
  async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      // Check if we're in backoff period
      const now = Date.now();
      if (this.isPaused && now < this.pauseUntil) {
        const waitTime = this.pauseUntil - now;
        console.log(`[RateLimiter:${this.name}] Paused for ${waitTime}ms`);
        await this.sleep(waitTime);
        continue;
      }
      
      // Check global backoff
      if (now < this.backoffUntil) {
        const waitTime = this.backoffUntil - now;
        await this.sleep(Math.min(waitTime, 1000));
        continue;
      }
      
      // Refill tokens
      this.refillTokens();
      
      // Check token availability
      if (this.tokens < 1) {
        // Wait for next token
        await this.sleep(this.refillRate);
        continue;
      }
      
      // Check concurrency limit
      if (this.currentConcurrent >= this.maxConcurrent) {
        await this.sleep(100);
        continue;
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
  async executeRequest(request: any): Promise<void> {
    try {
      const result = await request.fn();

      // Cache result if TTL specified
      if (request.ttlMs > 0) {
        this.setCached(request.key, result, request.ttlMs);
      }

      this.recordSuccess();
      request.resolve(result);
    } catch (error) {
      const err = error as Error;
      this.recordFailure(err);
      request.reject(err);
    } finally {
      this.currentConcurrent--;
      
      // Continue processing queue
      if (!this.processing && this.queue.length > 0) {
        this.processQueue();
      }
    }
  }
  
  // Refill tokens based on elapsed time
  refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.refillRate);

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.burst, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }
  
  // Handle HTTP response for backoff logic
  onHttpResponse(response: any): void {
    if (!response) return;

    const status = response.status;
    
    // Check for rate limit or service unavailable
    if (status === 429 || status === 503) {
      this.metrics.last429At = Date.now();
      
      // Check for Retry-After header
      const retryAfter = response.headers?.get?.('Retry-After') || response.headers?.['retry-after'];
      if (retryAfter) {
        const retryMs = this.parseRetryAfter(retryAfter);
        this.pause(retryMs);
        console.warn(`[RateLimiter:${this.name}] Got ${status}, pausing for ${retryMs}ms (Retry-After)`);
      } else {
        // Exponential backoff with jitter
        const backoffMs = this.calculateBackoff();
        this.pause(backoffMs);
        console.warn(`[RateLimiter:${this.name}] Got ${status}, backing off for ${backoffMs}ms`);
      }
    } else if (status >= 200 && status < 300) {
      // Success - reset consecutive failures
      this.consecutiveFailures = 0;
    }
  }
  
  // Parse Retry-After header (seconds or HTTP date)
  parseRetryAfter(retryAfter: string): number {
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
    this.consecutiveFailures++;
    const exponential = Math.min(
      this.maxBackoffMs,
      this.baseBackoffMs * Math.pow(2, this.consecutiveFailures - 1)
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
  recordSuccess(): void {
    this.metrics.successfulRequests++;
    this.consecutiveFailures = 0;
  }

  // Record failed request
  recordFailure(error: Error): void {
    this.metrics.failedRequests++;
    this.metrics.lastError = error?.message || 'Unknown error';
    this.consecutiveFailures++;
  }
  
  // Get cached value if still valid
  getCached(key: string, ttlMs: number): any {
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
  setCached(key: string, value: any, ttlMs: number): void {
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
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Get current metrics
  getMetrics(): any {
    return {
      ...this.metrics,
      currentQueueLength: this.queue.length,
      currentConcurrent: this.currentConcurrent,
      tokens: this.tokens,
      backoffActive: Date.now() < this.backoffUntil,
      avgWaitMs: this.metrics.totalRequests > 0
        ? Math.round(this.metrics.totalWaitTime / this.metrics.totalRequests)
        : 0,
      requestsPerSec: this.maxRPS,
      cacheSize: this.cache.size,
      inflightSize: this.inflight.size
    };
  }

  // Clear the queue (emergency use)
  clearQueue(): void {
    while (this.queue.length > 0) {
      const request = this.queue.shift();
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      request.reject(new Error('Queue cleared'));
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
    
    console.log(`[RateLimiter:${this.name}] Reset`);
  }
}

export default RateLimiter;