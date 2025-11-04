import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'components/index': 'src/components/index.ts',
    'business/index': 'src/business/index.ts',
    'services/index': 'src/services/index.ts',
  },
  format: ['esm'],
  dts: false, // Disable for now - will add types incrementally
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
  minify: false,
  external: [
    '@dreamlit/walrus',
    '@dreamlit/walrus-sui-core',
    '@dreamlit/shared',
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@mysten/dapp-kit',
    '@tanstack/react-query',
    'x-data-spreadsheet',
    'luckysheet',
    'luckyexcel',
    'xlsx'
  ],
});
