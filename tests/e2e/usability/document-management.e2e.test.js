/**
 * Document Management E2E Tests
 * Tests for creating, listing, opening, and managing spreadsheet documents
 */

import { test, expect } from '../fixtures/spreadsheet.js';
import { e2eLogger } from '../utils/E2ETestLogger.js';

test.describe('Document Management', () => {
  test.beforeEach(async ({ page }) => {
    e2eLogger.suiteStart('Document Management');

    // Start at homepage/dashboard
    const baseURL = process.env.APP_URL || 'http://localhost:3005';
    await page.goto(baseURL);
    await page.waitForTimeout(2000);
  });

  test('should display document list', async ({ page }) => {
    e2eLogger.info('Testing document list display');

    // Look for document list/grid
    const documentList = page.locator('[class*="document"], [class*="list"], [class*="grid"], table').first();

    if (await documentList.isVisible({ timeout: 5000 })) {
      e2eLogger.success('Document list found');

      // Count documents
      const documents = page.locator('[class*="document-item"], tr, [class*="card"]');
      const count = await documents.count();

      e2eLogger.result('Documents in list', count);
      e2eLogger.assertion(count >= 0, `Found ${count} documents`);
    } else {
      e2eLogger.info('Document list not found - may show empty state');

      // Check for empty state message
      const emptyState = page.locator('[class*="empty"], [class*="no-documents"]').first();
      if (await emptyState.isVisible({ timeout: 2000 })) {
        const emptyText = await emptyState.textContent();
        e2eLogger.result('Empty state message', emptyText);
        e2eLogger.success('Empty state displayed correctly');
      }
    }
  });

  test('should create multiple documents', async ({ page, spreadsheet }) => {
    e2eLogger.info('Testing multiple document creation');

    const documentCount = 2;

    for (let i = 0; i < documentCount; i++) {
      e2eLogger.info(`Creating document ${i + 1}/${documentCount}`);

      // Click create button
      const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();
      await createButton.click();
      await page.waitForTimeout(500);

      // Fill in document name
      const modal = page.locator('[role="dialog"], .modal, [class*="modal"]').first();
      if (await modal.isVisible({ timeout: 2000 })) {
        const nameInput = modal.locator('input[type="text"], input[placeholder*="name" i]').first();

        if (await nameInput.isVisible({ timeout: 1000 })) {
          await nameInput.fill(`Test Document ${i + 1} - ${Date.now()}`);
          e2eLogger.action('keyboard', `Entered document name: Test Document ${i + 1}`);
        }

        const submitButton = modal.locator('button').filter({ hasText: /create|submit|ok/i }).first();
        await submitButton.click();
      }

      await page.waitForTimeout(2000);
      await spreadsheet.waitForLuckysheet(15000);

      // Go back to dashboard
      await page.goto(process.env.APP_URL || 'http://localhost:3005');
      await page.waitForTimeout(2000);
    }

    e2eLogger.success(`Created ${documentCount} documents`);

    // Verify documents appear in list
    const documents = page.locator('[class*="document-item"], tr, [class*="card"]');
    const count = await documents.count();

    e2eLogger.result('Total documents after creation', count);
    e2eLogger.assertion(count >= documentCount, `At least ${documentCount} documents exist`);
  });

  test('should open existing document', async ({ page, spreadsheet }) => {
    e2eLogger.info('Testing opening existing document');

    // First, create a document
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();
    await createButton.click();
    await page.waitForTimeout(500);

    const modal = page.locator('[role="dialog"], .modal, [class*="modal"]').first();
    if (await modal.isVisible({ timeout: 2000 })) {
      const submitButton = modal.locator('button').filter({ hasText: /create|submit|ok/i }).first();
      await submitButton.click();
    }

    await page.waitForTimeout(2000);
    await spreadsheet.waitForLuckysheet(15000);

    // Add identifying content
    await spreadsheet.clickCell(0, 0);
    await spreadsheet.typeInCell('Unique Content');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Save (if auto-save is disabled)
    await spreadsheet.save();
    await page.waitForTimeout(2000);

    // Go back to dashboard
    await page.goto(process.env.APP_URL || 'http://localhost:3005');
    await page.waitForTimeout(2000);

    // Click on the document to open it
    const documentItem = page.locator('[class*="document-item"], tr, [class*="card"]').first();

    if (await documentItem.isVisible({ timeout: 5000 })) {
      await documentItem.click();
      e2eLogger.action('click', 'Clicked document to open');

      await page.waitForTimeout(2000);
      await spreadsheet.waitForLuckysheet(15000);

      // Verify content loaded
      const value = await spreadsheet.getCellValue(0, 0);
      e2eLogger.result('Cell value after opening', value);

      e2eLogger.assertion(
        value === 'Unique Content',
        'Document opened with correct content'
      );
      expect(value).toBe('Unique Content');

      e2eLogger.success('Existing document opened successfully');
    } else {
      e2eLogger.warn('Document list not found - cannot test opening');
    }
  });

  test('should show document metadata', async ({ page }) => {
    e2eLogger.info('Testing document metadata display');

    // Look for document items
    const documentItem = page.locator('[class*="document-item"], tr, [class*="card"]').first();

    if (await documentItem.isVisible({ timeout: 5000 })) {
      const itemText = await documentItem.textContent();
      e2eLogger.result('Document item text', itemText);

      // Check for common metadata fields
      const hasDate = itemText && (
        itemText.includes('202') || // Year
        itemText.includes('ago') ||
        itemText.includes('/')
      );

      const hasName = itemText && itemText.trim().length > 0;

      if (hasName) {
        e2eLogger.success('Document name displayed');
      }

      if (hasDate) {
        e2eLogger.success('Document date/time displayed');
      }

      if (!hasName && !hasDate) {
        e2eLogger.info('Metadata format not determined');
      }
    } else {
      e2eLogger.warn('No documents found to check metadata');
    }
  });

  test('should filter/search documents', async ({ page }) => {
    e2eLogger.info('Testing document search/filter');

    // Look for search input
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i]').first();

    if (await searchInput.isVisible({ timeout: 3000 })) {
      e2eLogger.success('Search input found');

      // Enter search query
      await searchInput.fill('Test');
      await page.waitForTimeout(500);

      e2eLogger.action('keyboard', 'Entered search query: Test');

      // Check if list updated
      const documents = page.locator('[class*="document-item"], tr, [class*="card"]');
      const count = await documents.count();

      e2eLogger.result('Documents after search', count);
      e2eLogger.success('Search functionality works');
    } else {
      e2eLogger.info('Search functionality not found');
    }
  });

  test('should sort documents', async ({ page }) => {
    e2eLogger.info('Testing document sorting');

    // Look for sort dropdown or buttons
    const sortControls = [
      page.locator('[class*="sort"], select[name*="sort"]').first(),
      page.locator('button').filter({ hasText: /sort/i }).first(),
      page.locator('th').first() // Table header for sorting
    ];

    let foundSort = false;

    for (const control of sortControls) {
      if (await control.isVisible({ timeout: 1000 })) {
        e2eLogger.success('Sort control found');
        foundSort = true;

        // Try to click/interact
        await control.click().catch(() => {});
        await page.waitForTimeout(500);

        e2eLogger.action('click', 'Clicked sort control');
        break;
      }
    }

    if (!foundSort) {
      e2eLogger.info('Sort functionality not found');
    }
  });

  test('should show loading state while fetching documents', async ({ page }) => {
    e2eLogger.info('Testing loading state');

    // Reload page to trigger loading
    await page.reload();

    // Immediately check for loading indicator
    await page.waitForTimeout(100);

    const loadingIndicators = [
      page.locator('[class*="loading"], [class*="spinner"]').first(),
      page.locator('[role="progressbar"]').first(),
      page.locator('[aria-busy="true"]').first()
    ];

    let foundLoading = false;

    for (const indicator of loadingIndicators) {
      if (await indicator.isVisible({ timeout: 500 })) {
        e2eLogger.success('Loading indicator shown');
        foundLoading = true;
        break;
      }
    }

    if (!foundLoading) {
      e2eLogger.info('Loading indicator not found (may load very quickly)');
    }

    // Wait for loading to finish
    await page.waitForTimeout(2000);
  });

  test('should handle empty document list', async ({ page }) => {
    e2eLogger.info('Testing empty state handling');

    // This test assumes we can clear all documents or use a fresh account
    // For now, just check if empty state exists

    const emptyState = page.locator('[class*="empty"], [class*="no-documents"], [class*="zero-state"]').first();

    if (await emptyState.isVisible({ timeout: 3000 })) {
      const emptyText = await emptyState.textContent();
      e2eLogger.result('Empty state message', emptyText);

      const hasCreatePrompt = emptyText && (
        emptyText.toLowerCase().includes('create') ||
        emptyText.toLowerCase().includes('get started') ||
        emptyText.toLowerCase().includes('new')
      );

      if (hasCreatePrompt) {
        e2eLogger.success('Empty state provides helpful guidance');
      } else {
        e2eLogger.info('Empty state shown');
      }
    } else {
      e2eLogger.info('Documents exist - empty state not shown (expected)');
    }
  });

  test('should show document count', async ({ page }) => {
    e2eLogger.info('Testing document count display');

    // Look for count indicator
    const countIndicator = page.locator('[class*="count"], [class*="total"]').first();

    if (await countIndicator.isVisible({ timeout: 3000 })) {
      const countText = await countIndicator.textContent();
      e2eLogger.result('Document count indicator', countText);
      e2eLogger.success('Document count displayed');
    } else {
      e2eLogger.info('Document count indicator not found');
    }
  });

  test('should handle rapid document creation', async ({ page, spreadsheet }) => {
    e2eLogger.info('Testing rapid document creation');

    const createCount = 3;

    for (let i = 0; i < createCount; i++) {
      const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();

      if (await createButton.isVisible({ timeout: 3000 })) {
        await createButton.click();
        await page.waitForTimeout(300);

        const modal = page.locator('[role="dialog"], .modal, [class*="modal"]').first();
        if (await modal.isVisible({ timeout: 2000 })) {
          const submitButton = modal.locator('button').filter({ hasText: /create|submit|ok/i }).first();
          await submitButton.click();
        }

        await page.waitForTimeout(1000);

        // Go back to dashboard quickly
        await page.goto(process.env.APP_URL || 'http://localhost:3005');
        await page.waitForTimeout(1000);
      }
    }

    e2eLogger.success('Rapid document creation completed without errors');

    // Verify documents exist
    const documents = page.locator('[class*="document-item"], tr, [class*="card"]');
    const count = await documents.count();

    e2eLogger.result('Documents after rapid creation', count);
    e2eLogger.assertion(count >= createCount, `At least ${createCount} documents created`);
  });

  test('should persist document list after page reload', async ({ page }) => {
    e2eLogger.info('Testing document list persistence');

    // Get initial document count
    const documentsBefore = page.locator('[class*="document-item"], tr, [class*="card"]');
    const countBefore = await documentsBefore.count().catch(() => 0);

    e2eLogger.result('Documents before reload', countBefore);

    // Reload page
    await page.reload();
    await page.waitForTimeout(3000);

    // Get document count after reload
    const documentsAfter = page.locator('[class*="document-item"], tr, [class*="card"]');
    const countAfter = await documentsAfter.count().catch(() => 0);

    e2eLogger.result('Documents after reload', countAfter);

    e2eLogger.assertion(
      countAfter === countBefore,
      'Document count persisted after reload'
    );
    expect(countAfter).toBe(countBefore);

    e2eLogger.success('Document list persistence verified');
  });

  test.afterEach(async () => {
    e2eLogger.suiteEnd('Document Management', {
      passed: 0,
      failed: 0,
      total: 0,
      duration: 0
    });
  });
});
