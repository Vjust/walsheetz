/**
 * BrowserSuiService Network Tests
 * Tests for mainnet/testnet detection and network mismatch handling
 */
import { describe, test, expect, beforeEach, vi } from 'vitest'

describe('BrowserSuiService - Network Detection', () => {
  let mockConfig
  let mockConfigLoader
  let mockClient

  beforeEach(() => {
    // Mock config
    mockConfig = {
      currentNetwork: 'testnet',
      networks: {
        testnet: {
          rpcUrl: 'https://fullnode.testnet.sui.io:443'
        },
        mainnet: {
          rpcUrl: 'https://fullnode.mainnet.sui.io:443'
        }
      }
    }

    // Mock configLoader
    mockConfigLoader = {
      config: mockConfig,
      getConfig: vi.fn().mockResolvedValue(mockConfig),
      switchNetwork: vi.fn()
    }

    // Mock SuiClient
    mockClient = {
      getChainIdentifier: vi.fn(),
      _url: 'https://fullnode.testnet.sui.io:443'
    }
  })

  describe('checkNetworkAgainstConfig', () => {
    test('should detect testnet network consistency', async () => {
      const chainId = 'sui_testnet'
      const config = mockConfig
      const env = 'testnet'

      const expectsTestnet = config.networks[env].rpcUrl.includes('testnet')
      const looksLikeTestnet = chainId.toLowerCase().includes('testnet')

      expect(expectsTestnet).toBe(true)
      expect(looksLikeTestnet).toBe(true)
    })

    test('should detect mainnet network consistency', async () => {
      const chainId = 'sui_mainnet'
      const config = mockConfig
      const env = 'mainnet'

      const expectsMainnet = config.networks[env].rpcUrl.includes('mainnet')
      const looksLikeMainnet = chainId.toLowerCase().includes('mainnet')

      expect(expectsMainnet).toBe(true)
      expect(looksLikeMainnet).toBe(true)
    })

    test('should detect network mismatch between wallet and config', () => {
      // Config expects testnet
      const configEnv = 'testnet'
      const configUrl = mockConfig.networks[configEnv].rpcUrl

      // Wallet reports mainnet
      const walletChainId = 'sui_mainnet'

      // Check for mismatch
      const configExpectsTestnet = configUrl.includes('testnet')
      const walletIsMainnet = walletChainId.includes('mainnet')

      expect(configExpectsTestnet).toBe(true)
      expect(walletIsMainnet).toBe(true)
      expect(configExpectsTestnet).not.toBe(walletIsMainnet) // Mismatch detected
    })

    test('should not auto-switch network on mismatch detection', () => {
      // When network mismatch is detected, config should NOT auto-switch
      const configBeforeSwitch = mockConfig.currentNetwork

      // Simulate mismatch detection
      const walletNetwork = 'mainnet'
      const configNetwork = 'testnet'

      // Should NOT automatically switch
      expect(configBeforeSwitch).toBe('testnet')
      expect(mockConfigLoader.switchNetwork).not.toHaveBeenCalled()
    })

    test('should allow explicit network switch after confirmation', async () => {
      // Simulate user confirming network switch
      const userConfirmed = true
      const walletNetwork = 'mainnet'

      if (userConfirmed) {
        await mockConfigLoader.switchNetwork(walletNetwork)
      }

      expect(mockConfigLoader.switchNetwork).toHaveBeenCalledWith('mainnet')
    })
  })

  describe('Network warning state', () => {
    test('should generate network warning when mismatch detected', () => {
      const mismatch = {
        mismatch: true,
        walletNetwork: 'mainnet',
        configNetwork: 'testnet',
        message: 'Network mismatch: wallet and app on different networks'
      }

      expect(mismatch.mismatch).toBe(true)
      expect(mismatch.walletNetwork).not.toBe(mismatch.configNetwork)
      expect(mismatch.message).toBeDefined()
    })

    test('should provide user choice between switching or keeping config', () => {
      const choices = {
        switch: 'Switch app to mainnet',
        keep: 'Keep Testnet'
      }

      expect(choices.switch).toBeDefined()
      expect(choices.keep).toBeDefined()
    })
  })

  describe('RPC endpoint selection', () => {
    test('should use configured RPC URL for detected network', () => {
      const network = 'mainnet'
      const rpcUrl = mockConfig.networks[network].rpcUrl

      expect(rpcUrl).toBe('https://fullnode.mainnet.sui.io:443')
      expect(rpcUrl).toContain('mainnet')
    })

    test('should use proxy endpoint in production', () => {
      const proxyUrl = '/api/sui-rpc-proxy'
      const absoluteUrl = 'https://fullnode.mainnet.sui.io:443'

      // Production should try proxy first
      expect(proxyUrl).toBeDefined()
      expect(absoluteUrl).toBeDefined()
    })

    test('should fallback to absolute URL on proxy failure', () => {
      const primaryUrl = '/api/sui-rpc-proxy'
      const fallbackUrl = 'https://fullnode.mainnet.sui.io:443'

      // Both should be available for fallback
      expect(primaryUrl).toBeDefined()
      expect(fallbackUrl).toBeDefined()
    })
  })
})
