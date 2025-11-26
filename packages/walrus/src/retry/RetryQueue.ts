// Retry queue with exponential backoff for failed operations

interface QueueOperation {
  fn: (data: unknown) => Promise<unknown>;
  data: unknown;
  attempt: number;
  addedAt: number;
}

export class RetryQueue {
  queue: QueueOperation[];
  maxSize: number;
  processing: boolean;
  interval: ReturnType<typeof setInterval> | null;

  constructor(maxSize = 50) {
    this.queue = [];
    this.maxSize = maxSize;
    this.processing = false;
    this.interval = null;
  }

  /**
   * Add operation to retry queue
   * @param {Object} operation - { fn: async function, data: any, attempt: number }
   */
  add(operation: Partial<QueueOperation> & Pick<QueueOperation, 'fn' | 'data'>) {
    if (this.queue.length >= this.maxSize) {
      console.warn('[RetryQueue] Queue full, dropping oldest operation');
      this.queue.shift();
    }

    this.queue.push({
      ...operation,
      attempt: operation.attempt || 0,
      addedAt: Date.now()
    });
  }

  /**
   * Start automatic retry processing
   * @param {number} intervalMs - Processing interval (default: 30 seconds)
   */
  start(intervalMs = 30000) {
    if (this.interval) return;
    this.interval = setInterval(() => this.process(), intervalMs);
  }

  /**
   * Stop automatic retry processing
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Process retry queue with exponential backoff
   * @returns {Promise<{processed: number, failed: number, remaining: number}>}
   */
  async process() {
    if (this.processing || this.queue.length === 0) {
      return { processed: 0, failed: 0, remaining: this.queue.length };
    }

    this.processing = true;
    let processed = 0;
    let failed = 0;

    try {
      const operations = [...this.queue];
      this.queue = [];

      for (const operation of operations) {
        const backoffMs = Math.min(1000 * Math.pow(2, operation.attempt), 60000);
        const age = Date.now() - operation.addedAt;

        // Skip if not enough time has passed since last attempt
        if (age < backoffMs) {
          this.queue.push(operation);
          continue;
        }

        try {
          await operation.fn(operation.data);
          processed++;
        } catch (error) {
          operation.attempt++;
          if (operation.attempt < 5) {
            this.queue.push(operation);
          } else {
            console.warn('[RetryQueue] Operation failed after 5 attempts, dropping');
            failed++;
          }
        }
      }

      return { processed, failed, remaining: this.queue.length };
    } finally {
      this.processing = false;
    }
  }

  /**
   * Get queue size
   * @returns {number} Number of operations in queue
   */
  size() {
    return this.queue.length;
  }

  /**
   * Clear the queue
   */
  clear() {
    this.queue = [];
  }
}
