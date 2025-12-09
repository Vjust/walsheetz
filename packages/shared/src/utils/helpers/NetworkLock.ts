/**
 * NetworkLock Utility
 * Simple synchronization mechanism to prevent race conditions
 */

class NetworkLock {
  private _locked: boolean;
  private _queue: (() => void)[];

  constructor() {
    this._locked = false;
    this._queue = [];
  }

  async acquireLock(): Promise<void> {
    if (!this._locked) {
      this._locked = true;
      return;
    }

    return new Promise(resolve => {
      this._queue.push(resolve);
    });
  }

  releaseLock(): void {
    if (this._queue.length > 0) {
      const resolve = this._queue.shift();
      resolve?.();
    } else {
      this._locked = false;
    }
  }

  async withLock<T>(callback: () => T | Promise<T>): Promise<T> {
    await this.acquireLock();
    try {
      const result = await Promise.resolve(callback());
      return result;
    } finally {
      this.releaseLock();
    }
  }

  isLocked(): boolean {
    return this._locked;
  }

  getQueueSize(): number {
    return this._queue.length;
  }

  reset(): void {
    this._locked = false;
    this._queue = [];
  }
}

export const networkLock = new NetworkLock();

export default networkLock;
