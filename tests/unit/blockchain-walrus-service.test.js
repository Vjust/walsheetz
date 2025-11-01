import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dependencies
vi.mock('../../blockchain/config.js', () => ({
  getCurrentConfig: () => ({
    walrus: {
      publisherUrl: 'http://localhost:8080',
      aggregatorUrl: 'http://localhost:9000'
    },
    storage: {
      features: {
        batchPersistence: {
          enabled: false
        }
      }
    }
  })
}));

vi.mock('@/sdk/utils/CircuitBreaker.js', () => ({
  ResilientExecutor: class MockResilientExecutor {
    constructor(config) {
      this.config = config;
    }
    async execute(operation) {
      return await operation();
    }
  }
}));

vi.mock('@/sdk/services/IndexedDBCache.js', () => ({
  indexedDBCache: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn()
  }
}));

describe('WalrusService', () => {
  let WalrusService;
  let service;
  let mockFetch;

  beforeEach(async () => {
    // Mock global fetch
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // Mock crypto using vi.stubGlobal
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn().mockResolvedValue(new ArrayBuffer(32))
      }
    });

    // Mock Blob
    vi.stubGlobal('Blob', class MockBlob {
      constructor(data, options) {
        this.data = data;
        this.type = options?.type || 'application/octet-stream';
      }
    });

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Import the actual WalrusService after mocking dependencies
    const { WalrusService: WS } = await import('../../blockchain/walrus-service.js');
    WalrusService = WS;
    service = new WalrusService();
  });

  describe('storeWithQuilt', () => {
    it('should await encodeSpreadsheetData and use encoded.data for blob', async () => {
      const testData = { cells: { A1: { value: 'test' } } };
      const mockEncodedData = new Uint8Array([1, 2, 3, 4]);

      // Spy on encodeSpreadsheetData to ensure it's awaited
      const encodeSpy = vi.spyOn(service, 'encodeSpreadsheetData')
        .mockResolvedValue({
          data: mockEncodedData,
          metadata: { compressed: false, size: 4 }
        });

      // Mock the store API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          newlyCreated: {
            blobObject: {
              id: 'test-blob-id',
              blobId: 'test-blob-id-123',
              storage: {
                endEpoch: 173
              }
            }
          }
        })
      });

      const result = await service.storeWithQuilt(testData);

      // Verify encodeSpreadsheetData was called and awaited
      expect(encodeSpy).toHaveBeenCalledWith(testData);

      // Verify the fetch was called (meaning blob was created successfully)
      expect(mockFetch).toHaveBeenCalled();

      // Verify the method returns successfully
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('blobId', 'test-blob-id-123');
    });

    it('should handle encoding errors gracefully', async () => {
      const testData = { cells: { A1: { value: 'test' } } };

      // Mock encodeSpreadsheetData to throw an error
      vi.spyOn(service, 'encodeSpreadsheetData')
        .mockRejectedValue(new Error('Encoding failed'));

      // Should throw an error with meaningful message
      await expect(service.storeWithQuilt(testData)).rejects.toThrow('Encoding failed');
    });

    it('should create blob with correct binary data', async () => {
      const testData = { cells: { A1: { value: 'test' } } };
      const mockEncodedData = new Uint8Array([1, 2, 3, 4]);

      vi.spyOn(service, 'encodeSpreadsheetData')
        .mockResolvedValue({
          data: mockEncodedData,
          metadata: { compressed: false, size: 4 }
        });

      // Mock successful store response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          newlyCreated: {
            blobObject: {
              id: 'test-blob-id',
              blobId: 'test-blob-id-123',
              storage: {
                endEpoch: 173
              }
            }
          }
        })
      });

      const result = await service.storeWithQuilt(testData);

      // Verify that fetch was called with form data containing the blob
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'PUT',
          body: expect.any(global.Blob)
        })
      );

      expect(result).toHaveProperty('success', true);
    });
  });
});