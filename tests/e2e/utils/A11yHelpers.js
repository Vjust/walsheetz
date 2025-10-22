/**
 * Accessibility Testing Helpers
 * Utilities for WCAG 2.1 Level AA compliance testing
 */

import { e2eLogger } from './E2ETestLogger.js';

/**
 * Inject axe-core into the page
 */
export async function injectAxe(page) {
  await page.addScriptTag({
    url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.7.2/axe.min.js'
  });
  e2eLogger.success('axe-core injected into page');
}

/**
 * Run axe accessibility scan
 */
export async function runAxeScan(page, context = null, options = {}) {
  e2eLogger.info('Running axe accessibility scan...', { context, options });

  const results = await page.evaluate((contextArg, optionsArg) => {
    return new Promise((resolve) => {
      window.axe.run(contextArg || document, optionsArg || {}, (err, results) => {
        if (err) throw err;
        resolve(results);
      });
    });
  }, context, options);

  e2eLogger.info('Axe scan complete', {
    violations: results.violations.length,
    passes: results.passes.length,
    incomplete: results.incomplete.length
  });

  return results;
}

/**
 * Check for accessibility violations
 */
export async function checkA11y(page, context = null, options = {}) {
  try {
    await injectAxe(page);
  } catch (e) {
    // Axe might already be injected
  }

  const results = await runAxeScan(page, context, options);

  if (results.violations.length > 0) {
    e2eLogger.warn(`Found ${results.violations.length} accessibility violations`);
    results.violations.forEach(violation => {
      e2eLogger.a11yViolation(violation);
    });
    return {
      pass: false,
      violations: results.violations,
      passes: results.passes.length
    };
  }

  e2eLogger.a11yPass(`No accessibility violations found`, results.passes.length);
  return {
    pass: true,
    violations: [],
    passes: results.passes.length
  };
}

/**
 * Get color contrast ratio between two colors
 */
function getContrastRatio(rgb1, rgb2) {
  const getLuminance = (rgb) => {
    const [r, g, b] = rgb.map(val => {
      val = val / 255;
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const lum1 = getLuminance(rgb1);
  const lum2 = getLuminance(rgb2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Parse RGB color string to array
 */
function parseRgb(rgbString) {
  const match = rgbString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
  }
  return [0, 0, 0];
}

/**
 * Check color contrast for an element
 */
export async function checkColorContrast(page, selector, requiredRatio = 4.5) {
  const result = await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return null;

    const computedStyle = window.getComputedStyle(element);
    const color = computedStyle.color;
    const backgroundColor = computedStyle.backgroundColor;
    const fontSize = computedStyle.fontSize;

    return { color, backgroundColor, fontSize, text: element.textContent };
  }, selector);

  if (!result) {
    e2eLogger.warn(`Element not found: ${selector}`);
    return { pass: false, ratio: 0 };
  }

  const foreground = parseRgb(result.color);
  const background = parseRgb(result.backgroundColor);
  const ratio = getContrastRatio(foreground, background);

  // Large text (18pt+ or 14pt+ bold) requires 3:1 ratio
  const fontSize = parseFloat(result.fontSize);
  const isLargeText = fontSize >= 18 || fontSize >= 14; // Simplified, doesn't check bold
  const required = isLargeText ? 3 : requiredRatio;

  e2eLogger.contrast(selector, ratio, required);

  return {
    pass: ratio >= required,
    ratio,
    required,
    foreground: result.color,
    background: result.backgroundColor
  };
}

/**
 * Check if element is keyboard focusable
 */
export async function isKeyboardFocusable(page, selector) {
  const focusable = await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return false;

    // Check if element is focusable
    const tabIndex = element.tabIndex;
    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute('role');

    // Interactive elements
    const interactiveTags = ['a', 'button', 'input', 'textarea', 'select'];
    if (interactiveTags.includes(tagName)) return true;

    // Has tabindex >= 0
    if (tabIndex >= 0) return true;

    // Has interactive role
    const interactiveRoles = ['button', 'link', 'textbox', 'checkbox', 'radio'];
    if (role && interactiveRoles.includes(role)) return true;

    return false;
  }, selector);

  return focusable;
}

/**
 * Check focus visibility
 */
export async function checkFocusVisible(page, selector) {
  await page.focus(selector);

  const visible = await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return false;

    const computedStyle = window.getComputedStyle(element);
    const outline = computedStyle.outline;
    const outlineWidth = computedStyle.outlineWidth;
    const boxShadow = computedStyle.boxShadow;

    // Check if there's visible focus indicator
    const hasOutline = outline !== 'none' && outlineWidth !== '0px';
    const hasBoxShadow = boxShadow !== 'none';

    return hasOutline || hasBoxShadow;
  }, selector);

  e2eLogger.focus(selector, visible);

  return visible;
}

/**
 * Test keyboard navigation
 */
export async function testKeyboardNavigation(page, startSelector, expectedOrder) {
  e2eLogger.info('Testing keyboard navigation', { startSelector, steps: expectedOrder.length });

  await page.focus(startSelector);
  const results = [];

  for (let i = 0; i < expectedOrder.length; i++) {
    await page.keyboard.press('Tab');

    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tagName: el.tagName,
        id: el.id,
        className: el.className,
        ariaLabel: el.getAttribute('aria-label'),
        role: el.getAttribute('role'),
        text: el.textContent?.trim().substring(0, 50)
      };
    });

    const expected = expectedOrder[i];
    const match = expected.selector ? await page.evaluate((sel) => {
      return document.activeElement === document.querySelector(sel);
    }, expected.selector) : true;

    e2eLogger.assertion(match, `Tab ${i + 1}: ${expected.description || expected.selector}`);

    results.push({
      step: i + 1,
      expected: expected,
      actual: focusedElement,
      match
    });
  }

  const allMatch = results.every(r => r.match);
  return { pass: allMatch, results };
}

/**
 * Check ARIA attributes
 */
export async function checkAriaAttributes(page, selector, expectedAttributes = {}) {
  const attributes = await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return null;

    const ariaAttrs = {};
    for (const attr of element.attributes) {
      if (attr.name.startsWith('aria-') || attr.name === 'role') {
        ariaAttrs[attr.name] = attr.value;
      }
    }
    return ariaAttrs;
  }, selector);

  if (!attributes) {
    e2eLogger.warn(`Element not found: ${selector}`);
    return { pass: false, missing: Object.keys(expectedAttributes) };
  }

  const missing = [];
  const incorrect = [];

  for (const [attr, expectedValue] of Object.entries(expectedAttributes)) {
    if (!(attr in attributes)) {
      missing.push(attr);
      e2eLogger.aria(selector, attr, 'missing', expectedValue);
    } else if (expectedValue !== undefined && attributes[attr] !== expectedValue) {
      incorrect.push({ attr, expected: expectedValue, actual: attributes[attr] });
      e2eLogger.aria(selector, attr, attributes[attr], expectedValue);
    } else {
      e2eLogger.aria(selector, attr, attributes[attr], expectedValue);
    }
  }

  return {
    pass: missing.length === 0 && incorrect.length === 0,
    attributes,
    missing,
    incorrect
  };
}

/**
 * Check for proper heading hierarchy
 */
export async function checkHeadingHierarchy(page) {
  const headings = await page.evaluate(() => {
    const headingElements = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    return headingElements.map(h => ({
      level: parseInt(h.tagName.substring(1)),
      text: h.textContent.trim(),
      html: h.outerHTML.substring(0, 100)
    }));
  });

  const issues = [];
  let previousLevel = 0;

  headings.forEach((heading, index) => {
    // Check if skipping levels (e.g., h1 -> h3)
    if (heading.level > previousLevel + 1 && previousLevel !== 0) {
      issues.push({
        index,
        message: `Heading level skipped: h${previousLevel} -> h${heading.level}`,
        heading
      });
    }

    // Check if there's only one h1
    if (heading.level === 1) {
      const h1Count = headings.filter(h => h.level === 1).length;
      if (h1Count > 1 && index === 0) {
        issues.push({
          index,
          message: `Multiple h1 elements found (${h1Count})`,
          heading
        });
      }
    }

    previousLevel = heading.level;
  });

  if (issues.length > 0) {
    e2eLogger.warn(`Found ${issues.length} heading hierarchy issues`);
    issues.forEach(issue => {
      e2eLogger.warn(`  ${issue.message}: ${issue.heading.text}`);
    });
  } else {
    e2eLogger.a11yPass('Heading hierarchy is correct');
  }

  return {
    pass: issues.length === 0,
    headings,
    issues
  };
}

/**
 * Check for alt text on images
 */
export async function checkImageAltText(page) {
  const images = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs.map(img => ({
      src: img.src,
      alt: img.alt,
      hasAlt: img.hasAttribute('alt'),
      role: img.getAttribute('role'),
      ariaLabel: img.getAttribute('aria-label')
    }));
  });

  const missingAlt = images.filter(img => !img.hasAlt && img.role !== 'presentation' && !img.ariaLabel);

  if (missingAlt.length > 0) {
    e2eLogger.warn(`Found ${missingAlt.length} images without alt text`);
    missingAlt.forEach(img => {
      e2eLogger.warn(`  Missing alt: ${img.src}`);
    });
  } else {
    e2eLogger.a11yPass('All images have alt text');
  }

  return {
    pass: missingAlt.length === 0,
    totalImages: images.length,
    missingAlt: missingAlt.length
  };
}

/**
 * Check for form labels
 */
export async function checkFormLabels(page) {
  const inputs = await page.evaluate(() => {
    const formInputs = Array.from(document.querySelectorAll('input, textarea, select'));
    return formInputs.map(input => {
      const id = input.id;
      const label = id ? document.querySelector(`label[for="${id}"]`) : null;
      const ariaLabel = input.getAttribute('aria-label');
      const ariaLabelledby = input.getAttribute('aria-labelledby');

      return {
        type: input.type || input.tagName.toLowerCase(),
        id,
        hasLabel: !!label,
        labelText: label?.textContent.trim(),
        ariaLabel,
        ariaLabelledby,
        hasAccessibleName: !!label || !!ariaLabel || !!ariaLabelledby
      };
    });
  });

  const unlabeled = inputs.filter(input => !input.hasAccessibleName);

  if (unlabeled.length > 0) {
    e2eLogger.warn(`Found ${unlabeled.length} form inputs without labels`);
    unlabeled.forEach(input => {
      e2eLogger.warn(`  Unlabeled ${input.type}: ${input.id || 'no id'}`);
    });
  } else {
    e2eLogger.a11yPass('All form inputs have labels');
  }

  return {
    pass: unlabeled.length === 0,
    totalInputs: inputs.length,
    unlabeled: unlabeled.length
  };
}

export default {
  injectAxe,
  runAxeScan,
  checkA11y,
  checkColorContrast,
  isKeyboardFocusable,
  checkFocusVisible,
  testKeyboardNavigation,
  checkAriaAttributes,
  checkHeadingHierarchy,
  checkImageAltText,
  checkFormLabels
};
