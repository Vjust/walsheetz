import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'url'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.{test,spec}.{js,ts,jsx,tsx}'],

    // Exclude E2E tests (they use Playwright instead of vitest)
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/e2e/**'],

    // Enhanced logging and reporting
    reporters: process.env.CI ? ['verbose', 'json'] : ['verbose'],
    outputFile: {
      json: './test-results/test-output.json'
    },

    // Test timeout configuration
    testTimeout: 10000,
    hookTimeout: 10000,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './test-results/coverage',
      exclude: [
        'node_modules/**',
        'tests/**',
        '**/*.test.*',
        '**/*.config.*',
        '**/*.d.ts',
        '**/dist/**',
        '**/build/**'
      ],
      include: [
        'packages/**/src/**',
        'frontend/**'
      ],
      all: true,
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80
    },

    // Parallel execution
    threads: true,
    maxThreads: 4,

    // Watch mode settings
    watch: false,
    watchExclude: ['**/node_modules/**', '**/dist/**'],

    // Logging
    logHeapUsage: false,
    silent: false
  },
  resolve: {
    alias: {
      '@dreamlit/walrus-sui-core/blockchain-integration': fileURLToPath(
        new URL('./packages/walrus-sui-core/src/blockchain-integration/index.ts', import.meta.url)
      ),
      '@dreamlit/walrus-sui-core/blockchain': fileURLToPath(
        new URL('./packages/walrus-sui-core/src/blockchain/index.ts', import.meta.url)
      ),
      '@dreamlit/walrus-sui-core/transaction': fileURLToPath(
        new URL('./packages/walrus-sui-core/src/transaction-management/index.ts', import.meta.url)
      ),
      '@dreamlit/walrus-sui-core/data-integrity': fileURLToPath(
        new URL('./packages/walrus-sui-core/src/data-integrity/index.ts', import.meta.url)
      ),
      '@dreamlit/walrus-sui-core': fileURLToPath(new URL('./packages/walrus-sui-core/src/index.ts', import.meta.url)),
      '@dreamlit/walrus': fileURLToPath(new URL('./packages/walrus/src/index.ts', import.meta.url)),
      '@dreamlit/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./frontend', import.meta.url)),
      '@lib': fileURLToPath(new URL('./frontend/lib', import.meta.url)),
      '@app': fileURLToPath(new URL('./frontend/app', import.meta.url)),
      '@features': fileURLToPath(new URL('./frontend/features', import.meta.url)),
      '@shared': fileURLToPath(new URL('./frontend/shared', import.meta.url)),
      '@scripts': fileURLToPath(new URL('./scripts', import.meta.url))
    }
  },
  define: {
    global: 'globalThis'
  }
})
