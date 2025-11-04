import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.js',
    node: 'src/node.js',
  },
  format: ['esm'],
  dts: false, // Disable for now since source is JavaScript
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
});
