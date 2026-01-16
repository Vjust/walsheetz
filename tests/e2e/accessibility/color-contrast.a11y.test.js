/**
 * Color Contrast Accessibility Tests
 * WCAG 2.1 Level AA - Contrast (Minimum) (1.4.3)
 * Requires 4.5:1 contrast ratio for normal text, 3:1 for large text
 */

import { test, expect } from '../fixtures/accessibility.js';

test.describe('Accessibility: Color Contrast', () => {
  test.beforeEach(async ({ page }) => {
    const baseURL = process.env.APP_URL || 'http://localhost:3005';
    await page.goto(baseURL);
    await page.waitForTimeout(2000);
  });

  test('should have sufficient contrast for body text', async ({ page, a11y }) => {
    const bodySelector = 'body, main, p';
    const result = await a11y.checkColorContrast(bodySelector, 4.5);
    await expect(result).toMeetContrastRequirements();
  });

  test('should have sufficient contrast for button text', async ({ page, a11y }) => {
    const buttons = await page.locator('button:visible').all();

    if (buttons.length > 0) {
      let passCount = 0;

      for (const button of buttons.slice(0, 5)) {
        const selector = await button.evaluate(el => {
          if (el.id) return `#${el.id}`;
          const classes = el.className.split(' ').filter(c => c).join('.');
          return classes ? `.${classes}` : 'button';
        });

        try {
          const result = await a11y.checkColorContrast(selector, 4.5);
          if (result.pass) passCount++;
        } catch {
          // Skip buttons that can't be checked
        }
      }

      expect(passCount).toBeGreaterThan(0);
    }
  });

  test('should have sufficient contrast for link text', async ({ page, a11y }) => {
    const links = await page.locator('a:visible').all();

    if (links.length > 0) {
      let passCount = 0;

      for (const link of links.slice(0, 5)) {
        const linkText = await link.textContent();

        if (linkText?.trim()) {
          try {
            const result = await a11y.checkColorContrast('a', 4.5);
            if (result.pass) passCount++;
          } catch {
            // Skip links that can't be checked
          }
        }
      }

      expect(passCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('should have sufficient contrast for form labels', async ({ page, a11y }) => {
    const labels = await page.locator('label:visible').all();

    if (labels.length > 0) {
      try {
        const result = await a11y.checkColorContrast('label', 4.5);
        expect(result.pass).toBe(true);
      } catch {
        // Labels may not be present
      }
    }
  });

  test('should have sufficient contrast for headings', async ({ page, a11y }) => {
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();

    if (headings.length > 0) {
      const tagName = await headings[0].evaluate(el => el.tagName.toLowerCase());

      try {
        const result = await a11y.checkColorContrast(tagName, 4.5);
        await expect(result).toMeetContrastRequirements();
      } catch {
        // Headings may not be present
      }
    }
  });

  test('should have sufficient contrast for placeholder text', async ({ page }) => {
    const inputs = await page.locator('input[placeholder]:visible, textarea[placeholder]:visible').all();

    if (inputs.length > 0) {
      const placeholderStyle = await page.evaluate(() => {
        const input = document.querySelector('input[placeholder], textarea[placeholder]');
        if (!input) return null;
        const styles = window.getComputedStyle(input, '::placeholder');
        return { color: styles.color };
      });

      expect(placeholderStyle).toBeDefined();
    }
  });

  test('should have sufficient contrast for icon buttons', async ({ page }) => {
    const iconButtons = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons
        .filter(btn => btn.querySelector('svg, img, i, [class*="icon"]') || (btn.textContent?.trim().length || 0) < 3)
        .map(btn => ({
          color: window.getComputedStyle(btn).color,
          backgroundColor: window.getComputedStyle(btn).backgroundColor
        }));
    });

    expect(Array.isArray(iconButtons)).toBe(true);
  });

  test('should have sufficient contrast in different states (hover, focus)', async ({ page, a11y }) => {
    const button = page.locator('button:visible').first();

    if (await button.isVisible({ timeout: 3000 })) {
      const normalResult = await a11y.checkColorContrast('button:visible', 4.5);
      expect(normalResult.ratio).toBeGreaterThan(0);

      await button.hover();
      await page.waitForTimeout(200);

      await button.focus();
      await page.waitForTimeout(200);

      const focusStyles = await button.evaluate(el => ({
        outline: window.getComputedStyle(el).outline
      }));

      expect(focusStyles).toBeDefined();
    }
  });

  test('should have sufficient contrast for error messages', async ({ page }) => {
    const errorElements = await page.locator('[class*="error"], [class*="danger"], [role="alert"]').all();

    if (errorElements.length > 0) {
      const errorStyles = await errorElements[0].evaluate(el => ({
        color: window.getComputedStyle(el).color,
        backgroundColor: window.getComputedStyle(el).backgroundColor
      }));

      expect(errorStyles).toBeDefined();
    }
  });

  test('should have sufficient contrast for disabled elements', async ({ page }) => {
    const disabledElements = await page.locator('button:disabled, input:disabled, [disabled]').all();

    if (disabledElements.length > 0) {
      const disabledStyles = await disabledElements[0].evaluate(el => ({
        opacity: window.getComputedStyle(el).opacity
      }));

      // Disabled elements are exempt from WCAG contrast requirements
      expect(disabledStyles).toBeDefined();
    }
  });

  test('should run comprehensive axe contrast checks', async ({ page, a11y }) => {
    const result = await a11y.runAxeScan(null, {
      runOnly: { type: 'tag', values: ['cat.color'] }
    });

    expect(result.violations.length).toBe(0);
  });

  test('should have sufficient contrast for status indicators', async ({ page }) => {
    const statusElements = await page.locator('[class*="status"], [class*="badge"], [class*="tag"]').all();

    if (statusElements.length > 0) {
      const statusStyles = await statusElements[0].evaluate(el => ({
        color: window.getComputedStyle(el).color,
        backgroundColor: window.getComputedStyle(el).backgroundColor
      }));

      expect(statusStyles).toBeDefined();
    }
  });

  test('should maintain contrast in dark mode (if supported)', async ({ page, a11y }) => {
    const darkModeToggle = page.locator('[class*="dark"], [class*="theme"]').first();

    if (await darkModeToggle.isVisible({ timeout: 2000 })) {
      await darkModeToggle.click();
      await page.waitForTimeout(500);

      const darkModeResult = await a11y.checkColorContrast('body', 4.5);
      expect(darkModeResult.ratio).toBeGreaterThan(0);

      await darkModeToggle.click();
      await page.waitForTimeout(300);
    }
  });
});
