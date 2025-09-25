import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'url'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3005,
    host: '0.0.0.0'
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