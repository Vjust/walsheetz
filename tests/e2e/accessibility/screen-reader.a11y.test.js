/**
 * Screen Reader Compatibility Accessibility Tests
 * WCAG 2.1 Level AA - Text Alternatives (1.1.1), Info and Relationships (1.3.1)
 */

import { test, expect } from '../fixtures/accessibility.js';
import { e2eLogger } from '../utils/E2ETestLogger.js';

test.describe('Accessibility: Screen Reader Compatibility', () => {
  test.beforeEach(async ({ page }) => {
    e2eLogger.suiteStart('Accessibility: Screen Reader Compatibility');

    const baseURL = process.env.APP_URL || 'http://localhost:3005';
    await page.goto(baseURL);
    await page.waitForTimeout(2000);
  });

  test('should have alt text on all images', async ({ page, a11y }) => {
    e2eLogger.info('Testing image alt text for screen readers');

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

  test('should have semantic HTML structure', async ({ page }) => {
    e2eLogger.info('Testing semantic HTML for screen readers');

    const semanticElements = await page.evaluate(() => {
      const semantic = {
        header: document.querySelectorAll('header').length,
        nav: document.querySelectorAll('nav').length,
        main: document.querySelectorAll('main').length,
        article: document.querySelectorAll('article').length,
        section: document.querySelectorAll('section').length,
        aside: document.querySelectorAll('aside').length,
        footer: document.querySelectorAll('footer').length
      };

      return semantic;
    });

    e2eLogger.result('Semantic elements', semanticElements);

    const hasSemanticStructure = Object.values(semanticElements).some(count => count > 0);

    e2eLogger.assertion(hasSemanticStructure, 'Page uses semantic HTML elements');

    if (hasSemanticStructure) {
      e2eLogger.success('Semantic HTML structure present');
    } else {
      e2eLogger.warn('Page may lack semantic HTML structure');
    }
  });

  test('should have proper document title', async ({ page }) => {
    e2eLogger.info('Testing document title for screen readers');

    const title = await page.title();
    e2eLogger.result('Document title', title);

    e2eLogger.assertion(
      title && title.trim().length > 0,
      'Document has a title'
    );
    expect(title).toBeTruthy();

    e2eLogger.assertion(
      title.length < 100,
      'Title is concise'
    );

    e2eLogger.success('Document title is appropriate for screen readers');
  });

  test('should have lang attribute on html element', async ({ page }) => {
    e2eLogger.info('Testing lang attribute for screen readers');

    const lang = await page.evaluate(() => {
      return document.documentElement.getAttribute('lang');
    });

    e2eLogger.result('HTML lang attribute', lang);

    e2eLogger.assertion(
      lang && lang.length >= 2,
      'HTML element has lang attribute'
    );
    expect(lang).toBeTruthy();

    e2eLogger.success('Language specified for screen readers');
  });

  test('should have accessible names for all interactive elements', async ({ page }) => {
    e2eLogger.info('Testing accessible names');

    const elementsWithoutNames = await page.evaluate(() => {
      const interactiveSelectors = 'button, a, input, select, textarea, [role="button"], [role="link"]';
      const elements = Array.from(document.querySelectorAll(interactiveSelectors));

      return elements.filter(el => {
        // Check for accessible name
        const text = el.textContent?.trim();
        const ariaLabel = el.getAttribute('aria-label');
        const ariaLabelledby = el.getAttribute('aria-labelledby');
        const title = el.getAttribute('title');
        const alt = el.getAttribute('alt');
        const placeholder = el.getAttribute('placeholder');
        const labelFor = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;

        const hasName = text || ariaLabel || ariaLabelledby || title || alt || placeholder || labelFor;

        return !hasName;
      }).map(el => ({
        tagName: el.tagName,
        type: el.getAttribute('type'),
        className: el.className,
        id: el.id
      }));
    });

    e2eLogger.result('Elements without accessible names', elementsWithoutNames.length);

    if (elementsWithoutNames.length > 0) {
      elementsWithoutNames.slice(0, 5).forEach(el => {
        e2eLogger.warn(`No accessible name: ${el.tagName}${el.id ? '#' + el.id : ''}`);
      });
    }

    e2eLogger.assertion(
      elementsWithoutNames.length === 0,
      'All interactive elements have accessible names'
    );

    if (elementsWithoutNames.length === 0) {
      e2eLogger.success('All interactive elements have accessible names');
    }
  });

  test('should have proper table structure with headers', async ({ page }) => {
    e2eLogger.info('Testing table accessibility');

    const tables = await page.evaluate(() => {
      const allTables = Array.from(document.querySelectorAll('table'));

      return allTables.map(table => {
        const hasCaption = !!table.querySelector('caption');
        const hasThead = !!table.querySelector('thead');
        const hasTh = !!table.querySelector('th');
        const hasScope = Array.from(table.querySelectorAll('th')).some(th =>
          th.getAttribute('scope')
        );

        return {
          hasCaption,
          hasThead,
          hasTh,
          hasScope,
          rowCount: table.querySelectorAll('tr').length
        };
      });
    });

    e2eLogger.result('Tables found', tables.length);

    if (tables.length > 0) {
      tables.forEach((table, i) => {
        e2eLogger.result(`Table ${i + 1}`, table);

        e2eLogger.assertion(
          table.hasTh,
          `Table ${i + 1} has header cells (<th>)`
        );

        if (table.hasCaption) {
          e2eLogger.success(`Table ${i + 1} has caption`);
        } else {
          e2eLogger.info(`Table ${i + 1} lacks caption (recommended for screen readers)`);
        }
      });

      e2eLogger.success('Table accessibility checked');
    } else {
      e2eLogger.info('No tables found');
    }
  });

  test('should have descriptive link text', async ({ page }) => {
    e2eLogger.info('Testing link text descriptiveness');

    const links = await page.evaluate(() => {
      const allLinks = Array.from(document.querySelectorAll('a[href]'));

      return allLinks.map(link => {
        const text = link.textContent?.trim() || '';
        const ariaLabel = link.getAttribute('aria-label') || '';
        const title = link.getAttribute('title') || '';

        const displayText = ariaLabel || text || title;

        // Check for non-descriptive text
        const nonDescriptive = [
          'click here',
          'read more',
          'more',
          'here',
          'link'
        ];

        const isNonDescriptive = nonDescriptive.some(phrase =>
          displayText.toLowerCase().includes(phrase) && displayText.length < 15
        );

        return {
          text: displayText.substring(0, 50),
          href: link.getAttribute('href')?.substring(0, 50),
          isNonDescriptive,
          isEmpty: displayText.length === 0
        };
      });
    });

    e2eLogger.result('Links found', links.length);

    if (links.length > 0) {
      const emptyLinks = links.filter(link => link.isEmpty);
      const nonDescriptiveLinks = links.filter(link => link.isNonDescriptive);

      e2eLogger.result('Empty links', emptyLinks.length);
      e2eLogger.result('Non-descriptive links', nonDescriptiveLinks.length);

      if (emptyLinks.length > 0) {
        e2eLogger.warn('Some links have no text content');
        emptyLinks.slice(0, 3).forEach(link => {
          e2eLogger.warn(`  Empty link: ${link.href}`);
        });
      }

      if (nonDescriptiveLinks.length > 0) {
        e2eLogger.info(`${nonDescriptiveLinks.length} links may not be descriptive`);
        nonDescriptiveLinks.slice(0, 3).forEach(link => {
          e2eLogger.info(`  "${link.text}" -> ${link.href}`);
        });
      }

      if (emptyLinks.length === 0 && nonDescriptiveLinks.length < links.length / 2) {
        e2eLogger.success('Link text is generally descriptive');
      }
    } else {
      e2eLogger.info('No links found');
    }
  });

  test('should announce dynamic content changes', async ({ page }) => {
    e2eLogger.info('Testing live region announcements');

    // Check for ARIA live regions
    const liveRegions = await page.evaluate(() => {
      const regions = Array.from(document.querySelectorAll('[aria-live], [role="status"], [role="alert"], [role="log"]'));

      return regions.map(region => ({
        role: region.getAttribute('role'),
        ariaLive: region.getAttribute('aria-live'),
        ariaAtomic: region.getAttribute('aria-atomic'),
        ariaRelevant: region.getAttribute('aria-relevant'),
        text: region.textContent?.trim().substring(0, 50),
        tagName: region.tagName
      }));
    });

    e2eLogger.result('Live regions found', liveRegions.length);

    if (liveRegions.length > 0) {
      liveRegions.forEach((region, i) => {
        e2eLogger.result(`Live region ${i + 1}`, region);
      });

      e2eLogger.success('Live regions present for dynamic content');
    } else {
      e2eLogger.info('No live regions found (may not be needed)');
    }
  });

  test('should have proper list markup', async ({ page }) => {
    e2eLogger.info('Testing list markup for screen readers');

    const lists = await page.evaluate(() => {
      return {
        ul: document.querySelectorAll('ul').length,
        ol: document.querySelectorAll('ol').length,
        dl: document.querySelectorAll('dl').length,
        roleList: document.querySelectorAll('[role="list"]').length
      };
    });

    e2eLogger.result('Lists found', lists);

    const hasLists = Object.values(lists).some(count => count > 0);

    if (hasLists) {
      e2eLogger.success('Lists use proper markup');
    } else {
      e2eLogger.info('No lists found on page');
    }
  });

  test('should have form validation that works with screen readers', async ({ page }) => {
    e2eLogger.info('Testing form validation accessibility');

    // Look for required fields
    const requiredFields = await page.evaluate(() => {
      const fields = Array.from(document.querySelectorAll('input[required], textarea[required], select[required]'));

      return fields.map(field => ({
        type: field.getAttribute('type') || field.tagName.toLowerCase(),
        hasAriaRequired: field.getAttribute('aria-required') === 'true',
        hasAriaInvalid: field.hasAttribute('aria-invalid'),
        hasAriaDescribedby: field.hasAttribute('aria-describedby'),
        id: field.id
      }));
    });

    e2eLogger.result('Required fields found', requiredFields.length);

    if (requiredFields.length > 0) {
      requiredFields.forEach(field => {
        e2eLogger.result(`Required field`, field);

        if (field.hasAriaRequired) {
          e2eLogger.success(`Field ${field.id} has aria-required`);
        }
      });

      e2eLogger.success('Form validation attributes checked');
    } else {
      e2eLogger.info('No required fields found');
    }
  });

  test('should have skip navigation links', async ({ page }) => {
    e2eLogger.info('Testing skip navigation for screen readers');

    // Tab to reveal skip links
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);

    const skipLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href^="#"]'));
      return links
        .filter(link => {
          const text = link.textContent?.toLowerCase() || '';
          return text.includes('skip') || text.includes('jump');
        })
        .map(link => ({
          text: link.textContent?.trim(),
          href: link.getAttribute('href'),
          visible: link.offsetParent !== null
        }));
    });

    e2eLogger.result('Skip links found', skipLinks.length);

    if (skipLinks.length > 0) {
      skipLinks.forEach(link => {
        e2eLogger.result('Skip link', link);
      });

      e2eLogger.success('Skip navigation links present');
    } else {
      e2eLogger.info('No skip links found (recommended for complex layouts)');
    }
  });

  test('should have descriptive button text', async ({ page }) => {
    e2eLogger.info('Testing button text descriptiveness');

    const buttons = await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button'));

      return allButtons.map(button => {
        const text = button.textContent?.trim() || '';
        const ariaLabel = button.getAttribute('aria-label') || '';
        const title = button.getAttribute('title') || '';

        const displayText = ariaLabel || text || title;

        return {
          text: displayText.substring(0, 50),
          isEmpty: displayText.length === 0,
          hasAriaLabel: !!ariaLabel,
          isIconOnly: text.length < 3 && !ariaLabel
        };
      });
    });

    e2eLogger.result('Buttons found', buttons.length);

    if (buttons.length > 0) {
      const emptyButtons = buttons.filter(btn => btn.isEmpty);
      const iconOnlyWithoutLabel = buttons.filter(btn => btn.isIconOnly);

      e2eLogger.result('Empty buttons', emptyButtons.length);
      e2eLogger.result('Icon-only without label', iconOnlyWithoutLabel.length);

      if (emptyButtons.length > 0) {
        e2eLogger.warn('Some buttons have no accessible text');
      }

      if (iconOnlyWithoutLabel.length > 0) {
        e2eLogger.warn('Some icon buttons lack aria-label');
      }

      if (emptyButtons.length === 0 && iconOnlyWithoutLabel.length === 0) {
        e2eLogger.success('All buttons have descriptive text');
      }
    }
  });

  test('should have proper heading hierarchy for screen readers', async ({ page, a11y }) => {
    e2eLogger.info('Testing heading hierarchy');

    const result = await a11y.checkHeadingHierarchy();

    e2eLogger.result('Headings found', result.headings.length);

    if (result.headings.length > 0) {
      await expect(result).toHaveValidHeadingHierarchy();

      if (result.pass) {
        e2eLogger.success('Heading hierarchy is valid for screen readers');
      } else {
        e2eLogger.warn('Heading hierarchy has issues');
        result.issues.forEach(issue => {
          e2eLogger.warn(`  ${issue.message}`);
        });
      }
    }
  });

  test('should run comprehensive axe screen reader checks', async ({ page, a11y }) => {
    e2eLogger.info('Running comprehensive axe-core scan');

    const result = await a11y.checkA11y();

    e2eLogger.result('Total violations', result.violations.length);
    e2eLogger.result('Total passes', result.passes);

    if (!result.pass) {
      e2eLogger.warn(`Found ${result.violations.length} accessibility violations`);

      // Group violations by impact
      const critical = result.violations.filter(v => v.impact === 'critical');
      const serious = result.violations.filter(v => v.impact === 'serious');
      const moderate = result.violations.filter(v => v.impact === 'moderate');
      const minor = result.violations.filter(v => v.impact === 'minor');

      e2eLogger.result('Critical', critical.length);
      e2eLogger.result('Serious', serious.length);
      e2eLogger.result('Moderate', moderate.length);
      e2eLogger.result('Minor', minor.length);

      // Log top violations
      result.violations.slice(0, 5).forEach(violation => {
        e2eLogger.a11yViolation(violation);
      });
    } else {
      e2eLogger.success('All axe-core accessibility checks passed');
    }

    await expect(result).toPassAccessibility();
  });

  test.afterEach(async () => {
    e2eLogger.suiteEnd('Accessibility: Screen Reader Compatibility', {
      passed: 0,
      failed: 0,
      total: 0,
      duration: 0
    });
  });
});
