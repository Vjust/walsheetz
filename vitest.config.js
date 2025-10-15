import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'url'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.js'],

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
        '**/*.test.js',
        '**/*.config.js',
        '**/dist/**',
        '**/build/**'
      ],
      include: [
        'frontend/services/**/*.js',
        'blockchain/**/*.js'
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
    logHeapUsage: true,
    silent: false
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./frontend', import.meta.url)),
      '@blockchain': fileURLToPath(new URL('./blockchain', import.meta.url))
    }
  },
  define: {
    global: 'globalThis'
  }
})