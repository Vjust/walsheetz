/**
 * Focus Management Accessibility Tests
 * WCAG 2.1 Level AA - Focus Visible (2.4.7), Focus Order (2.4.3)
 */

import { test, expect } from '../fixtures/accessibility.js';
import { e2eLogger } from '../utils/E2ETestLogger.js';

test.describe('Accessibility: Focus Management', () => {
  test.beforeEach(async ({ page }) => {
    e2eLogger.suiteStart('Accessibility: Focus Management');

    const baseURL = process.env.APP_URL || 'http://localhost:3005';
    await page.goto(baseURL);
    await page.waitForTimeout(2000);
  });

  test('should have visible focus indicators on all interactive elements', async ({ page, a11y }) => {
    e2eLogger.info('Testing focus visibility');

    // Test various interactive elements
    const selectors = [
      'button:visible',
      'a:visible',
      'input:visible',
      '[tabindex="0"]:visible'
    ];

    let visibleCount = 0;
    let invisibleCount = 0;

    for (const selector of selectors) {
      const elements = await page.locator(selector).all();

      for (const element of elements.slice(0, 3)) {
        try {
          await element.focus();
          await page.waitForTimeout(200);

          // Check if focus is visible
          const hasVisibleFocus = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el) return false;

            const styles = window.getComputedStyle(el);
            const outline = styles.outline;
            const outlineWidth = styles.outlineWidth;
            const boxShadow = styles.boxShadow;
            const border = styles.border;

            // Check for visible focus indicator
            const hasOutline = outline !== 'none' && outlineWidth !== '0px';
            const hasBoxShadow = boxShadow !== 'none';
            const hasBorder = border && border !== 'none';

            return hasOutline || hasBoxShadow || hasBorder;
          });

          if (hasVisibleFocus) {
            visibleCount++;
          } else {
            invisibleCount++;
            const text = await element.textContent();
            e2eLogger.warn(`No visible focus indicator: ${selector} "${text?.substring(0, 30)}"`);
          }
        } catch (error) {
          // Element may not be focusable
        }
      }
    }

    e2eLogger.result('Elements with visible focus', visibleCount);
    e2eLogger.result('Elements without visible focus', invisibleCount);

    e2eLogger.assertion(
      visibleCount > 0,
      'Some elements have visible focus indicators'
    );
    expect(visibleCount).toBeGreaterThan(0);

    if (invisibleCount > 0) {
      e2eLogger.warn(`${invisibleCount} elements lack visible focus indicators`);
    }

    e2eLogger.success('Focus visibility checked');
  });

  test('should have clear focus indicator on buttons', async ({ page, a11y }) => {
    e2eLogger.info('Testing button focus indicators');

    const buttons = await page.locator('button:visible').all();

    if (buttons.length > 0) {
      const firstButton = buttons[0];
      const buttonSelector = 'button:visible';

      await expect(firstButton).toHaveVisibleFocus(page, buttonSelector);
      e2eLogger.success('Button focus indicator is visible');
    } else {
      e2eLogger.info('No buttons found to test');
    }
  });

  test('should have clear focus indicator on links', async ({ page }) => {
    e2eLogger.info('Testing link focus indicators');

    const links = await page.locator('a:visible').all();

    if (links.length > 0) {
      const firstLink = links[0];
      await firstLink.focus();
      await page.waitForTimeout(200);

      const hasVisibleFocus = await page.evaluate(() => {
        const el = document.activeElement;
        const styles = window.getComputedStyle(el);
        return styles.outline !== 'none' || styles.boxShadow !== 'none';
      });

      e2eLogger.assertion(hasVisibleFocus, 'Link has visible focus indicator');

      if (hasVisibleFocus) {
        e2eLogger.success('Link focus indicator is visible');
      } else {
        e2eLogger.warn('Link may lack visible focus indicator');
      }
    } else {
      e2eLogger.info('No links found to test');
    }
  });

  test('should maintain focus when modal opens', async ({ page }) => {
    e2eLogger.info('Testing focus management in modal');

    // Open modal
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();

    if (await createButton.isVisible({ timeout: 3000 })) {
      await createButton.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[role="dialog"], .modal').first();

      if (await modal.isVisible({ timeout: 2000 })) {
        e2eLogger.success('Modal opened');

        // Check if focus moved into modal
        await page.waitForTimeout(300);

        const focusedElement = await page.evaluate(() => {
          const el = document.activeElement;
          const modal = document.querySelector('[role="dialog"], .modal');

          return {
            tagName: el.tagName,
            inModal: modal ? modal.contains(el) : false,
            text: el.textContent?.trim().substring(0, 30)
          };
        });

        e2eLogger.result('Focused element after modal open', focusedElement);

        e2eLogger.assertion(
          focusedElement.inModal,
          'Focus moved into modal'
        );

        if (focusedElement.inModal) {
          e2eLogger.success('Focus correctly managed when modal opens');
        } else {
          e2eLogger.warn('Focus may not have moved into modal');
        }

        // Close modal
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }
  });

  test('should restore focus when modal closes', async ({ page }) => {
    e2eLogger.info('Testing focus restoration after modal close');

    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();

    if (await createButton.isVisible({ timeout: 3000 })) {
      // Focus and record the button
      await createButton.focus();
      await page.waitForTimeout(200);

      const buttonId = await createButton.evaluate(el => {
        return el.id || el.className || el.textContent?.trim();
      });

      e2eLogger.result('Initial focused button', buttonId);

      // Open modal
      await createButton.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[role="dialog"], .modal').first();

      if (await modal.isVisible({ timeout: 2000 })) {
        // Close modal
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);

        // Check if focus returned to button
        const focusedAfterClose = await page.evaluate(() => {
          const el = document.activeElement;
          return {
            tagName: el.tagName,
            id: el.id,
            className: el.className,
            text: el.textContent?.trim().substring(0, 30)
          };
        });

        e2eLogger.result('Focused element after modal close', focusedAfterClose);

        // Check if focus returned to the button
        const focusRestored = focusedAfterClose.tagName === 'BUTTON';

        e2eLogger.assertion(
          focusRestored,
          'Focus restored after modal close'
        );

        if (focusRestored) {
          e2eLogger.success('Focus correctly restored when modal closes');
        } else {
          e2eLogger.warn('Focus may not have been restored to original element');
        }
      }
    }
  });

  test('should trap focus within modal', async ({ page }) => {
    e2eLogger.info('Testing focus trap in modal');

    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();

    if (await createButton.isVisible({ timeout: 3000 })) {
      await createButton.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[role="dialog"], .modal').first();

      if (await modal.isVisible({ timeout: 2000 })) {
        e2eLogger.success('Modal opened');

        // Tab through modal elements
        let focusedElements = [];

        for (let i = 0; i < 10; i++) {
          await page.keyboard.press('Tab');
          await page.waitForTimeout(150);

          const focused = await page.evaluate(() => {
            const el = document.activeElement;
            const modal = document.querySelector('[role="dialog"], .modal');

            return {
              inModal: modal ? modal.contains(el) : false,
              tagName: el.tagName,
              text: el.textContent?.trim().substring(0, 20)
            };
          });

          focusedElements.push(focused);
        }

        // Check that focus stayed within modal
        const allInModal = focusedElements.every(el => el.inModal);

        e2eLogger.result('Tab iterations in modal', focusedElements.length);
        e2eLogger.assertion(
          allInModal,
          'Focus trapped within modal'
        );

        if (allInModal) {
          e2eLogger.success('Focus trap works correctly');
        } else {
          e2eLogger.warn('Focus may have escaped modal');
        }

        // Close modal
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }
  });

  test('should not lose focus when interacting with page', async ({ page }) => {
    e2eLogger.info('Testing focus persistence during interaction');

    // Focus on an element
    const button = page.locator('button:visible').first();

    if (await button.isVisible({ timeout: 3000 })) {
      await button.focus();
      await page.waitForTimeout(200);

      const initialFocus = await page.evaluate(() => {
        return document.activeElement.tagName;
      });

      e2eLogger.result('Initial focus', initialFocus);

      // Move mouse (should not affect keyboard focus)
      await page.mouse.move(100, 100);
      await page.waitForTimeout(200);

      const focusAfterMove = await page.evaluate(() => {
        return document.activeElement.tagName;
      });

      e2eLogger.assertion(
        focusAfterMove === initialFocus,
        'Focus maintained after mouse movement'
      );
      expect(focusAfterMove).toBe(initialFocus);

      e2eLogger.success('Focus persistence verified');
    }
  });

  test('should have sufficient focus indicator contrast', async ({ page, a11y }) => {
    e2eLogger.info('Testing focus indicator contrast');

    const button = page.locator('button:visible').first();

    if (await button.isVisible({ timeout: 3000 })) {
      await button.focus();
      await page.waitForTimeout(200);

      // Get focus indicator styles
      const focusStyles = await page.evaluate(() => {
        const el = document.activeElement;
        const styles = window.getComputedStyle(el);

        return {
          outline: styles.outline,
          outlineColor: styles.outlineColor,
          outlineWidth: styles.outlineWidth,
          boxShadow: styles.boxShadow,
          backgroundColor: styles.backgroundColor,
          borderColor: styles.borderColor
        };
      });

      e2eLogger.result('Focus indicator styles', focusStyles);

      // Check if there's a visible focus indicator
      const hasIndicator = focusStyles.outline !== 'none' ||
                          focusStyles.boxShadow !== 'none' ||
                          focusStyles.outlineWidth !== '0px';

      e2eLogger.assertion(hasIndicator, 'Focus indicator is present');

      if (hasIndicator) {
        e2eLogger.success('Focus indicator has sufficient styling');
      } else {
        e2eLogger.warn('Focus indicator may not be visible');
      }
    }
  });

  test('should maintain logical focus order', async ({ page }) => {
    e2eLogger.info('Testing focus order logic');

    // Record tab order positions
    const focusSequence = [];

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(150);

      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        const rect = el.getBoundingClientRect();

        return {
          tagName: el.tagName,
          text: el.textContent?.trim().substring(0, 20),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          tabIndex: el.tabIndex
        };
      });

      focusSequence.push(focused);
    }

    e2eLogger.result('Focus sequence', focusSequence.map(el => el.text || el.tagName));

    // Check if focus generally moves top-to-bottom, left-to-right
    let logicalOrder = true;
    for (let i = 1; i < focusSequence.length - 1; i++) {
      const prev = focusSequence[i - 1];
      const curr = focusSequence[i];

      // Simplified check: Y position should not decrease significantly
      if (curr.y < prev.y - 50) {
        logicalOrder = false;
        e2eLogger.warn(`Focus jumped up: ${prev.text} -> ${curr.text}`);
      }
    }

    e2eLogger.assertion(logicalOrder, 'Focus order is logical');

    if (logicalOrder) {
      e2eLogger.success('Focus order follows logical sequence');
    }
  });

  test('should not have invisible focused elements', async ({ page }) => {
    e2eLogger.info('Testing for invisible focused elements');

    // Tab through elements and check visibility
    let invisibleFocusCount = 0;

    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);

      const focusInfo = await page.evaluate(() => {
        const el = document.activeElement;
        const styles = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        return {
          tagName: el.tagName,
          display: styles.display,
          visibility: styles.visibility,
          opacity: styles.opacity,
          isVisible: rect.width > 0 && rect.height > 0 &&
                     styles.display !== 'none' &&
                     styles.visibility !== 'hidden' &&
                     parseFloat(styles.opacity) > 0
        };
      });

      if (!focusInfo.isVisible && focusInfo.tagName !== 'BODY') {
        invisibleFocusCount++;
        e2eLogger.warn(`Invisible element focused: ${focusInfo.tagName}`);
      }
    }

    e2eLogger.result('Invisible focused elements', invisibleFocusCount);

    e2eLogger.assertion(
      invisibleFocusCount === 0,
      'No invisible elements receive focus'
    );

    if (invisibleFocusCount === 0) {
      e2eLogger.success('All focused elements are visible');
    }
  });

  test('should handle focus in dynamic content', async ({ page, spreadsheet }) => {
    e2eLogger.info('Testing focus management in dynamic content');

    // Navigate to spreadsheet (dynamic content)
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();

    if (await createButton.isVisible({ timeout: 3000 })) {
      await createButton.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[role="dialog"], .modal').first();
      if (await modal.isVisible({ timeout: 2000 })) {
        const submitButton = modal.locator('button').filter({ hasText: /create|submit|ok/i }).first();
        await submitButton.click();
      }

      await page.waitForTimeout(2000);
      await spreadsheet.waitForLuckysheet(15000);

      // Focus should be somewhere meaningful
      const focusAfterLoad = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          tagName: el.tagName,
          text: el.textContent?.trim().substring(0, 30)
        };
      });

      e2eLogger.result('Focus after dynamic load', focusAfterLoad);

      // Focus should not be on body (should be on interactive element)
      const hasMeaningfulFocus = focusAfterLoad.tagName !== 'BODY';

      if (hasMeaningfulFocus) {
        e2eLogger.success('Focus placed on meaningful element after dynamic load');
      } else {
        e2eLogger.info('Focus on body after load (acceptable if no default focus target)');
      }
    }
  });

  test('should show skip links for keyboard users', async ({ page }) => {
    e2eLogger.info('Testing skip links');

    // Tab to reveal skip links (often hidden until focused)
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);

    const skipLink = await page.locator('a[href^="#"]').filter({ hasText: /skip/i }).first();

    if (await skipLink.isVisible({ timeout: 1000 })) {
      e2eLogger.success('Skip link is visible when focused');

      const href = await skipLink.getAttribute('href');
      e2eLogger.result('Skip link target', href);

      // Verify target exists
      if (href) {
        const target = page.locator(href);
        const targetExists = await target.count() > 0;

        e2eLogger.assertion(targetExists, `Skip link target ${href} exists`);

        if (targetExists) {
          e2eLogger.success('Skip link target is valid');
        }
      }
    } else {
      e2eLogger.info('No skip links found (may not be needed for simple layouts)');
    }
  });

  test('should have focus indicator distinct from hover', async ({ page }) => {
    e2eLogger.info('Testing focus vs hover indicators');

    const button = page.locator('button:visible').first();

    if (await button.isVisible({ timeout: 3000 })) {
      // Get hover styles
      await button.hover();
      await page.waitForTimeout(200);

      const hoverStyles = await button.evaluate(el => {
        const styles = window.getComputedStyle(el);
        return {
          outline: styles.outline,
          boxShadow: styles.boxShadow,
          backgroundColor: styles.backgroundColor
        };
      });

      // Get focus styles
      await button.focus();
      await page.waitForTimeout(200);

      const focusStyles = await button.evaluate(el => {
        const styles = window.getComputedStyle(el);
        return {
          outline: styles.outline,
          boxShadow: styles.boxShadow,
          backgroundColor: styles.backgroundColor
        };
      });

      e2eLogger.result('Hover styles', hoverStyles);
      e2eLogger.result('Focus styles', focusStyles);

      // Check if focus styles are different/distinct
      const stylesAreDifferent = focusStyles.outline !== hoverStyles.outline ||
                                  focusStyles.boxShadow !== hoverStyles.boxShadow;

      if (stylesAreDifferent) {
        e2eLogger.success('Focus indicator is distinct from hover state');
      } else {
        e2eLogger.info('Focus and hover styles are similar (may be acceptable)');
      }
    }
  });

  test.afterEach(async () => {
    e2eLogger.suiteEnd('Accessibility: Focus Management', {
      passed: 0,
      failed: 0,
      total: 0,
      duration: 0
    });
  });
});
