/**
 * Runtime Autocomplete Debugging Tool
 *
 * This script hooks into Luckysheet's autocomplete internals to understand
 * what happens when you type "=WZ" in a cell.
 *
 * Usage in browser console AFTER app loads:
 *   fetch('/scripts/test-autocomplete-runtime.js').then(r => r.text()).then(eval)
 *
 * Then type "=WZ" in a cell and watch the console for detailed logs.
 */

(function debugAutocomplete() {
  console.log('═'.repeat(80));
  console.log('🐛 AUTOCOMPLETE RUNTIME DEBUGGER');
  console.log('═'.repeat(80));

  // ==========================================================================
  // PART 1: Inspect Current State
  // ==========================================================================
  console.log('\n📊 PART 1: Current Formula Structures');
  console.log('─'.repeat(80));

  const files = window.luckysheet?.getluckysheetfile?.() || [];
  console.log(`\n📄 Sheet files: ${files.length}`);

  files.forEach((sheet, idx) => {
    console.log(`\n  Sheet ${idx}: "${sheet.name}"`);

    if (sheet.luckysheet_function) {
      const wzKeys = Object.keys(sheet.luckysheet_function).filter(k => k.startsWith('WZ.'));
      console.log(`    luckysheet_function (object): ${Object.keys(sheet.luckysheet_function).length} total, ${wzKeys.length} WZ`);
      if (wzKeys.length > 0) {
        console.log(`    WZ functions: ${wzKeys.slice(0, 5).join(', ')}${wzKeys.length > 5 ? '...' : ''}`);
      }
    } else {
      console.log(`    luckysheet_function: NOT FOUND`);
    }

    if (Array.isArray(sheet.functionList)) {
      const wzCount = sheet.functionList.filter(f => f?.n?.startsWith('WZ.')).length;
      console.log(`    functionList (array): ${sheet.functionList.length} total, ${wzCount} WZ`);
    }
  });

  console.log('\n🌍 Global Structures:');
  if (window.luckysheet_function) {
    const wzGlobal = Object.keys(window.luckysheet_function).filter(k => k.startsWith('WZ.')).length;
    console.log(`  window.luckysheet_function: ${Object.keys(window.luckysheet_function).length} total, ${wzGlobal} WZ`);
  } else {
    console.log(`  window.luckysheet_function: NOT FOUND`);
  }

  if (window.luckysheet_configsetting?.functionlist) {
    const wzConfig = window.luckysheet_configsetting.functionlist.filter(f => f?.n?.startsWith('WZ.')).length;
    console.log(`  window.luckysheet_configsetting.functionlist: ${window.luckysheet_configsetting.functionlist.length} total, ${wzConfig} WZ`);
  }

  // ==========================================================================
  // PART 2: Hook into Array.prototype.filter (Autocomplete likely uses this)
  // ==========================================================================
  console.log('\n📊 PART 2: Installing Array Filter Hooks');
  console.log('─'.repeat(80));

  const originalFilter = Array.prototype.filter;
  let filterCallCount = 0;

  Array.prototype.filter = function(fn, thisArg) {
    const result = originalFilter.call(this, fn, thisArg);

    // Only log if this array contains formula objects
    if (this.length > 0 && this[0]?.n && typeof this[0].n === 'string') {
      filterCallCount++;

      // Check if this is a formula list being searched
      const hasCommonFunctions = this.some(f => f?.n === 'SUM' || f?.n === 'AVERAGE');
      const hasWZFunctions = this.some(f => f?.n?.startsWith('WZ.'));

      if (hasCommonFunctions || hasWZFunctions) {
        console.log(`\n🔍 [Filter Call #${filterCallCount}] Formula list being filtered:`);
        console.log(`    Total functions: ${this.length}`);
        console.log(`    WZ functions in source: ${this.filter(f => f?.n?.startsWith('WZ.')).length}`);
        console.log(`    Results returned: ${result.length}`);
        console.log(`    WZ functions in results: ${result.filter(f => f?.n?.startsWith('WZ.')).length}`);

        if (result.length > 0 && result.length < 20) {
          console.log(`    Result names: ${result.map(f => f.n).join(', ')}`);
        }

        // Try to capture the filter function to see what criteria it's using
        if (fn) {
          console.log(`    Filter function: ${fn.toString().slice(0, 200)}...`);
        }
      }
    }

    return result;
  };

  console.log('✅ Array.prototype.filter hooked');
  console.log('   Now type "=WZ" in a cell and watch for filter calls');

  // ==========================================================================
  // PART 3: Hook into String.prototype.startsWith (Autocomplete might use this)
  // ==========================================================================
  console.log('\n📊 PART 3: Installing String StartsWith Hooks');
  console.log('─'.repeat(80));

  const originalStartsWith = String.prototype.startsWith;
  let startsWithCallCount = 0;
  const recentCalls = [];

  String.prototype.startsWith = function(searchString, position) {
    const result = originalStartsWith.call(this, searchString, position);

    // Only log formula-like strings
    if (this.length < 50 && (this.includes('.') || this.match(/^[A-Z_]+$/))) {
      startsWithCallCount++;
      const call = {
        string: this.toString(),
        searchString,
        result,
        timestamp: Date.now()
      };
      recentCalls.push(call);

      // Keep only last 100 calls
      if (recentCalls.length > 100) {
        recentCalls.shift();
      }

      // Log WZ-related searches
      if (searchString === 'WZ' || searchString === 'WZ.' || this.startsWith('WZ.')) {
        console.log(`\n🔍 [StartsWith #${startsWithCallCount}] "${this}".startsWith("${searchString}") = ${result}`);
      }
    }

    return result;
  };

  console.log('✅ String.prototype.startsWith hooked');

  // ==========================================================================
  // PART 4: Monitor DOM for Autocomplete Elements
  // ==========================================================================
  console.log('\n📊 PART 4: Monitoring DOM for Autocomplete Elements');
  console.log('─'.repeat(80));

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          const className = node.className || '';
          const id = node.id || '';

          // Look for autocomplete-related class names
          if (className.includes('formula') ||
              className.includes('autocomplete') ||
              className.includes('function') ||
              className.includes('select') ||
              id.includes('formula') ||
              id.includes('function')) {
            console.log('\n🎨 [DOM] Autocomplete element added:');
            console.log(`    Tag: ${node.tagName}`);
            console.log(`    Class: ${className}`);
            console.log(`    ID: ${id}`);
            console.log(`    HTML: ${node.outerHTML.slice(0, 200)}...`);
          }
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.log('✅ DOM MutationObserver active');

  // ==========================================================================
  // PART 5: Expose Debug API
  // ==========================================================================
  window.__autocompleteDebug = {
    getRecentStartsWithCalls: (count = 20) => {
      return recentCalls.slice(-count);
    },
    getStats: () => ({
      filterCalls: filterCallCount,
      startsWithCalls: startsWithCallCount,
      recentCallsStored: recentCalls.length
    }),
    stopMonitoring: () => {
      Array.prototype.filter = originalFilter;
      String.prototype.startsWith = originalStartsWith;
      observer.disconnect();
      console.log('✅ All hooks removed');
    },
    checkFormulasInDOM: () => {
      const allElements = document.querySelectorAll('[class*="formula"], [id*="formula"], [class*="function"], [id*="function"]');
      console.log(`\n📋 Found ${allElements.length} formula-related DOM elements:`);
      allElements.forEach((el, idx) => {
        if (idx < 10) { // Limit output
          console.log(`  ${idx + 1}. ${el.tagName}.${el.className} #${el.id}`);
        }
      });
      return allElements;
    }
  };

  // ==========================================================================
  // INSTRUCTIONS
  // ==========================================================================
  console.log('\n' + '═'.repeat(80));
  console.log('✅ AUTOCOMPLETE DEBUGGER READY');
  console.log('═'.repeat(80));
  console.log('\n📝 INSTRUCTIONS:');
  console.log('   1. Click any cell in the spreadsheet');
  console.log('   2. Type: =WZ');
  console.log('   3. Watch the console for detailed logs');
  console.log('   4. Check if autocomplete dropdown appears');
  console.log('\n🛠️  DEBUG API (window.__autocompleteDebug):');
  console.log('   • getRecentStartsWithCalls() - See recent string searches');
  console.log('   • getStats() - See hook statistics');
  console.log('   • stopMonitoring() - Remove all hooks');
  console.log('   • checkFormulasInDOM() - Find formula elements in DOM');
  console.log('\n' + '═'.repeat(80));

  return {
    success: true,
    message: 'Autocomplete debugger installed. Type =WZ in a cell to see logs.'
  };
})();
