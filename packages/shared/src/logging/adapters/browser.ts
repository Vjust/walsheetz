/**
 * Browser platform adapter for logging
 * Provides browser-specific features like localStorage and Performance API
 */

import type { Logger } from '../index.js';

export interface BrowserLoggerConfig {
  enableLocalStorage?: boolean;
  maxErrorLogs?: number;
  enablePerformanceMarks?: boolean;
}

/**
 * Browser-specific logging utilities
 */
export class BrowserLoggerAdapter {
  private enableLocalStorage: boolean;
  private maxErrorLogs: number;
  private enablePerformanceMarks: boolean;
  private performanceMarks: Map<string, number>;

  constructor(config: BrowserLoggerConfig = {}) {
    this.enableLocalStorage = config.enableLocalStorage !== false;
    this.maxErrorLogs = config.maxErrorLogs || 50;
    this.enablePerformanceMarks = config.enablePerformanceMarks !== false;
    this.performanceMarks = new Map();
  }

  /**
   * Save error logs to localStorage for later analysis
   */
  saveErrorLog(logEntry: Record<string, unknown>): void {
    if (!this.enableLocalStorage) return;

    try {
      if (typeof localStorage === 'undefined') return;

      const errorLogs = JSON.parse(localStorage.getItem('walsheetz_error_logs') || '[]');
      errorLogs.push(logEntry);
      if (errorLogs.length > this.maxErrorLogs) {
        errorLogs.shift();
      }
      localStorage.setItem('walsheetz_error_logs', JSON.stringify(errorLogs));
    } catch (_error) {
      // Silently ignore localStorage errors
    }
  }

  /**
   * Get debug mode from localStorage
   */
  getDebugMode(): boolean {
    if (!this.enableLocalStorage) return false;
    try {
      if (typeof localStorage === 'undefined') return false;
      return localStorage.getItem('walsheetz_debug_mode') === 'true';
    } catch (_error) {
      return false;
    }
  }

  /**
   * Set debug mode in localStorage
   */
  setDebugMode(enabled: boolean): void {
    if (!this.enableLocalStorage) return;
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem('walsheetz_debug_mode', enabled.toString());
    } catch (_error) {
      // Silently ignore localStorage errors
    }
  }

  /**
   * Start performance mark
   */
  startMark(label: string): void {
    this.performanceMarks.set(label, Date.now());

    if (this.enablePerformanceMarks && typeof performance !== 'undefined') {
      performance.mark(`${label}-start`);
    }
  }

  /**
   * End performance mark and return duration
   */
  endMark(label: string): number | null {
    const startTime = this.performanceMarks.get(label);
    if (!startTime) return null;

    const duration = Date.now() - startTime;
    this.performanceMarks.delete(label);

    if (this.enablePerformanceMarks && typeof performance !== 'undefined') {
      try {
        performance.mark(`${label}-end`);
        performance.measure(label, `${label}-start`, `${label}-end`);
      } catch (_error) {
        // Ignore performance measurement errors
      }
    }

    return duration;
  }

  /**
   * Check if localStorage is available
   */
  isStorageAvailable(): boolean {
    if (!this.enableLocalStorage) return false;
    try {
      if (typeof localStorage === 'undefined') return false;
      localStorage.setItem('__walsheetz_storage_test__', 'true');
      localStorage.removeItem('__walsheetz_storage_test__');
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Clear all error logs from localStorage
   */
  clearErrorLogs(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('walsheetz_error_logs');
      }
    } catch (_error) {
      // Silently ignore localStorage errors
    }
  }

  /**
   * Get all stored error logs
   */
  getErrorLogs(): Record<string, unknown>[] {
    try {
      if (typeof localStorage === 'undefined') return [];
      return JSON.parse(localStorage.getItem('walsheetz_error_logs') || '[]');
    } catch (_error) {
      return [];
    }
  }
}
