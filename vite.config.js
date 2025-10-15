import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'url'

// Additional configuration for handling CommonJS modules
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

// Conditional proxy logging - set VITE_VERBOSE_PROXY=true for detailed logs
const VERBOSE_PROXY = process.env.VITE_VERBOSE_PROXY === 'true'

export default defineConfig({
  root: '.',
  // Reduce Vite console noise
  logLevel: 'warn',
  // Public assets folder (app-config.json, etc.)
  publicDir: 'public',
  plugins: [
    react(),
    // Production build guard - prevent test mode in production
    {
      name: 'test-mode-guard',
      buildStart() {
        if (process.env.NODE_ENV === 'production' && process.env.VITE_TEST_AUTH_BYPASS === 'true') {
          throw new Error(
            '❌ VITE_TEST_AUTH_BYPASS cannot be enabled in production builds!\n' +
            'Test mode is for development and testing only.\n' +
            'Remove VITE_TEST_AUTH_BYPASS=true from your environment variables.'
          );
        }
      }
    },
    // Dev environment status summary
    {
      name: 'walsheetz-dev-status',
      configureServer(server) {
        server.httpServer?.once('listening', () => {
          setTimeout(() => {
            const port = server.config.server.port || 3005;
            console.log('\n' + '='.repeat(60));
            console.log('✅ WalSheetz Dev Environment Ready');
            console.log('='.repeat(60));
            console.log(`• Vite UI:        http://localhost:${port}`);
            console.log(`• Bridge Server:  http://localhost:8081`);
            console.log(`• Bridge Health:  http://localhost:8081/health`);
            console.log(`• Network:        testnet (Sui + Walrus)`);
            console.log('='.repeat(60) + '\n');
          }, 100); // Slight delay to ensure bridge has started
        });
      }
    }
  ],
  server: {
    port: 3005,
    host: '0.0.0.0',
    watch: {
      ignored: ['**/Sui Ref/*', '**/protos/*', '**/tmp-vite/*']
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
            console.error('[Vite Proxy] Sui RPC error:', typeof err === 'string' ? err : (err && err.message) || 'Unknown error');
          });
          if (VERBOSE_PROXY) {
            proxy.on('proxyReq', (proxyReq, req) => {
              console.log(`[Vite Proxy] Sui RPC: ${req.method} ${req.url}`);
            });
          }
        }
      },
      
      // Walrus Publisher proxy with proper API path handling
      '/walrus-publisher': {
        target: 'https://publisher.walrus-testnet.walrus.space',
        changeOrigin: true,
        secure: true,
        timeout: 45000, // Longer timeout for uploads
        rewrite: (path) => {
          // Handle API endpoints correctly
          if (path === '/walrus-publisher' || path === '/walrus-publisher/') {
            return '/v1/api';
          }
          // For other paths, preserve the structure after /walrus-publisher
          return path.replace(/^\/walrus-publisher/, '');
        },
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            console.error('[Vite Proxy] Walrus Publisher error:', typeof err === 'string' ? err : (err && err.message) || 'Unknown error');
            if (VERBOSE_PROXY) {
              console.log('[Vite Proxy] Attempting fallback for Walrus Publisher...');
            }
          });
          proxy.on('proxyReq', (proxyReq, req) => {
            if (VERBOSE_PROXY) {
              console.log(`[Vite Proxy] Walrus Publisher: ${req.method} ${req.url}`);
            }
            // Set proper headers for Walrus
            proxyReq.setHeader('Accept', 'application/json');
            proxyReq.setHeader('User-Agent', 'WalSheetz/1.0.0');
          });
        }
      },
      
      // Walrus Aggregator proxy with proper API path handling
      '/walrus-aggregator': {
        target: 'https://aggregator.walrus-testnet.walrus.space',
        changeOrigin: true,
        secure: true,
        timeout: 30000,
        rewrite: (path) => {
          // Handle API endpoints correctly
          if (path === '/walrus-aggregator' || path === '/walrus-aggregator/') {
            return '/v1/api';
          }
          // Handle blob requests
          if (path.startsWith('/walrus-aggregator/v1/blobs/')) {
            return path.replace(/^\/walrus-aggregator/, '');
          }
          // For other paths, preserve the structure after /walrus-aggregator
          return path.replace(/^\/walrus-aggregator/, '');
        },
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            console.error('[Vite Proxy] Walrus Aggregator error:', typeof err === 'string' ? err : (err && err.message) || 'Unknown error');
          });
          proxy.on('proxyReq', (proxyReq, req) => {
            if (VERBOSE_PROXY) {
              console.log(`[Vite Proxy] Walrus Aggregator: ${req.method} ${req.url}`);
            }
            proxyReq.setHeader('Accept', 'application/json');
            proxyReq.setHeader('User-Agent', 'WalSheetz/1.0.0');
          });
          if (VERBOSE_PROXY) {
            proxy.on('proxyRes', (proxyRes, req) => {
              console.log(`[Vite Proxy] Walrus Aggregator response: ${proxyRes.statusCode} for ${req.url}`);
            });
          }
        }
      },

      // WebSocket proxy - DISABLED for single-user MVP
      // Collaboration features are not used in the single-user build
      // '/ws': {
      //   target: 'ws://localhost:8081',
      //   ws: true,
      //   changeOrigin: true
      // }
    }
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./frontend', import.meta.url)),
      '@blockchain': fileURLToPath(new URL('./blockchain', import.meta.url)),
      '@scripts': fileURLToPath(new URL('./scripts', import.meta.url)),
      '@sentry/nextjs': fileURLToPath(new URL('./frontend/services/SentryStub.js', import.meta.url))
    }
  },
  define: {
    global: 'globalThis',
    'process.env': {},
    'process.browser': true
  },
  optimizeDeps: {
    entries: ['./frontend/main.jsx'],
    exclude: ['@sentry/nextjs']
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/]
    }
  },
  ssr: {
    noExternal: ['@sentry/nextjs']
  }
})