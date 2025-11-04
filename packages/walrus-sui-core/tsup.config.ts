import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'node/index': 'src/node/index.ts',
    'browser/index': 'src/browser/index.ts',
    'blockchain/index': 'src/blockchain/index.ts',
    'blockchain-integration/index': 'src/blockchain-integration/index.ts',
    'transaction-management/index': 'src/transaction-management/index.ts',
    'data-integrity/index': 'src/data-integrity/index.ts',
  },
  format: ['esm'],
  dts: false, // Disable for now - will add types incrementally
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
  minify: false,
  external: ['@dreamlit/walrus', '@dreamlit/shared', 'undici'],
});
