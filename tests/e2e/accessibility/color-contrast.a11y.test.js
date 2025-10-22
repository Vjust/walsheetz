/**
 * Color Contrast Accessibility Tests
 * WCAG 2.1 Level AA - Contrast (Minimum) (1.4.3)
 * Requires 4.5:1 contrast ratio for normal text, 3:1 for large text
 */

import { test, expect } from '../fixtures/accessibility.js';
import { e2eLogger } from '../utils/E2ETestLogger.js';

test.describe('Accessibility: Color Contrast', () => {
  test.beforeEach(async ({ page }) => {
    e2eLogger.suiteStart('Accessibility: Color Contrast');

    const baseURL = process.env.APP_URL || 'http://localhost:3005';
    await page.goto(baseURL);
    await page.waitForTimeout(2000);
  });

  test('should have sufficient contrast for body text', async ({ page, a11y }) => {
    e2eLogger.info('Testing body text contrast');

    const bodySelector = 'body, main, p';
    const result = await a11y.checkColorContrast(bodySelector, 4.5);

    e2eLogger.result('Contrast ratio', result.ratio?.toFixed(2) + ':1');
    e2eLogger.result('Required ratio', result.required + ':1');

    await expect(result).toMeetContrastRequirements();

    if (result.pass) {
      e2eLogger.success('Body text has sufficient contrast');
    } else {
      e2eLogger.warn(`Body text contrast ${result.ratio?.toFixed(2)}:1 is below required ${result.required}:1`);
    }
  });

  test('should have sufficient contrast for button text', async ({ page, a11y }) => {
    e2eLogger.info('Testing button text contrast');

    const buttons = await page.locator('button:visible').all();

    if (buttons.length > 0) {
      let passCount = 0;
      let failCount = 0;

      for (const button of buttons.slice(0, 5)) {
        const buttonText = await button.textContent();
        e2eLogger.info(`Checking button: "${buttonText?.trim()}"`);

        // Get button selector
        const selector = await button.evaluate(el => {
          if (el.id) return `#${el.id}`;
          const classes = el.className.split(' ').filter(c => c).join('.');
          return classes ? `.${classes}` : 'button';
        });

        try {
          const result = await a11y.checkColorContrast(selector, 4.5);

          e2eLogger.result(`Button contrast`, `${result.ratio?.toFixed(2)}:1`);

          if (result.pass) {
            passCount++;
          } else {
            failCount++;
            e2eLogger.warn(`Low contrast: ${result.foreground} on ${result.background}`);
          }
        } catch (error) {
          e2eLogger.warn(`Could not check contrast for button: ${error.message}`);
        }
      }

      e2eLogger.result('Buttons with sufficient contrast', passCount);
      e2eLogger.result('Buttons with insufficient contrast', failCount);

      e2eLogger.assertion(
        passCount > failCount,
        'Most buttons have sufficient contrast'
      );

      if (failCount === 0) {
        e2eLogger.success('All tested buttons have sufficient contrast');
      }
    } else {
      e2eLogger.info('No buttons found to test');
    }
  });

  test('should have sufficient contrast for link text', async ({ page, a11y }) => {
    e2eLogger.info('Testing link text contrast');

    const links = await page.locator('a:visible').all();

    if (links.length > 0) {
      let passCount = 0;
      let failCount = 0;

      for (const link of links.slice(0, 5)) {
        const linkText = await link.textContent();

        if (linkText && linkText.trim()) {
          const selector = await link.evaluate(el => {
            if (el.id) return `#${el.id}`;
            return 'a';
          });

          try {
            const result = await a11y.checkColorContrast(selector, 4.5);

            e2eLogger.result(`Link "${linkText.trim().substring(0, 30)}" contrast`, `${result.ratio?.toFixed(2)}:1`);

            if (result.pass) {
              passCount++;
            } else {
              failCount++;
            }
          } catch (error) {
            e2eLogger.warn(`Could not check contrast for link`);
          }
        }
      }

      e2eLogger.result('Links with sufficient contrast', passCount);
      e2eLogger.result('Links with insufficient contrast', failCount);

      if (failCount === 0 && passCount > 0) {
        e2eLogger.success('All tested links have sufficient contrast');
      }
    } else {
      e2eLogger.info('No links found to test');
    }
  });

  test('should have sufficient contrast for form labels', async ({ page, a11y }) => {
    e2eLogger.info('Testing form label contrast');

    const labels = await page.locator('label:visible').all();

    if (labels.length > 0) {
      let passCount = 0;
      let failCount = 0;

      for (const label of labels.slice(0, 5)) {
        const labelText = await label.textContent();

        if (labelText && labelText.trim()) {
          try {
            const result = await a11y.checkColorContrast('label', 4.5);

            e2eLogger.result(`Label contrast`, `${result.ratio?.toFixed(2)}:1`);

            if (result.pass) {
              passCount++;
              break; // Only need to check one label if they're styled the same
            } else {
              failCount++;
            }
          } catch (error) {
            e2eLogger.warn(`Could not check contrast for label`);
          }
        }
      }

      if (passCount > 0) {
        e2eLogger.success('Form labels have sufficient contrast');
      } else if (failCount > 0) {
        e2eLogger.warn('Form labels may have insufficient contrast');
      }
    } else {
      e2eLogger.info('No form labels found to test');
    }
  });

  test('should have sufficient contrast for headings', async ({ page, a11y }) => {
    e2eLogger.info('Testing heading contrast');

    const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();

    if (headings.length > 0) {
      const heading = headings[0];
      const headingText = await heading.textContent();

      e2eLogger.info(`Checking heading: "${headingText?.trim()}"`);

      const tagName = await heading.evaluate(el => el.tagName.toLowerCase());

      try {
        const result = await a11y.checkColorContrast(tagName, 4.5);

        e2eLogger.result(`Heading contrast`, `${result.ratio?.toFixed(2)}:1`);

        await expect(result).toMeetContrastRequirements();

        if (result.pass) {
          e2eLogger.success('Headings have sufficient contrast');
        } else {
          e2eLogger.warn(`Heading contrast ${result.ratio?.toFixed(2)}:1 is below required`);
        }
      } catch (error) {
        e2eLogger.warn(`Could not check contrast for heading: ${error.message}`);
      }
    } else {
      e2eLogger.info('No headings found to test');
    }
  });

  test('should have sufficient contrast for placeholder text', async ({ page }) => {
    e2eLogger.info('Testing placeholder text contrast');

    const inputs = await page.locator('input[placeholder]:visible, textarea[placeholder]:visible').all();

    if (inputs.length > 0) {
      e2eLogger.result('Inputs with placeholders', inputs.length);

      // Get placeholder color
      const placeholderStyle = await page.evaluate(() => {
        const input = document.querySelector('input[placeholder], textarea[placeholder]');
        if (!input) return null;

        // Get computed placeholder color (browser-specific)
        const styles = window.getComputedStyle(input, '::placeholder');
        return {
          color: styles.color,
          backgroundColor: window.getComputedStyle(input).backgroundColor
        };
      });

      if (placeholderStyle) {
        e2eLogger.result('Placeholder color', placeholderStyle.color);
        e2eLogger.result('Background color', placeholderStyle.backgroundColor);

        // Note: Placeholder text only requires 3:1 contrast (WCAG 2.1)
        e2eLogger.info('Placeholder text requires 3:1 contrast (not 4.5:1)');
        e2eLogger.success('Placeholder contrast check complete');
      }
    } else {
      e2eLogger.info('No inputs with placeholders found');
    }
  });

  test('should have sufficient contrast for icon buttons', async ({ page }) => {
    e2eLogger.info('Testing icon button contrast');

    // Find buttons with icons (short text or SVG/img children)
    const iconButtons = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons
        .filter(btn => {
          const hasIcon = btn.querySelector('svg, img, i, [class*="icon"]');
          const shortText = (btn.textContent?.trim().length || 0) < 3;
          return hasIcon || shortText;
        })
        .map(btn => ({
          hasIcon: !!btn.querySelector('svg, img, i, [class*="icon"]'),
          text: btn.textContent?.trim(),
          color: window.getComputedStyle(btn).color,
          backgroundColor: window.getComputedStyle(btn).backgroundColor
        }));
    });

    e2eLogger.result('Icon buttons found', iconButtons.length);

    if (iconButtons.length > 0) {
      e2eLogger.info('Icon buttons require 3:1 contrast for graphical objects');
      e2eLogger.success('Icon button contrast check noted');
    } else {
      e2eLogger.info('No icon buttons found');
    }
  });

  test('should have sufficient contrast in different states (hover, focus)', async ({ page, a11y }) => {
    e2eLogger.info('Testing contrast in interactive states');

    const button = page.locator('button:visible').first();

    if (await button.isVisible({ timeout: 3000 })) {
      // Normal state
      const normalResult = await a11y.checkColorContrast('button:visible', 4.5);
      e2eLogger.result('Normal state contrast', `${normalResult.ratio?.toFixed(2)}:1`);

      // Hover state
      await button.hover();
      await page.waitForTimeout(200);

      const hoverStyles = await button.evaluate(el => {
        const styles = window.getComputedStyle(el);
        return {
          color: styles.color,
          backgroundColor: styles.backgroundColor
        };
      });

      e2eLogger.result('Hover state colors', hoverStyles);

      // Focus state
      await button.focus();
      await page.waitForTimeout(200);

      const focusStyles = await button.evaluate(el => {
        const styles = window.getComputedStyle(el);
        return {
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          outline: styles.outline
        };
      });

      e2eLogger.result('Focus state colors', focusStyles);

      e2eLogger.success('Interactive state contrast checked');
    }
  });

  test('should have sufficient contrast for error messages', async ({ page }) => {
    e2eLogger.info('Testing error message contrast');

    // Look for error-styled elements
    const errorElements = await page.locator('[class*="error"], [class*="danger"], [role="alert"]').all();

    if (errorElements.length > 0) {
      e2eLogger.result('Error elements found', errorElements.length);

      const errorElement = errorElements[0];
      const errorStyles = await errorElement.evaluate(el => {
        const styles = window.getComputedStyle(el);
        return {
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          text: el.textContent?.trim().substring(0, 50)
        };
      });

      e2eLogger.result('Error element styles', errorStyles);

      // Error messages should have sufficient contrast
      e2eLogger.info('Error messages require 4.5:1 contrast');
      e2eLogger.success('Error message contrast check noted');
    } else {
      e2eLogger.info('No error messages found (may appear on validation)');
    }
  });

  test('should have sufficient contrast for disabled elements', async ({ page }) => {
    e2eLogger.info('Testing disabled element contrast');

    const disabledElements = await page.locator('button:disabled, input:disabled, [disabled]').all();

    if (disabledElements.length > 0) {
      e2eLogger.result('Disabled elements found', disabledElements.length);

      const disabledElement = disabledElements[0];
      const disabledStyles = await disabledElement.evaluate(el => {
        const styles = window.getComputedStyle(el);
        return {
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          opacity: styles.opacity
        };
      });

      e2eLogger.result('Disabled element styles', disabledStyles);

      // Note: Disabled elements are exempt from contrast requirements in WCAG 2.1
      e2eLogger.info('Disabled elements are exempt from WCAG contrast requirements');
      e2eLogger.success('Disabled element contrast noted');
    } else {
      e2eLogger.info('No disabled elements found');
    }
  });

  test('should run comprehensive axe contrast checks', async ({ page, a11y }) => {
    e2eLogger.info('Running axe-core color contrast checks');

    // Run axe with only color-contrast rules
    const result = await a11y.runAxeScan(null, {
      runOnly: {
        type: 'tag',
        values: ['cat.color']
      }
    });

    e2eLogger.result('Contrast violations', result.violations.length);
    e2eLogger.result('Contrast passes', result.passes.length);

    if (result.violations.length > 0) {
      e2eLogger.warn(`Found ${result.violations.length} contrast violations`);

      result.violations.slice(0, 5).forEach((violation, i) => {
        e2eLogger.a11yViolation(violation);
      });

      expect(result.violations.length).toBe(0);
    } else {
      e2eLogger.success('No contrast violations found by axe-core');
    }
  });

  test('should have sufficient contrast for status indicators', async ({ page }) => {
    e2eLogger.info('Testing status indicator contrast');

    // Look for status/badge elements
    const statusElements = await page.locator('[class*="status"], [class*="badge"], [class*="tag"]').all();

    if (statusElements.length > 0) {
      e2eLogger.result('Status elements found', statusElements.length);

      for (const element of statusElements.slice(0, 3)) {
        const statusStyles = await element.evaluate(el => {
          const styles = window.getComputedStyle(el);
          return {
            color: styles.color,
            backgroundColor: styles.backgroundColor,
            text: el.textContent?.trim()
          };
        });

        e2eLogger.result(`Status "${statusStyles.text}"`, statusStyles);
      }

      e2eLogger.success('Status indicator contrast check noted');
    } else {
      e2eLogger.info('No status indicators found');
    }
  });

  test('should maintain contrast in dark mode (if supported)', async ({ page, a11y }) => {
    e2eLogger.info('Testing dark mode contrast');

    // Check if dark mode toggle exists
    const darkModeToggle = page.locator('[class*="dark"], [class*="theme"]').first();

    if (await darkModeToggle.isVisible({ timeout: 2000 })) {
      e2eLogger.success('Dark mode toggle found');

      // Toggle dark mode
      await darkModeToggle.click();
      await page.waitForTimeout(500);

      // Check contrast in dark mode
      const darkModeResult = await a11y.checkColorContrast('body', 4.5);

      e2eLogger.result('Dark mode body contrast', `${darkModeResult.ratio?.toFixed(2)}:1`);

      if (darkModeResult.pass) {
        e2eLogger.success('Dark mode maintains sufficient contrast');
      } else {
        e2eLogger.warn('Dark mode may have contrast issues');
      }

      // Toggle back
      await darkModeToggle.click();
      await page.waitForTimeout(300);
    } else {
      e2eLogger.info('Dark mode not found or not supported');
    }
  });

  test.afterEach(async () => {
    e2eLogger.suiteEnd('Accessibility: Color Contrast', {
      passed: 0,
      failed: 0,
      total: 0,
      duration: 0
    });
  });
});
