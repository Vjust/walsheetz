import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for E2E Testing
 * Comprehensive setup with logging, screenshots, video recording, and multi-browser support
 *
 * Environment Variables:
 * - APP_URL: Base URL for tests (default: http://localhost:3005)
 * - E2E_HEADLESS: Run in headless mode (default: true)
 * - E2E_LOG_COLORS: Enable colored logging (default: true)
 * - E2E_LOG_TIMESTAMPS: Enable timestamps in logs (default: true)
 * - E2E_LOG_LEVEL: Logging level (debug, verbose, info, warn, error)
 * - UPDATE_SNAPSHOTS: Update visual regression baselines (default: false)
 * - CI: CI environment flag
 */

export default defineConfig({
  // Test directory and file matching
  testDir: './tests/e2e',
  testMatch: /.*\.e2e\.test\.js$/,

  // Global test timeout (90 seconds)
  timeout: 90_000,

  // Don't run tests in parallel to avoid resource conflicts
  fullyParallel: false,

  // Number of times to retry failed tests
  retries: process.env.CI ? 2 : 1,

  // Number of workers (browser instances)
  workers: process.env.CI ? 2 : 1,

  // Reporter configuration
  reporter: [
    // Line reporter for CI/CD
    ['line'],
    // HTML reporter for local development
    ['html', {
      outputFolder: 'tests/e2e/reports/html',
      open: process.env.CI ? 'never' : 'on-failure'
    }],
    // JSON reporter for programmatic analysis
    ['json', {
      outputFile: 'tests/e2e/reports/results.json'
    }],
    // JUnit reporter for CI integration
    ['junit', {
      outputFile: 'tests/e2e/reports/junit.xml'
    }]
  ],

  // Global test configuration
  use: {
    // Base URL for all tests
    baseURL: process.env.APP_URL || 'http://localhost:3005',

    // Browser settings
    headless: process.env.E2E_HEADLESS !== 'false',
    viewport: { width: 1280, height: 800 },

    // Ignore HTTPS errors (useful for local development)
    ignoreHTTPSErrors: true,

    // Screenshot settings
    screenshot: {
      mode: 'only-on-failure',
      fullPage: true
    },

    // Video recording settings
    video: {
      mode: process.env.CI ? 'retain-on-failure' : 'off',
      size: { width: 1280, height: 800 }
    },

    // Trace recording (for debugging)
    trace: process.env.CI ? 'retain-on-failure' : 'off',

    // Action timeout (for individual actions like click, fill, etc.)
    actionTimeout: 10_000,

    // Navigation timeout
    navigationTimeout: 30_000,

    // Locale and timezone
    locale: 'en-US',
    timezoneId: 'America/New_York',

    // Context options
    contextOptions: {
      // Permissions
      permissions: ['clipboard-read', 'clipboard-write'],

      // Geolocation (if needed)
      // geolocation: { longitude: 12.492507, latitude: 41.889938 },

      // Ignore CORS for local development
      bypassCSP: false
    }
  },

  // Output directories
  outputDir: 'tests/e2e/test-results',

  // Global setup/teardown
  // globalSetup: './tests/e2e/setup/global-setup.js',
  // globalTeardown: './tests/e2e/setup/global-teardown.js',

  // Projects for different browsers and configurations
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
          ]
        }
      }
    },

    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
      }
    },

    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
      }
    },

    // Mobile viewports
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
      }
    },

    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 13'],
      }
    },

    // Tablet viewports
    {
      name: 'tablet',
      use: {
        ...devices['iPad Pro'],
      }
    }
  ],

  // Web server configuration for test mode
  webServer: {
    command: 'env VITE_TEST_AUTH_BYPASS=true bun run dev',
    url: 'http://localhost:3005',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      VITE_TEST_AUTH_BYPASS: 'true'
    }
  }
});
