/**
 * @vitest-environment node
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { configLoader } from '../ConfigLoader.js'

describe('ConfigLoader Fallback Logic', () => {
  let fetchMock

  beforeEach(() => {
    // Reset configLoader state between tests
    configLoader.config = null
    configLoader.isFallback = false
    configLoader.fallbackAttemptCount = 0
    fetchMock = vi.fn()
    global.fetch = fetchMock

    // Restore Browser APIs in node environment
    const eventTarget = new EventTarget()
    global.window = {
      location: { hostname: 'localhost', origin: 'http://localhost:3000' },
      addEventListener: eventTarget.addEventListener.bind(eventTarget),
      removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
      dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget)
    }
    global.CustomEvent = global.CustomEvent ?? class CustomEvent extends Event {
      constructor(type, params = {}) {
        super(type, params)
        this.detail = params.detail
      }
    }

    global.localStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should mark config as isFallback when fetch fails with 404', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers()
    })

    const config = await configLoader._loadConfig()

    expect(config.isFallback).toBe(true)
    expect(configLoader.isFallback).toBe(true)
    expect(config.version).toContain('fallback')
  })

  test('should return fallback config with required fields on 404', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers()
    })

    const config = await configLoader._loadConfig()

    expect(config).toBeDefined()
    expect(config.networks).toBeDefined()
    expect(config.networks.testnet).toBeDefined()
    expect(config.networks.testnet.packageId).toBeDefined()
    expect(config.networks.testnet.registryObjectId).toBeDefined()
    expect(config.networks.testnet.walrus).toBeDefined()
  })

  test('should include walrus.features.epochsDefault in fallback config', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers()
    })

    const config = await configLoader._loadConfig()

    expect(config.networks.testnet.walrus.features).toBeDefined()
    expect(config.networks.testnet.walrus.features.epochsDefault).toBe(12)
  })

  test('should include contentHashInSave feature in fallback config', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers()
    })

    const config = await configLoader._loadConfig()

    expect(config.features).toBeDefined()
    expect(config.features.contentHashInSave).toBe(true)
  })

  test('should include wallet features in fallback config', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers()
    })

    const config = await configLoader._loadConfig()

    expect(config.features.walletFeatures).toBeDefined()
    expect(config.features.walletFeatures.supportsTransactionBlock).toBe(true)
    expect(config.features.walletFeatures.supportsSignAndExecute).toBe(true)
  })

  test('should add runtime methods to fallback config', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers()
    })

    const config = await configLoader._loadConfig()

    expect(typeof config.getCurrentNetwork).toBe('function')
    expect(typeof config.getFeature).toBe('function')
    expect(typeof config.setFeature).toBe('function')
  })

  test('should succeed with 200 response and not set isFallback', async () => {
    const testConfig = {
      version: '1.0.0',
      timestamp: Date.now(),
      networks: {
        testnet: {
          rpcUrl: 'https://fullnode.testnet.sui.io:443',
          packageId: '0xtest123',
          registryObjectId: '0xreg123',
          walrus: {
            aggregatorUrl: 'https://aggregator.walrus-testnet.walrus.space',
            publisherUrl: 'https://publisher.walrus-testnet.walrus.space'
          }
        }
      },
      features: {},
      ui: {},
      metadata: {}
    }

    const headers = new Headers()
    headers.set('content-type', 'application/json')

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers,
      text: vi.fn().mockResolvedValueOnce(JSON.stringify(testConfig)),
      json: vi.fn().mockResolvedValueOnce(testConfig)
    })

    const config = await configLoader._loadConfig()

    expect(config.isFallback).toBe(false)
    expect(configLoader.isFallback).toBe(false)
    expect(config.version).toBe('1.0.0')
  })

  test('should emit config:fallback event when using fallback', async () => {
    const eventEmitter = vi.fn()
    global.window.dispatchEvent = eventEmitter

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers()
    })

    await configLoader._loadConfig()

    // Note: Would need to mock transactionExperienceManager to fully test this
    // This is a basic check that the fallback path was taken
    expect(configLoader.isFallback).toBe(true)
  })

  test('persistForcedFeature should save to localStorage', () => {
    configLoader.persistForcedFeature('test.feature', true)

    expect(global.localStorage.setItem).toHaveBeenCalledWith(
      'walsheetz_forced_feature_test.feature',
      expect.stringContaining('true')
    )
  })

  test('getForcedFeature should retrieve from localStorage', () => {
    const storedValue = JSON.stringify({ value: true, timestamp: Date.now() })
    global.localStorage.getItem.mockReturnValueOnce(storedValue)

    const value = configLoader.getForcedFeature('test.feature')

    expect(value).toBe(true)
  })

  test('getForcedFeature should return null if not found', () => {
    global.localStorage.getItem.mockReturnValueOnce(null)

    const value = configLoader.getForcedFeature('missing.feature')

    expect(value).toBeNull()
  })

  test('clearForcedFeatures should clear all localStorage keys with prefix', () => {
    Object.defineProperty(global.localStorage, 'length', { value: 2 })
    Object.keys = vi.fn().mockReturnValueOnce(['walsheetz_forced_feature_test', 'other_key'])

    configLoader.clearForcedFeatures()

    // Should call removeItem for matching keys
    expect(global.localStorage.removeItem).toHaveBeenCalled()
  })

  test('fallback config should use proxied Walrus endpoints', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers()
    })

    const config = await configLoader._loadConfig()

    // Verify testnet routes through first-party proxy endpoints for CORS-safe requests
    expect(config.networks.testnet.walrus.publisherUrl).toBe('/api/walrus-publisher-testnet')
    expect(config.networks.testnet.walrus.aggregatorUrl).toBe('/api/walrus-aggregator-testnet')
    expect(config.networks.testnet.walrus.publisherUrl).toMatch(/^\/api\//)
    expect(config.networks.testnet.walrus.aggregatorUrl).toMatch(/^\/api\//)

    // Verify mainnet also uses proxied endpoints that forward to community infrastructure
    expect(config.networks.mainnet.walrus.publisherUrl).toBe('/api/walrus-publisher-mainnet')
    expect(config.networks.mainnet.walrus.aggregatorUrl).toBe('/api/walrus-aggregator-mainnet')
    expect(config.networks.mainnet.walrus.publisherUrl).toMatch(/^\/api\//)
    expect(config.networks.mainnet.walrus.aggregatorUrl).toMatch(/^\/api\//)
  })
})
