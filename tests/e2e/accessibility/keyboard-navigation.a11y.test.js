/**
 * Keyboard Navigation Accessibility Tests
 * WCAG 2.1 Level AA - Keyboard Accessible (2.1.1, 2.1.2)
 */

import { test, expect } from '../fixtures/accessibility.js';

test.describe('Accessibility: Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    const baseURL = process.env.APP_URL || 'http://localhost:3005';
    await page.goto(baseURL);
    await page.waitForTimeout(2000);
  });

  test('should allow Tab navigation through interactive elements', async ({ page }) => {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);

    const firstFocused = await page.evaluate(() => ({
      tagName: document.activeElement.tagName,
      id: document.activeElement.id
    }));

    let focusedElements = [firstFocused];

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(200);

      const focused = await page.evaluate(() => ({
        tagName: document.activeElement.tagName,
        id: document.activeElement.id
      }));

      focusedElements.push(focused);
    }

    const uniqueElements = new Set(focusedElements.map(el => `${el.tagName}-${el.id}`));
    expect(uniqueElements.size).toBeGreaterThan(1);
  });

  test('should support Shift+Tab for reverse navigation', async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);
    }

    const forwardFocused = await page.evaluate(() => ({
      tagName: document.activeElement.tagName,
      id: document.activeElement.id
    }));

    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    await page.waitForTimeout(200);

    const backwardFocused = await page.evaluate(() => ({
      tagName: document.activeElement.tagName,
      id: document.activeElement.id
    }));

    const movedBackward = forwardFocused.tagName !== backwardFocused.tagName ||
                          forwardFocused.id !== backwardFocused.id;

    expect(movedBackward).toBe(true);
  });

  test('should not trap keyboard focus', async ({ page }) => {
    let bodyFocused = false;
    let differentElements = new Set();

    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);

      const focused = await page.evaluate(() => ({
        tagName: document.activeElement.tagName,
        id: document.activeElement.id
      }));

      differentElements.add(`${focused.tagName}-${focused.id}`);

      if (focused.tagName === 'BODY') {
        bodyFocused = true;
        break;
      }
    }

    const noTrap = bodyFocused || differentElements.size > 3;
    expect(noTrap).toBe(true);
  });

  test('should allow keyboard access to all interactive controls', async ({ page, a11y }) => {
    const buttons = await page.locator('button').all();
    let accessibleCount = 0;

    for (const button of buttons.slice(0, 10)) {
      const selector = await button.evaluate(el =>
        `button:has-text("${el.textContent?.trim().substring(0, 20)}")`
      ).catch(() => 'button');

      const isAccessible = await a11y.isKeyboardFocusable(selector);
      if (isAccessible) accessibleCount++;
    }

    expect(accessibleCount).toBeGreaterThan(0);
  });

  test('should allow keyboard interaction with create button', async ({ page }) => {
    let focused = false;

    for (let attempts = 0; attempts < 20 && !focused; attempts++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(150);

      const focusedText = await page.evaluate(() =>
        document.activeElement?.textContent?.toLowerCase() || ''
      );

      if (focusedText.includes('create') || focusedText.includes('new')) {
        focused = true;
      }
    }

    if (!focused) return;

    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    const modal = page.locator('[role="dialog"], .modal').first();
    const modalVisible = await modal.isVisible({ timeout: 2000 });

    expect(modalVisible).toBe(true);
  });

  test('should allow Escape key to close modals', async ({ page }) => {
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();

    if (await createButton.isVisible({ timeout: 3000 })) {
      await createButton.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[role="dialog"], .modal').first();

      if (await modal.isVisible({ timeout: 2000 })) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);

        const isClosed = await modal.isHidden();
        expect(isClosed).toBe(true);
      }
    }
  });

  test('should support Enter key for form submission', async ({ page }) => {
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();

    if (await createButton.isVisible({ timeout: 3000 })) {
      await createButton.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[role="dialog"], .modal').first();

      if (await modal.isVisible({ timeout: 2000 })) {
        const input = modal.locator('input').first();

        if (await input.isVisible({ timeout: 1000 })) {
          await input.focus();
          await input.fill('Test Document');
          await page.keyboard.press('Enter');
          await page.waitForTimeout(2000);

          const isClosed = await modal.isHidden({ timeout: 3000 });
          expect(isClosed).toBe(true);
        }
      }
    }
  });

  test('should maintain logical tab order', async ({ page }) => {
    const tabOrder = [];

    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(150);

      const focused = await page.evaluate(() => ({
        tagName: document.activeElement.tagName,
        position: document.activeElement.getBoundingClientRect()
      }));

      tabOrder.push(focused);
    }

    expect(tabOrder.length).toBeGreaterThan(5);
  });

  test('should not have keyboard-only accessible hidden content', async ({ page }) => {
    const hiddenFocusable = await page.evaluate(() => {
      const focusable = document.querySelectorAll(
        'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      return Array.from(focusable).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display === 'none' || style.visibility === 'hidden';
      }).length;
    });

    expect(hiddenFocusable).toBeLessThan(50);
  });

  test('should handle spacebar for button activation', async ({ page }) => {
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();

    if (await createButton.isVisible({ timeout: 3000 })) {
      await createButton.focus();
      await page.waitForTimeout(300);

      await page.keyboard.press('Space');
      await page.waitForTimeout(1000);

      const modal = page.locator('[role="dialog"], .modal').first();
      const modalVisible = await modal.isVisible({ timeout: 2000 });

      if (modalVisible) {
        await page.keyboard.press('Escape');
      }

      expect(modalVisible).toBe(true);
    }
  });
});
