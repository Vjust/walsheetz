/**
 * Unified WZ Formula Autocomplete Diagnostic Script
 *
 * This script consolidates all diagnostic functionality to understand
 * why WZ.* formulas may or may not appear in Luckysheet's autocomplete.
 *
 * Run in browser console AFTER the app loads:
 *   fetch('/scripts/diagnose-wz-autocomplete.js').then(r => r.text()).then(eval)
 *
 * Or use from console:
 *   window.__wzCompleteOverride.logState()
 */

(function diagnoseWZAutocomplete() {
  console.log('═'.repeat(80));
  console.log('🔍 WZ FORMULA AUTOCOMPLETE DIAGNOSTIC');
  console.log(`🕒 Timestamp: ${new Date().toISOString()}`);
  console.log('═'.repeat(80));

  const results = {
    passed: [],
    failed: [],
    warnings: [],
    criticalIssues: []
  };

  // ============================================================================
  // TEST 1: Check Multi-Layer Injection Status
  // ============================================================================
  console.log('\n📋 TEST 1: Multi-Layer Injection Status');
  console.log('─'.repeat(80));

  // Layer 1: Pre-Init
  console.log('\n  🔹 Layer 1 (PRE-INIT):');
  if (window.__wzPreInit) {
    const preInitDiag = window.__wzPreInit.getDiagnostics();
    console.log(`    ✅ Pre-init API available`);
    console.log(`    Patch applied: ${preInitDiag.patchApplied}`);
    console.log(`    WZ in window.luckysheet_function: ${preInitDiag.globalFunctionObject}`);
    console.log(`    WZ in window.luckysheet_configsetting.functionlist: ${preInitDiag.globalFunctionArray}`);

    if (preInitDiag.patchApplied && preInitDiag.globalFunctionObject > 0) {
      results.passed.push('✅ Layer 1 (Pre-Init) working');
    } else {
      results.warnings.push('⚠️  Layer 1 (Pre-Init) not applied correctly');
    }
  } else {
    results.failed.push('❌ Layer 1 (Pre-Init) API not found');
    console.log(`    ❌ window.__wzPreInit not found`);
  }

  // Layer 2: Hook
  console.log('\n  🔹 Layer 2 (HOOK):');
  if (window.__wzInject) {
    const hookDiag = window.__wzInject.getDiagnostics();
    console.log(`    ✅ Hook API available`);
    console.log(`    Hook installed: ${hookDiag.hookInstalled}`);
    console.log(`    Injection count: ${hookDiag.injectionCount}`);
    console.log(`    Sheets with WZ functions: ${hookDiag.sheets.filter(s => s.wzInObject > 0).length}/${hookDiag.sheetsFound}`);

    if (hookDiag.hookInstalled && hookDiag.injectionCount > 0) {
      results.passed.push('✅ Layer 2 (Hook) working');
    } else {
      results.warnings.push('⚠️  Layer 2 (Hook) not applied correctly');
    }
  } else {
    results.warnings.push('⚠️  Layer 2 (Hook) API not found');
    console.log(`    ⚠️  window.__wzInject not found`);
  }

  // Layer 3: Config
  console.log('\n  🔹 Layer 3 (CONFIG):');
  const files = window.luckysheet?.getluckysheetfile?.() || [];
  if (files.length > 0 && files[0].luckysheet_function) {
    const wzInConfig = Object.keys(files[0].luckysheet_function).filter(k => k.startsWith('WZ.')).length;
    console.log(`    ✅ Sheet objects have luckysheet_function`);
    console.log(`    WZ functions in sheet[0]: ${wzInConfig}`);

    if (wzInConfig > 0) {
      results.passed.push('✅ Layer 3 (Config) working - WZ functions in sheet objects');
    } else {
      results.warnings.push('⚠️  Layer 3 (Config) - Sheet objects exist but no WZ functions');
    }
  } else {
    results.warnings.push('⚠️  Layer 3 (Config) - No sheet objects or luckysheet_function');
    console.log(`    ⚠️  Sheet objects not initialized yet or missing luckysheet_function`);
  }

  // ============================================================================
  // TEST 1.5: Check Internal Store.functionlist (THE REAL AUTOCOMPLETE SOURCE)
  // ============================================================================
  console.log('\n📋 TEST 1.5: Internal Store.functionlist (CRITICAL for Autocomplete)');
  console.log('─'.repeat(80));

  let internalStoreFound = false;
  let internalStoreWZCount = 0;

  // Check window.luckysheet properties for internal Store
  if (window.luckysheet) {
    for (let key in window.luckysheet) {
      try {
        const prop = window.luckysheet[key];
        if (prop && typeof prop === 'object' && Array.isArray(prop.functionlist)) {
          const wzCount = prop.functionlist.filter(f => f?.n?.startsWith('WZ.')).length;
          console.log(`  📦 Found window.luckysheet.${key}.functionlist: ${prop.functionlist.length} total, ${wzCount} WZ`);
          internalStoreFound = true;
          internalStoreWZCount += wzCount;

          if (wzCount > 0) {
            results.passed.push(`✅ Internal Store (${key}) has ${wzCount} WZ functions`);
          } else {
            results.criticalIssues.push(`❌ CRITICAL: ${key}.functionlist found but NO WZ functions!`);
          }
        }

        // Check nested structures
        if (prop && typeof prop === 'object') {
          for (let nestedKey in prop) {
            try {
              const nested = prop[nestedKey];
              if (nested && Array.isArray(nested.functionlist)) {
                const wzCount = nested.functionlist.filter(f => f?.n?.startsWith('WZ.')).length;
                console.log(`  📦 Found window.luckysheet.${key}.${nestedKey}.functionlist: ${nested.functionlist.length} total, ${wzCount} WZ`);
                internalStoreFound = true;
                internalStoreWZCount += wzCount;

                if (wzCount > 0) {
                  results.passed.push(`✅ Internal Store (${key}.${nestedKey}) has ${wzCount} WZ functions`);
                } else {
                  results.criticalIssues.push(`❌ CRITICAL: ${key}.${nestedKey}.functionlist found but NO WZ functions!`);
                }
              }
            } catch (e) {}
          }
        }
      } catch (e) {}
    }
  }

  // Check window.formula
  if (window.formula && Array.isArray(window.formula.functionlist)) {
    const wzCount = window.formula.functionlist.filter(f => f?.n?.startsWith('WZ.')).length;
    console.log(`  📦 Found window.formula.functionlist: ${window.formula.functionlist.length} total, ${wzCount} WZ`);
    internalStoreFound = true;
    internalStoreWZCount += wzCount;

    if (wzCount > 0) {
      results.passed.push(`✅ window.formula has ${wzCount} WZ functions`);
    } else {
      results.criticalIssues.push('❌ CRITICAL: window.formula.functionlist found but NO WZ functions!');
    }
  }

  // Check window.Store
  if (window.Store && Array.isArray(window.Store.functionlist)) {
    const wzCount = window.Store.functionlist.filter(f => f?.n?.startsWith('WZ.')).length;
    console.log(`  📦 Found window.Store.functionlist: ${window.Store.functionlist.length} total, ${wzCount} WZ`);
    internalStoreFound = true;
    internalStoreWZCount += wzCount;

    if (wzCount > 0) {
      results.passed.push(`✅ window.Store has ${wzCount} WZ functions`);
    } else {
      results.criticalIssues.push('❌ CRITICAL: window.Store.functionlist found but NO WZ functions!');
    }
  }

  if (!internalStoreFound) {
    results.criticalIssues.push('❌ CRITICAL: Could not find internal Store.functionlist - autocomplete will NOT work!');
    console.log('  ❌ Could not find internal Store.functionlist');
    console.log('  💡 This is the ACTUAL source for autocomplete - without it, WZ functions cannot appear');
  } else if (internalStoreWZCount === 0) {
    results.criticalIssues.push('❌ CRITICAL: Internal Store found but contains NO WZ functions!');
    console.log('  ⚠️  Internal Store found but contains NO WZ functions');
  } else {
    console.log(`  ✅ Internal Store found with ${internalStoreWZCount} WZ functions - autocomplete SHOULD work!`);
  }

  // ============================================================================
  // TEST 2: Check Sheet Files (THE ACTUAL AUTOCOMPLETE SOURCE)
  // ============================================================================
  console.log('\n📋 TEST 2: Check Sheet Files (REAL Autocomplete Source)');
  console.log('─'.repeat(80));

  let sheetFiles = [];
  let hasSheetFiles = false;

  if (window.luckysheet && typeof window.luckysheet.getluckysheetfile === 'function') {
    sheetFiles = window.luckysheet.getluckysheetfile() || [];
    hasSheetFiles = sheetFiles.length > 0;

    console.log(`  ✅ window.luckysheet.getluckysheetfile() found`);
    console.log(`  📄 Sheet files: ${sheetFiles.length}`);

    if (hasSheetFiles) {
      results.passed.push(`✅ Found ${sheetFiles.length} sheet file(s)`);

      sheetFiles.forEach((sheet, idx) => {
        console.log(`\n  🔍 Sheet ${idx}: "${sheet.name || 'Unnamed'}"`);

        // Check sheet.luckysheet_function (object format - THE CRITICAL ONE)
        if (sheet.luckysheet_function && typeof sheet.luckysheet_function === 'object') {
          const wzKeys = Object.keys(sheet.luckysheet_function).filter(k => k.startsWith('WZ.'));
          console.log(`     luckysheet_function: ${wzKeys.length} WZ function keys`);

          if (wzKeys.length > 0) {
            results.passed.push(`✅ Sheet ${idx} has ${wzKeys.length} WZ functions in luckysheet_function`);
            console.log(`     ✅ Sample: ${wzKeys.slice(0, 3).join(', ')}`);
          } else {
            results.failed.push(`❌ Sheet ${idx} has NO WZ functions in luckysheet_function`);
            results.criticalIssues.push(`Sheet ${idx} missing WZ functions (autocomplete source)`);
          }
        } else {
          console.log(`     ❌ luckysheet_function: NOT FOUND or not an object`);
          results.failed.push(`❌ Sheet ${idx} missing luckysheet_function`);
        }

        // Check sheet.functionList (array format - backup)
        if (Array.isArray(sheet.functionList)) {
          const wzInArray = sheet.functionList.filter(f => f?.n?.startsWith('WZ.')).length;
          console.log(`     functionList array: ${sheet.functionList.length} total, ${wzInArray} WZ`);

          if (wzInArray > 0) {
            results.passed.push(`✅ Sheet ${idx} has ${wzInArray} WZ functions in functionList array`);
          }
        } else {
          console.log(`     functionList: not an array or doesn't exist`);
        }
      });
    } else {
      results.failed.push('❌ No sheet files found');
      results.criticalIssues.push('No sheet files - app may not be fully loaded');
      console.log('  ❌ No sheet files found - app may not be initialized yet');
    }
  } else {
    results.failed.push('❌ window.luckysheet.getluckysheetfile not available');
    results.criticalIssues.push('Cannot access sheet files - critical API missing');
    console.log('  ❌ window.luckysheet.getluckysheetfile() not available');
  }

  // ============================================================================
  // TEST 3: Check Injection API
  // ============================================================================
  console.log('\n📋 TEST 3: WZ Injection API Status');
  console.log('─'.repeat(80));

  if (window.__wzInject) {
    console.log('  ✅ window.__wzInject API available');

    const injectionDiag = window.__wzInject.getDiagnostics();
    console.log(`  Hook installed: ${injectionDiag.hookInstalled}`);
    console.log(`  Injection count: ${injectionDiag.injectionCount}`);
    console.log(`  Sheets found: ${injectionDiag.sheetsFound}`);

    if (injectionDiag.hookInstalled) {
      results.passed.push('✅ WZ injection hook is installed');
    } else {
      results.warnings.push('⚠️  WZ injection hook not installed');
    }

    if (injectionDiag.injectionCount > 0) {
      results.passed.push(`✅ ${injectionDiag.injectionCount} injection(s) performed`);
    } else {
      results.warnings.push('⚠️  No injections performed yet');
    }

    // Show per-sheet diagnostic
    if (injectionDiag.sheets.length > 0) {
      console.log('\n  📊 Per-sheet WZ function counts:');
      injectionDiag.sheets.forEach(sheet => {
        console.log(`     Sheet ${sheet.index} "${sheet.name}": ${sheet.wzInObject} WZ functions`);
      });
    }
  } else {
    results.warnings.push('⚠️  window.__wzInject API not found');
    console.log('  ⚠️  window.__wzInject API not found (new injection system may not be loaded)');
  }

  // ============================================================================
  // TEST 4: Check All Known Formula Structures
  // ============================================================================
  console.log('\n📋 TEST 4: Check All Formula Storage Structures');
  console.log('─'.repeat(80));

  const structures = [
    {
      name: 'window.formula.functionlist',
      obj: window.formula?.functionlist,
      critical: false,
      note: 'Runtime mirror'
    },
    {
      name: 'window.luckysheet_function',
      obj: window.luckysheet_function,
      critical: false,
      note: 'Object format lookup'
    },
    {
      name: 'window.luckysheet_configsetting.functionlist',
      obj: window.luckysheet_configsetting?.functionlist,
      critical: false,
      note: 'Config array'
    }
  ];

  structures.forEach(struct => {
    console.log(`\n  🔍 ${struct.name} (${struct.note}):`);

    if (!struct.obj) {
      console.log(`     ❌ Does not exist`);
      results.warnings.push(`⚠️  ${struct.name} not found`);
      return;
    }

    if (Array.isArray(struct.obj)) {
      const wzCount = struct.obj.filter(f => f?.n?.startsWith('WZ.')).length;
      const total = struct.obj.length;
      console.log(`     Array with ${total} entries, ${wzCount} WZ functions`);

      if (wzCount > 0) {
        results.passed.push(`✅ ${wzCount} WZ functions in ${struct.name}`);
      } else {
        results.warnings.push(`⚠️  ${struct.name} has no WZ functions`);
      }
    } else if (typeof struct.obj === 'object') {
      const wzKeys = Object.keys(struct.obj).filter(k => k.startsWith('WZ.'));
      console.log(`     Object with ${wzKeys.length} WZ function keys`);

      if (wzKeys.length > 0) {
        results.passed.push(`✅ ${wzKeys.length} WZ functions in ${struct.name}`);
      } else {
        results.warnings.push(`⚠️  ${struct.name} has no WZ function keys`);
      }
    } else {
      console.log(`     Unexpected type: ${typeof struct.obj}`);
    }
  });

  // ============================================================================
  // TEST 5: Check createFunctionList Hook
  // ============================================================================
  console.log('\n📋 TEST 5: createFunctionList() Hook Status');
  console.log('─'.repeat(80));

  if (window.formula?.createFunctionList) {
    console.log('  ✅ window.formula.createFunctionList exists');

    if (window.formula.createFunctionList.__wzCompleteOverride) {
      results.passed.push('✅ createFunctionList is hooked (__wzCompleteOverride marker)');
      console.log('  ✅ PASS: Function is hooked (has __wzCompleteOverride marker)');
    } else if (window.formula.createFunctionList.__wzPatched) {
      results.passed.push('✅ createFunctionList is hooked (__wzPatched marker)');
      console.log('  ✅ PASS: Function is hooked (has __wzPatched marker)');
    } else {
      results.warnings.push('⚠️  createFunctionList exists but no hook marker found');
      console.log('  ⚠️  WARN: No hook marker found - may not be intercepted');
    }
  } else {
    results.warnings.push('⚠️  window.formula.createFunctionList not available');
    console.log('  ⚠️  window.formula.createFunctionList not found');
    console.log('  This is expected on some CDN builds - fallback hook should be active');
  }

  // ============================================================================
  // TEST 6: window.luckysheet.create Hook (Fallback)
  // ============================================================================
  console.log('\n📋 TEST 6: window.luckysheet.create Hook (Fallback Strategy)');
  console.log('─'.repeat(80));

  if (window.luckysheet?.create) {
    console.log('  ✅ window.luckysheet.create exists');

    // Can't easily detect if this is hooked, but we can note it exists
    results.passed.push('✅ window.luckysheet.create available for fallback hook');
  } else {
    results.warnings.push('⚠️  window.luckysheet.create not found');
    console.log('  ⚠️  window.luckysheet.create not found');
  }

  // ============================================================================
  // DIAGNOSTIC API TEST
  // ============================================================================
  console.log('\n📋 Diagnostic API');
  console.log('─'.repeat(80));

  if (window.__wzCompleteOverride?.getDiagnostics) {
    const diag = window.__wzCompleteOverride.getDiagnostics();
    console.log('  Diagnostic data:');
    console.log(JSON.stringify(diag, null, 2));
  } else {
    console.log('  ⚠️  Diagnostic API not available');
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n' + '═'.repeat(80));
  console.log('📊 DIAGNOSTIC SUMMARY');
  console.log('═'.repeat(80));

  console.log(`\n✅ Passed: ${results.passed.length}`);
  results.passed.forEach(p => console.log(`   ${p}`));

  console.log(`\n⚠️  Warnings: ${results.warnings.length}`);
  results.warnings.forEach(w => console.log(`   ${w}`));

  console.log(`\n❌ Failed: ${results.failed.length}`);
  results.failed.forEach(f => console.log(`   ${f}`));

  if (results.criticalIssues.length > 0) {
    console.log(`\n🚨 CRITICAL ISSUES:`);
    results.criticalIssues.forEach(issue => console.log(`   ❌ ${issue}`));
  }

  // ============================================================================
  // RECOMMENDATIONS
  // ============================================================================
  console.log('\n' + '═'.repeat(80));
  console.log('💡 RECOMMENDATIONS');
  console.log('═'.repeat(80));

  if (results.criticalIssues.length === 0 && hasSheetFiles && sheetFiles.some(s => s.luckysheet_function && Object.keys(s.luckysheet_function).some(k => k.startsWith('WZ.')))) {
    console.log('\n✅ DIAGNOSIS: System appears to be working correctly!');
    console.log('\n📝 Manual verification steps:');
    console.log('   1. Click any cell in the spreadsheet');
    console.log('   2. Type: =WZ');
    console.log('   3. Native dropdown should appear with WZ functions');
    console.log('   4. Arrow keys to navigate, Enter/Tab to select');
  } else {
    console.log('\n❌ DIAGNOSIS: Issues detected that prevent WZ autocomplete');
    console.log('\n🔧 Troubleshooting steps:');

    if (!hasSheetFiles) {
      console.log('   1. No sheet files found - app may not be initialized');
      console.log('      Wait for sheets to load and run diagnostic again');
    }

    if (window.__wzInject) {
      if (!window.__wzInject.isHookInstalled()) {
        console.log('   2. Hook not installed - try manual setup:');
        console.log('      window.__wzInject.setupHook()');
      }

      console.log('   3. Try manual injection:');
      console.log('      window.__wzInject.inject("manual diagnostic test")');
    } else {
      console.log('   2. Injection API not loaded - check console for errors in main.jsx');
    }

    if (hasSheetFiles && sheetFiles.every(s => !s.luckysheet_function || !Object.keys(s.luckysheet_function).some(k => k.startsWith('WZ.')))) {
      console.log('   4. Sheet files exist but have no WZ functions');
      console.log('      This means injection failed or hasn\'t run yet');
    }
  }

  console.log('\n' + '═'.repeat(80));

  // ============================================================================
  // RETURN RESULTS
  // ============================================================================
  return {
    summary: {
      passed: results.passed.length,
      warnings: results.warnings.length,
      failed: results.failed.length,
      critical: results.criticalIssues.length
    },
    sheetFiles: {
      found: hasSheetFiles,
      count: sheetFiles.length,
      wzInSheets: sheetFiles.map(s => ({
        name: s.name,
        wzCount: s.luckysheet_function ? Object.keys(s.luckysheet_function).filter(k => k.startsWith('WZ.')).length : 0
      }))
    },
    injectionAPI: {
      available: !!window.__wzInject,
      hookInstalled: window.__wzInject?.isHookInstalled() || false,
      diagnostics: window.__wzInject?.getDiagnostics() || null
    },
    hookInstalled,
    criticalIssues: results.criticalIssues,
    allResults: results
  };
})();
