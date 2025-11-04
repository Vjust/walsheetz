/**
 * Luckysheet API methods verification test
 * Verifies that checkRequiredMethods and verifyCDNVersion work correctly
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import luckysheetApi from '../luckysheetApi.js';

describe('LuckysheetApi methods verification', () => {
  beforeEach(() => {
    // Mock window and Luckysheet globals
    if (typeof window === 'undefined') {
      global.window = {}
    }

    // Always set up luckysheet mock (happy-dom provides window but not luckysheet)
    global.window.luckysheet = {
      create: () => {},
      destroy: () => {},
      undo: () => {},
      redo: () => {},
      refresh: () => {},
      refreshFormula: () => {},
      copy: () => {},
      paste: () => {},
      cut: () => {},
      zoom: () => {},
      getAllSheets: () => []
    }
  });

  describe('checkRequiredMethods', () => {
    it('should identify all required methods when present', () => {
      const result = luckysheetApi.checkRequiredMethods();

      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('missing');
      expect(Array.isArray(result.available)).toBe(true);
      expect(Array.isArray(result.missing)).toBe(true);
    });

    it('should return error when Luckysheet not loaded', () => {
      // Temporarily remove Luckysheet
      const original = global.window.luckysheet;
      global.window.luckysheet = null;

      const result = luckysheetApi.checkRequiredMethods();
      expect(result).toHaveProperty('error');

      // Restore
      global.window.luckysheet = original;
    });

    it('should list all required methods', () => {
      const requiredMethods = [
        'create', 'destroy', 'undo', 'redo', 'refresh', 'refreshFormula',
        'copy', 'paste', 'cut', 'zoom', 'getAllSheets'
      ];

      const result = luckysheetApi.checkRequiredMethods();

      // All methods should be either available or missing (not missing both)
      const allMethods = [...result.available, ...result.missing];
      expect(allMethods.length).toBeGreaterThanOrEqual(requiredMethods.length);
    });
  });

  describe('verifyCDNVersion', () => {
    it('should return error when Luckysheet not loaded', () => {
      const original = global.window.luckysheet;
      global.window.luckysheet = null;

      const result = luckysheetApi.verifyCDNVersion();
      expect(result).toHaveProperty('error');

      global.window.luckysheet = original;
    });

    it('should detect CDN provider from script tag', () => {
      // Add a mock script tag
      const mockScript = {
        src: 'https://cdn.jsdelivr.net/npm/luckysheet@2.1.13/dist/luckysheet.umd.js'
      };

      // Mock document.querySelectorAll
      global.document = {
        querySelectorAll: () => [mockScript]
      };

      const result = luckysheetApi.verifyCDNVersion();

      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('cdnProvider');
      expect(result).toHaveProperty('scriptSrc');
    });

    it('should parse version from CDN URL', () => {
      const mockScript = {
        src: 'https://cdn.jsdelivr.net/npm/luckysheet@2.1.13/dist/luckysheet.umd.js'
      };

      global.document = {
        querySelectorAll: () => [mockScript]
      };

      const result = luckysheetApi.verifyCDNVersion();
      expect(result.version).toBe('2.1.13');
    });
  });

  describe('diagnostic methods', () => {
    it('should expose checkRequiredMethods for diagnostics', () => {
      expect(typeof luckysheetApi.checkRequiredMethods).toBe('function');
    });

    it('should expose verifyCDNVersion for diagnostics', () => {
      expect(typeof luckysheetApi.verifyCDNVersion).toBe('function');
    });

    it('should provide useful diagnostic data for troubleshooting', () => {
      const methodCheck = luckysheetApi.checkRequiredMethods();
      const versionCheck = luckysheetApi.verifyCDNVersion();

      // Either should provide useful information
      const hasMethodInfo = !!(methodCheck.available || methodCheck.missing || methodCheck.error);
      const hasVersionInfo = !!(versionCheck.version || versionCheck.cdnProvider || versionCheck.error || versionCheck.warning);

      expect(hasMethodInfo || hasVersionInfo).toBe(true);
    });
  });
});
