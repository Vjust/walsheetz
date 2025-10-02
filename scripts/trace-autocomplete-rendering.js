/**
 * Advanced Autocomplete Rendering Tracer
 *
 * This script identifies the exact mechanism Luckysheet uses to render formula autocomplete.
 * It hooks into DOM creation, string matching, and event handling to trace the call path.
 *
 * Usage in browser console AFTER app loads:
 *   fetch('/scripts/trace-autocomplete-rendering.js').then(r => r.text()).then(eval)
 *
 * Then type "=WZ" in a cell and watch the console for detailed traces.
 */

(function traceAutocompleteRendering() {
  console.log('═'.repeat(80));
  console.log('🔍 AUTOCOMPLETE RENDERING TRACER');
  console.log('═'.repeat(80));

  const traces = {
    domCreation: [],
    stringMatching: [],
    eventHandlers: [],
    callStacks: []
  };

  // ==========================================================================
  // PART 1: Hook DOM Element Creation
  // ==========================================================================
  console.log('\n📊 PART 1: Hooking DOM Element Creation');
  console.log('─'.repeat(80));

  const originalCreateElement = document.createElement;
  document.createElement = function(tagName) {
    const element = originalCreateElement.call(document, tagName);

    // Track when autocomplete elements are created
    const originalSetAttribute = element.setAttribute;
    element.setAttribute = function(name, value) {
      if (name === 'class' && value && value.includes('luckysheet-formula-search')) {
        console.log('\n🎨 [DOM] Autocomplete element created:');
        console.log(`    Tag: ${tagName}`);
        console.log(`    Class: ${value}`);
        console.log(`    Stack trace:`);

        const stack = new Error().stack.split('\n').slice(2, 8);
        traces.callStacks.push({
          type: 'dom-creation',
          element: tagName,
          className: value,
          stack: stack
        });

        stack.forEach(line => console.log(`      ${line.trim()}`));
      }

      return originalSetAttribute.call(this, name, value);
    };

    return element;
  };

  console.log('✅ document.createElement hooked');

  // ==========================================================================
  // PART 2: Monitor Autocomplete Container Mutations
  // ==========================================================================
  console.log('\n📊 PART 2: Monitoring Autocomplete Container');
  console.log('─'.repeat(80));

  const autocompleteObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          const className = node.className || '';

          // Check for autocomplete container
          if (className.includes('luckysheet-formula-search')) {
            console.log('\n🎯 [MUTATION] Autocomplete container appeared!');
            console.log(`    Element: ${node.tagName}`);
            console.log(`    Class: ${className}`);
            console.log(`    ID: ${node.id}`);
            console.log(`    Children: ${node.children.length}`);

            // Log all formula items
            const items = node.querySelectorAll('[class*="formula-search-item"]');
            console.log(`    Formula items: ${items.length}`);

            items.forEach((item, idx) => {
              const text = item.textContent || item.innerText;
              if (idx < 10) { // Limit output
                console.log(`      ${idx + 1}. "${text}"`);
              }
            });

            // Try to find WZ functions
            const hasWZ = Array.from(items).some(item =>
              (item.textContent || item.innerText).includes('WZ.')
            );

            if (hasWZ) {
              console.log('    ✅ WZ functions FOUND in dropdown!');
            } else {
              console.log('    ❌ WZ functions NOT found in dropdown');
            }

            traces.domCreation.push({
              timestamp: Date.now(),
              element: node,
              itemCount: items.length,
              hasWZ
            });
          }

          // Check for individual formula items
          if (className.includes('formula-search-item')) {
            const text = node.textContent || node.innerText;
            if (text.startsWith('WZ.')) {
              console.log(`\n✨ [MUTATION] WZ formula item created: "${text}"`);
            }
          }
        }
      });
    });
  });

  autocompleteObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.log('✅ MutationObserver active');

  // ==========================================================================
  // PART 3: Hook String Matching Functions (Enhanced)
  // ==========================================================================
  console.log('\n📊 PART 3: Hooking String Matching Functions');
  console.log('─'.repeat(80));

  const originalStartsWith = String.prototype.startsWith;
  let startsWithCallCount = 0;

  String.prototype.startsWith = function(searchString, position) {
    const result = originalStartsWith.call(this, searchString, position);

    // Track formula-related string matching
    if (this.length < 50 && (
      this.includes('.') ||
      this.match(/^[A-Z_]+$/) ||
      searchString === 'WZ' ||
      searchString === 'WZ.' ||
      this.startsWith('WZ.')
    )) {
      startsWithCallCount++;

      const call = {
        string: this.toString(),
        searchString,
        result,
        timestamp: Date.now()
      };

      traces.stringMatching.push(call);

      // Log WZ-related calls
      if (searchString === 'WZ' || searchString === 'WZ.' || this.startsWith('WZ.')) {
        console.log(`\n🔍 [StartsWith] "${this}".startsWith("${searchString}") = ${result}`);

        // Capture stack trace
        const stack = new Error().stack.split('\n').slice(2, 6);
        console.log('    Stack:');
        stack.forEach(line => console.log(`      ${line.trim()}`));
      }
    }

    return result;
  };

  console.log('✅ String.prototype.startsWith hooked');

  // Hook indexOf as well (Luckysheet might use this)
  const originalIndexOf = String.prototype.indexOf;
  String.prototype.indexOf = function(searchString, position) {
    const result = originalIndexOf.call(this, searchString, position);

    if (this.length < 50 && (searchString === 'WZ' || searchString === 'WZ.' || this.startsWith('WZ.'))) {
      console.log(`\n🔍 [indexOf] "${this}".indexOf("${searchString}") = ${result}`);
    }

    return result;
  };

  console.log('✅ String.prototype.indexOf hooked');

  // ==========================================================================
  // PART 4: Find Autocomplete Rendering Functions
  // ==========================================================================
  console.log('\n📊 PART 4: Searching for Autocomplete Functions');
  console.log('─'.repeat(80));

  const autocompleteRelatedFunctions = [];

  if (window.luckysheet) {
    console.log('\n🔍 Scanning window.luckysheet for autocomplete-related functions...');

    for (let key in window.luckysheet) {
      try {
        const value = window.luckysheet[key];
        if (typeof value === 'function') {
          const fnString = value.toString();

          // Look for functions that mention formula search
          if (fnString.includes('formula-search') ||
              fnString.includes('formulaSearch') ||
              fnString.includes('autocomplete') ||
              fnString.includes('functionlist')) {

            console.log(`  📌 Found: window.luckysheet.${key}`);
            autocompleteRelatedFunctions.push({
              name: key,
              function: value,
              snippet: fnString.slice(0, 200)
            });
          }
        }
      } catch (e) {
        // Skip properties that throw errors
      }
    }

    if (autocompleteRelatedFunctions.length === 0) {
      console.log('  ⚠️  No autocomplete-related functions found in window.luckysheet');
    } else {
      console.log(`  ✅ Found ${autocompleteRelatedFunctions.length} potential autocomplete functions`);
    }
  }

  // ==========================================================================
  // PART 5: Expose Debug API
  // ==========================================================================
  window.__autocompleteTracer = {
    getTraces: () => traces,
    getStats: () => ({
      domCreations: traces.domCreation.length,
      stringMatches: traces.stringMatching.length,
      eventHandlers: traces.eventHandlers.length,
      callStacks: traces.callStacks.length,
      startsWithCalls: startsWithCallCount
    }),
    getAutocompleteF functions: () => autocompleteRelatedFunctions,
    stopMonitoring: () => {
      String.prototype.startsWith = originalStartsWith;
      String.prototype.indexOf = originalIndexOf;
      document.createElement = originalCreateElement;
      autocompleteObserver.disconnect();
      console.log('✅ All hooks removed');
    },
    checkCurrentAutocomplete: () => {
      const container = document.querySelector('[class*="luckysheet-formula-search"]');
      if (container) {
        const items = container.querySelectorAll('[class*="formula-search-item"]');
        console.log(`\n📋 Current autocomplete dropdown:`);
        console.log(`  Container: ${container.className}`);
        console.log(`  Items: ${items.length}`);

        items.forEach((item, idx) => {
          const text = item.textContent || item.innerText;
          console.log(`    ${idx + 1}. "${text}"`);
        });

        return Array.from(items).map(item => item.textContent || item.innerText);
      } else {
        console.log('  ⚠️  No autocomplete dropdown currently visible');
        return [];
      }
    }
  };

  // ==========================================================================
  // INSTRUCTIONS
  // ==========================================================================
  console.log('\n' + '═'.repeat(80));
  console.log('✅ AUTOCOMPLETE TRACER READY');
  console.log('═'.repeat(80));
  console.log('\n📝 INSTRUCTIONS:');
  console.log('   1. Click any cell in the spreadsheet');
  console.log('   2. Type: =WZ');
  console.log('   3. Watch the console for detailed traces');
  console.log('   4. Autocomplete dropdown appearance will be logged');
  console.log('\n🛠️  DEBUG API (window.__autocompleteTracer):');
  console.log('   • getTraces() - Get all recorded traces');
  console.log('   • getStats() - Get trace statistics');
  console.log('   • getAutocompleteFunctions() - List found autocomplete functions');
  console.log('   • checkCurrentAutocomplete() - Inspect current dropdown');
  console.log('   • stopMonitoring() - Remove all hooks');
  console.log('\n' + '═'.repeat(80));

  return {
    success: true,
    message: 'Autocomplete tracer installed. Type =WZ in a cell to see traces.'
  };
})();
