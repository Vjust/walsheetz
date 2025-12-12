/**
 * WZ Formula Display-Time Injection
 *
 * This module intercepts Luckysheet's autocomplete dropdown rendering and injects
 * WZ functions directly into the displayed results. This bypasses the need to patch
 * internal Store structures by working at the DOM level.
 *
 * Strategy:
 * - Monitor DOM for autocomplete container appearance
 * - When dropdown renders, inject WZ formula items that match search term
 * - Clone Luckysheet's styling and structure for seamless integration
 * - Hook click events to insert WZ functions into formula bar
 */

import { WALSHEETZ_FUNCTION_METADATA } from '../formulas/WalSheetzFunctions.js';

let observer = null;
let isActive = false;

/**
 * Convert WalSheetz metadata to formula search item format
 */
function convertToSearchItem(name, metadata) {
  return {
    n: name,
    t: 0,
    d: metadata.description || `WalSheetz ${metadata.category} function`,
    a: (metadata.parameters || []).map(p => p.name).join(',') || '',
    m: [
      metadata.parameters?.filter(p => !p.optional).length || 0,
      metadata.parameters?.length || 0
    ]
  };
}

/**
 * Get current formula input text from Luckysheet
 */
function getCurrentFormulaInput() {
  try {
    // Try to get from formula editor
    const formulaEditor = document.querySelector('#luckysheet-rich-text-editor');
    if (formulaEditor) {
      const text = formulaEditor.textContent || formulaEditor.innerText || '';
      return text.trim();
    }

    // Try to get from input bar
    const inputBar = document.querySelector('#luckysheet-input-box');
    if (inputBar) {
      const text = inputBar.value || '';
      return text.trim();
    }

    // Fallback: try to get from cell editor
    const cellEditor = document.querySelector('[contenteditable="true"]');
    if (cellEditor) {
      const text = cellEditor.textContent || cellEditor.innerText || '';
      return text.trim();
    }

    return '';
  } catch (e) {
    console.error('[Render-Time Inject] Error getting formula input:', e);
    return '';
  }
}

/**
 * Extract search term from formula input
 * Examples:
 *   "=WZ" -> "WZ"
 *   "=WZ." -> "WZ."
 *   "=WZ.CONTRACT.LIST(" -> "WZ.CONTRACT.LIST"
 *   "=SUM(A1,WZ" -> "WZ"
 *   "=WZ.CONTRACT.LIST(," -> "WZ.CONTRACT.LIST"
 */
function extractSearchTerm(formulaText) {
  if (!formulaText || !formulaText.startsWith('=')) {
    return '';
  }

  // Remove leading "="
  formulaText = formulaText.slice(1);

  // Strip trailing punctuation (parentheses, commas, whitespace) before matching
  // This ensures "WZ.CONTRACT.LIST(" becomes "WZ.CONTRACT.LIST"
  const stripped = formulaText.replace(/[\s(,)]+$/, '');

  // Find the last incomplete function name
  // Updated regex to handle the case where function name is followed by punctuation
  // Matches: letters, dots, underscores that are followed by non-word/non-dot chars or end of string
  const match = stripped.match(/([A-Z_.]+)(?=[^\w.]|$)/i);
  if (match) {
    return match[1].toUpperCase();
  }

  return '';
}

/**
 * Find WZ functions that match the search term
 */
function findMatchingWZFunctions(searchTerm) {
  if (!searchTerm) {
    return [];
  }

  const searchUpper = searchTerm.toUpperCase();
  const matches = [];

  Object.entries(WALSHEETZ_FUNCTION_METADATA).forEach(([name, metadata]) => {
    if (name.toUpperCase().startsWith(searchUpper)) {
      matches.push(convertToSearchItem(name, metadata));
    }
  });

  return matches;
}

/**
 * Create a formula search item DOM element (clone Luckysheet's structure)
 */
function createFormulaSearchItemElement(formulaData) {
  const item = document.createElement('div');
  item.className = 'luckysheet-formula-search-item';

  // Add formula name
  const nameSpan = document.createElement('span');
  nameSpan.className = 'luckysheet-formula-search-item-name';
  nameSpan.textContent = formulaData.n;
  item.appendChild(nameSpan);

  // Add formula description
  if (formulaData.d) {
    const descSpan = document.createElement('span');
    descSpan.className = 'luckysheet-formula-search-item-desc';
    descSpan.textContent = formulaData.d;
    item.appendChild(descSpan);
  }

  // Store formula data for click handler
  item._wzFormulaData = formulaData;

  return item;
}

/**
 * Insert WZ function into formula bar when autocomplete item is clicked
 */
function insertWZFunctionIntoFormula(formulaName) {
  try {
    console.log(`[Render-Time Inject] Inserting WZ function: ${formulaName}`);

    // Try to find the formula editor
    const formulaEditor = document.querySelector('#luckysheet-rich-text-editor');
    if (formulaEditor) {
      // Get current text
      const currentText = formulaEditor.textContent || formulaEditor.innerText || '';

      // Replace the search term with the complete function name
      const searchTerm = extractSearchTerm(currentText);
      if (searchTerm) {
        const newText = currentText.replace(new RegExp(searchTerm + '$'), formulaName + '(');
        formulaEditor.textContent = newText;

        // Trigger input event to update Luckysheet
        const event = new Event('input', { bubbles: true });
        formulaEditor.dispatchEvent(event);

        console.log(`[Render-Time Inject] ✅ Inserted "${formulaName}(" into formula bar`);
        return true;
      }
    }

    // Fallback: try input box
    const inputBox = document.querySelector('#luckysheet-input-box');
    if (inputBox) {
      const currentText = inputBox.value || '';
      const searchTerm = extractSearchTerm(currentText);
      if (searchTerm) {
        const newText = currentText.replace(new RegExp(searchTerm + '$'), formulaName + '(');
        inputBox.value = newText;

        const event = new Event('input', { bubbles: true });
        inputBox.dispatchEvent(event);

        console.log(`[Render-Time Inject] ✅ Inserted "${formulaName}(" into input box`);
        return true;
      }
    }

    console.warn('[Render-Time Inject] ⚠️  Could not find formula editor to insert function');
    return false;
  } catch (e) {
    console.error('[Render-Time Inject] Error inserting function:', e);
    return false;
  }
}

/**
 * Inject WZ functions into autocomplete dropdown
 */
function injectIntoAutocomplete(autocompleteContainer) {
  try {
    // Get current formula input
    const formulaText = getCurrentFormulaInput();
    if (window.__wzDebug) {
      console.log(`[Render-Time Inject] Current formula: "${formulaText}"`);
    }

    // Extract search term
    const searchTerm = extractSearchTerm(formulaText);
    if (window.__wzDebug) {
      console.log(`[Render-Time Inject] Search term: "${searchTerm}"`);
    }

    if (!searchTerm) {
      if (window.__wzDebug) {
        console.log('[Render-Time Inject] No search term, skipping injection');
      }
      return;
    }

    // Check if we already injected for this search term
    if (autocompleteContainer._wzLastSearchTerm === searchTerm) {
      if (window.__wzDebug) {
        console.log('[Render-Time Inject] Already injected for this search term');
      }
      return;
    }

    if (window.__wzDebug) {
      console.log('[Render-Time Inject] 🎯 Autocomplete dropdown detected, injecting WZ functions...');
    }

    // Find matching WZ functions
    const wzMatches = findMatchingWZFunctions(searchTerm);

    if (window.__wzDebug) {
      console.log(`[Render-Time Inject] Found ${wzMatches.length} matching WZ functions`);
    }

    if (wzMatches.length === 0) {
      if (window.__wzDebug) {
        console.log('[Render-Time Inject] No WZ functions match search term');
      }
      return;
    }

    // Create and append WZ function items
    wzMatches.forEach((wzFunc, idx) => {
      const item = createFormulaSearchItemElement(wzFunc);

      // Add click handler
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (window.__wzDebug) {
          console.log(`[Render-Time Inject] WZ function clicked: ${wzFunc.n}`);
        }

        // Insert function and close autocomplete
        insertWZFunctionIntoFormula(wzFunc.n);

        // Close autocomplete dropdown
        autocompleteContainer.style.display = 'none';
      });

      // Add hover effect
      item.addEventListener('mouseenter', () => {
        // Remove highlight from other items
        const allItems = autocompleteContainer.querySelectorAll('.luckysheet-formula-search-item');
        allItems.forEach(i => i.classList.remove('luckysheet-formula-search-item-active'));

        // Highlight this item
        item.classList.add('luckysheet-formula-search-item-active');
      });

      // Append to container
      autocompleteContainer.appendChild(item);

      if (window.__wzDebug && idx < 3) {
        console.log(`[Render-Time Inject]   ${idx + 1}. ${wzFunc.n} - ${wzFunc.d}`);
      }
    });

    // Mark this container as injected for this search term
    autocompleteContainer._wzLastSearchTerm = searchTerm;

    console.log(`[Render-Time Inject] ✅ Injected ${wzMatches.length} WZ functions for "${searchTerm}"`);
  } catch (e) {
    console.error('[Render-Time Inject] Error injecting WZ functions:', e);
  }
}

/**
 * Start monitoring DOM for autocomplete dropdown
 */
export function startRenderTimeInjection() {
  if (isActive) {
    console.log('[Render-Time Inject] Already active');
    return;
  }

  console.log('[Render-Time Inject] 🚀 Starting display-time injection...');

  observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return; // Only process element nodes

        const className = node.className || '';

        // Check if this is the autocomplete container
        if (typeof className === 'string' &&
            (className.includes('luckysheet-formula-search') ||
             className.includes('formula-search-c'))) {

          console.log(`[Render-Time Inject] 📋 Autocomplete container detected: ${className}`);

          // Inject WZ functions with a small delay to ensure Luckysheet has finished rendering
          setTimeout(() => {
            injectIntoAutocomplete(node);
          }, 50);
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  isActive = true;
  console.log('[Render-Time Inject] ✅ DOM monitoring active');
}

/**
 * Stop monitoring
 */
export function stopRenderTimeInjection() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  isActive = false;
  console.log('[Render-Time Inject] ⏹️  DOM monitoring stopped');
}

/**
 * Check if injection is active
 */
export function isRenderTimeInjectionActive() {
  return isActive;
}

// Expose for debugging
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  window.__wzRenderTimeInject = {
    start: startRenderTimeInjection,
    stop: stopRenderTimeInjection,
    isActive: isRenderTimeInjectionActive,
    testExtractSearch: (text) => {
      console.log(`Input: "${text}"`);
      console.log(`Search term: "${extractSearchTerm(text)}"`);
      return extractSearchTerm(text);
    },
    testFindMatches: (searchTerm) => {
      const matches = findMatchingWZFunctions(searchTerm);
      console.log(`Search: "${searchTerm}"`);
      console.log(`Matches: ${matches.length}`);
      matches.forEach((m, idx) => {
        console.log(`  ${idx + 1}. ${m.n} - ${m.d}`);
      });
      return matches;
    }
  };
}
