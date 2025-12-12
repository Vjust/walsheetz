/**
 * Shared Utility for Nested Luckysheet Function Registration
 *
 * This module solves the critical issue where WZ functions were stored as flat keys
 * (e.g., luckysheet_function['WZ.CONTRACT.LIST']) but Luckysheet's evaluator expects
 * nested objects (e.g., luckysheet_function.WZ.CONTRACT.LIST.f).
 *
 * Key responsibilities:
 * 1. Split dotted names (WZ.CONTRACT.LIST) into nested object paths
 * 2. Attach metadata to the leaf node
 * 3. Create execution wrapper (f property) that delegates to WALSHEETZ_FUNCTIONS
 * 4. Preserve Luckysheet context (this.cellRef) for async functions
 */

import { WALSHEETZ_FUNCTIONS } from '../formulas/WalSheetzFunctions.js';

/**
 * Ensure nested object structure for a Luckysheet function
 *
 * Example:
 *   ensureLuckysheetFunctionTree(container, 'WZ.CONTRACT.LIST', metadata)
 *   Creates: container.WZ.CONTRACT.LIST = { ...metadata, f: (function) }
 *
 * @param {Object} container - The target container (e.g., window.luckysheet_function)
 * @param {string} name - Dotted function name (e.g., 'WZ.CONTRACT.LIST')
 * @param {Object} metadata - Function metadata (description, parameters, etc.)
 * @param {Function} implementation - Optional custom implementation (defaults to WALSHEETZ_FUNCTIONS[name])
 * @returns {Object} The leaf node that was created/updated
 */
export function ensureLuckysheetFunctionTree(container, name, metadata, implementation = null) {
  if (!container || typeof container !== 'object') {
    throw new Error('Container must be an object');
  }

  if (!name || typeof name !== 'string') {
    throw new Error('Function name must be a non-empty string');
  }

  // Split the dotted name into parts: 'WZ.CONTRACT.LIST' → ['WZ', 'CONTRACT', 'LIST']
  const parts = name.split('.');

  // Navigate/create the nested structure
  let current = container;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];

    // Create intermediate object if it doesn't exist
    if (!current[part] || typeof current[part] !== 'object') {
      current[part] = {};
    }

    current = current[part];
  }

  // Get the leaf property name (e.g., 'LIST')
  const leafName = parts[parts.length - 1];

  // Create or update the leaf node
  if (!current[leafName] || typeof current[leafName] !== 'object') {
    current[leafName] = {};
  }

  const leafNode = current[leafName];

  // Attach all metadata properties to the leaf node
  Object.assign(leafNode, metadata);

  // Get the implementation function
  const impl = implementation || WALSHEETZ_FUNCTIONS[name];

  if (!impl) {
    console.warn(`[ensureLuckysheetNesting] No implementation found for ${name}`);

    // Create a stub function that returns an error
    leafNode.f = function(...args) {
      console.error(`[Luckysheet] Function ${name} not implemented`);
      return { status: 'error', message: `Function ${name} not implemented` };
    };
  } else {
    // Create execution wrapper that:
    // 1. Preserves Luckysheet's this context (for this.cellRef)
    // 2. Delegates to the actual implementation
    // 3. Handles both sync and async functions
    leafNode.f = function(...args) {
      try {
        // Get cell reference from Luckysheet context
        const cellRef = this?.cellRef || 'A1';

        // Call the implementation with preserved context
        const result = impl.call({ cellRef, ...this }, ...args);

        // Handle async functions (Promises)
        if (result && typeof result.then === 'function') {
          // For async functions, Luckysheet may show "Loading..." initially
          // The actual result will be updated when the promise resolves
          return result.catch(error => {
            console.error(`[Luckysheet] Error in ${name}:`, error);
            return { status: 'error', message: error.message || 'Function execution failed' };
          });
        }

        return result;
      } catch (error) {
        console.error(`[Luckysheet] Error executing ${name}:`, error);
        return { status: 'error', message: error.message || 'Function execution failed' };
      }
    };

    // Preserve function name for debugging
    Object.defineProperty(leafNode.f, 'name', {
      value: name,
      configurable: true
    });
  }

  return leafNode;
}

/**
 * Batch registration helper - registers multiple WZ functions at once
 *
 * @param {Object} container - The target container (e.g., window.luckysheet_function)
 * @param {Object} functionsMetadata - Object mapping function names to metadata
 * @param {Object} implementations - Optional object mapping function names to implementations
 * @returns {number} Number of functions registered
 */
export function ensureLuckysheetFunctionTreeBatch(container, functionsMetadata, implementations = null) {
  let registered = 0;

  Object.entries(functionsMetadata).forEach(([name, metadata]) => {
    try {
      const impl = implementations?.[name] || null;
      ensureLuckysheetFunctionTree(container, name, metadata, impl);
      registered++;
    } catch (error) {
      console.error(`[ensureLuckysheetNesting] Failed to register ${name}:`, error);
    }
  });

  return registered;
}

/**
 * Verify that a function was properly nested
 *
 * @param {Object} container - The container to check
 * @param {string} name - Dotted function name (e.g., 'WZ.CONTRACT.LIST')
 * @returns {Object} Verification result with { exists, hasMetadata, hasExecutor, path }
 */
export function verifyLuckysheetNesting(container, name) {
  const parts = name.split('.');
  let current = container;
  const path = [];

  for (const part of parts) {
    path.push(part);

    if (!current || typeof current !== 'object' || !current[part]) {
      return {
        exists: false,
        hasMetadata: false,
        hasExecutor: false,
        path: path.join('.'),
        missingAt: path.join('.')
      };
    }

    current = current[part];
  }

  return {
    exists: true,
    hasMetadata: !!(current.n && current.d), // Has name and description
    hasExecutor: typeof current.f === 'function',
    path: name,
    node: current
  };
}

/**
 * Debug helper - lists all WZ functions in a container
 *
 * @param {Object} container - The container to inspect
 * @param {string} prefix - Prefix for nested traversal (internal use)
 * @returns {Array} Array of { path, hasExecutor, metadata }
 */
export function listWZFunctions(container, prefix = '') {
  const functions = [];

  if (!container || typeof container !== 'object') {
    return functions;
  }

  for (const key in container) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const value = container[key];

    if (value && typeof value === 'object') {
      // Check if this is a function node (has 'n' property or 'f' property)
      if (value.n || typeof value.f === 'function') {
        functions.push({
          path: fullPath,
          hasExecutor: typeof value.f === 'function',
          hasMetadata: !!(value.n && value.d),
          metadata: value
        });
      }

      // Recursively check nested objects (but only for WZ.* paths)
      if (fullPath.startsWith('WZ') || prefix.startsWith('WZ')) {
        functions.push(...listWZFunctions(value, fullPath));
      }
    }
  }

  return functions;
}

// Expose for debugging
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  window.__wzNesting = {
    ensure: ensureLuckysheetFunctionTree,
    ensureBatch: ensureLuckysheetFunctionTreeBatch,
    verify: verifyLuckysheetNesting,
    listWZ: listWZFunctions
  };
}
