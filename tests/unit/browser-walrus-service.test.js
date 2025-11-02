import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserWalrusService } from '@/walrus/BrowserWalrusService.js';

// Mock the dependencies
vi.mock('@/sdk/shared/utils/ConfigLoader.js', () => ({
  configLoader: {
    getConfig: vi.fn()
  }
}));

vi.mock('@/walrus/config/WalrusConfigResolver.js', () => ({
  resolveWalrusEndpoints: vi.fn(() => ({
    publisherUrl: 'http://localhost:8080',
    aggregatorUrl: 'http://localhost:9000'
  }))
}));

vi.mock('@/blockchain/config.js', () => ({
  getCurrentConfig: () => ({
    walrus: {
      publisherUrl: 'http://localhost:8080',
      aggregatorUrl: 'http://localhost:9000',
      features: {}
    },
    sui: {
      graphqlUrl: 'http://localhost:8080/graphql'
    }
  })
}));

describe('BrowserWalrusService', () => {
  let service;
  let mockFetch;
  let originalNodeEnv;

  beforeEach(() => {
    // Save original NODE_ENV
    originalNodeEnv = process.env.NODE_ENV;
    // Override NODE_ENV to not be 'test' for connect tests
    process.env.NODE_ENV = 'vitest-unit';

    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock console methods to avoid noise during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    service = new BrowserWalrusService();
  });

  afterEach(() => {
    // Restore NODE_ENV
    process.env.NODE_ENV = originalNodeEnv;
    vi.clearAllMocks();
  });

  describe('connect', () => {
    // TODO: Update these tests after Walrus service migration completes
    it.skip('should return true when connection is successful', async () => {
      // Mock configLoader.getConfig()
      const { configLoader } = await import('@/sdk/shared/utils/ConfigLoader.js');
      configLoader.getConfig.mockResolvedValueOnce({
        resolveHealthyServiceUrl: vi.fn().mockResolvedValue('http://localhost:8080'),
        getWalrusServiceBase: vi.fn().mockReturnValue('http://localhost:8080')
      });

      // Mock successful health check response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'healthy' })
      });

      const result = await service.connect();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/api'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.any(Object)
        })
      );
    });

    it('should handle connection failure gracefully', async () => {
      // Mock configLoader.getConfig()
      const { configLoader } = await import('@/sdk/shared/utils/ConfigLoader.js');
      configLoader.getConfig.mockResolvedValueOnce({
        resolveHealthyServiceUrl: vi.fn().mockResolvedValue('http://localhost:8080'),
        getWalrusServiceBase: vi.fn().mockReturnValue('http://localhost:8080')
      });

      // Mock failed fetch
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.connect();

      expect(result).toBe(false);
    });

    it('should handle non-200 response gracefully', async () => {
      // Mock configLoader.getConfig()
      const { configLoader } = await import('@/sdk/shared/utils/ConfigLoader.js');
      configLoader.getConfig.mockResolvedValueOnce({
        resolveHealthyServiceUrl: vi.fn().mockResolvedValue('http://localhost:8080'),
        getWalrusServiceBase: vi.fn().mockReturnValue('http://localhost:8080')
      });

      // Mock non-OK response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable'
      });

      const result = await service.connect();

      expect(result).toBe(false);
    });

    it.skip('should emit operation events during connection', async () => {
      // Mock configLoader.getConfig()
      const { configLoader } = await import('@/sdk/shared/utils/ConfigLoader.js');
      configLoader.getConfig.mockResolvedValueOnce({
        resolveHealthyServiceUrl: vi.fn().mockResolvedValue('http://localhost:8080'),
        getWalrusServiceBase: vi.fn().mockReturnValue('http://localhost:8080')
      });

      const eventSpy = vi.spyOn(service, 'emitOperationEvent');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'healthy' })
      });

      await service.connect();

      // Should emit at least one operation event
      expect(eventSpy).toHaveBeenCalled();
    });
  });
});