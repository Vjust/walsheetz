import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserWalrusService } from '../../frontend/services/BrowserWalrusService.js';

describe('BrowserWalrusService', () => {
  let service;
  let mockFetch;

  beforeEach(() => {
    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock console methods to avoid noise during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    service = new BrowserWalrusService();
  });

  describe('connect', () => {
    it('should return true when connection is successful', async () => {
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
      // Mock failed fetch
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.connect();

      expect(result).toBe(false);
    });

    it('should handle non-200 response gracefully', async () => {
      // Mock non-OK response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable'
      });

      const result = await service.connect();

      expect(result).toBe(false);
    });

    it('should emit operation events during connection', async () => {
      const eventSpy = vi.spyOn(service, 'emit');

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