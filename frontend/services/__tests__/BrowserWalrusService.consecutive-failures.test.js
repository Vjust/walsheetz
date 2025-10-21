/**
 * @vitest-environment node
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { BrowserWalrusService } from '../BrowserWalrusService.js'

describe('BrowserWalrusService Consecutive Failure Threshold', () => {
  let service
  let fetchMock

  beforeEach(() => {
    // Mock environment
    global.process = { env: { NODE_ENV: 'test' } }
    global.window = {
      location: { hostname: 'localhost', origin: 'http://localhost:3000' }
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

    service = new BrowserWalrusService()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should NOT clear data on single transient failure', async () => {
    // Mock single transient failure
    fetchMock.mockRejectedValueOnce(new Error('Network timeout'))

    const clearDataSpy = vi.spyOn(service, 'clearAllData')

    // Perform health check
    await service.performHealthCheck(false)

    // CRITICAL: clearAllData should NOT be called on first failure
    expect(clearDataSpy).not.toHaveBeenCalled()
    expect(service.healthStatus.consecutiveFailures).toBe(1)

    clearDataSpy.mockRestore()
  })

  test('should NOT clear data on two consecutive failures', async () => {
    const clearDataSpy = vi.spyOn(service, 'clearAllData')

    // First failure
    fetchMock.mockRejectedValueOnce(new Error('Network timeout'))
    await service.performHealthCheck(false)
    expect(clearDataSpy).not.toHaveBeenCalled()
    expect(service.healthStatus.consecutiveFailures).toBe(1)

    // Second failure
    fetchMock.mockRejectedValueOnce(new Error('Network timeout'))
    await service.performHealthCheck(false)
    expect(clearDataSpy).not.toHaveBeenCalled()
    expect(service.healthStatus.consecutiveFailures).toBe(2)

    clearDataSpy.mockRestore()
  })

  test('should clear data only after 3 consecutive failures (threshold)', async () => {
    const clearDataSpy = vi.spyOn(service, 'clearAllData')

    // First failure - no clear
    fetchMock.mockRejectedValueOnce(new Error('Network timeout'))
    await service.performHealthCheck(false)
    expect(clearDataSpy).not.toHaveBeenCalled()

    // Second failure - no clear
    fetchMock.mockRejectedValueOnce(new Error('Network timeout'))
    await service.performHealthCheck(false)
    expect(clearDataSpy).not.toHaveBeenCalled()

    // Third failure - SHOULD clear now
    fetchMock.mockRejectedValueOnce(new Error('Network timeout'))
    await service.performHealthCheck(false)
    expect(clearDataSpy).toHaveBeenCalledTimes(1)
    expect(service.healthStatus.consecutiveFailures).toBe(3)

    clearDataSpy.mockRestore()
  })

  test('should reset failure counter on successful health check', async () => {
    const clearDataSpy = vi.spyOn(service, 'clearAllData')

    // First failure
    fetchMock.mockRejectedValueOnce(new Error('Network timeout'))
    await service.performHealthCheck(false)
    expect(service.healthStatus.consecutiveFailures).toBe(1)

    // Successful health check - counter resets
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Map()
    })
    await service.performHealthCheck(false)
    expect(service.healthStatus.consecutiveFailures).toBe(0)
    expect(clearDataSpy).not.toHaveBeenCalled()

    clearDataSpy.mockRestore()
  })

  test('should recover from threshold and not clear after reset', async () => {
    const clearDataSpy = vi.spyOn(service, 'clearAllData')

    // Get to threshold (3 failures)
    for (let i = 0; i < 3; i++) {
      fetchMock.mockRejectedValueOnce(new Error('Network timeout'))
      await service.performHealthCheck(false)
    }
    expect(clearDataSpy).toHaveBeenCalledTimes(1)
    expect(service.healthStatus.consecutiveFailures).toBe(3)

    // Recovery - successful health check
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Map()
    })
    await service.performHealthCheck(false)
    expect(service.healthStatus.consecutiveFailures).toBe(0)

    // Another failure after recovery - should NOT clear (back to 1)
    fetchMock.mockRejectedValueOnce(new Error('Network timeout'))
    await service.performHealthCheck(false)
    expect(clearDataSpy).toHaveBeenCalledTimes(1)  // Still just 1 call total
    expect(service.healthStatus.consecutiveFailures).toBe(1)

    clearDataSpy.mockRestore()
  })

  test('should preserve pending saves during transient failures', async () => {
    const testSaves = [
      { id: '1', data: 'save1' },
      { id: '2', data: 'save2' }
    ]
    service.pendingSaves.push(...testSaves)

    // Transient failure (should NOT clear saves)
    fetchMock.mockRejectedValueOnce(new Error('Network timeout'))
    await service.performHealthCheck(false)

    // Saves should still be there
    expect(service.pendingSaves).toHaveLength(2)
    expect(service.pendingSaves).toEqual(testSaves)
  })

  test('should log transient vs persistent failures differently', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn')

    // First transient failure
    fetchMock.mockRejectedValueOnce(new Error('Network timeout'))
    await service.performHealthCheck(false)

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Transient health failure'),
      expect.any(Object)
    )

    // Two more failures to reach threshold
    for (let i = 0; i < 2; i++) {
      fetchMock.mockRejectedValueOnce(new Error('Network timeout'))
      await service.performHealthCheck(false)
    }

    // Last log should be about persistent failures
    const lastCall = consoleWarnSpy.mock.calls[consoleWarnSpy.mock.calls.length - 1]
    expect(lastCall[0]).toContain('Persistent health failures detected')

    consoleWarnSpy.mockRestore()
  })
})
