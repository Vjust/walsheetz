/**
 * E2E Test: WZ Function Autocomplete
 *
 * Tests that WZ functions appear correctly in autocomplete dropdown
 * and can be selected to populate cells.
 *
 * This test serves as a guardrail for the multi-layer injection refactor.
 */
import { test, expect } from './fixtures/wallet-free.js';

test.describe('WZ Function Autocomplete', () => {
  test('should show WZ.CONTRACT.LIST in autocomplete when typing =WZ', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Wait for Luckysheet to be fully initialized
    await page.waitForSelector('#luckysheet-container canvas', { timeout: 10000 });

    // Additional wait for formula injection to complete
    await page.waitForTimeout(1000);

    // Click on cell A1 to focus it
    const canvas = page.locator('#luckysheet-container canvas').first();
    await canvas.click({ position: { x: 50, y: 50 } });

    // Wait for cell to be selected
    await page.waitForTimeout(500);

    // Type formula prefix to trigger autocomplete
    await page.keyboard.type('=WZ.CONTRACT.LIST(');

    // Wait for autocomplete dropdown to appear
    // Luckysheet uses classes like 'luckysheet-formula-search' or 'formula-search-c'
    const autocompleteDropdown = page.locator('.luckysheet-formula-search, .formula-search-c').first();

    await expect(autocompleteDropdown).toBeVisible({ timeout: 5000 });

    // Check that WZ.CONTRACT.LIST appears in the dropdown
    const autocompleteItem = page.locator('.luckysheet-formula-search-item').filter({ hasText: 'WZ.CONTRACT.LIST' });
    await expect(autocompleteItem).toBeVisible({ timeout: 3000 });

    // Take screenshot for debugging if needed
    await page.screenshot({ path: 'tests/e2e/screenshots/autocomplete-dropdown.png', fullPage: true });
  });

  test('should autocomplete WZ.SUILEND.RESERVES when typing =WZ.SUILEND', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#luckysheet-container canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const canvas = page.locator('#luckysheet-container canvas').first();
    await canvas.click({ position: { x: 50, y: 50 } });
    await page.waitForTimeout(500);

    // Type partial formula
    await page.keyboard.type('=WZ.SUILEND.RE');

    // Wait for autocomplete
    const autocompleteDropdown = page.locator('.luckysheet-formula-search, .formula-search-c').first();
    await expect(autocompleteDropdown).toBeVisible({ timeout: 5000 });

    // Should show WZ.SUILEND.RESERVES
    const autocompleteItem = page.locator('.luckysheet-formula-search-item').filter({ hasText: 'WZ.SUILEND.RESERVES' });
    await expect(autocompleteItem).toBeVisible({ timeout: 3000 });
  });

  test('should allow selecting autocomplete item to populate cell', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#luckysheet-container canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const canvas = page.locator('#luckysheet-container canvas').first();
    await canvas.click({ position: { x: 50, y: 50 } });
    await page.waitForTimeout(500);

    // Type formula
    await page.keyboard.type('=WZ.CONTRACT.LIST');
    await page.waitForTimeout(500);

    // Wait for autocomplete dropdown
    const autocompleteDropdown = page.locator('.luckysheet-formula-search, .formula-search-c').first();
    await expect(autocompleteDropdown).toBeVisible({ timeout: 5000 });

    // Click on the autocomplete item
    const autocompleteItem = page.locator('.luckysheet-formula-search-item').filter({ hasText: 'WZ.CONTRACT.LIST' }).first();
    await autocompleteItem.click();

    // Autocomplete should close
    await expect(autocompleteDropdown).not.toBeVisible({ timeout: 2000 });

    // Formula bar should contain the function
    const formulaBar = page.locator('#luckysheet-rich-text-editor, #luckysheet-input-box');
    await expect(formulaBar.first()).toContainText('WZ.CONTRACT.LIST');

    // Take screenshot
    await page.screenshot({ path: 'tests/e2e/screenshots/formula-selected.png', fullPage: true });
  });

  test('should not break on repeated cell selections', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#luckysheet-container canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const canvas = page.locator('#luckysheet-container canvas').first();

    // Click multiple cells in sequence
    for (let i = 0; i < 5; i++) {
      await canvas.click({ position: { x: 50 + (i * 80), y: 50 } });
      await page.waitForTimeout(200);

      // Type formula in each cell
      await page.keyboard.type('=WZ');
      await page.waitForTimeout(300);

      // Verify autocomplete appears
      const autocompleteDropdown = page.locator('.luckysheet-formula-search, .formula-search-c').first();
      await expect(autocompleteDropdown).toBeVisible({ timeout: 3000 });

      // Press Escape to close autocomplete
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      // Clear cell
      await page.keyboard.press('Delete');
      await page.waitForTimeout(200);
    }

    // Take final screenshot
    await page.screenshot({ path: 'tests/e2e/screenshots/repeated-selections.png', fullPage: true });
  });

  test('should display WZ function descriptions in autocomplete', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#luckysheet-container canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const canvas = page.locator('#luckysheet-container canvas').first();
    await canvas.click({ position: { x: 50, y: 50 } });
    await page.waitForTimeout(500);

    await page.keyboard.type('=WZ.APY');
    await page.waitForTimeout(500);

    const autocompleteDropdown = page.locator('.luckysheet-formula-search, .formula-search-c').first();
    await expect(autocompleteDropdown).toBeVisible({ timeout: 5000 });

    // Check for description text (should contain "APY" or "protocol")
    const description = page.locator('.luckysheet-formula-search-item-desc');
    await expect(description.first()).toBeVisible({ timeout: 3000 });
  });
});

test.describe('WZ Function Injection Diagnostics', () => {
  test('should have injection API available in browser console', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#luckysheet-container canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // PRIMARY: Check new LuckysheetAdapter (Phase 2)
    const hasAdapter = await page.evaluate(() => typeof window.__luckysheetAdapter !== 'undefined');
    expect(hasAdapter).toBe(true);

    const adapterDiag = await page.evaluate(() => {
      if (window.__luckysheetAdapter) {
        return window.__luckysheetAdapter.getDiagnostics();
      }
      return null;
    });

    expect(adapterDiag).not.toBeNull();
    expect(adapterDiag.state).toBe('READY');
    expect(adapterDiag.hookInstalled).toBe(true);
    expect(adapterDiag.wzFunctionsInjected).toBe(true);
    expect(adapterDiag.sheetsFound).toBeGreaterThan(0);

    console.log('📊 LuckysheetAdapter Diagnostics:', JSON.stringify(adapterDiag, null, 2));

    // SECONDARY: Check legacy API (compatibility check)
    const hasLegacyWzInject = await page.evaluate(() => typeof window.__wzInject !== 'undefined');
    const hasWzNesting = await page.evaluate(() => typeof window.__wzNesting !== 'undefined');

    if (hasLegacyWzInject) {
      console.log('ℹ️  Legacy __wzInject API still present (will be deprecated in future)');
    }

    // Utility APIs should still be available
    expect(hasWzNesting).toBe(true);
  });

  test('should have WZ functions registered in Luckysheet', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#luckysheet-container canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Check that WZ functions are in luckysheet_function
    const wzFunctions = await page.evaluate(() => {
      if (typeof window.luckysheet_function === 'object') {
        const wzKeys = Object.keys(window.luckysheet_function).filter(k => k.startsWith('WZ'));
        return wzKeys;
      }
      return [];
    });

    expect(wzFunctions.length).toBeGreaterThan(0);
    console.log('Registered WZ functions:', wzFunctions);

    // Verify nested structure exists
    const hasNestedStructure = await page.evaluate(() => {
      return !!(window.luckysheet_function?.WZ?.CONTRACT?.LIST);
    });

    expect(hasNestedStructure).toBe(true);
  });
});
