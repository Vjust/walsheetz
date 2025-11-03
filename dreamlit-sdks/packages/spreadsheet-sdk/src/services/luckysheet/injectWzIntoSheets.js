/**
 * WZ Formula Injection for Luckysheet Sheet Files
 *
 * CRITICAL UNDERSTANDING:
 * - Luckysheet's autocomplete reads from sheet file objects, NOT global mirrors
 * - The real source is: window.luckysheet.getluckysheetfile()
 * - Each sheet has: sheet.luckysheet_function (object) and possibly sheet.functionList (array)
 * - CDN build 2.1.13 does NOT expose window.formula or window.Store
 *
 * This module directly patches the sheet file objects where autocomplete actually reads from.
 */

import { WALSHEETZ_FUNCTION_METADATA, WALSHEETZ_FUNCTIONS } from '../formulas/WalSheetzFunctions.js';
import { ensureLuckysheetFunctionTree, ensureLuckysheetFunctionTreeBatch } from './ensureLuckysheetNesting.js';

let hookInstalled = false;
let injectionCount = 0;

/**
 * Check if the Luckysheet hook has been installed
 * @returns {boolean} - True if hook is installed
 */
export const isLuckysheetHookInstalled = () => hookInstalled;

/**
 * Convert WalSheetz metadata to Luckysheet formula format
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
 * Inject WZ functions into Luckysheet sheet files
 *
 * This is THE CRITICAL FUNCTION that patches the actual autocomplete source.
 *
 * @param {string} reason - Why this injection is happening (for logging)
 * @returns {number} - Number of WZ functions injected
 */
export function injectWzIntoSheets(reason = 'manual call') {
  console.log(`[WZ Inject] 🎯 Injecting WZ functions into sheet files (reason: ${reason})...`);

  if (!window.luckysheet) {
    console.error('[WZ Inject] ❌ window.luckysheet not available');
    return 0;
  }

  if (typeof window.luckysheet.getluckysheetfile !== 'function') {
    console.error('[WZ Inject] ❌ window.luckysheet.getluckysheetfile not available');
    return 0;
  }

  const files = window.luckysheet.getluckysheetfile() || [];
  console.log(`[WZ Inject] 📄 Found ${files.length} sheet file(s)`);

  if (files.length === 0) {
    console.warn('[WZ Inject] ⚠️  No sheet files found - may be too early');
    return 0;
  }

  let totalInjected = 0;

  // Patch each sheet file
  files.forEach((sheet, idx) => {
    console.log(`[WZ Inject] 🔧 Processing sheet ${idx}: "${sheet.name || 'Unnamed'}"`);

    // Ensure sheet.luckysheet_function exists (object format)
    if (!sheet.luckysheet_function || typeof sheet.luckysheet_function !== 'object') {
      sheet.luckysheet_function = {};
      console.log(`[WZ Inject]    Created luckysheet_function object for sheet ${idx}`);
    }

    // Inject WZ functions into sheet.luckysheet_function (object with nested structure)
    let objAdded = 0;
    Object.entries(WALSHEETZ_FUNCTION_METADATA).forEach(([name, metadata]) => {
      try {
        // Use ensureLuckysheetFunctionTree to create nested structure with execution wrapper
        const luckysheetFormula = convertToLuckysheetFormula(name, metadata);
        ensureLuckysheetFunctionTree(
          sheet.luckysheet_function,
          name,
          luckysheetFormula,
          WALSHEETZ_FUNCTIONS[name]
        );
        objAdded++;
      } catch (error) {
        console.error(`[WZ Inject] Failed to register ${name} in sheet[${idx}]:`, error);
      }
    });

    if (objAdded > 0) {
      console.log(`[WZ Inject]    ✅ Added ${objAdded} WZ functions to sheet[${idx}].luckysheet_function (nested with execution wrappers)`);
      totalInjected += objAdded;
    }

    // If sheet has functionList array, patch it too
    if (Array.isArray(sheet.functionList)) {
      let arrAdded = 0;
      Object.entries(WALSHEETZ_FUNCTION_METADATA).forEach(([name, metadata]) => {
        const exists = sheet.functionList.some(f => f?.n === name);
        if (!exists) {
          sheet.functionList.push(convertToLuckysheetFormula(name, metadata));
          arrAdded++;
        }
      });

      if (arrAdded > 0) {
        console.log(`[WZ Inject]    ✅ Added ${arrAdded} WZ functions to sheet[${idx}].functionList array`);
        totalInjected += arrAdded;
      }
    }
  });

  // Also patch global mirrors as backup (these are used by some Luckysheet internals)
  let globalAdded = patchGlobalMirrors();
  totalInjected += globalAdded;

  injectionCount++;
  console.log(`[WZ Inject] ✅ Injection #${injectionCount} complete: ${totalInjected} total entries added`);

  return totalInjected;
}

/**
 * Patch global formula mirrors (backup/fallback)
 */
function patchGlobalMirrors() {
  let added = 0;

  // Patch window.luckysheet_function (object format with nested structure)
  if (typeof window.luckysheet_function === 'object') {
    Object.entries(WALSHEETZ_FUNCTION_METADATA).forEach(([name, metadata]) => {
      try {
        const luckysheetFormula = convertToLuckysheetFormula(name, metadata);
        ensureLuckysheetFunctionTree(
          window.luckysheet_function,
          name,
          luckysheetFormula,
          WALSHEETZ_FUNCTIONS[name]
        );
        added++;
      } catch (error) {
        console.error(`[WZ Inject] Failed to register ${name} in window.luckysheet_function:`, error);
      }
    });
    if (added > 0) {
      console.log(`[WZ Inject]    ✅ Added ${added} WZ functions to window.luckysheet_function (nested with execution wrappers)`);
    }
  }

  // Patch window.luckysheet_configsetting.functionlist (array format)
  if (window.luckysheet_configsetting?.functionlist && Array.isArray(window.luckysheet_configsetting.functionlist)) {
    let arrAdded = 0;
    Object.entries(WALSHEETZ_FUNCTION_METADATA).forEach(([name, metadata]) => {
      const exists = window.luckysheet_configsetting.functionlist.some(f => f?.n === name);
      if (!exists) {
        window.luckysheet_configsetting.functionlist.push(convertToLuckysheetFormula(name, metadata));
        arrAdded++;
      }
    });
    if (arrAdded > 0) {
      console.log(`[WZ Inject]    ✅ Added ${arrAdded} WZ functions to window.luckysheet_configsetting.functionlist`);
      added += arrAdded;
    }
  }

  return added;
}

/**
 * Patch the internal Store.functionlist that autocomplete actually uses
 *
 * This is the CRITICAL function that makes autocomplete work.
 * Luckysheet's autocomplete reads from an internal Store object in a closure,
 * NOT from the public structures we've been patching.
 */
function patchInternalStoreFunctionlist() {
  console.log('[WZ Inject] 🎯 Attempting to patch INTERNAL Store.functionlist for autocomplete...');

  let patched = 0;

  // Strategy 1: Look for Store in window.luckysheet properties
  if (window.luckysheet) {
    for (let key in window.luckysheet) {
      try {
        const prop = window.luckysheet[key];

        // Check if this property has a functionlist array
        if (prop && typeof prop === 'object' && Array.isArray(prop.functionlist)) {
          console.log(`[WZ Inject] 🔍 Found functionlist in window.luckysheet.${key}`);
          const beforeCount = prop.functionlist.length;

          Object.entries(WALSHEETZ_FUNCTION_METADATA).forEach(([name, metadata]) => {
            const exists = prop.functionlist.some(f => f?.n === name);
            if (!exists) {
              const luckysheetFormula = convertToLuckysheetFormula(name, metadata);
              // For arrays, we can't create nested structure, but we still need the execution wrapper
              // Store the metadata with f property
              luckysheetFormula.f = WALSHEETZ_FUNCTIONS[name];
              prop.functionlist.push(luckysheetFormula);
              patched++;
            }
          });

          console.log(`[WZ Inject] ✅ Patched ${key}.functionlist: ${beforeCount} -> ${prop.functionlist.length} (+${patched} WZ functions)`);
        }

        // Check nested structures like fn[lang].functionlist
        if (prop && typeof prop === 'object') {
          for (let nestedKey in prop) {
            try {
              const nested = prop[nestedKey];
              if (nested && Array.isArray(nested.functionlist)) {
                console.log(`[WZ Inject] 🔍 Found functionlist in window.luckysheet.${key}.${nestedKey}`);
                const beforeCount = nested.functionlist.length;

                Object.entries(WALSHEETZ_FUNCTION_METADATA).forEach(([name, metadata]) => {
                  const exists = nested.functionlist.some(f => f?.n === name);
                  if (!exists) {
                    const luckysheetFormula = convertToLuckysheetFormula(name, metadata);
                    // For arrays, attach execution wrapper directly
                    luckysheetFormula.f = WALSHEETZ_FUNCTIONS[name];
                    nested.functionlist.push(luckysheetFormula);
                    patched++;
                  }
                });

                console.log(`[WZ Inject] ✅ Patched ${key}.${nestedKey}.functionlist: ${beforeCount} -> ${nested.functionlist.length}`);
              }
            } catch (e) {
              // Skip properties that throw errors on access
            }
          }
        }
      } catch (e) {
        // Skip properties that throw errors on access
      }
    }
  }

  // Strategy 2: Check window.formula (may exist in some builds)
  if (window.formula && Array.isArray(window.formula.functionlist)) {
    console.log('[WZ Inject] 🔍 Found window.formula.functionlist');
    const beforeCount = window.formula.functionlist.length;

    Object.entries(WALSHEETZ_FUNCTION_METADATA).forEach(([name, metadata]) => {
      const exists = window.formula.functionlist.some(f => f?.n === name);
      if (!exists) {
        const luckysheetFormula = convertToLuckysheetFormula(name, metadata);
        luckysheetFormula.f = WALSHEETZ_FUNCTIONS[name];
        window.formula.functionlist.push(luckysheetFormula);
        patched++;
      }
    });

    console.log(`[WZ Inject] ✅ Patched window.formula.functionlist: ${beforeCount} -> ${window.formula.functionlist.length}`);
  }

  // Strategy 3: Check for Store object directly
  if (window.Store && Array.isArray(window.Store.functionlist)) {
    console.log('[WZ Inject] 🔍 Found window.Store.functionlist');
    const beforeCount = window.Store.functionlist.length;

    Object.entries(WALSHEETZ_FUNCTION_METADATA).forEach(([name, metadata]) => {
      const exists = window.Store.functionlist.some(f => f?.n === name);
      if (!exists) {
        const luckysheetFormula = convertToLuckysheetFormula(name, metadata);
        luckysheetFormula.f = WALSHEETZ_FUNCTIONS[name];
        window.Store.functionlist.push(luckysheetFormula);
        patched++;
      }
    });

    console.log(`[WZ Inject] ✅ Patched window.Store.functionlist: ${beforeCount} -> ${window.Store.functionlist.length}`);
  }

  if (patched === 0) {
    console.warn('[WZ Inject] ⚠️  Could not find internal Store.functionlist - autocomplete may not work');
    console.warn('[WZ Inject] 💡 Autocomplete likely uses a closure-scoped Store that we cannot access');
  } else {
    console.log(`[WZ Inject] ✅ Successfully patched internal Store with ${patched} WZ functions!`);
  }

  return patched;
}

/**
 * Setup hook on window.luckysheet.create to inject WZ functions after initialization
 *
 * MUST be called BEFORE luckysheet.create() is first invoked
 *
 * @returns {boolean} - True if hook was installed
 */
export function setupLuckysheetHook() {
  console.log('[WZ Inject] 🔧 Setting up luckysheet.create hook...');

  if (hookInstalled) {
    console.log('[WZ Inject] Hook already installed');
    return true;
  }

  if (!window.luckysheet) {
    console.error('[WZ Inject] ❌ window.luckysheet not available');
    return false;
  }

  if (typeof window.luckysheet.create !== 'function') {
    console.error('[WZ Inject] ❌ window.luckysheet.create is not a function');
    return false;
  }

  const originalCreate = window.luckysheet.create;

  window.luckysheet.create = function(config) {
    console.log('[WZ Inject] 🎯 luckysheet.create() called - will inject WZ functions into INTERNAL Store');

    // Call original create
    const result = originalCreate.call(this, config);

    // CRITICAL: Patch the internal Store.functionlist that autocomplete actually uses
    setTimeout(() => {
      console.log('[WZ Inject] 🚀 Patching internal structures after create()...');

      // First try to patch internal Store
      const storePatched = patchInternalStoreFunctionlist();

      // Then patch public structures as fallback
      injectWzIntoSheets('after luckysheet.create');

      console.log(`[WZ Inject] 📊 Injection complete: ${storePatched > 0 ? 'Internal Store patched ✅' : 'Public structures only ⚠️'}`);
    }, 100);

    // Also hook workbookCreateAfter if available
    const originalAfter = config?.hook?.workbookCreateAfter;
    if (config?.hook) {
      const originalWorkbookAfter = config.hook.workbookCreateAfter;
      config.hook.workbookCreateAfter = function(...args) {
        console.log('[WZ Inject] 📋 workbookCreateAfter fired - ensuring internal Store is patched');

        // Re-patch internal Store in case it was rebuilt
        patchInternalStoreFunctionlist();

        // Also patch public structures
        injectWzIntoSheets('workbookCreateAfter hook');

        if (originalWorkbookAfter) {
          return originalWorkbookAfter.apply(this, args);
        }
      };
    }

    return result;
  };

  hookInstalled = true;
  console.log('[WZ Inject] ✅ Hook installed on window.luckysheet.create');

  return true;
}

/**
 * Get diagnostic info about WZ injection status
 */
export function getInjectionDiagnostics() {
  const files = window.luckysheet?.getluckysheetfile?.() || [];

  const diagnostics = {
    hookInstalled,
    injectionCount,
    sheetsFound: files.length,
    sheets: files.map((sheet, idx) => {
      const wzInObject = sheet.luckysheet_function
        ? Object.keys(sheet.luckysheet_function).filter(k => k.startsWith('WZ.')).length
        : 0;

      const wzInArray = Array.isArray(sheet.functionList)
        ? sheet.functionList.filter(f => f?.n?.startsWith('WZ.')).length
        : 0;

      return {
        index: idx,
        name: sheet.name || 'Unnamed',
        hasLuckysheetFunction: !!sheet.luckysheet_function,
        wzInObject,
        hasFunctionList: Array.isArray(sheet.functionList),
        functionListLength: sheet.functionList?.length || 0,
        wzInArray
      };
    }),
    globalMirrors: {
      luckysheet_function: window.luckysheet_function
        ? Object.keys(window.luckysheet_function).filter(k => k.startsWith('WZ.')).length
        : 0,
      configsetting_functionlist: window.luckysheet_configsetting?.functionlist
        ? window.luckysheet_configsetting.functionlist.filter(f => f?.n?.startsWith('WZ.')).length
        : 0
    }
  };

  return diagnostics;
}

// Expose for debugging in browser console
if (typeof window !== 'undefined') {
  window.__wzInject = {
    inject: injectWzIntoSheets,
    patchInternalStore: patchInternalStoreFunctionlist,
    setupHook: setupLuckysheetHook,
    getDiagnostics: getInjectionDiagnostics,
    isHookInstalled: () => hookInstalled
  };
}
