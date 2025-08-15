import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: '.',
  base: '/',
  
  plugins: [
    legacy({
      targets: ['defaults', 'not IE 11']
    })
  ],
  
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./frontend', import.meta.url)),
      '@components': fileURLToPath(new URL('./frontend/components', import.meta.url)),
      '@utils': fileURLToPath(new URL('./frontend/utils', import.meta.url))
    }
  },
  
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        homepage: fileURLToPath(new URL('./frontend/homepage.html', import.meta.url))
      },
      output: {
        manualChunks: {
          'luckysheet': ['luckysheet'],
          'vendor': ['./frontend/storage.js', './frontend/ui-handlers.js']
        }
      }
    },
    // Optimize for large spreadsheet library
    chunkSizeWarningLimit: 1000,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // Keep console for dev tools
        drop_debugger: true
      }
    }
  },
  
  server: {
    port: 3000,
    host: true,
    open: '/frontend/homepage.html',
    cors: true,
    hmr: {
      overlay: true
    }
  },
  
  optimizeDeps: {
    include: ['luckysheet'],
    exclude: [],
    esbuildOptions: {
      target: 'es2020'
    }
  },
  
  css: {
    devSourcemap: true,
    preprocessorOptions: {
      css: {
        charset: false
      }
    }
  }
});
