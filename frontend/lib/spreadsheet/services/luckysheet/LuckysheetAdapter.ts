/**
 * Luckysheet Adapter
 *
 * Single deterministic interface for Luckysheet initialization and WZ function injection.
 * Replaces the 5-layer monkey-patching strategy with a clean, testable adapter.
 *
 * Lifecycle:
 * 1. IDLE: Adapter created, not yet initialized
 * 2. INITIALIZING: Waiting for Luckysheet CDN to load
 * 3. READY: Luckysheet available, WZ functions injected
 * 4. ERROR: Initialization failed
 *
 * Key Responsibilities:
 * - Wait for Luckysheet CDN to load
 * - Build complete luckysheet_function tree BEFORE create()
 * - Inject WZ functions with proper nesting
 * - Provide cleanup mechanism
 * - Expose diagnostic API
 */

import { WALSHEETZ_FUNCTION_METADATA, WALSHEETZ_FUNCTIONS } from '../formulas/WalSheetzFunctions.js';
import { ensureLuckysheetFunctionTree } from './ensureLuckysheetNesting.js';

const INIT_TIMEOUT = 10000; // 10 seconds to wait for CDN
const CHECK_INTERVAL = 50;   // Check every 50ms

export class LuckysheetAdapter {
  constructor() {
    this.state = 'IDLE';
    this.luckysheet = null;
    this.initPromise = null;
    this.wzFunctionsInjected = false;
    this.diagnostics = {
      hookInstalled: false,
      injectionCount: 0,
      lastInjectionTime: null,
      errors: []
    };
  }

  /**
   * Get current adapter state
   * @returns {'IDLE'|'INITIALIZING'|'READY'|'ERROR'}
   */
  getState() {
    return this.state;
  }

  /**
   * Check if Luckysheet is ready
   * @returns {boolean}
   */
  isReady() {
    return this.state === 'READY';
  }

  /**
   * Initialize Luckysheet and inject WZ functions
   * Safe to call multiple times (idempotent)
   *
   * @returns {Promise<boolean>} True if initialization succeeded
   */
  async initialize() {
    // Return existing promise if already initializing
    if (this.initPromise) {
      return this.initPromise;
    }

    // Already initialized
    if (this.state === 'READY') {
      return Promise.resolve(true);
    }

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  /**
   * Internal initialization logic
   * @private
   */
  async _doInitialize() {
    try {
      this.state = 'INITIALIZING';
      console.log('[LuckysheetAdapter] Initializing...');

      // Wait for Luckysheet CDN to load
      const luckysheetLoaded = await this._waitForLuckysheet();
      if (!luckysheetLoaded) {
        throw new Error('Luckysheet CDN failed to load within timeout');
      }

      this.luckysheet = window.luckysheet;

      // Install hook on luckysheet.create to inject WZ functions
      this._installCreateHook();

      // Pre-inject WZ functions into global structures
      this._preInjectWZFunctions();

      this.state = 'READY';
      console.log('[LuckysheetAdapter] ✅ Ready');
      return true;

    } catch (error) {
      this.state = 'ERROR';
      this.diagnostics.errors.push({
        timestamp: Date.now(),
        message: error.message,
        stack: error.stack
      });
      console.error('[LuckysheetAdapter] ❌ Initialization failed:', error);
      return false;
    }
  }

  /**
   * Wait for Luckysheet CDN to load
   * @private
   * @returns {Promise<boolean>}
   */
  async _waitForLuckysheet() {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkInterval = setInterval(() => {
        if (window.luckysheet) {
          clearInterval(checkInterval);
          console.log('[LuckysheetAdapter] Luckysheet CDN loaded');
          resolve(true);
          return;
        }

        if (Date.now() - startTime > INIT_TIMEOUT) {
          clearInterval(checkInterval);
          console.error('[LuckysheetAdapter] Timeout waiting for Luckysheet CDN');
          resolve(false);
        }
      }, CHECK_INTERVAL);

      // Immediate check
      if (window.luckysheet) {
        clearInterval(checkInterval);
        console.log('[LuckysheetAdapter] Luckysheet CDN already loaded');
        resolve(true);
      }
    });
  }

  /**
   * Install hook on luckysheet.create() to inject WZ functions AFTER create
   * @private
   */
  _installCreateHook() {
    if (!window.luckysheet || typeof window.luckysheet.create !== 'function') {
      console.warn('[LuckysheetAdapter] Cannot install hook: luckysheet.create not available');
      return;
    }

    if (this.diagnostics.hookInstalled) {
      console.log('[LuckysheetAdapter] Hook already installed');
      return;
    }

    const originalCreate = window.luckysheet.create;
    const adapter = this;

    window.luckysheet.create = function(config) {
      console.log('[LuckysheetAdapter] 🎯 luckysheet.create() intercepted');

      // Inject WZ functions into config if not already present
      if (config) {
        const { tree, functionList } = adapter.buildWZFunctionDefinitions();

        if (!config.luckysheet_function) {
          config.luckysheet_function = tree;
          console.log('[LuckysheetAdapter] Injected WZ functions into config');
        }

        if (!config.functionList || !Array.isArray(config.functionList)) {
          config.functionList = [...functionList];
        }

        // Some Luckysheet builds expect lowercase functionlist
        if (!config.functionlist || !Array.isArray(config.functionlist)) {
          config.functionlist = [...functionList];
        }
      }

      // Call original create
      const result = originalCreate.call(this, config);

      // Post-create injection into sheet files
      setTimeout(() => {
        adapter._injectIntoSheetFiles('post-create');
      }, 100);

      return result;
    };

    this.diagnostics.hookInstalled = true;
    console.log('[LuckysheetAdapter] ✅ Hook installed on luckysheet.create');
  }

  /**
   * Pre-inject WZ functions into global structures BEFORE create()
   * @private
   */
  _preInjectWZFunctions() {
    console.log('[LuckysheetAdapter] Pre-injecting WZ functions...');

    // Ensure global structures exist
    if (typeof window !== 'undefined') {
      if (!window.luckysheet_function) {
        window.luckysheet_function = {};
      }
      if (!window.luckysheet_configsetting) {
        window.luckysheet_configsetting = {};
      }
      if (!window.luckysheet_configsetting.functionlist) {
        window.luckysheet_configsetting.functionlist = [];
      }
    }

    // Inject into window.luckysheet_function (nested structure) and global functionlist array
    let injected = 0;
    const globalFunctionList = window.luckysheet_configsetting.functionlist;

    Object.entries(WALSHEETZ_FUNCTION_METADATA).forEach(([name, metadata]) => {
      try {
        const luckysheetFormula = this._convertToLuckysheetFormula(name, metadata);
        ensureLuckysheetFunctionTree(
          window.luckysheet_function,
          name,
          luckysheetFormula,
          WALSHEETZ_FUNCTIONS[name]
        );
        if (Array.isArray(globalFunctionList) && !globalFunctionList.some(f => f?.n === name)) {
          globalFunctionList.push(luckysheetFormula);
        }
        injected++;
      } catch (error) {
        console.error(`[LuckysheetAdapter] Failed to inject ${name}:`, error);
      }
    });

    this.wzFunctionsInjected = true;
    this.diagnostics.injectionCount++;
    this.diagnostics.lastInjectionTime = Date.now();

    console.log(`[LuckysheetAdapter] ✅ Pre-injected ${injected} WZ functions`);
  }

  /**
   * Inject WZ functions into sheet files (called after create)
   * @private
   * @param {string} reason - Why this injection is happening
   */
  _injectIntoSheetFiles(reason = 'manual') {
    console.log(`[LuckysheetAdapter] Injecting into sheet files (${reason})...`);

    if (!window.luckysheet || typeof window.luckysheet.getluckysheetfile !== 'function') {
      console.warn('[LuckysheetAdapter] Cannot inject: getluckysheetfile not available');
      return 0;
    }

    const files = window.luckysheet.getluckysheetfile() || [];
    let injected = 0;

    files.forEach((sheet, idx) => {
      if (!sheet.luckysheet_function || typeof sheet.luckysheet_function !== 'object') {
        sheet.luckysheet_function = {};
      }
      if (!Array.isArray(sheet.functionList)) {
        sheet.functionList = [];
      }

      Object.entries(WALSHEETZ_FUNCTION_METADATA).forEach(([name, metadata]) => {
        try {
          const luckysheetFormula = this._convertToLuckysheetFormula(name, metadata);
          ensureLuckysheetFunctionTree(
            sheet.luckysheet_function,
            name,
            luckysheetFormula,
            WALSHEETZ_FUNCTIONS[name]
          );
          if (Array.isArray(sheet.functionList) && !sheet.functionList.some(f => f?.n === name)) {
            sheet.functionList.push(luckysheetFormula);
          }
          injected++;
        } catch (error) {
          console.error(`[LuckysheetAdapter] Failed to inject ${name} into sheet ${idx}:`, error);
        }
      });
    });

    this.diagnostics.injectionCount++;
    console.log(`[LuckysheetAdapter] ✅ Injected ${injected} entries into ${files.length} sheet(s)`);
    return injected;
  }

  /**
   * Build complete WZ function tree for passing to luckysheet.create()
   * Public API for consuming code (e.g., useSpreadsheetLifecycle)
   * @returns {Object} {tree, functionList}
   */
  buildWZFunctionDefinitions() {
    const tree = {};
    const functionList = [];

    Object.entries(WALSHEETZ_FUNCTION_METADATA).forEach(([name, metadata]) => {
      try {
        const luckysheetFormula = this._convertToLuckysheetFormula(name, metadata);
        ensureLuckysheetFunctionTree(tree, name, luckysheetFormula, WALSHEETZ_FUNCTIONS[name]);
        functionList.push(luckysheetFormula);
      } catch (error) {
        console.error(`[LuckysheetAdapter] Failed to build tree for ${name}:`, error);
      }
    });

    return { tree, functionList };
  }

  /**
   * Convert WalSheetz metadata to Luckysheet formula format
   * @private
   */
  _convertToLuckysheetFormula(name, metadata) {
    const params = metadata.parameters || [];
    let minArgs = 0;
    let maxArgs = 0;
    let hasVariadic = false;

    for (const param of params) {
      if (param.name?.startsWith('...')) {
        hasVariadic = true;
        maxArgs = 255;
      } else if (param.optional !== true) {
        minArgs++;
        maxArgs++;
      } else {
        maxArgs++;
      }
    }

    if (!hasVariadic && params.length > 0) {
      maxArgs = Math.max(maxArgs, minArgs);
    }

    const displayParams = params.filter(p => !p.name?.startsWith('...'));

    return {
      n: name,
      t: 0,
      d: metadata.description || `WalSheetz ${metadata.category} function`,
      a: displayParams.map(param => param.name).join(',') || '',
      m: [minArgs, hasVariadic ? 255 : maxArgs],
      p: displayParams.map(param => ({
        name: param.name,
        detail: param.description,
        example: param.example || '',
        require: param.optional === true ? 'o' : 'm',
        repeat: 'n',
        type: param.type === 'number' ? 'n' : 's'
      }))
    };
  }

  /**
   * Get diagnostic information
   * @returns {Object} Diagnostic info
   */
  getDiagnostics() {
    const files = window.luckysheet?.getluckysheetfile?.() || [];

    return {
      state: this.state,
      hookInstalled: this.diagnostics.hookInstalled,
      wzFunctionsInjected: this.wzFunctionsInjected,
      injectionCount: this.diagnostics.injectionCount,
      lastInjectionTime: this.diagnostics.lastInjectionTime,
      sheetsFound: files.length,
      sheets: files.map((sheet, idx) => {
        const wzInObject = sheet.luckysheet_function
          ? Object.keys(sheet.luckysheet_function).filter(k => k.startsWith('WZ')).length
          : 0;

        return {
          index: idx,
          name: sheet.name || 'Unnamed',
          hasLuckysheetFunction: !!sheet.luckysheet_function,
          wzInObject
        };
      }),
      globalMirrors: {
        luckysheet_function: window.luckysheet_function
          ? Object.keys(window.luckysheet_function).filter(k => k.startsWith('WZ')).length
          : 0,
        configsetting_functionlist: window.luckysheet_configsetting?.functionlist
          ? window.luckysheet_configsetting.functionlist.filter(f => f?.n?.startsWith('WZ')).length
          : 0
      },
      errors: this.diagnostics.errors
    };
  }

  /**
   * Cleanup and destroy
   */
  destroy() {
    console.log('[LuckysheetAdapter] Destroying...');
    this.state = 'IDLE';
    this.initPromise = null;
    this.wzFunctionsInjected = false;
  }
}

// Create singleton instance
export const luckysheetAdapter = new LuckysheetAdapter();

// Expose for debugging
if (typeof window !== 'undefined') {
  window.__luckysheetAdapter = luckysheetAdapter;
}
