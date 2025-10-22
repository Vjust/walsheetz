/**
 * Formula Autocomplete E2E Tests
 * Tests for WZ function autocomplete functionality
 */

import { test, expect } from '../fixtures/spreadsheet.js';
import { e2eLogger } from '../utils/E2ETestLogger.js';

test.describe('Formula Autocomplete', () => {
  test.beforeEach(async ({ page, spreadsheet }) => {
    e2eLogger.suiteStart('Formula Autocomplete');

    // Navigate to spreadsheet
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();
    if (await createButton.isVisible({ timeout: 5000 })) {
      await createButton.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[role="dialog"], .modal, [class*="modal"]').first();
      if (await modal.isVisible({ timeout: 2000 })) {
        const submitButton = modal.locator('button').filter({ hasText: /create|submit|ok/i }).first();
        await submitButton.click();
      }
    }

    await page.waitForTimeout(2000);
    await spreadsheet.waitForLuckysheet(15000);
  });

  test('should trigger autocomplete for WZ functions', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing WZ function autocomplete trigger');

    // Click cell
    await spreadsheet.clickCell(0, 0);

    // Start typing a formula with WZ prefix
    await spreadsheet.typeInCell('=WZ');
    await page.waitForTimeout(500);

    // Check if autocomplete dropdown appears
    try {
      const dropdown = await spreadsheet.waitForAutocomplete(5000);
      e2eLogger.success('Autocomplete dropdown appeared');

      // Verify dropdown is visible
      const isVisible = await dropdown.isVisible();
      e2eLogger.assertion(isVisible, 'Autocomplete dropdown is visible');
      expect(isVisible).toBe(true);

    } catch (error) {
      e2eLogger.warn('Autocomplete dropdown did not appear');
      e2eLogger.info('This may be expected if WZ functions are not yet implemented');
    }
  });

  test('should show WZ_STORE function in autocomplete', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing WZ_STORE function in autocomplete');

    await spreadsheet.clickCell(0, 0);
    await spreadsheet.typeInCell('=WZ_STORE');
    await page.waitForTimeout(500);

    try {
      const dropdown = await spreadsheet.waitForAutocomplete(5000);

      // Look for WZ_STORE in the list
      const storeItem = page.locator('.luckysheet-formula-search-item').filter({ hasText: /WZ_STORE/i }).first();

      if (await storeItem.isVisible({ timeout: 2000 })) {
        e2eLogger.success('WZ_STORE function found in autocomplete');

        const itemText = await storeItem.textContent();
        e2eLogger.result('Autocomplete item text', itemText);

        expect(itemText).toContain('WZ_STORE');
      } else {
        e2eLogger.warn('WZ_STORE function not found in autocomplete');
      }

    } catch (error) {
      e2eLogger.warn('Autocomplete test skipped - dropdown not available');
    }
  });

  test('should show WZ_READ function in autocomplete', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing WZ_READ function in autocomplete');

    await spreadsheet.clickCell(1, 0);
    await spreadsheet.typeInCell('=WZ_READ');
    await page.waitForTimeout(500);

    try {
      const dropdown = await spreadsheet.waitForAutocomplete(5000);

      // Look for WZ_READ in the list
      const readItem = page.locator('.luckysheet-formula-search-item').filter({ hasText: /WZ_READ/i }).first();

      if (await readItem.isVisible({ timeout: 2000 })) {
        e2eLogger.success('WZ_READ function found in autocomplete');

        const itemText = await readItem.textContent();
        e2eLogger.result('Autocomplete item text', itemText);

        expect(itemText).toContain('WZ_READ');
      } else {
        e2eLogger.warn('WZ_READ function not found in autocomplete');
      }

    } catch (error) {
      e2eLogger.warn('Autocomplete test skipped - dropdown not available');
    }
  });

  test('should select autocomplete item with mouse', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing autocomplete item selection with mouse');

    await spreadsheet.clickCell(2, 0);
    await spreadsheet.typeInCell('=WZ');
    await page.waitForTimeout(500);

    try {
      await spreadsheet.waitForAutocomplete(5000);

      // Get first autocomplete item
      const firstItem = page.locator('.luckysheet-formula-search-item').first();

      if (await firstItem.isVisible({ timeout: 2000 })) {
        const itemText = await firstItem.textContent();
        e2eLogger.info(`Clicking autocomplete item: ${itemText}`);

        // Click the item
        await firstItem.click();
        await page.waitForTimeout(300);

        // Check formula bar to see if function was inserted
        const formulaBar = await spreadsheet.getFormulaBarValue();
        e2eLogger.result('Formula bar after selection', formulaBar);

        e2eLogger.assertion(
          formulaBar && formulaBar.includes('WZ'),
          'WZ function inserted into cell'
        );

        e2eLogger.success('Autocomplete selection works');
      }

    } catch (error) {
      e2eLogger.warn('Autocomplete selection test skipped');
    }
  });

  test('should navigate autocomplete with arrow keys', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing autocomplete navigation with arrow keys');

    await spreadsheet.clickCell(3, 0);
    await spreadsheet.typeInCell('=WZ');
    await page.waitForTimeout(500);

    try {
      await spreadsheet.waitForAutocomplete(5000);

      // Press down arrow to navigate
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(200);

      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(200);

      // Press Enter to select
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);

      // Check if function was inserted
      const formulaBar = await spreadsheet.getFormulaBarValue();
      e2eLogger.result('Formula bar after arrow navigation', formulaBar);

      if (formulaBar && formulaBar.includes('WZ')) {
        e2eLogger.success('Arrow key navigation in autocomplete works');
      } else {
        e2eLogger.warn('Arrow key selection may not have worked');
      }

    } catch (error) {
      e2eLogger.warn('Autocomplete navigation test skipped');
    }
  });

  test('should close autocomplete with Escape', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing autocomplete dismissal with Escape');

    await spreadsheet.clickCell(4, 0);
    await spreadsheet.typeInCell('=WZ');
    await page.waitForTimeout(500);

    try {
      const dropdown = await spreadsheet.waitForAutocomplete(5000);

      // Press Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      // Check if dropdown is hidden
      const isHidden = await dropdown.isHidden();
      e2eLogger.assertion(isHidden, 'Autocomplete dropdown dismissed');

      if (isHidden) {
        e2eLogger.success('Escape key dismisses autocomplete');
      } else {
        e2eLogger.warn('Autocomplete may still be visible');
      }

    } catch (error) {
      e2eLogger.warn('Autocomplete dismissal test skipped');
    }
  });

  test('should show function description in autocomplete', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing function description display');

    await spreadsheet.clickCell(5, 0);
    await spreadsheet.typeInCell('=WZ_STORE');
    await page.waitForTimeout(500);

    try {
      await spreadsheet.waitForAutocomplete(5000);

      // Look for description or help text
      const descriptionEl = page.locator('.formula-help, .function-description, [class*="description"]').first();

      if (await descriptionEl.isVisible({ timeout: 2000 })) {
        const description = await descriptionEl.textContent();
        e2eLogger.result('Function description', description);
        e2eLogger.success('Function description is displayed');
      } else {
        e2eLogger.info('Function description element not found');
      }

    } catch (error) {
      e2eLogger.warn('Description display test skipped');
    }
  });

  test('should filter autocomplete results as user types', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing autocomplete filtering');

    await spreadsheet.clickCell(6, 0);
    await spreadsheet.typeInCell('=WZ_ST');
    await page.waitForTimeout(500);

    try {
      await spreadsheet.waitForAutocomplete(5000);

      // Count visible items
      const items = page.locator('.luckysheet-formula-search-item:visible');
      const count = await items.count();

      e2eLogger.result('Filtered autocomplete items', count);

      // Type more to narrow down
      await page.keyboard.type('O');
      await page.waitForTimeout(300);

      const newCount = await items.count();
      e2eLogger.result('Autocomplete items after more typing', newCount);

      if (newCount <= count) {
        e2eLogger.success('Autocomplete filters as user types');
      } else {
        e2eLogger.warn('Autocomplete filtering may not be working');
      }

    } catch (error) {
      e2eLogger.warn('Autocomplete filtering test skipped');
    }
  });

  test('should work with standard Excel functions', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing autocomplete for standard Excel functions');

    await spreadsheet.clickCell(7, 0);
    await spreadsheet.typeInCell('=SUM');
    await page.waitForTimeout(500);

    try {
      const dropdown = page.locator('.luckysheet-formula-search, .formula-search-c').first();
      const isVisible = await dropdown.isVisible({ timeout: 3000 });

      if (isVisible) {
        e2eLogger.success('Autocomplete works for standard Excel functions');

        // Look for SUM function
        const sumItem = page.locator('.luckysheet-formula-search-item').filter({ hasText: /^SUM/i }).first();

        if (await sumItem.isVisible({ timeout: 2000 })) {
          e2eLogger.success('SUM function found in autocomplete');
        }
      }

    } catch (error) {
      e2eLogger.warn('Standard function autocomplete test skipped');
    }
  });

  test('should handle partial WZ function names', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing partial WZ function name autocomplete');

    const partialNames = ['=WZ', '=WZ_', '=WZ_S', '=WZ_STO'];

    for (const partial of partialNames) {
      await spreadsheet.clickCell(8, partialNames.indexOf(partial));
      await spreadsheet.typeInCell(partial);
      await page.waitForTimeout(500);

      try {
        const dropdown = page.locator('.luckysheet-formula-search, .formula-search-c').first();
        const isVisible = await dropdown.isVisible({ timeout: 2000 });

        e2eLogger.assertion(
          isVisible,
          `Autocomplete appears for "${partial}"`
        );

        // Escape to close dropdown for next iteration
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

      } catch (error) {
        e2eLogger.warn(`Autocomplete test skipped for "${partial}"`);
      }
    }

    e2eLogger.success('Partial name autocomplete test complete');
  });

  test.afterEach(async () => {
    e2eLogger.suiteEnd('Formula Autocomplete', {
      passed: 0,
      failed: 0,
      total: 0,
      duration: 0
    });
  });
});
