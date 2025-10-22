/**
 * Spreadsheet Test Fixture
 * Extends base test with spreadsheet-specific helpers and setup
 */

import { test as base, expect } from '@playwright/test';
import { e2eLogger } from '../utils/E2ETestLogger.js';
import * as spreadsheetHelpers from '../utils/SpreadsheetHelpers.js';
import * as visualHelpers from '../utils/VisualHelpers.js';

/**
 * Extended test fixture with spreadsheet helpers
 */
export const test = base.extend({
  /**
   * Enhanced page fixture with spreadsheet initialization
   */
  page: async ({ page }, use, testInfo) => {
    const testId = e2eLogger.testStart(testInfo.title);

    try {
      // Wait for app to be ready
      e2eLogger.setup('Waiting for page to load...');
      await page.waitForLoadState('domcontentloaded');

      // Navigate to base URL
      const baseURL = process.env.APP_URL || 'http://localhost:3005';
      e2eLogger.navigation(baseURL);
      await page.goto(baseURL);

      // Give React and app initialization time
      e2eLogger.setup('Waiting for React and application initialization...');
      await page.waitForTimeout(2000);

      // Check if Luckysheet is loaded
      const hasLuckysheet = await page.evaluate(() => {
        return typeof window.luckysheet !== 'undefined';
      });

      if (hasLuckysheet) {
        e2eLogger.success('Luckysheet detected on page');
      } else {
        e2eLogger.warn('Luckysheet not detected - may not be on spreadsheet page');
      }

      // Use the page
      await use(page);

      // Test completed successfully
      e2eLogger.testPass(testInfo.title, testId);

    } catch (error) {
      // Test failed
      e2eLogger.testFail(testInfo.title, error, {
        url: page.url(),
        viewport: await page.viewportSize()
      }, testId);

      // Take failure screenshot
      try {
        const screenshotPath = await visualHelpers.screenshotOnFailure(page, testInfo.title);
        testInfo.attachments.push({
          name: 'failure-screenshot',
          path: screenshotPath,
          contentType: 'image/png'
        });
      } catch (screenshotError) {
        e2eLogger.warn(`Failed to capture failure screenshot: ${screenshotError.message}`);
      }

      throw error;
    }
  },

  /**
   * Spreadsheet helpers fixture
   * Provides all spreadsheet interaction utilities
   */
  spreadsheet: async ({ page }, use) => {
    const helpers = {
      // Wait for wallet connection
      waitForWalletConnection: async (timeout = 15000) => {
        return await spreadsheetHelpers.waitForWalletConnection(page, timeout);
      },

      // Wait for Luckysheet initialization
      waitForLuckysheet: async (timeout = 10000) => {
        return await spreadsheetHelpers.waitForLuckysheet(page, timeout);
      },

      // Cell operations
      clickCell: async (row, col) => {
        return await spreadsheetHelpers.clickCell(page, row, col);
      },

      getCellValue: async (row, col) => {
        return await spreadsheetHelpers.getCellValue(page, row, col);
      },

      verifyCellValue: async (row, col, expectedValue) => {
        return await spreadsheetHelpers.verifyCellValue(page, row, col, expectedValue);
      },

      typeInCell: async (text) => {
        return await spreadsheetHelpers.typeInCell(page, text);
      },

      clearCell: async (row, col) => {
        return await spreadsheetHelpers.clearCell(page, row, col);
      },

      // Range operations
      selectRange: async (startRow, startCol, endRow, endCol) => {
        return await spreadsheetHelpers.selectRange(page, startRow, startCol, endRow, endCol);
      },

      // Formula operations
      getFormulaBarValue: async () => {
        return await spreadsheetHelpers.getFormulaBarValue(page);
      },

      waitForAutocomplete: async (timeout = 5000) => {
        return await spreadsheetHelpers.waitForAutocomplete(page, timeout);
      },

      selectAutocompleteItem: async (itemText) => {
        return await spreadsheetHelpers.selectAutocompleteItem(page, itemText);
      },

      // Navigation
      navigateWithArrows: async (direction, count = 1) => {
        return await spreadsheetHelpers.navigateWithArrows(page, direction, count);
      },

      getActiveCell: async () => {
        return await spreadsheetHelpers.getActiveCell(page);
      },

      verifyActiveCell: async (row, col) => {
        return await spreadsheetHelpers.verifyActiveCell(page, row, col);
      },

      // Formatting
      getCellFormat: async (row, col) => {
        return await spreadsheetHelpers.getCellFormat(page, row, col);
      },

      verifyCellBold: async (row, col, shouldBeBold = true) => {
        return await spreadsheetHelpers.verifyCellBold(page, row, col, shouldBeBold);
      },

      verifyCellItalic: async (row, col, shouldBeItalic = true) => {
        return await spreadsheetHelpers.verifyCellItalic(page, row, col, shouldBeItalic);
      },

      verifyCellUnderline: async (row, col, shouldBeUnderlined = true) => {
        return await spreadsheetHelpers.verifyCellUnderline(page, row, col, shouldBeUnderlined);
      },

      // Keyboard shortcuts
      pressShortcut: async (keys) => {
        return await spreadsheetHelpers.pressShortcut(page, keys);
      },

      copyCells: async () => {
        return await spreadsheetHelpers.copyCells(page);
      },

      pasteCells: async () => {
        return await spreadsheetHelpers.pasteCells(page);
      },

      undo: async () => {
        return await spreadsheetHelpers.undo(page);
      },

      redo: async () => {
        return await spreadsheetHelpers.redo(page);
      },

      // Save operations
      save: async () => {
        return await spreadsheetHelpers.save(page);
      },

      verifySaveStatus: async (expectedStatus = 'saved') => {
        return await spreadsheetHelpers.verifySaveStatus(page, expectedStatus);
      },

      // Utility functions
      getCellRef: spreadsheetHelpers.getCellRef,
      getCellPosition: async (row, col) => {
        return await spreadsheetHelpers.getCellPosition(page, row, col);
      }
    };

    await use(helpers);
  },

  /**
   * Visual testing helpers fixture
   */
  visual: async ({ page }, use, testInfo) => {
    const helpers = {
      // Screenshot operations
      takeScreenshot: async (name, options = {}) => {
        return await visualHelpers.takeScreenshot(page, name, options);
      },

      screenshotOnFailure: async (testName) => {
        return await visualHelpers.screenshotOnFailure(page, testName || testInfo.title);
      },

      captureElement: async (selector, name) => {
        return await visualHelpers.captureElement(page, selector, name);
      },

      // Visual regression
      visualRegressionTest: async (name, options = {}) => {
        return await visualHelpers.visualRegressionTest(page, name, options);
      },

      // Video recording
      startVideoRecording: async (name) => {
        return await visualHelpers.startVideoRecording(page, name);
      },

      stopVideoRecording: async (recording) => {
        return await visualHelpers.stopVideoRecording(recording);
      },

      // Utility
      waitForVisualStability: async (duration = 1000, checkInterval = 100) => {
        return await visualHelpers.waitForVisualStability(page, duration, checkInterval);
      },

      screenshotWithNetworkWait: async (name, waitForIdle = true) => {
        return await visualHelpers.screenshotWithNetworkWait(page, name, waitForIdle);
      }
    };

    await use(helpers);
  }
});

/**
 * Custom expect matchers for spreadsheet testing
 */
expect.extend({
  /**
   * Check if cell has expected value
   */
  async toHaveCellValue(page, row, col, expectedValue) {
    const actualValue = await spreadsheetHelpers.getCellValue(page, row, col);
    const pass = actualValue === expectedValue || String(actualValue) === String(expectedValue);

    return {
      pass,
      message: () => pass
        ? `Expected cell (${row}, ${col}) not to have value "${expectedValue}"`
        : `Expected cell (${row}, ${col}) to have value "${expectedValue}", but got "${actualValue}"`
    };
  },

  /**
   * Check if cell is bold
   */
  async toHaveBoldCell(page, row, col) {
    const format = await spreadsheetHelpers.getCellFormat(page, row, col);
    const pass = format.bl === 1;

    return {
      pass,
      message: () => pass
        ? `Expected cell (${row}, ${col}) not to be bold`
        : `Expected cell (${row}, ${col}) to be bold`
    };
  },

  /**
   * Check if visual regression test passed
   */
  toPassVisualRegression(result) {
    const pass = result.pass;

    return {
      pass,
      message: () => pass
        ? 'Expected visual regression to fail'
        : `Visual regression failed: ${result.diffPercentage?.toFixed(2)}% difference (${result.diffPixels} pixels)`
    };
  }
});

export { expect };
