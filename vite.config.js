import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'url'

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
    // Custom alias resolver for scripts directory
    {
      name: 'resolve-scripts-alias',
      resolveId(source) {
        if (source.startsWith('@scripts/')) {
          const scriptPath = source.replace('@scripts/', './scripts/');
          return this.resolve(scriptPath, undefined, { skipSelf: true });
        }
        return null;
      }
    },
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
    strictPort: true,
    host: '0.0.0.0',
    watch: {
      ignored: ['**/Sui Ref/*', '**/protos/*', '**/tmp-vite/*']
    },
    fs: {
      strict: true,
      allow: [
        fileURLToPath(new URL('./src', import.meta.url)),
        fileURLToPath(new URL('./web', import.meta.url)),
        fileURLToPath(new URL('./frontend', import.meta.url)),
        fileURLToPath(new URL('./blockchain', import.meta.url)),
        fileURLToPath(new URL('./scripts', import.meta.url)),
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
      // IMPORTANT: Target must match app-config.json walrus.publisherUrl to ensure
      // the proxy can strip/normalize any CORS headers from the remote endpoint
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
      // IMPORTANT: Target must match app-config.json walrus.aggregatorUrl to ensure
      // the proxy can strip/normalize any CORS headers from the remote endpoint
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

      // Walrus Publisher - Mainnet
      '/walrus-publisher-mainnet': {
        target: 'https://walrus-mainnet-publisher-1.staketab.org',
        changeOrigin: true,
        secure: true,
        timeout: 45000,
        rewrite: (path) => path.replace(/^\/walrus-publisher-mainnet/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Accept', 'application/json');
            proxyReq.setHeader('User-Agent', 'WalSheetz/1.0.0');
          });
          if (VERBOSE_PROXY) {
            proxy.on('proxyRes', (proxyRes, req) => {
              console.log(`[Vite Proxy] Walrus Publisher Mainnet response: ${proxyRes.statusCode} for ${req.url}`);
            });
          }
        }
      },

      // Walrus Aggregator - Mainnet
      '/walrus-aggregator-mainnet': {
        target: 'https://aggregator.walrus.space',
        changeOrigin: true,
        secure: true,
        timeout: 30000,
        rewrite: (path) => path.replace(/^\/walrus-aggregator-mainnet/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Accept', 'application/json');
            proxyReq.setHeader('User-Agent', 'WalSheetz/1.0.0');
          });
          if (VERBOSE_PROXY) {
            proxy.on('proxyRes', (proxyRes, req) => {
              console.log(`[Vite Proxy] Walrus Aggregator Mainnet response: ${proxyRes.statusCode} for ${req.url}`);
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
      // @dreamlit/* package aliases - resolve to source for dev
      '@dreamlit/walrus-sui-core/blockchain-integration': fileURLToPath(new URL('./packages/walrus-sui-core/src/blockchain-integration/index.ts', import.meta.url)),
      '@dreamlit/walrus-sui-core/blockchain': fileURLToPath(new URL('./packages/walrus-sui-core/src/blockchain/index.ts', import.meta.url)),
      '@dreamlit/walrus-sui-core/transaction': fileURLToPath(new URL('./packages/walrus-sui-core/src/transaction-management/index.ts', import.meta.url)),
      '@dreamlit/walrus-sui-core/data-integrity': fileURLToPath(new URL('./packages/walrus-sui-core/src/data-integrity/index.ts', import.meta.url)),
      '@dreamlit/walrus-sui-core': fileURLToPath(new URL('./packages/walrus-sui-core/src/index.ts', import.meta.url)),
      '@dreamlit/walrus': fileURLToPath(new URL('./packages/walrus/src/index.ts', import.meta.url)),
      '@dreamlit/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
      // App aliases
      '@/walrus': fileURLToPath(new URL('./src/walrus', import.meta.url)),
      '@/sdk': fileURLToPath(new URL('./src/sdk', import.meta.url)),
      '@/web': fileURLToPath(new URL('./web', import.meta.url)),
      '@/blockchain': fileURLToPath(new URL('./blockchain', import.meta.url)),
      '@': fileURLToPath(new URL('./frontend', import.meta.url)),
      '@app': fileURLToPath(new URL('./frontend/app', import.meta.url)),
      '@features': fileURLToPath(new URL('./frontend/features', import.meta.url)),
      '@services': fileURLToPath(new URL('./frontend/services', import.meta.url)),
      '@shared': fileURLToPath(new URL('./frontend/shared', import.meta.url)),
      '@utils': fileURLToPath(new URL('./frontend/utils', import.meta.url)),
      '@adapters': fileURLToPath(new URL('./frontend/adapters', import.meta.url)),
      '@interfaces': fileURLToPath(new URL('./frontend/interfaces', import.meta.url)),
      '@types': fileURLToPath(new URL('./frontend/types', import.meta.url)),
      '@blockchain': fileURLToPath(new URL('./blockchain/src', import.meta.url)),
      '@scripts': fileURLToPath(new URL('./scripts', import.meta.url)),
      '@sentry/nextjs': fileURLToPath(new URL('./frontend/services/infrastructure/SentryStub.js', import.meta.url))
    },
    // Ensure .js extensions are resolved properly
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json']
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
    },
    rollupOptions: {
      external: [],
      output: {
        manualChunks: undefined
      }
    },
    // Enable source maps for debugging module issues
    sourcemap: 'hidden',
    // Ensure blockchain directory is accessible during build
    outDir: 'dist',
    emptyOutDir: true
  },
  ssr: {
    noExternal: ['@sentry/nextjs']
  }
})