# E2E Testing Infrastructure

Comprehensive end-to-end testing for Walsheetz spreadsheet application with focus on **usability** and **accessibility** (WCAG 2.1 Level AA compliance).

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Test Architecture](#test-architecture)
- [Running Tests](#running-tests)
- [Test Suites](#test-suites)
- [Utilities and Helpers](#utilities-and-helpers)
- [Docker Support](#docker-support)
- [Visual Regression Testing](#visual-regression-testing)
- [Accessibility Testing](#accessibility-testing)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

This E2E testing infrastructure provides:

- **Comprehensive Logging**: Detailed, colorized console output with timestamps
- **Usability Testing**: Real user workflows (creating, editing, saving spreadsheets)
- **Accessibility Testing**: WCAG 2.1 Level AA compliance verification
- **Visual Regression**: Screenshot comparison and diff generation
- **Multi-Browser**: Chrome, Firefox, Safari, Mobile viewports
- **Docker Support**: Containerized test execution
- **Rich Reporting**: HTML, JSON, JUnit reports

### Test Statistics

- **7 Usability Test Suites**: 72 tests covering spreadsheet workflows
- **5 Accessibility Test Suites**: 62 tests covering WCAG 2.1 compliance
- **Total**: 134 E2E tests

## 🚀 Quick Start

### Prerequisites

```bash
# Install dependencies
bun install

# Install Playwright browsers
bunx playwright install
```

### Run All Tests

```bash
# Run all E2E tests (headless)
bun run test:e2e

# Run with UI mode (interactive)
bun run test:e2e:ui

# Run in headed mode (see browser)
bun run test:e2e:headed
```

### Run Specific Test Suites

```bash
# Run only usability tests
bun run test:e2e:usability

# Run only accessibility tests
bun run test:e2e:a11y

# Run specific browser
bun run test:e2e:chrome
bun run test:e2e:firefox
bun run test:e2e:webkit
```

## 🏗️ Test Architecture

```
tests/e2e/
├── utils/                          # Test utilities
│   ├── E2ETestLogger.js           # Extensive logging utility
│   ├── A11yHelpers.js             # Accessibility testing utilities
│   ├── SpreadsheetHelpers.js      # Luckysheet interaction helpers
│   └── VisualHelpers.js           # Screenshot & visual regression
├── fixtures/                       # Playwright fixtures
│   ├── spreadsheet.js             # Spreadsheet testing fixture
│   └── accessibility.js           # Accessibility testing fixture
├── usability/                      # Usability test suites
│   ├── spreadsheet-creation.e2e.test.js
│   ├── cell-editing.e2e.test.js
│   ├── keyboard-shortcuts.e2e.test.js
│   ├── formula-autocomplete.e2e.test.js
│   ├── save-workflow.e2e.test.js
│   ├── navigation.e2e.test.js
│   └── document-management.e2e.test.js
├── accessibility/                  # Accessibility test suites
│   ├── keyboard-navigation.a11y.test.js
│   ├── aria-labels.a11y.test.js
│   ├── focus-management.a11y.test.js
│   ├── color-contrast.a11y.test.js
│   └── screen-reader.a11y.test.js
├── screenshots/                    # Screenshot storage
│   ├── baselines/                 # Visual regression baselines
│   ├── current/                   # Current test screenshots
│   ├── diffs/                     # Visual diff images
│   └── failures/                  # Failure screenshots
├── videos/                         # Video recordings
├── reports/                        # Test reports
│   ├── html/                      # HTML report
│   └── results.json               # JSON report
└── README.md                       # This file
```

## 🏃 Running Tests

### Local Development

```bash
# Run all tests
bun run test:e2e

# Run with UI mode (recommended for development)
bun run test:e2e:ui

# Run in debug mode
bun run test:e2e:debug

# Run specific test file
bunx playwright test tests/e2e/usability/cell-editing.e2e.test.js
```

### Environment Variables

Configure test behavior with environment variables:

```bash
# Application URL
export APP_URL=http://localhost:3005

# Headless mode
export E2E_HEADLESS=true

# Logging configuration
export E2E_LOG_COLORS=true
export E2E_LOG_TIMESTAMPS=true
export E2E_LOG_LEVEL=verbose  # debug, verbose, info, warn, error

# Visual regression
export UPDATE_SNAPSHOTS=true
```

### Browser-Specific Tests

```bash
# Run on specific browser
bun run test:e2e:chrome
bun run test:e2e:firefox
bun run test:e2e:webkit

# Run on mobile viewports
bun run test:e2e:mobile
```

### Test Reports

```bash
# View HTML report
bun run test:e2e:report

# Reports are generated at:
# - tests/e2e/reports/html/index.html
# - tests/e2e/reports/results.json
# - tests/e2e/reports/junit.xml
```

## 📦 Test Suites

### Usability Tests

#### 1. Spreadsheet Creation (8 tests)
```bash
bunx playwright test tests/e2e/usability/spreadsheet-creation.e2e.test.js
```
- Application homepage load
- Create document button visibility
- Create document modal
- Default and custom document names
- Empty cell initialization
- Canvas rendering

#### 2. Cell Editing (10 tests)
```bash
bunx playwright test tests/e2e/usability/cell-editing.e2e.test.js
```
- Cell selection
- Text and number input
- Cell content editing
- Delete and clear operations
- Enter/Tab navigation
- Special characters
- Long text handling

#### 3. Keyboard Shortcuts (11 tests)
```bash
bunx playwright test tests/e2e/usability/keyboard-shortcuts.e2e.test.js
```
- Bold (Ctrl+B), Italic (Ctrl+I), Underline (Ctrl+U)
- Copy/Paste (Ctrl+C/V)
- Undo/Redo (Ctrl+Z/Y)
- Save (Ctrl+S)
- Arrow key navigation
- Range selection (Shift+Arrow)
- Escape key

#### 4. Formula Autocomplete (10 tests)
```bash
bunx playwright test tests/e2e/usability/formula-autocomplete.e2e.test.js
```
- WZ function autocomplete trigger
- WZ_STORE, WZ_READ functions
- Mouse and keyboard selection
- Autocomplete navigation
- Filtering as user types
- Standard Excel functions

#### 5. Save Workflow (11 tests)
```bash
bunx playwright test tests/e2e/usability/save-workflow.e2e.test.js
```
- Save button visibility
- Ctrl+S shortcut
- Saving status indicators
- Success status display
- Data persistence after reload
- Rapid consecutive saves
- Unsaved changes indicator

#### 6. Navigation (10 tests)
```bash
bunx playwright test tests/e2e/usability/navigation.e2e.test.js
```
- Homepage navigation
- Navigation links
- Spreadsheet navigation
- Browser back/forward buttons
- Direct URL access
- Page reload handling
- 404 error handling

#### 7. Document Management (12 tests)
```bash
bunx playwright test tests/e2e/usability/document-management.e2e.test.js
```
- Document list display
- Multiple document creation
- Opening existing documents
- Document metadata
- Search/filter functionality
- Sorting
- Loading states
- Empty states

### Accessibility Tests (WCAG 2.1 Level AA)

#### 1. Keyboard Navigation (10 tests)
```bash
bunx playwright test tests/e2e/accessibility/keyboard-navigation.a11y.test.js
```
- Tab navigation through interactive elements
- Shift+Tab reverse navigation
- Focus trap prevention
- Keyboard access to all controls
- Escape key for modal dismissal
- Enter key for form submission
- Logical tab order

#### 2. ARIA Labels (13 tests)
```bash
bunx playwright test tests/e2e/accessibility/aria-labels.a11y.test.js
```
- Button ARIA labels
- Icon-only button labels
- ARIA roles on interactive elements
- Form input labels
- Modal dialog ARIA attributes
- Live regions for dynamic content
- Heading hierarchy
- Expandable element attributes
- Landmark roles

#### 3. Focus Management (12 tests)
```bash
bunx playwright test tests/e2e/accessibility/focus-management.a11y.test.js
```
- Visible focus indicators
- Focus indicator contrast
- Focus management in modals
- Focus restoration after modal close
- Focus trap within modal
- Focus persistence during interaction
- Logical focus order
- Skip navigation links

#### 4. Color Contrast (13 tests)
```bash
bunx playwright test tests/e2e/accessibility/color-contrast.a11y.test.js
```
- Body text contrast (4.5:1)
- Button text contrast
- Link text contrast
- Form label contrast
- Heading contrast
- Placeholder text contrast
- Icon button contrast
- Interactive states (hover, focus)
- Error message contrast
- Status indicator contrast
- Dark mode contrast
- Comprehensive axe contrast checks

#### 5. Screen Reader Compatibility (14 tests)
```bash
bunx playwright test tests/e2e/accessibility/screen-reader.a11y.test.js
```
- Image alt text
- Semantic HTML structure
- Document title
- Lang attribute
- Accessible names for interactive elements
- Table structure with headers
- Descriptive link text
- Dynamic content announcements
- List markup
- Form validation
- Skip navigation links
- Descriptive button text
- Heading hierarchy
- Comprehensive axe screen reader checks

## 🛠️ Utilities and Helpers

### E2ETestLogger

Extensive logging utility with colorized output:

```javascript
import { e2eLogger } from '../utils/E2ETestLogger.js';

// Test lifecycle
const testId = e2eLogger.testStart('Test name');
e2eLogger.testPass('Test name', testId);
e2eLogger.testFail('Test name', error, context, testId);

// Actions and results
e2eLogger.action('click', 'Clicked save button');
e2eLogger.result('Cell value', value);
e2eLogger.assertion(condition, 'Assertion message');

// Accessibility
e2eLogger.a11yViolation(violation);
e2eLogger.a11yPass('Check passed');
e2eLogger.contrast('button', 4.5, 4.5);
e2eLogger.focus('input', true);
e2eLogger.aria('button', 'aria-label', 'Save', 'Save');
```

### SpreadsheetHelpers

Luckysheet interaction utilities:

```javascript
import * as spreadsheetHelpers from '../utils/SpreadsheetHelpers.js';

// Cell operations
await spreadsheet.clickCell(0, 0);
await spreadsheet.typeInCell('Hello');
const value = await spreadsheet.getCellValue(0, 0);
await spreadsheet.verifyCellValue(0, 0, 'Hello');
await spreadsheet.clearCell(0, 0);

// Navigation
await spreadsheet.navigateWithArrows('down', 3);
const activeCell = await spreadsheet.getActiveCell();

// Formatting
await spreadsheet.verifyCellBold(0, 0, true);
await spreadsheet.pressShortcut('Control+B');

// Save
await spreadsheet.save();
await spreadsheet.verifySaveStatus('saved');
```

### A11yHelpers

Accessibility testing utilities:

```javascript
import * as a11yHelpers from '../utils/A11yHelpers.js';

// Axe-core scanning
await a11y.injectAxe(page);
const result = await a11y.checkA11y(page);

// Color contrast
const contrastResult = await a11y.checkColorContrast(page, 'button', 4.5);

// Keyboard navigation
const isAccessible = await a11y.isKeyboardFocusable(page, 'button');
const hasFocus = await a11y.checkFocusVisible(page, 'button');

// ARIA attributes
const ariaResult = await a11y.checkAriaAttributes(page, '[role="dialog"]', {
  'role': 'dialog',
  'aria-modal': 'true'
});

// Content structure
const headingResult = await a11y.checkHeadingHierarchy(page);
const imageResult = await a11y.checkImageAltText(page);
const formResult = await a11y.checkFormLabels(page);
```

### VisualHelpers

Screenshot and visual regression utilities:

```javascript
import * as visualHelpers from '../utils/VisualHelpers.js';

// Screenshots
await visual.takeScreenshot(page, 'homepage');
await visual.screenshotOnFailure(page, testInfo.title);
await visual.captureElement(page, '.modal', 'modal');

// Visual regression
const result = await visual.visualRegressionTest(page, 'homepage', {
  fullPage: true,
  threshold: 0.1
});

// Video recording
const recording = await visual.startVideoRecording(page, 'test');
// ... perform actions ...
await visual.stopVideoRecording(recording);

// Comparison
await visual.compareScreenshots(baseline, current, diff);
await visual.createComparisonImage(img1, img2, output);
```

## 🐳 Docker Support

### Run Tests in Docker

```bash
# Build Docker image
bun run test:e2e:docker:build

# Run tests in Docker
bun run test:e2e:docker

# Clean up Docker resources
bun run test:e2e:docker:clean
```

### Docker Compose Services

- **app**: Application server (port 3005)
- **e2e-tests**: Test runner
- **e2e-ui**: UI mode for debugging (port 9323)

### Docker Configuration

```yaml
# Start all services
docker-compose -f docker-compose.e2e.yml up

# Run with UI mode (for debugging)
docker-compose -f docker-compose.e2e.yml --profile debug up
```

## 📸 Visual Regression Testing

### Update Baselines

```bash
# Update all visual regression baselines
bun run test:e2e:visual

# Or set environment variable
UPDATE_SNAPSHOTS=true bun run test:e2e
```

### Visual Regression Workflow

1. **First Run**: Creates baseline screenshots
2. **Subsequent Runs**: Compares against baselines
3. **Differences**: Generates diff images highlighting changes
4. **Review**: Check diff images in `tests/e2e/screenshots/diffs/`

### Example

```javascript
test('should match homepage design', async ({ page, visual }) => {
  await page.goto('/');

  const result = await visual.visualRegressionTest('homepage', {
    fullPage: true,
    threshold: 0.1  // 10% difference allowed
  });

  expect(result).toPassVisualRegression();
});
```

## ♿ Accessibility Testing

### Running Accessibility Tests

```bash
# Run all accessibility tests
bun run test:e2e:a11y

# Run specific accessibility test
bunx playwright test tests/e2e/accessibility/color-contrast.a11y.test.js
```

### WCAG 2.1 Level AA Coverage

- ✅ **Perceivable**: Text alternatives, color contrast, resize text
- ✅ **Operable**: Keyboard accessible, no keyboard traps, focus visible
- ✅ **Understandable**: Page titles, labels, error identification
- ✅ **Robust**: Valid HTML, ARIA attributes, name/role/value

### Accessibility Tools

- **axe-core**: Automated accessibility testing
- **Color Contrast Calculator**: WCAG-compliant contrast ratio calculation
- **ARIA Validator**: Checks ARIA attributes and roles
- **Keyboard Navigator**: Tests keyboard-only workflows

### Custom Matchers

```javascript
// Accessibility matchers
await expect(result).toPassAccessibility();
await expect(result).toMeetContrastRequirements();
await expect(page, selector).toBeKeyboardAccessible();
await expect(page, selector).toHaveVisibleFocus();
await expect(page, selector, attrs).toHaveCorrectAria();
await expect(result).toHaveValidHeadingHierarchy();
```

## 🔄 CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Install Playwright browsers
        run: bunx playwright install --with-deps

      - name: Run E2E tests
        run: bun run test:e2e
        env:
          CI: true
          E2E_HEADLESS: true

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: e2e-test-results
          path: |
            tests/e2e/reports/
            tests/e2e/screenshots/failures/
```

### Using Docker in CI

```yaml
      - name: Run E2E tests in Docker
        run: bun run test:e2e:docker
```

## 🔧 Troubleshooting

### Common Issues

#### Tests Timeout

```bash
# Increase timeout
bunx playwright test --timeout=180000

# Or in individual test
test('long running test', async ({ page }) => {
  test.setTimeout(180000);
  // ...
});
```

#### Screenshots Not Captured

```bash
# Ensure directory exists
mkdir -p tests/e2e/screenshots/failures

# Check permissions
chmod 755 tests/e2e/screenshots
```

#### Luckysheet Not Loading

```javascript
// Increase wait time
await spreadsheet.waitForLuckysheet(30000);

// Check if Luckysheet is available
const hasLuckysheet = await page.evaluate(() => {
  return typeof window.luckysheet !== 'undefined';
});
```

#### Visual Regression Failures

```bash
# Update baselines if changes are intentional
bun run test:e2e:visual

# Check diff images
open tests/e2e/screenshots/diffs/
```

#### Accessibility Violations

```javascript
// Get detailed violation info
const result = await a11y.checkA11y(page);
if (!result.pass) {
  console.log('Violations:', JSON.stringify(result.violations, null, 2));
}
```

### Debug Mode

```bash
# Run with debugger
bun run test:e2e:debug

# Or use Playwright inspector
PWDEBUG=1 bun run test:e2e
```

### Verbose Logging

```bash
# Enable debug logging
E2E_LOG_LEVEL=debug bun run test:e2e

# Disable colors (for CI)
E2E_LOG_COLORS=false bun run test:e2e

# Disable timestamps
E2E_LOG_TIMESTAMPS=false bun run test:e2e
```

## 📚 Additional Resources

- [Playwright Documentation](https://playwright.dev/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [axe-core Accessibility Testing](https://github.com/dequelabs/axe-core)
- [Luckysheet Documentation](https://mengshukeji.gitee.io/LuckysheetDocs/)

## 🤝 Contributing

When adding new E2E tests:

1. **Use Fixtures**: Import from `../fixtures/spreadsheet.js` or `../fixtures/accessibility.js`
2. **Log Extensively**: Use `e2eLogger` for all test actions and assertions
3. **Follow Naming**: `*.e2e.test.js` for usability, `*.a11y.test.js` for accessibility
4. **Add Documentation**: Update this README with new test descriptions
5. **Check Accessibility**: All new features should have accessibility tests

## 📝 License

Same as parent project (Walsheetz).
