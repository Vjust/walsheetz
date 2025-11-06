/**
 * @vitest-environment node
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { BrowserWalrusService } from '@services/walrus/BrowserWalrusService.js'

describe('BrowserWalrusService Degraded Mode', () => {
  let service
  let fetchMock

  beforeEach(() => {
    // Mock environment
    global.process = { env: { NODE_ENV: 'test' } }

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

    // Mock fetch globally
    fetchMock = vi.fn()
    global.fetch = fetchMock

    // Mock configLoader
    vi.mock('../../utils/ConfigLoader.js', () => ({
      configLoader: {
        getConfig: vi.fn().mockResolvedValue({
          getCurrentNetwork: () => ({ walrus: {} }),
          getWalrusServiceBase: vi.fn((service) => {
            if (service === 'publisher') return 'https://publisher.walrus-testnet.walrus.space'
            if (service === 'aggregator') return 'https://aggregator.walrus-testnet.walrus.space'
          })
        })
      }
    }))

    service = new BrowserWalrusService()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should enter degraded mode on CORS-blocked publisher', async () => {
    // Mock CORS failure on publisher
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    // Add pending save before health check
    const testSave = { id: '123', data: 'test' }
    service.pendingSaves.push(testSave)

    // Perform health check
    const healthResult = await service.performHealthCheck(false) // includeAggregator: false

    // Verify degraded mode activated
    expect(service.isDegraded).toBe(true)
    expect(healthResult.degraded).toBe(true)
    expect(healthResult.reason).toBe('cors_blocked')

    // CRITICAL: Save queue should be preserved (not cleared)
    expect(service.pendingSaves).toHaveLength(1)
    expect(service.pendingSaves[0]).toEqual(testSave)
  })

  test('should enter degraded mode on CORS-blocked aggregator', async () => {
    // Mock successful publisher, failed aggregator
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Map()
    })

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    // Add pending saves
    const testSaves = [
      { id: '1', data: 'save1' },
      { id: '2', data: 'save2' }
    ]
    service.pendingSaves.push(...testSaves)

    // Perform health check
    const healthResult = await service.performHealthCheck(true) // includeAggregator: true

    // Verify degraded mode
    expect(service.isDegraded).toBe(true)
    expect(healthResult.degraded).toBe(true)

    // CRITICAL: All pending saves preserved
    expect(service.pendingSaves).toHaveLength(2)
    expect(service.pendingSaves).toEqual(testSaves)
  })

  test('should NOT clear data when CORS-blocked (degraded mode)', async () => {
    // Mock CORS failure
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const clearDataSpy = vi.spyOn(service, 'clearAllData')

    // Perform health check
    await service.performHealthCheck(false)

    // CRITICAL: clearAllData should NOT be called in degraded mode
    expect(clearDataSpy).not.toHaveBeenCalled()
    expect(service.isDegraded).toBe(true)

    clearDataSpy.mockRestore()
  })

  test('should recover from degraded mode when endpoints heal', async () => {
    // Start in degraded mode
    service.isDegraded = true
    service.pendingSaves.push({ id: '1', data: 'queued' })

    // Mock successful health checks
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map()
    })

    // Perform health check - should recover
    const healthResult = await service.performHealthCheck(true)

    // Should exit degraded mode
    expect(service.isDegraded).toBe(false)
    expect(healthResult.isHealthy).toBe(true)

    // Saves still queued for processing
    expect(service.pendingSaves).toHaveLength(1)
  })

  test('should detect CORS error message variations', async () => {
    const corsErrors = [
      new TypeError('Failed to fetch'),
      new Error('CORS policy: No Access-Control-Allow-Origin header'),
      new TypeError('Failed to fetch') // Network errors are detected as CORS if they're TypeErrors with "Failed to fetch"
    ]

    for (const error of corsErrors) {
      fetchMock.mockRejectedValueOnce(error)

      const result = await service.checkPublisherHealth('test-check')

      expect(result.corsBlocked).toBe(true)
      expect(result.available).toBe(false)
    }
  })

  test('should preserve save queue size in degraded mode logs', async () => {
    // Add multiple pending saves
    service.pendingSaves = [
      { id: '1', data: 'a' },
      { id: '2', data: 'b' },
      { id: '3', data: 'c' }
    ]

    // Mock CORS failure
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    // Spy on console to verify message
    const consoleWarnSpy = vi.spyOn(console, 'warn')

    // Perform health check
    await service.performHealthCheck(false)

    // Verify log mentions save queue size (single string log)
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Save queue preserved (3 pending saves)')
    )

    consoleWarnSpy.mockRestore()
  })
})
