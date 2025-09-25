import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'url'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.js']
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