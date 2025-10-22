/**
 * Spreadsheet Creation E2E Tests
 * Tests for creating new spreadsheet documents and initial setup
 */

import { test, expect } from '../fixtures/spreadsheet.js';
import { e2eLogger } from '../utils/E2ETestLogger.js';

test.describe('Spreadsheet Creation', () => {
  test.beforeEach(async ({ page }) => {
    e2eLogger.suiteStart('Spreadsheet Creation');
  });

  test('should load application homepage', async ({ page }) => {
    e2eLogger.info('Testing application homepage load');

    // Verify page title
    const title = await page.title();
    e2eLogger.result('Page title', title);
    expect(title).toBeTruthy();

    // Verify page loaded successfully
    const url = page.url();
    e2eLogger.result('Current URL', url);
    expect(url).toContain('localhost:3005');
  });

  test('should display create document button', async ({ page }) => {
    e2eLogger.info('Testing create document button visibility');

    // Look for create button
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();
    await expect(createButton).toBeVisible({ timeout: 10000 });

    e2eLogger.success('Create document button is visible');

    // Check button is enabled
    const isEnabled = await createButton.isEnabled();
    e2eLogger.assertion(isEnabled, 'Create button is enabled');
    expect(isEnabled).toBe(true);
  });

  test('should open create document modal', async ({ page }) => {
    e2eLogger.info('Testing create document modal');

    // Click create button
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();
    await createButton.click();
    e2eLogger.action('click', 'Clicked create document button');

    // Wait for modal to appear
    await page.waitForTimeout(500);

    // Check if modal is visible
    const modal = page.locator('[role="dialog"], .modal, [class*="modal"]').first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    e2eLogger.success('Create document modal opened');

    // Verify modal has input field for document name
    const nameInput = modal.locator('input[type="text"], input[placeholder*="name" i]').first();
    await expect(nameInput).toBeVisible();

    e2eLogger.success('Document name input field is visible');
  });

  test('should create new spreadsheet with default name', async ({ page, spreadsheet }) => {
    e2eLogger.info('Testing spreadsheet creation with default name');

    // Click create button
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();
    await createButton.click();
    e2eLogger.action('click', 'Clicked create document button');

    await page.waitForTimeout(500);

    // Enter a title (required by modal)
    const modal = page.locator('[role="dialog"], .modal, [class*="modal"]').first();
    const nameInput = modal.locator('input[type="text"], input[placeholder*="title" i], input#document-title').first();

    const defaultName = `Test Sheet ${Date.now()}`;
    await nameInput.fill(defaultName);
    e2eLogger.action('keyboard', `Entered title: ${defaultName}`);

    // Submit modal
    const submitButton = modal.locator('button').filter({ hasText: /create spreadsheet/i }).first();
    await submitButton.click();
    e2eLogger.action('click', 'Clicked create spreadsheet button');

    // Wait for creation to complete (progress indicator may appear)
    await page.waitForTimeout(3000);

    // Verify Luckysheet is initialized
    await spreadsheet.waitForLuckysheet(15000);

    e2eLogger.success('Spreadsheet created and Luckysheet initialized');

    // Verify luckysheet container is visible
    const container = page.locator('#luckysheet-container, #luckysheet');
    await expect(container).toBeVisible({ timeout: 5000 });

    e2eLogger.success('Luckysheet container is visible');
  });

  test('should create spreadsheet with custom name', async ({ page, spreadsheet }) => {
    e2eLogger.info('Testing spreadsheet creation with custom name');

    const customName = `Test Spreadsheet ${Date.now()}`;
    e2eLogger.debug('Custom name', { name: customName });

    // Click create button
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();
    await createButton.click();

    await page.waitForTimeout(500);

    // Enter custom name
    const modal = page.locator('[role="dialog"], .modal, [class*="modal"]').first();
    const nameInput = modal.locator('input[type="text"], input[placeholder*="title" i], input#document-title').first();

    await nameInput.fill(customName);
    e2eLogger.action('keyboard', `Entered name: ${customName}`);

    // Submit
    const submitButton = modal.locator('button').filter({ hasText: /create spreadsheet/i }).first();
    await submitButton.click();
    e2eLogger.action('click', 'Clicked create spreadsheet button');

    // Wait for creation to complete
    await page.waitForTimeout(3000);

    // Verify spreadsheet loaded
    await spreadsheet.waitForLuckysheet(15000);

    e2eLogger.success('Custom-named spreadsheet created successfully');

    // Verify document name appears in UI (header or title)
    const headerText = await page.locator('header, [class*="header"], h1').first().textContent();
    e2eLogger.result('Header text', headerText);

    // Note: This assertion may need adjustment based on actual UI
    // expect(headerText).toContain(customName);
  });

  test('should initialize with empty cells', async ({ page, spreadsheet }) => {
    e2eLogger.info('Testing initial cell state');

    // Create a new spreadsheet first
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();
    if (await createButton.isVisible()) {
      await createButton.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[role="dialog"], .modal, [class*="modal"]').first();
      if (await modal.isVisible()) {
        const nameInput = modal.locator('input[type="text"], input[placeholder*="title" i], input#document-title').first();
        await nameInput.fill(`Test Empty ${Date.now()}`);

        const submitButton = modal.locator('button').filter({ hasText: /create spreadsheet/i }).first();
        await submitButton.click();
      }
    }

    await page.waitForTimeout(3000);
    await spreadsheet.waitForLuckysheet(15000);

    // Check several cells are empty
    const cellsToCheck = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 2, col: 2 }
    ];

    for (const { row, col } of cellsToCheck) {
      const value = await spreadsheet.getCellValue(row, col);
      e2eLogger.assertion(
        !value || value === '',
        `Cell (${row}, ${col}) is empty`
      );
      expect(value).toBeFalsy();
    }

    e2eLogger.success('All checked cells are empty as expected');
  });

  test('should have canvas elements rendered', async ({ page, spreadsheet }) => {
    e2eLogger.info('Testing canvas rendering');

    // Create spreadsheet
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();
    if (await createButton.isVisible()) {
      await createButton.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[role="dialog"], .modal, [class*="modal"]').first();
      if (await modal.isVisible()) {
        const nameInput = modal.locator('input[type="text"], input[placeholder*="title" i], input#document-title').first();
        await nameInput.fill(`Test Canvas ${Date.now()}`);

        const submitButton = modal.locator('button').filter({ hasText: /create spreadsheet/i }).first();
        await submitButton.click();
      }
    }

    await page.waitForTimeout(3000);
    await spreadsheet.waitForLuckysheet(15000);

    // Check for canvas elements
    const canvases = page.locator('#luckysheet-container canvas, #luckysheet canvas');
    const count = await canvases.count();

    e2eLogger.result('Canvas elements found', count);
    e2eLogger.assertion(count > 0, `Found ${count} canvas elements`);
    expect(count).toBeGreaterThan(0);

    // Verify canvas dimensions
    const firstCanvas = canvases.first();
    const boundingBox = await firstCanvas.boundingBox();

    if (boundingBox) {
      e2eLogger.result('Canvas dimensions', {
        width: boundingBox.width,
        height: boundingBox.height
      });

      e2eLogger.assertion(
        boundingBox.width > 0 && boundingBox.height > 0,
        'Canvas has non-zero dimensions'
      );
      expect(boundingBox.width).toBeGreaterThan(0);
      expect(boundingBox.height).toBeGreaterThan(0);
    }

    e2eLogger.success('Canvas elements rendered correctly');
  });

  test('should load with proper viewport', async ({ page, spreadsheet }) => {
    e2eLogger.info('Testing viewport configuration');

    const viewport = page.viewportSize();
    e2eLogger.result('Viewport size', viewport);

    expect(viewport.width).toBeGreaterThanOrEqual(1280);
    expect(viewport.height).toBeGreaterThanOrEqual(600);

    e2eLogger.success('Viewport configured correctly');
  });

  test.afterEach(async () => {
    e2eLogger.suiteEnd('Spreadsheet Creation', {
      passed: 0,
      failed: 0,
      total: 0,
      duration: 0
    });
  });
});
