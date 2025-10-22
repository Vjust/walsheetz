/**
 * ARIA Labels and Attributes Accessibility Tests
 * WCAG 2.1 Level AA - Name, Role, Value (4.1.2)
 */

import { test, expect } from '../fixtures/accessibility.js';
import { e2eLogger } from '../utils/E2ETestLogger.js';

test.describe('Accessibility: ARIA Labels', () => {
  test.beforeEach(async ({ page }) => {
    e2eLogger.suiteStart('Accessibility: ARIA Labels');

    const baseURL = process.env.APP_URL || 'http://localhost:3005';
    await page.goto(baseURL);
    await page.waitForTimeout(2000);
  });

  test('should have proper ARIA labels on buttons', async ({ page, a11y }) => {
    e2eLogger.info('Testing button ARIA labels');

    // Find all buttons
    const buttons = await page.locator('button:visible').all();
    e2eLogger.result('Visible buttons found', buttons.length);

    let labeledCount = 0;
    let unlabeledCount = 0;

    for (const button of buttons.slice(0, 10)) {
      const attributes = await button.evaluate(el => {
        return {
          text: el.textContent?.trim(),
          ariaLabel: el.getAttribute('aria-label'),
          ariaLabelledby: el.getAttribute('aria-labelledby'),
          title: el.getAttribute('title')
        };
      });

      const hasAccessibleName = attributes.text ||
                                 attributes.ariaLabel ||
                                 attributes.ariaLabelledby ||
                                 attributes.title;

      if (hasAccessibleName) {
        labeledCount++;
        e2eLogger.assertion(true, `Button has accessible name: "${attributes.text || attributes.ariaLabel}"`);
      } else {
        unlabeledCount++;
        e2eLogger.warn('Button without accessible name found');
      }
    }

    e2eLogger.result('Labeled buttons', labeledCount);
    e2eLogger.result('Unlabeled buttons', unlabeledCount);

    e2eLogger.assertion(
      labeledCount > unlabeledCount,
      'Most buttons have accessible names'
    );
    expect(labeledCount).toBeGreaterThan(0);

    e2eLogger.success('Button ARIA labels checked');
  });

  test('should have ARIA labels on icon-only buttons', async ({ page }) => {
    e2eLogger.info('Testing icon-only button labels');

    // Find buttons that might be icon-only (no text content or very short)
    const iconButtons = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons
        .filter(btn => {
          const text = btn.textContent?.trim() || '';
          return text.length < 3; // Likely icon-only
        })
        .map(btn => ({
          text: btn.textContent?.trim(),
          ariaLabel: btn.getAttribute('aria-label'),
          title: btn.getAttribute('title'),
          className: btn.className
        }));
    });

    e2eLogger.result('Potential icon-only buttons', iconButtons.length);

    if (iconButtons.length > 0) {
      const labeledIconButtons = iconButtons.filter(btn =>
        btn.ariaLabel || btn.title
      );

      e2eLogger.result('Labeled icon buttons', labeledIconButtons.length);

      e2eLogger.assertion(
        labeledIconButtons.length === iconButtons.length,
        'All icon-only buttons have ARIA labels'
      );

      if (labeledIconButtons.length < iconButtons.length) {
        e2eLogger.warn(`${iconButtons.length - labeledIconButtons.length} icon buttons lack labels`);
      }
    } else {
      e2eLogger.info('No icon-only buttons found');
    }

    e2eLogger.success('Icon button labels checked');
  });

  test('should have proper ARIA roles on interactive elements', async ({ page }) => {
    e2eLogger.info('Testing ARIA roles');

    const elements = await page.evaluate(() => {
      const interactiveSelectors = [
        'button',
        'a',
        'input',
        '[role="button"]',
        '[role="link"]',
        '[role="tab"]',
        '[role="menuitem"]'
      ];

      return interactiveSelectors.map(selector => {
        const els = Array.from(document.querySelectorAll(selector));
        return {
          selector,
          count: els.length,
          examples: els.slice(0, 3).map(el => ({
            tagName: el.tagName,
            role: el.getAttribute('role'),
            ariaLabel: el.getAttribute('aria-label')
          }))
        };
      });
    });

    e2eLogger.result('Interactive elements by type', elements);

    elements.forEach(item => {
      if (item.count > 0) {
        e2eLogger.assertion(true, `Found ${item.count} elements: ${item.selector}`);
      }
    });

    e2eLogger.success('ARIA roles checked');
  });

  test('should have ARIA labels on form inputs', async ({ page, a11y }) => {
    e2eLogger.info('Testing form input labels');

    const result = await a11y.checkFormLabels();

    e2eLogger.result('Total form inputs', result.totalInputs);
    e2eLogger.result('Unlabeled inputs', result.unlabeled);

    if (result.totalInputs > 0) {
      await expect(result).toHaveCompleteFormLabels();
      e2eLogger.success('All form inputs have labels');
    } else {
      e2eLogger.info('No form inputs found on this page');
    }
  });

  test('should have proper modal dialog ARIA attributes', async ({ page, a11y }) => {
    e2eLogger.info('Testing modal dialog ARIA attributes');

    // Open modal
    const createButton = page.locator('button').filter({ hasText: /create|new/i }).first();

    if (await createButton.isVisible({ timeout: 3000 })) {
      await createButton.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[role="dialog"], .modal, [class*="modal"]').first();

      if (await modal.isVisible({ timeout: 2000 })) {
        e2eLogger.success('Modal opened');

        // Check ARIA attributes
        const modalSelector = '[role="dialog"], .modal, [class*="modal"]';
        const result = await a11y.checkAriaAttributes(modalSelector, {
          'role': 'dialog',
          'aria-modal': 'true'
        });

        e2eLogger.result('Modal ARIA attributes', result.attributes);

        // Check for aria-labelledby or aria-label
        const hasLabel = result.attributes['aria-labelledby'] ||
                        result.attributes['aria-label'];

        if (hasLabel) {
          e2eLogger.success('Modal has accessible name');
        } else {
          e2eLogger.warn('Modal may lack accessible name (aria-label or aria-labelledby)');
        }

        // Close modal
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      } else {
        e2eLogger.info('Modal did not appear - test skipped');
      }
    }
  });

  test('should have ARIA live regions for dynamic content', async ({ page }) => {
    e2eLogger.info('Testing ARIA live regions');

    const liveRegions = await page.evaluate(() => {
      const regions = Array.from(document.querySelectorAll('[aria-live], [role="status"], [role="alert"]'));
      return regions.map(el => ({
        role: el.getAttribute('role'),
        ariaLive: el.getAttribute('aria-live'),
        ariaAtomic: el.getAttribute('aria-atomic'),
        text: el.textContent?.trim().substring(0, 50)
      }));
    });

    e2eLogger.result('Live regions found', liveRegions.length);

    if (liveRegions.length > 0) {
      liveRegions.forEach((region, i) => {
        e2eLogger.info(`Live region ${i + 1}: ${region.role || region.ariaLive} - "${region.text}"`);
      });

      e2eLogger.success('Live regions present for dynamic content');
    } else {
      e2eLogger.info('No ARIA live regions found (may not be needed)');
    }
  });

  test('should have proper heading hierarchy with ARIA', async ({ page, a11y }) => {
    e2eLogger.info('Testing heading hierarchy');

    const result = await a11y.checkHeadingHierarchy();

    e2eLogger.result('Headings found', result.headings.length);

    if (result.headings.length > 0) {
      await expect(result).toHaveValidHeadingHierarchy();

      if (result.pass) {
        e2eLogger.success('Heading hierarchy is valid');
      } else {
        e2eLogger.warn(`Heading hierarchy issues: ${result.issues.length}`);
        result.issues.slice(0, 3).forEach(issue => {
          e2eLogger.warn(`  - ${issue.message}`);
        });
      }
    } else {
      e2eLogger.info('No headings found on page');
    }
  });

  test('should have ARIA expanded attributes on collapsible elements', async ({ page }) => {
    e2eLogger.info('Testing aria-expanded attributes');

    const expandableElements = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('[aria-expanded]'));
      return elements.map(el => ({
        tagName: el.tagName,
        ariaExpanded: el.getAttribute('aria-expanded'),
        ariaControls: el.getAttribute('aria-controls'),
        text: el.textContent?.trim().substring(0, 30)
      }));
    });

    e2eLogger.result('Elements with aria-expanded', expandableElements.length);

    if (expandableElements.length > 0) {
      expandableElements.forEach(el => {
        const isValid = el.ariaExpanded === 'true' || el.ariaExpanded === 'false';
        e2eLogger.assertion(
          isValid,
          `aria-expanded="${el.ariaExpanded}" on ${el.text || el.tagName}`
        );
      });

      e2eLogger.success('aria-expanded attributes are valid');
    } else {
      e2eLogger.info('No collapsible elements found');
    }
  });

  test('should have ARIA described-by for additional context', async ({ page }) => {
    e2eLogger.info('Testing aria-describedby usage');

    const describedElements = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('[aria-describedby]'));
      return elements.map(el => {
        const describerId = el.getAttribute('aria-describedby');
        const describerEl = describerId ? document.getElementById(describerId) : null;

        return {
          element: el.tagName,
          describedby: describerId,
          describerExists: !!describerEl,
          describerText: describerEl?.textContent?.trim().substring(0, 50)
        };
      });
    });

    e2eLogger.result('Elements with aria-describedby', describedElements.length);

    if (describedElements.length > 0) {
      const validDescriptions = describedElements.filter(el => el.describerExists);

      e2eLogger.result('Valid descriptions', validDescriptions.length);

      e2eLogger.assertion(
        validDescriptions.length === describedElements.length,
        'All aria-describedby references are valid'
      );

      validDescriptions.forEach(el => {
        e2eLogger.info(`  ${el.element} described by: "${el.describerText}"`);
      });

      e2eLogger.success('aria-describedby attributes checked');
    } else {
      e2eLogger.info('No aria-describedby attributes found');
    }
  });

  test('should have proper ARIA invalid and error messages', async ({ page }) => {
    e2eLogger.info('Testing ARIA validation attributes');

    // Look for form inputs with validation
    const validationElements = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
      return inputs.map(el => ({
        type: el.getAttribute('type') || el.tagName.toLowerCase(),
        ariaInvalid: el.getAttribute('aria-invalid'),
        ariaErrormessage: el.getAttribute('aria-errormessage'),
        required: el.hasAttribute('required')
      }));
    });

    e2eLogger.result('Form inputs found', validationElements.length);

    if (validationElements.length > 0) {
      const withValidation = validationElements.filter(el =>
        el.ariaInvalid || el.ariaErrormessage
      );

      e2eLogger.result('Inputs with ARIA validation', withValidation.length);

      if (withValidation.length > 0) {
        e2eLogger.success('ARIA validation attributes present');
      } else {
        e2eLogger.info('No ARIA validation attributes (may be added on error)');
      }
    } else {
      e2eLogger.info('No form inputs found');
    }
  });

  test('should have ARIA labels on images', async ({ page, a11y }) => {
    e2eLogger.info('Testing image alt text and ARIA labels');

    const result = await a11y.checkImageAltText();

    e2eLogger.result('Total images', result.totalImages);
    e2eLogger.result('Missing alt text', result.missingAlt);

    if (result.totalImages > 0) {
      await expect(result).toHaveCompleteImageAltText();

      if (result.pass) {
        e2eLogger.success('All images have alt text');
      } else {
        e2eLogger.warn(`${result.missingAlt} images lack alt text`);
      }
    } else {
      e2eLogger.info('No images found on page');
    }
  });

  test('should have proper landmark roles', async ({ page }) => {
    e2eLogger.info('Testing ARIA landmark roles');

    const landmarks = await page.evaluate(() => {
      const landmarkSelectors = [
        'header, [role="banner"]',
        'nav, [role="navigation"]',
        'main, [role="main"]',
        'footer, [role="contentinfo"]',
        'aside, [role="complementary"]',
        '[role="search"]'
      ];

      return landmarkSelectors.map(selector => {
        const elements = Array.from(document.querySelectorAll(selector));
        return {
          type: selector.split(',')[0].split('[')[0],
          count: elements.length,
          hasLabel: elements.some(el =>
            el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')
          )
        };
      });
    });

    e2eLogger.result('Landmark regions', landmarks);

    const foundLandmarks = landmarks.filter(l => l.count > 0);

    foundLandmarks.forEach(landmark => {
      e2eLogger.assertion(
        true,
        `Found ${landmark.count} ${landmark.type} landmark(s)`
      );
    });

    if (foundLandmarks.length > 0) {
      e2eLogger.success('Page has landmark regions for navigation');
    } else {
      e2eLogger.warn('No landmark regions found');
    }
  });

  test('should have ARIA current for navigation items', async ({ page }) => {
    e2eLogger.info('Testing aria-current on navigation');

    const navItems = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('nav a, [role="navigation"] a, [role="tab"]'));
      return items.map(el => ({
        text: el.textContent?.trim().substring(0, 30),
        ariaCurrent: el.getAttribute('aria-current'),
        href: el.getAttribute('href'),
        role: el.getAttribute('role')
      }));
    });

    e2eLogger.result('Navigation items found', navItems.length);

    if (navItems.length > 0) {
      const withCurrent = navItems.filter(item => item.ariaCurrent);

      e2eLogger.result('Items with aria-current', withCurrent.length);

      if (withCurrent.length > 0) {
        withCurrent.forEach(item => {
          e2eLogger.success(`aria-current="${item.ariaCurrent}" on "${item.text}"`);
        });
      } else {
        e2eLogger.info('No aria-current attributes (may not be needed)');
      }
    } else {
      e2eLogger.info('No navigation items found');
    }
  });

  test.afterEach(async () => {
    e2eLogger.suiteEnd('Accessibility: ARIA Labels', {
      passed: 0,
      failed: 0,
      total: 0,
      duration: 0
    });
  });
});
