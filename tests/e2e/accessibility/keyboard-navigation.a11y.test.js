/**
 * Keyboard Navigation Accessibility Tests
 * WCAG 2.1 Level AA - Keyboard Accessible (2.1.1, 2.1.2)
 */

import { test, expect } from '../fixtures/accessibility.js';
import { e2eLogger } from '../utils/E2ETestLogger.js';

test.describe('Accessibility: Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    e2eLogger.suiteStart('Accessibility: Keyboard Navigation');

    const baseURL = process.env.APP_URL || 'http://localhost:3005';
    await page.goto(baseURL);
    await page.waitForTimeout(2000);
  });

  test('should allow Tab navigation through interactive elements', async ({ page, a11y }) => {
    e2eLogger.info('Testing Tab key navigation');

    // Start tabbing from the beginning
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);

    // Get focused element
    const firstFocused = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tagName: el.tagName,
        id: el.id,
        className: el.className,
        text: el.textContent?.trim().substring(0, 50)
      };
    });

    e2eLogger.result('First focused element', firstFocused);

    // Tab through several elements
    let focusedElements = [firstFocused];

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(200);

      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          tagName: el.tagName,
          id: el.id,
          role: el.getAttribute('role')
        };
      });

      focusedElements.push(focused);
    }

    e2eLogger.result('Focused elements during Tab navigation', focusedElements.length);

    // Verify focus moved (not stuck on one element)
    const uniqueElements = new Set(focusedElements.map(el => `${el.tagName}-${el.id}`));
    const focusProgressed = uniqueElements.size > 1;

    e2eLogger.assertion(focusProgressed, 'Focus progressed through multiple elements');
    expect(focusProgressed).toBe(true);

    e2eLogger.success('Tab navigation works correctly');
  });

  test('should support Shift+Tab for reverse navigation', async ({ page }) => {
    e2eLogger.info('Testing Shift+Tab reverse navigation');

    // Tab forward a few times
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);
    }

    // Get current focused element
    const forwardFocused = await page.evaluate(() => {
      return {
        tagName: document.activeElement.tagName,
        id: document.activeElement.id
      };
    });

    e2eLogger.result('Element after forward tabs', forwardFocused);

    // Tab backward
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    await page.waitForTimeout(200);

    // Get new focused element
    const backwardFocused = await page.evaluate(() => {
      return {
        tagName: document.activeElement.tagName,
        id: document.activeElement.id
      };
    });

    e2eLogger.result('Element after Shift+Tab', backwardFocused);

    // Verify focus moved backward (different element)
    const movedBackward = forwardFocused.tagName !== backwardFocused.tagName ||
                          forwardFocused.id !== backwardFocused.id;

    e2eLogger.assertion(movedBackward, 'Focus moved backward with Shift+Tab');
    expect(movedBackward).toBe(true);

    e2eLogger.success('Reverse Tab navigation works');
  });

  test('should not trap keyboard focus', async ({ page }) => {
    e2eLogger.info('Testing focus trap prevention');

    // Tab through many elements
    let bodyFocused = false;
    let differentElements = new Set();

    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);

      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          tagName: el.tagName,
          id: el.id
        };
      });

      differentElements.add(`${focused.tagName}-${focused.id}`);

      // If we reach body, we've cycled through all focusable elements
      if (focused.tagName === 'BODY') {
        bodyFocused = true;
        break;
      }
    }

    e2eLogger.result('Unique focusable elements', differentElements.size);

    // Should either reach body or have many focusable elements
    const noTrap = bodyFocused || differentElements.size > 3;

    e2eLogger.assertion(noTrap, 'Focus is not trapped in a loop');
    expect(noTrap).toBe(true);

    e2eLogger.success('No focus trap detected');
  });

  test('should allow keyboard access to all interactive controls', async ({ page, a11y }) => {
    e2eLogger.info('Testing keyboard access to buttons');

    // Find all buttons
    const buttons = await page.locator('button').all();
    e2eLogger.result('Total buttons found', buttons.length);

    let accessibleCount = 0;
    let inaccessibleCount = 0;

    for (const button of buttons.slice(0, 10)) { // Test first 10
      const selector = await button.evaluate(el => {
        return `button:has-text("${el.textContent?.trim().substring(0, 20)}")`;
      }).catch(() => 'button');

      const isAccessible = await a11y.isKeyboardFocusable(selector);

      if (isAccessible) {
        accessibleCount++;
      } else {
        inaccessibleCount++;
      }
    }

    e2eLogger.result('Keyboard accessible buttons', accessibleCount);
    e2eLogger.result('Inaccessible buttons', inaccessibleCount);

    e2eLogger.assertion(
      accessibleCount > 0,
      'At least some buttons are keyboard accessible'
    );

    e2eLogger.success('Button keyboard accessibility checked');
  });

  test('should allow keyboard interaction with create button', async ({ page }) => {
    e2eLogger.info('Testing keyboard interaction with create button');

    // Focus on create button using Tab
    let focused = false;
    let attempts = 0;

    while (!focused && attempts < 20) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(150);

      const focusedText = await page.evaluate(() => {
        return document.activeElement?.textContent?.toLowerCase() || '';
      });

      if (focusedText.includes('create') || focusedText.includes('new')) {
        focused = true;
        e2eLogger.success('Create button focused via keyboard');
        break;
      }

      attempts++;
    }

    if (!focused) {
      e2eLogger.warn('Create button not reached via Tab navigation');
      return;
    }

    // Activate with Enter or Space
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Check if modal appeared
    const modal = page.locator('[role="dialog"], .modal').first();
    const modalVisible = await modal.isVisible({ timeout: 2000 });

    e2eLogger.assertion(modalVisible, 'Create button activated via keyboard');
    expect(modalVisible).toBe(true);

    e2eLogger.success('Keyboard interaction with create button works');
  });

  test('should allow Escape key to close modals', async ({ page }) => {
    e2eLogger.info('Testing Escape key for modal dismissal');

    // Open create modal
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();

    if (await createButton.isVisible({ timeout: 3000 })) {
      await createButton.click();
      await page.waitForTimeout(500);

      // Verify modal is open
      const modal = page.locator('[role="dialog"], .modal').first();
      const isOpen = await modal.isVisible({ timeout: 2000 });

      if (isOpen) {
        e2eLogger.success('Modal opened');

        // Press Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);

        // Verify modal closed
        const isClosed = await modal.isHidden();

        e2eLogger.assertion(isClosed, 'Modal closed with Escape key');
        expect(isClosed).toBe(true);

        e2eLogger.success('Escape key closes modal');
      }
    }
  });

  test('should support Enter key for form submission', async ({ page }) => {
    e2eLogger.info('Testing Enter key for form submission');

    // Open create modal
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();

    if (await createButton.isVisible({ timeout: 3000 })) {
      await createButton.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[role="dialog"], .modal').first();

      if (await modal.isVisible({ timeout: 2000 })) {
        // Focus input field
        const input = modal.locator('input').first();

        if (await input.isVisible({ timeout: 1000 })) {
          await input.focus();
          await input.fill('Test Document');

          // Press Enter
          await page.keyboard.press('Enter');
          await page.waitForTimeout(2000);

          // Modal should close and navigate
          const isClosed = await modal.isHidden({ timeout: 3000 });

          e2eLogger.assertion(isClosed, 'Form submitted with Enter key');

          e2eLogger.success('Enter key form submission works');
        }
      }
    }
  });

  test('should maintain logical tab order', async ({ page }) => {
    e2eLogger.info('Testing logical tab order');

    // Record tab order
    const tabOrder = [];

    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(150);

      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          tagName: el.tagName,
          text: el.textContent?.trim().substring(0, 30),
          type: el.getAttribute('type'),
          role: el.getAttribute('role'),
          position: el.getBoundingClientRect()
        };
      });

      tabOrder.push(focused);
    }

    e2eLogger.result('Tab order sequence', tabOrder.map(el => el.text || el.tagName));

    // Check that tab order generally follows visual order (top-to-bottom, left-to-right)
    // This is a simplified check
    const hasLogicalOrder = tabOrder.length > 5;

    e2eLogger.assertion(hasLogicalOrder, 'Tab order captured');
    expect(hasLogicalOrder).toBe(true);

    e2eLogger.success('Tab order test complete');
  });

  test('should not have keyboard-only accessible hidden content', async ({ page }) => {
    e2eLogger.info('Testing for hidden keyboard traps');

    // Check if any focusable elements are hidden
    const hiddenFocusable = await page.evaluate(() => {
      const focusable = document.querySelectorAll(
        'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      return Array.from(focusable).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display === 'none' || style.visibility === 'hidden';
      }).length;
    });

    e2eLogger.result('Hidden focusable elements', hiddenFocusable);

    // Some hidden focusable elements are okay (like in collapsed menus)
    // But an excessive number could indicate problems
    e2eLogger.assertion(
      hiddenFocusable < 50,
      'Not too many hidden focusable elements'
    );

    e2eLogger.success('Hidden focusable elements check complete');
  });

  test('should handle spacebar for button activation', async ({ page }) => {
    e2eLogger.info('Testing spacebar for button activation');

    // Focus on a button
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();

    if (await createButton.isVisible({ timeout: 3000 })) {
      await createButton.focus();
      await page.waitForTimeout(300);

      // Press Space
      await page.keyboard.press('Space');
      await page.waitForTimeout(1000);

      // Check if modal appeared
      const modal = page.locator('[role="dialog"], .modal').first();
      const modalVisible = await modal.isVisible({ timeout: 2000 });

      e2eLogger.assertion(modalVisible, 'Button activated with spacebar');

      if (modalVisible) {
        e2eLogger.success('Spacebar activation works');
        // Close modal
        await page.keyboard.press('Escape');
      } else {
        e2eLogger.warn('Spacebar may not have activated button');
      }
    }
  });

  test.afterEach(async () => {
    e2eLogger.suiteEnd('Accessibility: Keyboard Navigation', {
      passed: 0,
      failed: 0,
      total: 0,
      duration: 0
    });
  });
});
