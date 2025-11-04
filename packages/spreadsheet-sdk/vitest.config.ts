import path from 'node:path'
import url from 'node:url'
import { defineConfig } from 'vitest/config'

const packageDir = path.dirname(url.fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(packageDir, '..', '..')
const projectRoot = path.resolve(workspaceRoot, '..')

export default defineConfig({
  resolve: {
    alias: [
      { find: '@dreamlit/walrus', replacement: path.join(workspaceRoot, 'packages', 'walrus', 'src', 'index.js') },
      { find: '@dreamlit/walrus-sui-core/blockchain', replacement: path.join(workspaceRoot, 'packages', 'walrus-sui-core', 'src', 'blockchain', 'index.js') },
      { find: '@dreamlit/walrus-sui-core/blockchain-integration', replacement: path.join(workspaceRoot, 'packages', 'walrus-sui-core', 'src', 'blockchain-integration', 'index.js') },
      { find: '@dreamlit/walrus-sui-core/dist/blockchain/index.js', replacement: path.join(workspaceRoot, 'packages', 'walrus-sui-core', 'src', 'blockchain', 'index.js') },
      { find: '@dreamlit/walrus-sui-core/dist/blockchain-integration/index.js', replacement: path.join(workspaceRoot, 'packages', 'walrus-sui-core', 'src', 'blockchain-integration', 'index.js') },
      { find: '@dreamlit/walrus-sui-core/transaction', replacement: path.join(workspaceRoot, 'packages', 'walrus-sui-core', 'src', 'transaction-management', 'index.js') },
      { find: '@dreamlit/walrus-sui-core/data-integrity', replacement: path.join(workspaceRoot, 'packages', 'walrus-sui-core', 'src', 'data-integrity', 'index.js') },
      { find: '@dreamlit/walrus-sui-core', replacement: path.join(workspaceRoot, 'packages', 'walrus-sui-core', 'src', 'index.js') },
      { find: '@dreamlit/spreadsheet-sdk', replacement: path.join(packageDir, 'src', 'index.js') },
      { find: '@/sdk', replacement: path.join(workspaceRoot, 'packages', 'walrus-sui-core', 'src') },
      { find: '@/sdk/', replacement: path.join(workspaceRoot, 'packages', 'walrus-sui-core', 'src') + path.sep },
      { find: '@/blockchain', replacement: path.join(workspaceRoot, 'packages', 'walrus-sui-core', 'src', 'blockchain') },
      { find: '@/blockchain/', replacement: path.join(workspaceRoot, 'packages', 'walrus-sui-core', 'src', 'blockchain') + path.sep },
      { find: '@', replacement: path.join(projectRoot, 'frontend') }
    ]
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [path.join(workspaceRoot, 'vitest.setup.ts')]
  }
})
