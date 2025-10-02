/**
 * Pre-Initialization Locale Patching for WZ Formulas
 *
 * CRITICAL TIMING: This module patches global formula structures BEFORE luckysheet.create() is called.
 *
 * Why this is needed:
 * - Luckysheet builds its autocomplete formula list DURING create(), not after
 * - Post-init patching (injectWzIntoSheets.js) may be too late if autocomplete caches the list
 * - Pre-patching ensures WZ functions are present when Luckysheet initializes its autocomplete
 *
 * Call sequence:
 * 1. CDN loads luckysheet.umd.js → window.luckysheet available
 * 2. main.jsx calls patchLuckysheetGlobalsBeforeInit() → globals patched
 * 3. main.jsx calls setupLuckysheetHook() → hooks create()
 * 4. Application calls luckysheet.create(config) → uses pre-patched globals
 * 5. injectWzIntoSheets() runs → patches sheet objects as backup
 */

import { WALSHEETZ_FUNCTION_METADATA, WALSHEETZ_FUNCTIONS } from '../formulas/WalSheetzFunctions.js';
import { ensureLuckysheetFunctionTree, ensureLuckysheetFunctionTreeBatch } from './ensureLuckysheetNesting.js';

let preInitPatchApplied = false;

/**
 * Convert WalSheetz metadata to Luckysheet formula format
 * (Same format as injectWzIntoSheets.js for consistency)
 */
function convertToLuckysheetFormula(name, metadata) {
  const params = metadata.parameters || [];

  // Calculate min/max args
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
 * Patch global Luckysheet formula structures BEFORE create() is called
 *
 * This is the FIRST layer of defense - ensures WZ functions exist in globals
 * before Luckysheet reads them during initialization.
 *
 * @returns {number} - Number of WZ functions patched into globals
 */
export function patchLuckysheetGlobalsBeforeInit() {
  console.log('[WZ Pre-Init] 🎯 Patching global Luckysheet structures BEFORE create()...');

  if (preInitPatchApplied) {
    console.log('[WZ Pre-Init] ⚠️  Pre-init patch already applied, skipping');
    return 0;
  }

  let totalPatched = 0;

  // Ensure globals exist
  if (typeof window === 'undefined') {
    console.error('[WZ Pre-Init] ❌ window not available');
    return 0;
  }

  // Patch window.luckysheet_function (object format with nested structure)
  if (!window.luckysheet_function || typeof window.luckysheet_function !== 'object') {
    window.luckysheet_function = {};
    console.log('[WZ Pre-Init] Created window.luckysheet_function object');
  }

  let objAdded = 0;
  Object.entries(WALSHEETZ_FUNCTION_METADATA).forEach(([name, metadata]) => {
    try {
      // Use ensureLuckysheetFunctionTree to create nested structure with execution wrapper
      const luckysheetFormula = convertToLuckysheetFormula(name, metadata);
      ensureLuckysheetFunctionTree(
        window.luckysheet_function,
        name,
        luckysheetFormula,
        WALSHEETZ_FUNCTIONS[name]
      );
      objAdded++;
    } catch (error) {
      console.error(`[WZ Pre-Init] Failed to register ${name}:`, error);
    }
  });

  if (objAdded > 0) {
    console.log(`[WZ Pre-Init] ✅ Added ${objAdded} WZ functions to window.luckysheet_function (nested with execution wrappers)`);
    totalPatched += objAdded;
  }

  // Patch window.luckysheet_configsetting.functionlist (array format)
  if (!window.luckysheet_configsetting) {
    window.luckysheet_configsetting = {};
    console.log('[WZ Pre-Init] Created window.luckysheet_configsetting object');
  }

  if (!Array.isArray(window.luckysheet_configsetting.functionlist)) {
    window.luckysheet_configsetting.functionlist = [];
    console.log('[WZ Pre-Init] Created window.luckysheet_configsetting.functionlist array');
  }

  let arrAdded = 0;
  Object.entries(WALSHEETZ_FUNCTION_METADATA).forEach(([name, metadata]) => {
    const exists = window.luckysheet_configsetting.functionlist.some(f => f?.n === name);
    if (!exists) {
      window.luckysheet_configsetting.functionlist.push(convertToLuckysheetFormula(name, metadata));
      arrAdded++;
    }
  });

  if (arrAdded > 0) {
    console.log(`[WZ Pre-Init] ✅ Added ${arrAdded} WZ functions to window.luckysheet_configsetting.functionlist`);
    totalPatched += arrAdded;
  }

  preInitPatchApplied = true;
  console.log(`[WZ Pre-Init] ✅ Pre-init patching complete: ${totalPatched} entries added to globals`);

  return totalPatched;
}

/**
 * Check if pre-init patch has been applied
 * @returns {boolean}
 */
export function isPreInitPatchApplied() {
  return preInitPatchApplied;
}

/**
 * Get diagnostic info about pre-init patching
 */
export function getPreInitDiagnostics() {
  return {
    patchApplied: preInitPatchApplied,
    globalFunctionObject: window.luckysheet_function
      ? Object.keys(window.luckysheet_function).filter(k => k.startsWith('WZ.')).length
      : 0,
    globalFunctionArray: window.luckysheet_configsetting?.functionlist
      ? window.luckysheet_configsetting.functionlist.filter(f => f?.n?.startsWith('WZ.')).length
      : 0,
    timestamp: new Date().toISOString()
  };
}

// Expose for debugging
if (typeof window !== 'undefined') {
  window.__wzPreInit = {
    patch: patchLuckysheetGlobalsBeforeInit,
    isPatched: isPreInitPatchApplied,
    getDiagnostics: getPreInitDiagnostics
  };
}
