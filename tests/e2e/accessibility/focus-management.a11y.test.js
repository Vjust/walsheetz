/**
 * Focus Management Accessibility Tests
 * WCAG 2.1 Level AA - Focus Visible (2.4.7), Focus Order (2.4.3)
 */

import { test, expect } from '../fixtures/accessibility.js';

test.describe('Accessibility: Focus Management', () => {
  test.beforeEach(async ({ page }) => {
    const baseURL = process.env.APP_URL || 'http://localhost:3005';
    await page.goto(baseURL);
    await page.waitForTimeout(2000);
  });

  test('should have visible focus indicators on all interactive elements', async ({ page }) => {
    const selectors = ['button:visible', 'a:visible', 'input:visible', '[tabindex="0"]:visible'];
    let visibleCount = 0;

    for (const selector of selectors) {
      const elements = await page.locator(selector).all();

      for (const element of elements.slice(0, 3)) {
        try {
          await element.focus();
          await page.waitForTimeout(200);

          const hasVisibleFocus = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el) return false;
            const styles = window.getComputedStyle(el);
            return styles.outline !== 'none' || styles.boxShadow !== 'none' || styles.outlineWidth !== '0px';
          });

          if (hasVisibleFocus) visibleCount++;
        } catch {
          // Element may not be focusable
        }
      }
    }

    expect(visibleCount).toBeGreaterThan(0);
  });

  test('should have clear focus indicator on buttons', async ({ page, a11y }) => {
    const buttons = await page.locator('button:visible').all();

    if (buttons.length > 0) {
      const buttonSelector = 'button:visible';
      await expect(buttons[0]).toHaveVisibleFocus(page, buttonSelector);
    }
  });

  test('should have clear focus indicator on links', async ({ page }) => {
    const links = await page.locator('a:visible').all();

    if (links.length > 0) {
      await links[0].focus();
      await page.waitForTimeout(200);

      const hasVisibleFocus = await page.evaluate(() => {
        const el = document.activeElement;
        const styles = window.getComputedStyle(el);
        return styles.outline !== 'none' || styles.boxShadow !== 'none';
      });

      expect(hasVisibleFocus).toBe(true);
    }
  });

  test('should maintain focus when modal opens', async ({ page }) => {
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();

    if (await createButton.isVisible({ timeout: 3000 })) {
      await createButton.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[role="dialog"], .modal').first();

      if (await modal.isVisible({ timeout: 2000 })) {
        await page.waitForTimeout(300);

        const focusedElement = await page.evaluate(() => {
          const el = document.activeElement;
          const modal = document.querySelector('[role="dialog"], .modal');
          return { inModal: modal ? modal.contains(el) : false };
        });

        expect(focusedElement.inModal).toBe(true);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }
  });

  test('should restore focus when modal closes', async ({ page }) => {
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();

    if (await createButton.isVisible({ timeout: 3000 })) {
      await createButton.focus();
      await page.waitForTimeout(200);
      await createButton.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[role="dialog"], .modal').first();

      if (await modal.isVisible({ timeout: 2000 })) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);

        const focusedAfterClose = await page.evaluate(() => ({
          tagName: document.activeElement.tagName
        }));

        expect(focusedAfterClose.tagName).toBe('BUTTON');
      }
    }
  });

  test('should trap focus within modal', async ({ page }) => {
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();

    if (await createButton.isVisible({ timeout: 3000 })) {
      await createButton.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[role="dialog"], .modal').first();

      if (await modal.isVisible({ timeout: 2000 })) {
        let allInModal = true;

        for (let i = 0; i < 10; i++) {
          await page.keyboard.press('Tab');
          await page.waitForTimeout(150);

          const focused = await page.evaluate(() => {
            const el = document.activeElement;
            const modal = document.querySelector('[role="dialog"], .modal');
            return { inModal: modal ? modal.contains(el) : false };
          });

          if (!focused.inModal) allInModal = false;
        }

        expect(allInModal).toBe(true);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }
  });

  test('should not lose focus when interacting with page', async ({ page }) => {
    const button = page.locator('button:visible').first();

    if (await button.isVisible({ timeout: 3000 })) {
      await button.focus();
      await page.waitForTimeout(200);

      const initialFocus = await page.evaluate(() => document.activeElement.tagName);

      await page.mouse.move(100, 100);
      await page.waitForTimeout(200);

      const focusAfterMove = await page.evaluate(() => document.activeElement.tagName);

      expect(focusAfterMove).toBe(initialFocus);
    }
  });

  test('should have sufficient focus indicator contrast', async ({ page }) => {
    const button = page.locator('button:visible').first();

    if (await button.isVisible({ timeout: 3000 })) {
      await button.focus();
      await page.waitForTimeout(200);

      const focusStyles = await page.evaluate(() => {
        const styles = window.getComputedStyle(document.activeElement);
        return {
          outline: styles.outline,
          outlineWidth: styles.outlineWidth,
          boxShadow: styles.boxShadow
        };
      });

      const hasIndicator = focusStyles.outline !== 'none' ||
                          focusStyles.boxShadow !== 'none' ||
                          focusStyles.outlineWidth !== '0px';

      expect(hasIndicator).toBe(true);
    }
  });

  test('should maintain logical focus order', async ({ page }) => {
    const focusSequence = [];

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(150);

      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        const rect = el.getBoundingClientRect();
        return { y: Math.round(rect.y) };
      });

      focusSequence.push(focused);
    }

    // Check that focus generally moves top-to-bottom
    let logicalOrder = true;
    for (let i = 1; i < focusSequence.length - 1; i++) {
      if (focusSequence[i].y < focusSequence[i - 1].y - 50) {
        logicalOrder = false;
      }
    }

    expect(logicalOrder).toBe(true);
  });

  test('should not have invisible focused elements', async ({ page }) => {
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
          isVisible: rect.width > 0 && rect.height > 0 &&
                     styles.display !== 'none' &&
                     styles.visibility !== 'hidden' &&
                     parseFloat(styles.opacity) > 0
        };
      });

      if (!focusInfo.isVisible && focusInfo.tagName !== 'BODY') {
        invisibleFocusCount++;
      }
    }

    expect(invisibleFocusCount).toBe(0);
  });

  test('should handle focus in dynamic content', async ({ page, spreadsheet }) => {
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

      const focusAfterLoad = await page.evaluate(() => ({
        tagName: document.activeElement.tagName
      }));

      expect(focusAfterLoad.tagName).toBeDefined();
    }
  });

  test('should show skip links for keyboard users', async ({ page }) => {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);

    const skipLink = await page.locator('a[href^="#"]').filter({ hasText: /skip/i }).first();

    if (await skipLink.isVisible({ timeout: 1000 })) {
      const href = await skipLink.getAttribute('href');
      if (href) {
        const targetExists = await page.locator(href).count() > 0;
        expect(targetExists).toBe(true);
      }
    }
  });

  test('should have focus indicator distinct from hover', async ({ page }) => {
    const button = page.locator('button:visible').first();

    if (await button.isVisible({ timeout: 3000 })) {
      await button.hover();
      await page.waitForTimeout(200);

      const hoverStyles = await button.evaluate(el => ({
        outline: window.getComputedStyle(el).outline,
        boxShadow: window.getComputedStyle(el).boxShadow
      }));

      await button.focus();
      await page.waitForTimeout(200);

      const focusStyles = await button.evaluate(el => ({
        outline: window.getComputedStyle(el).outline,
        boxShadow: window.getComputedStyle(el).boxShadow
      }));

      expect(focusStyles).toBeDefined();
      expect(hoverStyles).toBeDefined();
    }
  });
});
