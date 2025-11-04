import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    node: 'src/node.ts',
  },
  format: ['esm'],
  dts: false, // Disable for now - will add types incrementally
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
  minify: false,
});
