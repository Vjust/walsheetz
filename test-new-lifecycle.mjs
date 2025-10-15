/**
 * Quick test script to verify new lifecycle hook is working
 */
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

// Collect console logs
const logs = [];
page.on('console', msg => {
  const text = msg.text();
  logs.push(text);
  console.log('BROWSER:', text);
});

// Navigate to app
console.log('\n📍 Navigating to http://localhost:3005...\n');
await page.goto('http://localhost:3005');

// Wait for Luckysheet to initialize
console.log('\n⏳ Waiting for Luckysheet to initialize...\n');
await page.waitForSelector('#luckysheet-container canvas', { timeout: 10000 });
await page.waitForTimeout(2000);

// Check for key log messages
console.log('\n📊 Checking console logs for key messages...\n');
const hasNewLifecycle = logs.some(log => log.includes('Using NEW lifecycle hook'));
const hasLegacy = logs.some(log => log.includes('Using LEGACY manual initialization'));
const hasAdapterInit = logs.some(log => log.includes('Luckysheet adapter initialized'));
const hasLifecycleInit = logs.some(log => log.includes('[Lifecycle]'));

console.log('Results:');
console.log(`  ✅ NEW lifecycle hook: ${hasNewLifecycle ? 'YES ✅' : 'NO ❌'}`);
console.log(`  ⚠️  Legacy path: ${hasLegacy ? 'YES (bad)' : 'NO (good)'}`);
console.log(`  ✅ Adapter initialized: ${hasAdapterInit ? 'YES ✅' : 'NO ❌'}`);
console.log(`  ✅ Lifecycle logs: ${hasLifecycleInit ? 'YES ✅' : 'NO ❌'}`);

// Check adapter state
console.log('\n📊 Checking adapter diagnostics...\n');
const adapterDiag = await page.evaluate(() => {
  if (window.__luckysheetAdapter) {
    return window.__luckysheetAdapter.getDiagnostics();
  }
  return null;
});

if (adapterDiag) {
  console.log('Adapter Diagnostics:');
  console.log(`  State: ${adapterDiag.state}`);
  console.log(`  Hook Installed: ${adapterDiag.hookInstalled}`);
  console.log(`  WZ Functions Injected: ${adapterDiag.wzFunctionsInjected}`);
  console.log(`  Sheets Found: ${adapterDiag.sheetsFound}`);
} else {
  console.log('❌ Adapter not available');
}

// Test autocomplete
console.log('\n🧪 Testing autocomplete...\n');
const canvas = page.locator('#luckysheet-container canvas').first();
await canvas.click({ position: { x: 50, y: 50 } });
await page.waitForTimeout(500);
await page.keyboard.type('=WZ.CONTRACT.LIST(');
await page.waitForTimeout(1000);

const autocompleteVisible = await page.locator('.luckysheet-formula-search, .formula-search-c').first().isVisible().catch(() => false);
console.log(`  Autocomplete visible: ${autocompleteVisible ? 'YES ✅' : 'NO ❌'}`);

console.log('\n✅ Manual testing complete. Browser window will stay open for 10 seconds...\n');
await page.waitForTimeout(10000);

await browser.close();
console.log('\n🎉 Test complete!\n');
process.exit(0);
