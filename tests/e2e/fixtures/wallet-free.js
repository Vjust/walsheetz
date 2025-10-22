/**
 * Wallet-free test fixture for E2E tests
 * Bypasses wallet connection requirements using VITE_TEST_AUTH_BYPASS
 */
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  // Add custom fixtures here if needed
  page: async ({ page }, use) => {
    // Wait for app to be ready
    await page.waitForLoadState('domcontentloaded');

    // Give React and Luckysheet time to initialize
    await page.waitForTimeout(2000);

    await use(page);
  }
});

export { expect };
