/**
 * @vitest-environment node
 */
import { describe, test, expect } from 'vitest'
import { existsSync } from 'fs'
import { resolve } from 'path'

describe('Config deployment', () => {
  test('app-config.json exists in public directory', () => {
    const configPath = resolve(__dirname, '../../../../public/app-config.json')
    expect(existsSync(configPath)).toBe(true)
  })

  test('app-config.json contains required network configuration', async () => {
    const configPath = resolve(__dirname, '../../../../public/app-config.json')
    const config = JSON.parse(require('fs').readFileSync(configPath, 'utf-8'))

    // Verify networks section exists
    expect(config.networks).toBeDefined()
    expect(config.networks.mainnet).toBeDefined()
    expect(config.networks.testnet).toBeDefined()

    // Verify mainnet has rpcProxy
    expect(config.networks.mainnet.rpcProxy).toBe('/api/sui-rpc-proxy')
    expect(config.networks.testnet.rpcProxy).toBe('/api/sui-rpc-proxy')

    // Verify RPC URLs are defined
    expect(config.networks.mainnet.rpcUrl).toBe('https://fullnode.mainnet.sui.io:443')
    expect(config.networks.testnet.rpcUrl).toBe('https://fullnode.testnet.sui.io:443')
  })
})
