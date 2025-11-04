import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'config/index': 'src/config/index.ts',
    'logging/index': 'src/logging/index.ts',
    'events/index': 'src/events/index.ts',
    'types/index': 'src/types/index.ts',
    'network/index': 'src/network/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  minify: false,
  target: 'es2022',
})
