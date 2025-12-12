/**
 * Throttle utility for rate-limiting log messages
 * Prevents spam of repeated log entries by tracking last log time per key
 */

export interface ThrottleResult {
  shouldLog: boolean
  count: number
}

export class LogThrottle {
  private lastLogTimes: Map<string, number>
  private logCounts: Map<string, number>

  constructor() {
    this.lastLogTimes = new Map()
    this.logCounts = new Map()
  }

  shouldLog(key: string, intervalMs = 30000): ThrottleResult {
    const now = Date.now()
    const lastTime = this.lastLogTimes.get(key) || 0
    const count = (this.logCounts.get(key) || 0) + 1

    if (now - lastTime >= intervalMs) {
      this.lastLogTimes.set(key, now)
      this.logCounts.set(key, 0)
      return { shouldLog: true, count }
    } else {
      this.logCounts.set(key, count)
      return { shouldLog: false, count }
    }
  }

  reset(key: string): void {
    this.lastLogTimes.delete(key)
    this.logCounts.delete(key)
  }

  clearAll(): void {
    this.lastLogTimes.clear()
    this.logCounts.clear()
  }
}
