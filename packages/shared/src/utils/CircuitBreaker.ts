/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures by "opening" the circuit when failures exceed threshold,
 * allowing the system to fail fast instead of waiting for timeouts.
 *
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Circuit is open, requests fail immediately
 * - HALF_OPEN: Testing if service has recovered
 */

export const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
} as const;

export type CircuitStateType = typeof CircuitState[keyof typeof CircuitState];

interface CircuitBreakerOptions {
  failureThreshold?: number;
  recoveryTimeout?: number;
  monitoringPeriod?: number;
  expectedErrors?: Array<string | RegExp | (new (...args: unknown[]) => Error)>;
  onStateChange?: (state: CircuitStateType, name: string) => void;
  name?: string;
}

interface CircuitBreakerStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  timeouts: number;
  circuitOpenCount: number;
}

export class CircuitBreaker {
  private failureThreshold: number;
  private recoveryTimeout: number;
  private monitoringPeriod: number;
  private expectedErrors: Array<string | RegExp | (new (...args: unknown[]) => Error)>;
  private failureCount: number;
  private lastFailureTime: number | null;
  private state: CircuitStateType;
  private nextAttemptTime: number;
  private stats: CircuitBreakerStats;
  private onStateChange: (state: CircuitStateType, name: string) => void;
  private name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout = options.recoveryTimeout || 60000;
    this.monitoringPeriod = options.monitoringPeriod || 60000;
    this.expectedErrors = options.expectedErrors || [];

    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = CircuitState.CLOSED;
    this.nextAttemptTime = 0;

    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      timeouts: 0,
      circuitOpenCount: 0
    };

    this.onStateChange = options.onStateChange || (() => {});
    this.name = options.name || 'CircuitBreaker';
  }

  async execute<T>(operation: () => Promise<T>, fallback: ((error: Error) => T) | null = null): Promise<T> {
    this.stats.totalRequests++;

    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        console.log(`[${this.name}] Circuit is OPEN, failing fast`);
        return this.handleFailure(new Error('Circuit breaker is OPEN'), fallback);
      } else {
        this.state = CircuitState.HALF_OPEN;
        this.onStateChange(CircuitState.HALF_OPEN, this.name);
        console.log(`[${this.name}] Circuit moved to HALF_OPEN state for testing`);
      }
    }

    try {
      console.log(`[${this.name}] Executing operation in ${this.state} state`);
      const result = await operation();

      this.handleSuccess();
      return result;
    } catch (error) {
      return this.handleFailure(error as Error, fallback);
    }
  }

  private handleSuccess(): void {
    this.stats.successfulRequests++;
    this.failureCount = 0;
    this.lastFailureTime = null;

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED;
      this.onStateChange(CircuitState.CLOSED, this.name);
      console.log(`[${this.name}] Circuit recovered - moved to CLOSED state`);
    }
  }

  private handleFailure<T>(error: Error, fallback: ((error: Error) => T) | null): T {
    this.stats.failedRequests++;
    this.failureCount++;
    this.lastFailureTime = Date.now();

    const errorMessage = typeof error === 'string' ? error : error.message || 'Unknown error';
    console.error(`[${this.name}] Operation failed:`, errorMessage);

    if (this.isExpectedError(error)) {
      console.log(`[${this.name}] Expected error, not counting towards circuit breaker`);
      if (fallback) {
        return fallback(error);
      }
      throw error;
    }

    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.recoveryTimeout;
      this.stats.circuitOpenCount++;
      this.onStateChange(CircuitState.OPEN, this.name);
      console.warn(`[${this.name}] Circuit OPENED due to ${this.failureCount} failures`);
    }

    if (fallback) {
      console.log(`[${this.name}] Executing fallback function`);
      return fallback(error);
    }

    throw error;
  }

  private isExpectedError(error: Error): boolean {
    return this.expectedErrors.some(expectedError => {
      if (typeof expectedError === 'string') {
        return error.message.includes(expectedError);
      }
      if (expectedError instanceof RegExp) {
        return expectedError.test(error.message);
      }
      if (typeof expectedError === 'function') {
        return error instanceof expectedError;
      }
      return false;
    });
  }

  getState(): CircuitStateType {
    return this.state;
  }

  getStats(): Record<string, unknown> {
    return {
      ...this.stats,
      currentState: this.state,
      failureCount: this.failureCount,
      failureRate: this.stats.totalRequests > 0
        ? (this.stats.failedRequests / this.stats.totalRequests * 100).toFixed(2)
        : 0,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null
    };
  }

  reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = CircuitState.CLOSED;
    this.nextAttemptTime = 0;
    console.log(`[${this.name}] Circuit breaker reset to CLOSED state`);
    this.onStateChange(CircuitState.CLOSED, this.name);
  }

  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.recoveryTimeout;
    this.stats.circuitOpenCount++;
    console.log(`[${this.name}] Circuit manually forced to OPEN state`);
    this.onStateChange(CircuitState.OPEN, this.name);
  }

  forceClose(): void {
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = CircuitState.CLOSED;
    this.nextAttemptTime = 0;
    console.log(`[${this.name}] Circuit manually forced to CLOSED state`);
    this.onStateChange(CircuitState.CLOSED, this.name);
  }
}

interface RetryHandlerOptions {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
  retryCondition?: (error: Error, attempt: number) => boolean;
  onRetry?: (error: Error, attempt: number, delay: number) => void;
  name?: string;
}

export class RetryHandler {
  private maxAttempts: number;
  private baseDelay: number;
  private maxDelay: number;
  private backoffMultiplier: number;
  private jitter: boolean;
  private retryCondition: (error: Error, attempt: number) => boolean;
  private onRetry: (error: Error, attempt: number, delay: number) => void;
  private name: string;

  constructor(options: RetryHandlerOptions = {}) {
    this.maxAttempts = options.maxAttempts || 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.jitter = options.jitter !== false;
    this.retryCondition = options.retryCondition || (() => true);
    this.onRetry = options.onRetry || (() => {});
    this.name = options.name || 'RetryHandler';
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt < this.maxAttempts) {
      attempt++;

      try {
        console.log(`[${this.name}] Attempt ${attempt}/${this.maxAttempts}`);
        const result = await operation();

        if (attempt > 1) {
          console.log(`[${this.name}] Operation succeeded on attempt ${attempt}`);
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        console.warn(`[${this.name}] Attempt ${attempt} failed:`, lastError.message);

        if (attempt === this.maxAttempts || !this.retryCondition(lastError, attempt)) {
          console.error(`[${this.name}] All ${this.maxAttempts} attempts failed`);
          break;
        }

        const delay = this.calculateDelay(attempt);
        console.log(`[${this.name}] Retrying in ${delay}ms...`);

        this.onRetry(lastError, attempt, delay);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private calculateDelay(attempt: number): number {
    let delay = this.baseDelay * Math.pow(this.backoffMultiplier, attempt - 1);
    delay = Math.min(delay, this.maxDelay);

    if (this.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(delay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

interface ResilientExecutorOptions {
  circuit?: CircuitBreakerOptions;
  retry?: RetryHandlerOptions;
  name?: string;
}

export class ResilientExecutor {
  private circuitBreaker: CircuitBreaker;
  private retryHandler: RetryHandler;
  private name: string;

  constructor(options: ResilientExecutorOptions = {}) {
    const circuitOptions = options.circuit || {};
    const retryOptions = options.retry || {};

    this.circuitBreaker = new CircuitBreaker({
      ...circuitOptions,
      name: options.name || 'ResilientExecutor'
    });

    this.retryHandler = new RetryHandler({
      ...retryOptions,
      name: options.name || 'ResilientExecutor'
    });

    this.name = options.name || 'ResilientExecutor';
  }

  async execute<T>(operation: () => Promise<T>, fallback: ((error: Error) => T) | null = null): Promise<T> {
    return this.circuitBreaker.execute(async () => {
      return this.retryHandler.execute(operation);
    }, fallback);
  }

  getStats(): Record<string, unknown> {
    return {
      circuit: this.circuitBreaker.getStats(),
      name: this.name
    };
  }

  reset(): void {
    this.circuitBreaker.reset();
  }

  getCircuitState(): CircuitStateType {
    return this.circuitBreaker.getState();
  }
}
