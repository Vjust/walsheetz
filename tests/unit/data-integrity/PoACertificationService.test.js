import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { testLogger } from '../../utils/TestLogger.js';
import {
  createMockEventBus,
  createMockLocalStorage,
  createMockBrowserSuiService,
  createMockBrowserWalrusService,
  generateBlobId,
  generateTxDigest,
  waitFor
} from '../../utils/TestHelpers.js';

let mockEventBusInstance;

vi.mock('@dreamlit/walrus', () => ({
  get eventBus() {
    return mockEventBusInstance;
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  },
  LogComponent: {
    UI: 'UI'
  }
}));

describe('PoACertificationService', () => {
  let service;
  let mockBrowserSuiService;
  let mockBrowserWalrusService;

  beforeEach(async () => {
    testLogger.suiteStart('PoACertificationService');

    mockEventBusInstance = createMockEventBus();
    global.localStorage = createMockLocalStorage();
    mockBrowserSuiService = createMockBrowserSuiService();
    mockBrowserWalrusService = createMockBrowserWalrusService();

    const { PoACertificationService } = await import('../../../packages/walrus-sui-core/src/data-integrity/services/PoACertificationService.ts');
    service = new PoACertificationService({
      browserSuiService: mockBrowserSuiService,
      browserWalrusService: mockBrowserWalrusService
    });
  });

  afterEach(() => {
    testLogger.suiteEnd('PoACertificationService', { passed: 0, failed: 0, total: 0, duration: 0 });
    vi.clearAllMocks();
  });

  describe('requestCertification', () => {
    it('should successfully request certification for a blob', async () => {
      const blobId = generateBlobId();
      const txDigest = generateTxDigest();

      mockBrowserSuiService.certifyBlob.mockResolvedValueOnce({
        success: true,
        transactionDigest: txDigest,
        durationDays: 30
      });

      const result = await service.requestCertification(blobId, { durationDays: 30 });

      expect(result.success).toBe(true);
      expect(result.transactionDigest).toBe(txDigest);
      expect(result.status).toBe('completed');
      expect(mockBrowserSuiService.certifyBlob).toHaveBeenCalledWith(blobId, { durationDays: 30 });
    });

    it('should handle certification failure', async () => {
      const blobId = generateBlobId();

      mockBrowserSuiService.certifyBlob.mockResolvedValueOnce({
        success: false,
        error: 'Wallet not connected'
      });

      const result = await service.requestCertification(blobId, { durationDays: 30 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Wallet not connected');
      expect(result.status).toBe('failed');
    });

    it('should prevent duplicate certification requests', async () => {
      const blobId = generateBlobId();

      mockBrowserSuiService.certifyBlob.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { success: true, transactionDigest: generateTxDigest() };
      });

      const [firstResult, secondResult] = await Promise.all([
        service.requestCertification(blobId, { durationDays: 30 }),
        service.requestCertification(blobId, { durationDays: 30 })
      ]);

      expect(firstResult.success).toBe(true);
      expect(secondResult.success).toBe(false);
      expect(secondResult.error).toContain('already in progress');
    });
  });

  describe('checkCertificationStatus', () => {
    it('should check and return certification status', async () => {
      const blobId = generateBlobId();

      mockBrowserWalrusService.getPoACertificate.mockResolvedValueOnce({
        success: true,
        blobId,
        poaStatus: 'certified',
        certificate: {
          blobId,
          expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000
        }
      });

      const result = await service.checkCertificationStatus(blobId);

      expect(result.success).toBe(true);
      expect(result.certified).toBe(true);
      expect(result.poaStatus).toBe('certified');
    });
  });

  describe('startStatusPolling', () => {
    it('should poll until certification is confirmed', async () => {
      const blobId = generateBlobId();
      let pollCount = 0;

      mockBrowserWalrusService.getPoACertificate.mockImplementation(async () => {
        pollCount++;
        if (pollCount < 3) {
          return { success: true, blobId, poaStatus: 'pending', certified: false };
        }
        return {
          success: true,
          blobId,
          poaStatus: 'certified',
          certified: true,
          certificate: { blobId, expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000 }
        };
      });

      service.defaultPollInterval = 100;
      service.startStatusPolling(blobId);

      await waitFor(() => pollCount >= 3, 2000);

      expect(pollCount).toBeGreaterThanOrEqual(3);
      service.stopStatusPolling(blobId);
    });
  });

  describe('getCertificationHistory', () => {
    it('should return certification history for a blob', () => {
      const blobId = generateBlobId();

      service.addToHistory(blobId, {
        action: 'certified',
        timestamp: Date.now(),
        transactionDigest: generateTxDigest()
      });

      service.addToHistory(blobId, {
        action: 'renewed',
        timestamp: Date.now() + 1000,
        transactionDigest: generateTxDigest()
      });

      const history = service.getCertificationHistory(blobId);

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(2);
      expect(history[0].action).toBe('certified');
    });
  });

  describe('certification history tracking', () => {
    it('should track certification history in-memory', () => {
      const blobId = generateBlobId();

      service.addToHistory(blobId, {
        action: 'certified',
        timestamp: Date.now(),
        transactionDigest: generateTxDigest()
      });

      const history = service.getCertificationHistory(blobId);

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(1);
    });
  });
});
