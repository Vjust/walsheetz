import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.js',
    'components/index': 'src/components/index.js',
    'business/index': 'src/business/index.js',
    'services/index': 'src/services/index.js',
  },
  format: ['esm'],
  dts: false, // Disable for now since source is JavaScript
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: [
    '@dreamlit/walrus',
    '@dreamlit/walrus-sui-core',
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@mysten/dapp-kit',
    '@tanstack/react-query',
    'x-data-spreadsheet'
  ],
});
