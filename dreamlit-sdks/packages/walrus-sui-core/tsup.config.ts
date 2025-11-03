import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.js',
    'node/index': 'src/node/index.js',
    'browser/index': 'src/browser/index.js',
    'blockchain/index': 'src/blockchain/index.js',
    'transaction-management/index': 'src/transaction-management/index.js',
    'data-integrity/index': 'src/data-integrity/index.js',
  },
  format: ['esm'],
  dts: false, // Disable for now since source is JavaScript
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['@dreamlit/walrus', 'undici'],
});
