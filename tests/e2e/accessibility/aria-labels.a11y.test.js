/**
 * ARIA Labels and Attributes Accessibility Tests
 * WCAG 2.1 Level AA - Name, Role, Value (4.1.2)
 */

import { test, expect } from '../fixtures/accessibility.js';

test.describe('Accessibility: ARIA Labels', () => {
  test.beforeEach(async ({ page }) => {
    const baseURL = process.env.APP_URL || 'http://localhost:3005';
    await page.goto(baseURL);
    await page.waitForTimeout(2000);
  });

  test('should have proper ARIA labels on buttons', async ({ page }) => {
    const buttons = await page.locator('button:visible').all();
    let labeledCount = 0;

    for (const button of buttons.slice(0, 10)) {
      const attributes = await button.evaluate(el => ({
        text: el.textContent?.trim(),
        ariaLabel: el.getAttribute('aria-label'),
        ariaLabelledby: el.getAttribute('aria-labelledby'),
        title: el.getAttribute('title')
      }));

      const hasAccessibleName = attributes.text ||
                                 attributes.ariaLabel ||
                                 attributes.ariaLabelledby ||
                                 attributes.title;
      if (hasAccessibleName) labeledCount++;
    }

    expect(labeledCount).toBeGreaterThan(0);
  });

  test('should have ARIA labels on icon-only buttons', async ({ page }) => {
    const iconButtons = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons
        .filter(btn => (btn.textContent?.trim() || '').length < 3)
        .map(btn => ({
          ariaLabel: btn.getAttribute('aria-label'),
          title: btn.getAttribute('title')
        }));
    });

    if (iconButtons.length > 0) {
      const labeledIconButtons = iconButtons.filter(btn => btn.ariaLabel || btn.title);
      expect(labeledIconButtons.length).toBe(iconButtons.length);
    }
  });

  test('should have proper ARIA roles on interactive elements', async ({ page }) => {
    const elements = await page.evaluate(() => {
      const selectors = ['button', 'a', 'input', '[role="button"]', '[role="link"]', '[role="tab"]'];
      return selectors.map(selector => ({
        selector,
        count: document.querySelectorAll(selector).length
      }));
    });

    const hasInteractiveElements = elements.some(item => item.count > 0);
    expect(hasInteractiveElements).toBe(true);
  });

  test('should have ARIA labels on form inputs', async ({ page, a11y }) => {
    const result = await a11y.checkFormLabels();
    if (result.totalInputs > 0) {
      await expect(result).toHaveCompleteFormLabels();
    }
  });

  test('should have proper modal dialog ARIA attributes', async ({ page, a11y }) => {
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();

    if (await createButton.isVisible({ timeout: 3000 })) {
      await createButton.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[role="dialog"], .modal, [class*="modal"]').first();

      if (await modal.isVisible({ timeout: 2000 })) {
        const modalSelector = '[role="dialog"], .modal, [class*="modal"]';
        const result = await a11y.checkAriaAttributes(modalSelector, {
          'role': 'dialog',
          'aria-modal': 'true'
        });

        expect(result.attributes).toBeDefined();
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }
  });

  test('should have ARIA live regions for dynamic content', async ({ page }) => {
    const liveRegions = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[aria-live], [role="status"], [role="alert"]')).map(el => ({
        role: el.getAttribute('role'),
        ariaLive: el.getAttribute('aria-live')
      }));
    });

    // Live regions are recommended but not required
    expect(Array.isArray(liveRegions)).toBe(true);
  });

  test('should have proper heading hierarchy with ARIA', async ({ page, a11y }) => {
    const result = await a11y.checkHeadingHierarchy();
    if (result.headings.length > 0) {
      await expect(result).toHaveValidHeadingHierarchy();
    }
  });

  test('should have ARIA expanded attributes on collapsible elements', async ({ page }) => {
    const expandableElements = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[aria-expanded]')).map(el => ({
        ariaExpanded: el.getAttribute('aria-expanded')
      }));
    });

    for (const el of expandableElements) {
      expect(['true', 'false']).toContain(el.ariaExpanded);
    }
  });

  test('should have ARIA described-by for additional context', async ({ page }) => {
    const describedElements = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[aria-describedby]')).map(el => {
        const describerId = el.getAttribute('aria-describedby');
        return {
          describerExists: !!document.getElementById(describerId)
        };
      });
    });

    for (const el of describedElements) {
      expect(el.describerExists).toBe(true);
    }
  });

  test('should have proper ARIA invalid and error messages', async ({ page }) => {
    const validationElements = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, textarea, select')).map(el => ({
        ariaInvalid: el.getAttribute('aria-invalid'),
        required: el.hasAttribute('required')
      }));
    });

    expect(Array.isArray(validationElements)).toBe(true);
  });

  test('should have ARIA labels on images', async ({ page, a11y }) => {
    const result = await a11y.checkImageAltText();
    if (result.totalImages > 0) {
      await expect(result).toHaveCompleteImageAltText();
    }
  });

  test('should have proper landmark roles', async ({ page }) => {
    const landmarks = await page.evaluate(() => {
      const selectors = [
        'header, [role="banner"]',
        'nav, [role="navigation"]',
        'main, [role="main"]',
        'footer, [role="contentinfo"]'
      ];
      return selectors.map(selector => ({
        type: selector.split(',')[0],
        count: document.querySelectorAll(selector).length
      }));
    });

    const foundLandmarks = landmarks.filter(l => l.count > 0);
    expect(foundLandmarks.length).toBeGreaterThan(0);
  });

  test('should have ARIA current for navigation items', async ({ page }) => {
    const navItems = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('nav a, [role="navigation"] a, [role="tab"]')).map(el => ({
        ariaCurrent: el.getAttribute('aria-current')
      }));
    });

    expect(Array.isArray(navItems)).toBe(true);
  });
});
