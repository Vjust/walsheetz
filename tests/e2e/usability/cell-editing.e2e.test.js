/**
 * Cell Editing E2E Tests
 * Tests for basic cell editing operations
 */

import { test, expect } from '../fixtures/spreadsheet.js';
import { e2eLogger } from '../utils/E2ETestLogger.js';

test.describe('Cell Editing', () => {
  test.beforeEach(async ({ page, spreadsheet }) => {
    e2eLogger.suiteStart('Cell Editing');

    // Navigate to spreadsheet (create or load existing)
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

  test('should click and select a cell', async ({ spreadsheet }) => {
    e2eLogger.info('Testing cell selection');

    // Click cell A1 (0, 0)
    await spreadsheet.clickCell(0, 0);

    // Verify cell is active
    const activeCell = await spreadsheet.getActiveCell();
    e2eLogger.result('Active cell', activeCell);

    e2eLogger.assertion(
      activeCell && activeCell.row === 0 && activeCell.col === 0,
      'Cell (0, 0) is active'
    );

    expect(activeCell).toBeTruthy();
    expect(activeCell.row).toBe(0);
    expect(activeCell.col).toBe(0);

    e2eLogger.success('Cell selection works correctly');
  });

  test('should type text into a cell', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing text input');

    const testText = 'Hello World';

    // Click cell
    await spreadsheet.clickCell(0, 0);

    // Type text
    await spreadsheet.typeInCell(testText);

    // Press Enter to confirm
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Verify cell value
    const value = await spreadsheet.getCellValue(0, 0);
    e2eLogger.result('Cell value', value);

    e2eLogger.assertion(
      value === testText,
      `Cell contains "${testText}"`
    );
    expect(value).toBe(testText);

    e2eLogger.success('Text input works correctly');
  });

  test('should type numbers into a cell', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing number input');

    const testNumber = '42';

    // Click cell
    await spreadsheet.clickCell(1, 1);

    // Type number
    await spreadsheet.typeInCell(testNumber);

    // Press Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Verify cell value
    const value = await spreadsheet.getCellValue(1, 1);
    e2eLogger.result('Cell value', value);

    // Value might be number or string depending on Luckysheet parsing
    const matches = value === testNumber || value === 42 || String(value) === testNumber;
    e2eLogger.assertion(matches, `Cell contains ${testNumber}`);
    expect(matches).toBe(true);

    e2eLogger.success('Number input works correctly');
  });

  test('should edit existing cell content', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing cell editing');

    // First, add content to a cell
    await spreadsheet.clickCell(2, 2);
    await spreadsheet.typeInCell('Original');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Click the cell again
    await spreadsheet.clickCell(2, 2);

    // Clear and type new content
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);
    await spreadsheet.typeInCell('Modified');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Verify new value
    const value = await spreadsheet.getCellValue(2, 2);
    e2eLogger.result('Cell value after edit', value);

    e2eLogger.assertion(
      value === 'Modified',
      'Cell content was modified'
    );
    expect(value).toBe('Modified');

    e2eLogger.success('Cell editing works correctly');
  });

  test('should clear cell content with Delete key', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing cell clearing');

    // Add content to a cell
    await spreadsheet.clickCell(3, 0);
    await spreadsheet.typeInCell('To be deleted');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Clear the cell
    await spreadsheet.clearCell(3, 0);

    // Verify cell is empty
    const value = await spreadsheet.getCellValue(3, 0);
    e2eLogger.result('Cell value after delete', value);

    e2eLogger.assertion(
      !value || value === '',
      'Cell is empty'
    );
    expect(value).toBeFalsy();

    e2eLogger.success('Cell clearing works correctly');
  });

  test('should edit multiple cells in sequence', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing multiple cell edits');

    const cellsToEdit = [
      { row: 0, col: 0, value: 'A1' },
      { row: 0, col: 1, value: 'B1' },
      { row: 1, col: 0, value: 'A2' },
      { row: 1, col: 1, value: 'B2' }
    ];

    for (const { row, col, value } of cellsToEdit) {
      await spreadsheet.clickCell(row, col);
      await spreadsheet.typeInCell(value);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
    }

    // Verify all cells
    for (const { row, col, value } of cellsToEdit) {
      const actualValue = await spreadsheet.getCellValue(row, col);
      e2eLogger.assertion(
        actualValue === value,
        `Cell (${row}, ${col}) = "${value}"`
      );
      expect(actualValue).toBe(value);
    }

    e2eLogger.success('Multiple cell edits work correctly');
  });

  test('should handle Enter key navigation', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing Enter key navigation');

    // Click cell A1
    await spreadsheet.clickCell(0, 0);
    await spreadsheet.typeInCell('First');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Should move to next row
    const activeCell = await spreadsheet.getActiveCell();
    e2eLogger.result('Active cell after Enter', activeCell);

    e2eLogger.assertion(
      activeCell && activeCell.row === 1,
      'Cursor moved to next row'
    );
    expect(activeCell.row).toBe(1);

    e2eLogger.success('Enter key navigation works correctly');
  });

  test('should handle Tab key navigation', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing Tab key navigation');

    // Click cell A1
    await spreadsheet.clickCell(0, 0);
    await spreadsheet.typeInCell('First');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);

    // Should move to next column
    const activeCell = await spreadsheet.getActiveCell();
    e2eLogger.result('Active cell after Tab', activeCell);

    e2eLogger.assertion(
      activeCell && activeCell.col === 1,
      'Cursor moved to next column'
    );
    expect(activeCell.col).toBe(1);

    e2eLogger.success('Tab key navigation works correctly');
  });

  test('should handle special characters', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing special character input');

    const specialChars = '!@#$%^&*()';

    await spreadsheet.clickCell(5, 0);
    await spreadsheet.typeInCell(specialChars);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const value = await spreadsheet.getCellValue(5, 0);
    e2eLogger.result('Cell value with special chars', value);

    e2eLogger.assertion(
      value === specialChars,
      'Special characters handled correctly'
    );
    expect(value).toBe(specialChars);

    e2eLogger.success('Special character input works correctly');
  });

  test('should handle long text input', async ({ spreadsheet, page }) => {
    e2eLogger.info('Testing long text input');

    const longText = 'This is a very long text that should wrap or overflow the cell boundary and test how the spreadsheet handles longer content';

    await spreadsheet.clickCell(6, 0);
    await spreadsheet.typeInCell(longText);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const value = await spreadsheet.getCellValue(6, 0);
    e2eLogger.result('Cell value with long text', value ? value.substring(0, 50) + '...' : 'empty');

    e2eLogger.assertion(
      value === longText,
      'Long text handled correctly'
    );
    expect(value).toBe(longText);

    e2eLogger.success('Long text input works correctly');
  });

  test.afterEach(async () => {
    e2eLogger.suiteEnd('Cell Editing', {
      passed: 0,
      failed: 0,
      total: 0,
      duration: 0
    });
  });
});
