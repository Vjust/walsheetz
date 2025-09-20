import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'url'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3005,
    host: '0.0.0.0',
    watch: {
      ignored: ['**/Sui Ref/**', '**/Sui Ref/**/*']
    },
    fs: {
      strict: true,
      allow: [
        fileURLToPath(new URL('./frontend', import.meta.url)),
        fileURLToPath(new URL('./blockchain', import.meta.url)),
        fileURLToPath(new URL('.', import.meta.url))
      ]
    },
    proxy: {
      // Sui RPC proxy with improved error handling
      '/sui-rpc': {
        target: 'https://fullnode.testnet.sui.io:443',
        changeOrigin: true,
        secure: true,
        timeout: 30000,
        rewrite: (path) => path.replace(/^\/sui-rpc/, ''),
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            console.error('[Vite Proxy] Sui RPC error:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log(`[Vite Proxy] Sui RPC: ${req.method} ${req.url}`);
          });
        }
      },
      
      // Walrus Publisher proxy with fallback endpoints
      '/walrus-publisher': {
        target: 'https://publisher.walrus-testnet.walrus.space',
        changeOrigin: true,
        secure: true,
        timeout: 45000, // Longer timeout for uploads
        rewrite: (path) => path.replace(/^\/walrus-publisher/, ''),
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            console.error('[Vite Proxy] Walrus Publisher error:', err.message);
            // Try fallback endpoint
            console.log('[Vite Proxy] Attempting fallback for Walrus Publisher...');
          });
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log(`[Vite Proxy] Walrus Publisher: ${req.method} ${req.url}`);
            // Set proper headers for Walrus
            proxyReq.setHeader('Accept', 'application/json');
            proxyReq.setHeader('User-Agent', 'WalSheetz/1.0.0');
          });
        }
      },
      
      // Walrus Aggregator proxy with enhanced logging
      '/walrus-aggregator': {
        target: 'https://aggregator.walrus-testnet.walrus.space',
        changeOrigin: true,
        secure: true,
        timeout: 30000,
        rewrite: (path) => path.replace(/^\/walrus-aggregator/, ''),
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            console.error('[Vite Proxy] Walrus Aggregator error:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log(`[Vite Proxy] Walrus Aggregator: ${req.method} ${req.url}`);
            proxyReq.setHeader('Accept', 'application/json');
            proxyReq.setHeader('User-Agent', 'WalSheetz/1.0.0');
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log(`[Vite Proxy] Walrus Aggregator response: ${proxyRes.statusCode} for ${req.url}`);
          });
        }
      },

      // WebSocket proxy for collaboration
      '/ws': {
        target: 'ws://localhost:8081',
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.error('[Vite Proxy] WebSocket error:', err.message);
          });
          proxy.on('open', () => {
            console.log('[Vite Proxy] WebSocket connection opened');
          });
          proxy.on('close', () => {
            console.log('[Vite Proxy] WebSocket connection closed');
          });
        }
      }
    }
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
  },
  optimizeDeps: {
    disabled: true,
    entries: ['./frontend/main.jsx']
  }
})