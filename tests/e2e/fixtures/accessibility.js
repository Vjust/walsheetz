/**
 * Accessibility Test Fixture
 * Extends base test with accessibility testing helpers (WCAG 2.1 Level AA)
 */

import { test as base, expect } from '@playwright/test';
import { e2eLogger } from '../utils/E2ETestLogger.js';
import * as a11yHelpers from '../utils/A11yHelpers.js';
import * as visualHelpers from '../utils/VisualHelpers.js';

/**
 * Extended test fixture with accessibility helpers
 */
export const test = base.extend({
  /**
   * Enhanced page fixture with accessibility setup
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

      // Wait for initial render
      e2eLogger.setup('Waiting for page initialization...');
      await page.waitForTimeout(2000);

      // Inject axe-core for accessibility testing
      e2eLogger.setup('Injecting axe-core...');
      try {
        await a11yHelpers.injectAxe(page);
      } catch (error) {
        e2eLogger.warn(`Failed to inject axe-core: ${error.message}`);
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
   * Accessibility helpers fixture
   * Provides all accessibility testing utilities
   */
  a11y: async ({ page }, use) => {
    const helpers = {
      // Axe-core scanning
      injectAxe: async () => {
        return await a11yHelpers.injectAxe(page);
      },

      runAxeScan: async (context = null, options = {}) => {
        return await a11yHelpers.runAxeScan(page, context, options);
      },

      checkA11y: async (context = null, options = {}) => {
        return await a11yHelpers.checkA11y(page, context, options);
      },

      // Color contrast
      checkColorContrast: async (selector, requiredRatio = 4.5) => {
        return await a11yHelpers.checkColorContrast(page, selector, requiredRatio);
      },

      // Keyboard navigation
      isKeyboardFocusable: async (selector) => {
        return await a11yHelpers.isKeyboardFocusable(page, selector);
      },

      checkFocusVisible: async (selector) => {
        return await a11yHelpers.checkFocusVisible(page, selector);
      },

      testKeyboardNavigation: async (startSelector, expectedOrder) => {
        return await a11yHelpers.testKeyboardNavigation(page, startSelector, expectedOrder);
      },

      // ARIA attributes
      checkAriaAttributes: async (selector, expectedAttributes = {}) => {
        return await a11yHelpers.checkAriaAttributes(page, selector, expectedAttributes);
      },

      // Content structure
      checkHeadingHierarchy: async () => {
        return await a11yHelpers.checkHeadingHierarchy(page);
      },

      checkImageAltText: async () => {
        return await a11yHelpers.checkImageAltText(page);
      },

      checkFormLabels: async () => {
        return await a11yHelpers.checkFormLabels(page);
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
      }
    };

    await use(helpers);
  }
});

/**
 * Custom expect matchers for accessibility testing
 */
expect.extend({
  /**
   * Check if page passes accessibility scan
   */
  async toPassAccessibility(result) {
    const pass = result.pass;

    if (!pass && result.violations) {
      const violationSummary = result.violations
        .slice(0, 5)
        .map(v => `  - [${v.impact || 'unknown'}] ${v.id}: ${v.description || 'No description'}`)
        .join('\n');

      return {
        pass,
        message: () => `Expected page to pass accessibility checks, but found ${result.violations.length} violations:\n${violationSummary}`
      };
    }

    return {
      pass,
      message: () => pass
        ? `Expected page to fail accessibility checks`
        : `Expected page to pass accessibility checks`
    };
  },

  /**
   * Check if contrast ratio meets WCAG requirements
   */
  toMeetContrastRequirements(result) {
    const pass = result.pass;

    return {
      pass,
      message: () => pass
        ? `Expected contrast ratio to fail requirements`
        : `Expected contrast ratio >= ${result.required}:1, but got ${result.ratio?.toFixed(2)}:1 (${result.foreground} on ${result.background})`
    };
  },

  /**
   * Check if element is keyboard accessible
   */
  async toBeKeyboardAccessible(page, selector) {
    const focusable = await a11yHelpers.isKeyboardFocusable(page, selector);
    const pass = focusable;

    return {
      pass,
      message: () => pass
        ? `Expected element "${selector}" not to be keyboard accessible`
        : `Expected element "${selector}" to be keyboard accessible (focusable via Tab key)`
    };
  },

  /**
   * Check if focus indicator is visible
   */
  async toHaveVisibleFocus(page, selector) {
    await page.focus(selector);
    const visible = await a11yHelpers.checkFocusVisible(page, selector);
    const pass = visible;

    return {
      pass,
      message: () => pass
        ? `Expected element "${selector}" not to have visible focus indicator`
        : `Expected element "${selector}" to have visible focus indicator (outline or box-shadow)`
    };
  },

  /**
   * Check if ARIA attributes are correct
   */
  async toHaveCorrectAria(page, selector, expectedAttributes) {
    const result = await a11yHelpers.checkAriaAttributes(page, selector, expectedAttributes);
    const pass = result.pass;

    if (!pass) {
      const missing = result.missing.length > 0
        ? `Missing: ${result.missing.join(', ')}`
        : '';
      const incorrect = result.incorrect.length > 0
        ? `Incorrect: ${result.incorrect.map(i => `${i.attr}="${i.actual}" (expected "${i.expected}")`).join(', ')}`
        : '';

      return {
        pass,
        message: () => `Expected element "${selector}" to have correct ARIA attributes.\n  ${missing}\n  ${incorrect}`
      };
    }

    return {
      pass,
      message: () => `Expected element "${selector}" not to have correct ARIA attributes`
    };
  },

  /**
   * Check if heading hierarchy is valid
   */
  toHaveValidHeadingHierarchy(result) {
    const pass = result.pass;

    if (!pass && result.issues) {
      const issueSummary = result.issues
        .slice(0, 5)
        .map(i => `  - ${i.message}: "${i.heading.text}"`)
        .join('\n');

      return {
        pass,
        message: () => `Expected valid heading hierarchy, but found ${result.issues.length} issues:\n${issueSummary}`
      };
    }

    return {
      pass,
      message: () => pass
        ? `Expected heading hierarchy to be invalid`
        : `Expected valid heading hierarchy`
    };
  },

  /**
   * Check if all images have alt text
   */
  toHaveCompleteImageAltText(result) {
    const pass = result.pass;

    return {
      pass,
      message: () => pass
        ? `Expected images to be missing alt text`
        : `Expected all images to have alt text, but ${result.missingAlt} of ${result.totalImages} images are missing alt attributes`
    };
  },

  /**
   * Check if all form inputs have labels
   */
  toHaveCompleteFormLabels(result) {
    const pass = result.pass;

    return {
      pass,
      message: () => pass
        ? `Expected form inputs to be missing labels`
        : `Expected all form inputs to have labels, but ${result.unlabeled} of ${result.totalInputs} inputs lack accessible names`
    };
  },

  /**
   * Check if keyboard navigation follows expected order
   */
  toFollowKeyboardNavigation(result) {
    const pass = result.pass;

    if (!pass) {
      const failedSteps = result.results
        .filter(r => !r.match)
        .slice(0, 3)
        .map(r => `  - Step ${r.step}: Expected ${r.expected.description || r.expected.selector}`)
        .join('\n');

      return {
        pass,
        message: () => `Expected keyboard navigation to follow expected order:\n${failedSteps}`
      };
    }

    return {
      pass,
      message: () => pass
        ? `Expected keyboard navigation not to follow expected order`
        : `Expected keyboard navigation to follow expected order`
    };
  }
});

export { expect };
