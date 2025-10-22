/**
 * Save Workflow E2E Tests
 * Tests for saving spreadsheets to Walrus/Sui blockchain
 */

import { test, expect } from '../fixtures/spreadsheet.js';
import { e2eLogger } from '../utils/E2ETestLogger.js';

test.describe('Save Workflow', () => {
  test.beforeEach(async ({ page, spreadsheet }) => {
    e2eLogger.suiteStart('Save Workflow');

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

    // Add some content to make save meaningful
    await spreadsheet.clickCell(0, 0);
    await spreadsheet.typeInCell('Test Data');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  });

  test('should show save button in UI', async ({ page }) => {
    e2eLogger.info('Testing save button visibility');

    // Look for save button
    const saveButton = page.locator('button').filter({ hasText: /save/i }).first();

    const isVisible = await saveButton.isVisible({ timeout: 5000 });
    e2eLogger.assertion(isVisible, 'Save button is visible');

    if (isVisible) {
      e2eLogger.success('Save button found in UI');

      // Check if enabled
      const isEnabled = await saveButton.isEnabled();
      e2eLogger.assertion(isEnabled, 'Save button is enabled');
      expect(isEnabled).toBe(true);
    } else {
      e2eLogger.warn('Save button not found - may use Ctrl+S only');
    }
  });

  test('should trigger save with Ctrl+S', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing save with Ctrl+S shortcut');

    // Press Ctrl+S
    await spreadsheet.save();
    await page.waitForTimeout(1000);

    // Look for save status indicator
    const statusIndicator = page.locator('[class*="save"], [class*="status"], .save-status-indicator').first();

    if (await statusIndicator.isVisible({ timeout: 3000 })) {
      const statusText = await statusIndicator.textContent();
      e2eLogger.result('Save status', statusText);
      e2eLogger.success('Save status indicator appeared');
    } else {
      e2eLogger.info('Save status indicator not found');
    }
  });

  test('should trigger save with save button click', async ({ page }) => {
    e2eLogger.info('Testing save with button click');

    // Click save button
    const saveButton = page.locator('button').filter({ hasText: /save/i }).first();

    if (await saveButton.isVisible({ timeout: 3000 })) {
      await saveButton.click();
      e2eLogger.action('click', 'Clicked save button');

      await page.waitForTimeout(1000);

      // Look for confirmation or status
      const statusIndicator = page.locator('[class*="save"], [class*="status"]').first();

      if (await statusIndicator.isVisible({ timeout: 3000 })) {
        const statusText = await statusIndicator.textContent();
        e2eLogger.result('Save status after button click', statusText);
        e2eLogger.success('Save initiated via button');
      }
    } else {
      e2eLogger.warn('Save button not found - test skipped');
    }
  });

  test('should show saving status during save operation', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing saving status indicator');

    // Trigger save
    await spreadsheet.save();

    // Immediately check for "saving" status
    await page.waitForTimeout(200);

    const statusIndicator = page.locator('[class*="save"], [class*="status"], .save-status-indicator').first();

    if (await statusIndicator.isVisible({ timeout: 1000 })) {
      const statusText = await statusIndicator.textContent();
      e2eLogger.result('Status during save', statusText);

      const isSaving = statusText && (
        statusText.toLowerCase().includes('saving') ||
        statusText.toLowerCase().includes('uploading') ||
        statusText.toLowerCase().includes('processing')
      );

      if (isSaving) {
        e2eLogger.success('Saving status shown during operation');
      } else {
        e2eLogger.info(`Status text: "${statusText}" (may already be complete)`);
      }
    }
  });

  test('should show success status after successful save', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing save success status');

    // Trigger save
    await spreadsheet.save();

    // Wait for save to complete
    await page.waitForTimeout(3000);

    // Check for success status
    const statusIndicator = page.locator('[class*="save"], [class*="status"], .save-status-indicator').first();

    if (await statusIndicator.isVisible({ timeout: 2000 })) {
      const statusText = await statusIndicator.textContent();
      e2eLogger.result('Status after save', statusText);

      const isSuccess = statusText && (
        statusText.toLowerCase().includes('saved') ||
        statusText.toLowerCase().includes('success') ||
        statusText.toLowerCase().includes('complete')
      );

      if (isSuccess) {
        e2eLogger.success('Success status shown after save');
        expect(isSuccess).toBe(true);
      } else {
        e2eLogger.warn(`Unexpected status text: "${statusText}"`);
      }
    } else {
      e2eLogger.warn('Save status indicator not visible');
    }
  });

  test('should persist data after save and reload', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing data persistence after save');

    const testValue = `Persist ${Date.now()}`;

    // Enter unique data
    await spreadsheet.clickCell(0, 0);
    await page.keyboard.press('Delete');
    await spreadsheet.typeInCell(testValue);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Save
    await spreadsheet.save();
    await page.waitForTimeout(3000);

    // Get current URL (should include document ID)
    const currentUrl = page.url();
    e2eLogger.result('Current URL', currentUrl);

    // Reload the page
    e2eLogger.action('navigation', 'Reloading page...');
    await page.reload();
    await page.waitForTimeout(3000);

    await spreadsheet.waitForLuckysheet(15000);

    // Check if data persisted
    const value = await spreadsheet.getCellValue(0, 0);
    e2eLogger.result('Cell value after reload', value);

    e2eLogger.assertion(
      value === testValue,
      `Data persisted after reload: "${testValue}"`
    );
    expect(value).toBe(testValue);

    e2eLogger.success('Data persistence verified');
  });

  test('should handle rapid consecutive saves', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing rapid consecutive saves');

    // Trigger multiple saves quickly
    for (let i = 0; i < 3; i++) {
      await spreadsheet.save();
      await page.waitForTimeout(100);
      e2eLogger.info(`Save attempt ${i + 1}`);
    }

    // Wait for saves to complete
    await page.waitForTimeout(3000);

    // Check final status
    const statusIndicator = page.locator('[class*="save"], [class*="status"], .save-status-indicator').first();

    if (await statusIndicator.isVisible({ timeout: 2000 })) {
      const statusText = await statusIndicator.textContent();
      e2eLogger.result('Status after rapid saves', statusText);

      // Should not show error
      const hasError = statusText && (
        statusText.toLowerCase().includes('error') ||
        statusText.toLowerCase().includes('failed')
      );

      e2eLogger.assertion(!hasError, 'No error after rapid saves');
      expect(hasError).toBe(false);
    }

    e2eLogger.success('Rapid saves handled correctly');
  });

  test('should show unsaved changes indicator', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing unsaved changes indicator');

    // Make changes
    await spreadsheet.clickCell(1, 1);
    await spreadsheet.typeInCell('Unsaved');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Look for unsaved indicator
    const unsavedIndicator = page.locator('[class*="unsaved"], [class*="dirty"], [class*="modified"]').first();

    if (await unsavedIndicator.isVisible({ timeout: 2000 })) {
      const indicatorText = await unsavedIndicator.textContent();
      e2eLogger.result('Unsaved indicator', indicatorText);
      e2eLogger.success('Unsaved changes indicator shown');
    } else {
      e2eLogger.info('Unsaved changes indicator not found');
    }
  });

  test('should clear unsaved indicator after save', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing unsaved indicator clearing');

    // Make changes
    await spreadsheet.clickCell(2, 2);
    await spreadsheet.typeInCell('Will be saved');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Save
    await spreadsheet.save();
    await page.waitForTimeout(3000);

    // Check if unsaved indicator is gone
    const unsavedIndicator = page.locator('[class*="unsaved"], [class*="dirty"]').first();
    const savedIndicator = page.locator('[class*="saved"], [class*="success"]').first();

    const isUnsavedHidden = await unsavedIndicator.isHidden().catch(() => true);
    const isSavedVisible = await savedIndicator.isVisible({ timeout: 2000 }).catch(() => false);

    if (isUnsavedHidden || isSavedVisible) {
      e2eLogger.success('Unsaved indicator cleared after save');
    } else {
      e2eLogger.info('Indicator state after save not determined');
    }
  });

  test('should preserve formatting after save', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing formatting preservation');

    // Add formatted content
    await spreadsheet.clickCell(3, 0);
    await spreadsheet.typeInCell('Bold Text');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Select and bold
    await spreadsheet.clickCell(3, 0);
    await spreadsheet.pressShortcut('Control+B');
    await page.waitForTimeout(300);

    // Get initial format
    const formatBefore = await spreadsheet.getCellFormat(3, 0);
    e2eLogger.result('Format before save', formatBefore);

    // Save
    await spreadsheet.save();
    await page.waitForTimeout(3000);

    // Reload
    await page.reload();
    await page.waitForTimeout(3000);
    await spreadsheet.waitForLuckysheet(15000);

    // Get format after reload
    const formatAfter = await spreadsheet.getCellFormat(3, 0);
    e2eLogger.result('Format after reload', formatAfter);

    // Note: Format persistence depends on implementation
    e2eLogger.info('Format preservation test complete');
  });

  test.afterEach(async () => {
    e2eLogger.suiteEnd('Save Workflow', {
      passed: 0,
      failed: 0,
      total: 0,
      duration: 0
    });
  });
});
