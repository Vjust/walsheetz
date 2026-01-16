import { defineWorkspace } from 'vitest/config'

/**
 * Vitest workspace configuration for monorepo
 *
 * This configuration automatically discovers and runs tests across all packages
 * in the monorepo. Each package can have its own vitest.config.ts for
 * package-specific settings.
 */
export default defineWorkspace([
  // Root project (tests/ + frontend)
  'vitest.config.js',

  // Auto-discover all packages
  'packages/*',

  // Future: apps can also have tests
  // 'apps/*',
])
