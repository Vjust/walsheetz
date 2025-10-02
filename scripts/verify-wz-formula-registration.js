/**
 * WZ Formula Registration Verification Script
 *
 * USAGE: Copy and paste this entire script into your browser console
 * after the WalSheetz app has loaded to verify WZ formulas are registered.
 *
 * This script checks if WZ formulas appear in:
 * 1. window.luckysheet_function (object format)
 * 2. window.luckysheet_configsetting.functionlist (array format)
 * 3. Luckysheet Store mirrors
 */

(function() {
  console.log('🔍 Verifying WZ Formula Registration...\n');

  // Check 1: window.luckysheet_function
  console.log('📋 Check 1: window.luckysheet_function');
  if (typeof window !== 'undefined' && window.luckysheet_function) {
    const wzFunctions = Object.keys(window.luckysheet_function).filter(key => key.startsWith('WZ.'));
    console.log(`✅ Found ${wzFunctions.length} WZ functions in window.luckysheet_function:`);
    wzFunctions.forEach(fn => console.log(`   - ${fn}`));
  } else {
    console.log('❌ window.luckysheet_function not found or empty');
  }

  console.log('\n📋 Check 2: window.luckysheet_configsetting.functionlist');
  if (typeof window !== 'undefined' &&
      window.luckysheet_configsetting &&
      Array.isArray(window.luckysheet_configsetting.functionlist)) {
    const wzFunctions = window.luckysheet_configsetting.functionlist.filter(f => f && f.n && f.n.startsWith('WZ.'));
    console.log(`✅ Found ${wzFunctions.length} WZ functions in functionlist:`);
    wzFunctions.forEach(f => console.log(`   - ${f.n}: ${f.d}`));
  } else {
    console.log('❌ window.luckysheet_configsetting.functionlist not found or empty');
  }

  console.log('\n📋 Check 3: Luckysheet Store');
  const storeCandidates = [
    { name: 'window.luckysheet.Store', obj: window?.luckysheet?.Store },
    { name: 'window.Store', obj: window?.Store },
    { name: 'window.luckysheet.store', obj: window?.luckysheet?.store }
  ].filter(c => c.obj);

  if (storeCandidates.length > 0) {
    storeCandidates.forEach(candidate => {
      if (candidate.obj.functionlist && Array.isArray(candidate.obj.functionlist)) {
        const wzFunctions = candidate.obj.functionlist.filter(f => f && f.n && f.n.startsWith('WZ.'));
        console.log(`✅ ${candidate.name}.functionlist has ${wzFunctions.length} WZ functions`);
      }
    });
  } else {
    console.log('⚠️ No Luckysheet Store found (may be expected if Store not used)');
  }

  console.log('\n📋 Check 4: Manual Test Instructions');
  console.log('To verify the native dropdown works:');
  console.log('1. Click on any cell in the spreadsheet');
  console.log('2. Type: =WZ');
  console.log('3. You should see WZ formulas appear in the autocomplete dropdown');
  console.log('\n✅ Verification complete!');
})();