/**
 * Shared Vitest setup file for all packages in the monorepo
 *
 * This file is referenced by package vitest.config.ts files
 * and runs before tests in those packages.
 */

// Configure test environment globals
import { expect } from 'vitest'

// Extend expect matchers if needed
// (currently empty, but available for shared test utilities)

// Set longer timeout for integration tests
if (process.env.TEST_TIMEOUT) {
  const timeout = parseInt(process.env.TEST_TIMEOUT, 10)
  if (!isNaN(timeout)) {
    // Note: Individual test files can override this
    globalThis.__TEST_TIMEOUT__ = timeout
  }
}

// Mock console methods in tests to reduce noise (optional)
if (process.env.TEST_SILENT === 'true') {
  global.console = {
    ...console,
    log: () => {},
    debug: () => {},
    info: () => {},
    // Keep warn and error
  }
}

export {}
