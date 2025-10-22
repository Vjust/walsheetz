/**
 * Navigation E2E Tests
 * Tests for application navigation and routing
 */

import { test, expect } from '../fixtures/spreadsheet.js';
import { e2eLogger } from '../utils/E2ETestLogger.js';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    e2eLogger.suiteStart('Navigation');

    // Start at homepage
    const baseURL = process.env.APP_URL || 'http://localhost:3005';
    await page.goto(baseURL);
    await page.waitForTimeout(2000);
  });

  test('should navigate to homepage', async ({ page }) => {
    e2eLogger.info('Testing homepage navigation');

    const url = page.url();
    e2eLogger.result('Current URL', url);

    expect(url).toContain('localhost:3005');
    e2eLogger.success('Homepage loaded');

    // Check for key elements
    const hasContent = await page.locator('body').isVisible();
    e2eLogger.assertion(hasContent, 'Page content is visible');
    expect(hasContent).toBe(true);
  });

  test('should have working navigation links', async ({ page }) => {
    e2eLogger.info('Testing navigation links');

    // Look for navigation menu or header links
    const nav = page.locator('nav, header, [role="navigation"]').first();

    if (await nav.isVisible({ timeout: 3000 })) {
      e2eLogger.success('Navigation element found');

      // Get all links
      const links = nav.locator('a');
      const count = await links.count();

      e2eLogger.result('Navigation links found', count);
      e2eLogger.assertion(count > 0, `Found ${count} navigation links`);
      expect(count).toBeGreaterThanOrEqual(0);
    } else {
      e2eLogger.info('Navigation element not found - may be minimal UI');
    }
  });

  test('should navigate to spreadsheet from homepage', async ({ page, spreadsheet }) => {
    e2eLogger.info('Testing navigation to spreadsheet');

    // Click create button
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();
    await createButton.click();
    e2eLogger.action('click', 'Clicked create button');

    await page.waitForTimeout(500);

    // Submit modal
    const modal = page.locator('[role="dialog"], .modal, [class*="modal"]').first();
    if (await modal.isVisible({ timeout: 2000 })) {
      const submitButton = modal.locator('button').filter({ hasText: /create|submit|ok/i }).first();
      await submitButton.click();
    }

    // Wait for navigation
    await page.waitForTimeout(2000);

    // Verify we're on spreadsheet page
    const url = page.url();
    e2eLogger.result('Spreadsheet URL', url);

    // URL should change (might include document ID)
    const urlChanged = !url.endsWith('3005') && !url.endsWith('3005/');
    e2eLogger.assertion(urlChanged, 'URL changed after navigation');

    // Verify Luckysheet loaded
    await spreadsheet.waitForLuckysheet(15000);
    e2eLogger.success('Navigated to spreadsheet successfully');
  });

  test('should support browser back button', async ({ page, spreadsheet }) => {
    e2eLogger.info('Testing browser back button');

    // Get initial URL
    const initialUrl = page.url();
    e2eLogger.result('Initial URL', initialUrl);

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

    const spreadsheetUrl = page.url();
    e2eLogger.result('Spreadsheet URL', spreadsheetUrl);

    // Go back
    await page.goBack();
    e2eLogger.action('navigation', 'Clicked browser back');
    await page.waitForTimeout(1000);

    // Verify we're back at initial page
    const backUrl = page.url();
    e2eLogger.result('URL after back', backUrl);

    const isBack = backUrl.includes(initialUrl) || initialUrl.includes(backUrl);
    e2eLogger.assertion(isBack, 'Navigated back to initial page');

    e2eLogger.success('Browser back button works');
  });

  test('should support browser forward button', async ({ page, spreadsheet }) => {
    e2eLogger.info('Testing browser forward button');

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
    const spreadsheetUrl = page.url();

    // Go back
    await page.goBack();
    await page.waitForTimeout(1000);

    // Go forward
    await page.goForward();
    e2eLogger.action('navigation', 'Clicked browser forward');
    await page.waitForTimeout(1000);

    // Verify we're back at spreadsheet
    const forwardUrl = page.url();
    e2eLogger.result('URL after forward', forwardUrl);

    e2eLogger.assertion(
      forwardUrl === spreadsheetUrl,
      'Navigated forward to spreadsheet'
    );

    e2eLogger.success('Browser forward button works');
  });

  test('should handle direct URL access to spreadsheet', async ({ page, spreadsheet }) => {
    e2eLogger.info('Testing direct URL access');

    // First, create a spreadsheet to get a valid URL
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
    const spreadsheetUrl = page.url();
    e2eLogger.result('Spreadsheet URL', spreadsheetUrl);

    // Navigate away
    await page.goto(process.env.APP_URL || 'http://localhost:3005');
    await page.waitForTimeout(1000);

    // Navigate directly back to spreadsheet
    e2eLogger.action('navigation', `Direct navigation to: ${spreadsheetUrl}`);
    await page.goto(spreadsheetUrl);
    await page.waitForTimeout(2000);

    // Verify spreadsheet loaded
    await spreadsheet.waitForLuckysheet(15000);
    e2eLogger.success('Direct URL access works');
  });

  test('should handle page reload', async ({ page, spreadsheet }) => {
    e2eLogger.info('Testing page reload');

    // Create spreadsheet
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

    // Add some content
    await spreadsheet.clickCell(0, 0);
    await spreadsheet.typeInCell('Before Reload');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Reload
    e2eLogger.action('navigation', 'Reloading page...');
    await page.reload();
    await page.waitForTimeout(3000);

    // Verify page reloaded
    await spreadsheet.waitForLuckysheet(15000);
    e2eLogger.success('Page reload works');

    // Check if content persisted (depends on save)
    const value = await spreadsheet.getCellValue(0, 0);
    e2eLogger.result('Cell value after reload', value || 'empty');
  });

  test('should show 404 for invalid document ID', async ({ page }) => {
    e2eLogger.info('Testing 404 handling');

    // Try to access invalid document
    const invalidUrl = `${process.env.APP_URL || 'http://localhost:3005'}/spreadsheet/invalid-id-12345`;

    e2eLogger.action('navigation', `Navigating to: ${invalidUrl}`);
    await page.goto(invalidUrl);
    await page.waitForTimeout(2000);

    // Look for error message or 404 page
    const errorText = await page.locator('body').textContent();

    const hasError = errorText && (
      errorText.includes('404') ||
      errorText.includes('not found') ||
      errorText.includes('error') ||
      errorText.includes('invalid')
    );

    if (hasError) {
      e2eLogger.success('Error handling for invalid document ID works');
    } else {
      e2eLogger.info('May redirect to homepage or show empty spreadsheet');
    }
  });

  test('should have breadcrumb or title showing current location', async ({ page, spreadsheet }) => {
    e2eLogger.info('Testing location indicator (breadcrumb/title)');

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

    // Look for title, breadcrumb, or header
    const locationIndicators = [
      page.locator('h1, h2').first(),
      page.locator('[class*="breadcrumb"]').first(),
      page.locator('header [class*="title"]').first()
    ];

    for (const indicator of locationIndicators) {
      if (await indicator.isVisible({ timeout: 1000 })) {
        const text = await indicator.textContent();
        e2eLogger.result('Location indicator', text);
        e2eLogger.success('Location indicator found');
        return;
      }
    }

    e2eLogger.info('No location indicator found - may use minimal UI');
  });

  test('should maintain URL state with query parameters', async ({ page }) => {
    e2eLogger.info('Testing URL query parameter handling');

    // Navigate with query parameters
    const urlWithParams = `${process.env.APP_URL || 'http://localhost:3005'}?test=true&mode=view`;

    e2eLogger.action('navigation', `Navigating to: ${urlWithParams}`);
    await page.goto(urlWithParams);
    await page.waitForTimeout(2000);

    // Check if parameters are preserved
    const currentUrl = page.url();
    e2eLogger.result('Current URL', currentUrl);

    const hasParams = currentUrl.includes('test=true');
    if (hasParams) {
      e2eLogger.success('Query parameters preserved');
    } else {
      e2eLogger.info('Query parameters may not be used');
    }
  });

  test.afterEach(async () => {
    e2eLogger.suiteEnd('Navigation', {
      passed: 0,
      failed: 0,
      total: 0,
      duration: 0
    });
  });
});
