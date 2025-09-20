import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'url'

export default defineConfig({
  server: {
    port: 3026,
    host: '127.0.0.1',
    strictPort: true
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./frontend', import.meta.url)),
      '@blockchain': fileURLToPath(new URL('./blockchain', import.meta.url))
    }
  },
  define: {
    global: 'globalThis',
    'process.env': {},
    'process.browser': true
  }
})