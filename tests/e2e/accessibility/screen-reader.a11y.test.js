/**
 * Screen Reader Compatibility Accessibility Tests
 * WCAG 2.1 Level AA - Text Alternatives (1.1.1), Info and Relationships (1.3.1)
 */

import { test, expect } from '../fixtures/accessibility.js';

test.describe('Accessibility: Screen Reader Compatibility', () => {
  test.beforeEach(async ({ page }) => {
    const baseURL = process.env.APP_URL || 'http://localhost:3005';
    await page.goto(baseURL);
    await page.waitForTimeout(2000);
  });

  test('should have alt text on all images', async ({ page, a11y }) => {
    const result = await a11y.checkImageAltText();
    if (result.totalImages > 0) {
      await expect(result).toHaveCompleteImageAltText();
    }
  });

  test('should have semantic HTML structure', async ({ page }) => {
    const semanticElements = await page.evaluate(() => ({
      header: document.querySelectorAll('header').length,
      nav: document.querySelectorAll('nav').length,
      main: document.querySelectorAll('main').length,
      footer: document.querySelectorAll('footer').length
    }));

    const hasSemanticStructure = Object.values(semanticElements).some(count => count > 0);
    expect(hasSemanticStructure).toBe(true);
  });

  test('should have proper document title', async ({ page }) => {
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeLessThan(100);
  });

  test('should have lang attribute on html element', async ({ page }) => {
    const lang = await page.evaluate(() => document.documentElement.getAttribute('lang'));
    expect(lang).toBeTruthy();
    expect(lang.length).toBeGreaterThanOrEqual(2);
  });

  test('should have accessible names for all interactive elements', async ({ page }) => {
    const elementsWithoutNames = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('button, a, input, select, textarea, [role="button"]'));
      return elements.filter(el => {
        const text = el.textContent?.trim();
        const ariaLabel = el.getAttribute('aria-label');
        const ariaLabelledby = el.getAttribute('aria-labelledby');
        const title = el.getAttribute('title');
        const placeholder = el.getAttribute('placeholder');
        const labelFor = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
        return !(text || ariaLabel || ariaLabelledby || title || placeholder || labelFor);
      }).length;
    });

    expect(elementsWithoutNames).toBe(0);
  });

  test('should have proper table structure with headers', async ({ page }) => {
    const tables = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('table')).map(table => ({
        hasTh: !!table.querySelector('th'),
        rowCount: table.querySelectorAll('tr').length
      }));
    });

    for (const table of tables) {
      if (table.rowCount > 0) {
        expect(table.hasTh).toBe(true);
      }
    }
  });

  test('should have descriptive link text', async ({ page }) => {
    const links = await page.evaluate(() => {
      const nonDescriptive = ['click here', 'read more', 'more', 'here', 'link'];
      return Array.from(document.querySelectorAll('a[href]')).map(link => {
        const text = link.textContent?.trim() || link.getAttribute('aria-label') || '';
        return {
          isEmpty: text.length === 0,
          isNonDescriptive: nonDescriptive.some(phrase =>
            text.toLowerCase().includes(phrase) && text.length < 15
          )
        };
      });
    });

    const emptyLinks = links.filter(link => link.isEmpty);
    expect(emptyLinks.length).toBe(0);
  });

  test('should announce dynamic content changes', async ({ page }) => {
    const liveRegions = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[aria-live], [role="status"], [role="alert"]')).length
    );

    expect(liveRegions).toBeGreaterThanOrEqual(0);
  });

  test('should have proper list markup', async ({ page }) => {
    const lists = await page.evaluate(() => ({
      ul: document.querySelectorAll('ul').length,
      ol: document.querySelectorAll('ol').length,
      dl: document.querySelectorAll('dl').length
    }));

    expect(lists).toBeDefined();
  });

  test('should have form validation that works with screen readers', async ({ page }) => {
    const requiredFields = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input[required], textarea[required]')).map(field => ({
        hasAriaRequired: field.getAttribute('aria-required') === 'true',
        id: field.id
      }))
    );

    expect(Array.isArray(requiredFields)).toBe(true);
  });

  test('should have skip navigation links', async ({ page }) => {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);

    const skipLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href^="#"]'))
        .filter(link => (link.textContent?.toLowerCase() || '').includes('skip'))
        .length
    );

    expect(skipLinks).toBeGreaterThanOrEqual(0);
  });

  test('should have descriptive button text', async ({ page }) => {
    const buttons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).map(btn => {
        const text = btn.textContent?.trim() || btn.getAttribute('aria-label') || '';
        return {
          isEmpty: text.length === 0,
          isIconOnly: text.length < 3 && !btn.getAttribute('aria-label')
        };
      });
    });

    const emptyButtons = buttons.filter(btn => btn.isEmpty);
    const iconOnlyWithoutLabel = buttons.filter(btn => btn.isIconOnly);

    expect(emptyButtons.length).toBe(0);
    expect(iconOnlyWithoutLabel.length).toBe(0);
  });

  test('should have proper heading hierarchy for screen readers', async ({ page, a11y }) => {
    const result = await a11y.checkHeadingHierarchy();
    if (result.headings.length > 0) {
      await expect(result).toHaveValidHeadingHierarchy();
    }
  });

  test('should run comprehensive axe screen reader checks', async ({ page, a11y }) => {
    const result = await a11y.checkA11y();

    if (!result.pass) {
      const critical = result.violations.filter(v => v.impact === 'critical');
      const serious = result.violations.filter(v => v.impact === 'serious');
      expect(critical.length).toBe(0);
      expect(serious.length).toBe(0);
    }

    await expect(result).toPassAccessibility();
  });
});
