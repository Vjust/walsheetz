import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.e2e\.test\.js$/,
  timeout: 90_000,
  fullyParallel: false,
  // Use the wallet-free fixture across all tests by setting a testMatch alias
  // Each test should import from this path: `import { test, expect } from './fixtures/wallet-free'`
  use: {
    baseURL: process.env.APP_URL || 'http://localhost:3005',
    headless: true,
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
    trace: 'off'
  },
  reporter: 'line'
})
