/**
 * PoA Certification Service Unit Tests
 * Comprehensive tests with extensive logging
 */

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

// We'll mock the imports
vi.mock('@/sdk/shared/utils/EventBus.js', () => {
  const mockBus = createMockEventBus();
  return {
    EventBus: class MockEventBus {
      constructor() {
        return mockBus;
      }
    },
    eventBus: mockBus
  };
});

vi.mock('@/sdk/shared/utils/Logger.js', () => ({
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

// Create shared mock instances for the services
let mockBrowserSuiServiceInstance;
let mockBrowserWalrusServiceInstance;

// Mock the service imports that are dynamically loaded
vi.mock('@/sdk/blockchain-integration/services/BrowserSuiService.js', () => ({
  get browserSuiService() {
    return mockBrowserSuiServiceInstance;
  }
}));

vi.mock('@/walrus/BrowserWalrusService.js', () => ({
  get browserWalrusService() {
    return mockBrowserWalrusServiceInstance;
  }
}));

describe('PoACertificationService', () => {
  let service;
  let mockEventBus;
  let mockLocalStorage;
  let mockBrowserSuiService;
  let mockBrowserWalrusService;

  beforeEach(async () => {
    testLogger.suiteStart('PoACertificationService');

    // Setup mocks
    testLogger.setup('Creating mocks...');

    mockEventBus = createMockEventBus();
    mockLocalStorage = createMockLocalStorage();

    // Create new mock instances for each test
    mockBrowserSuiServiceInstance = createMockBrowserSuiService();
    mockBrowserWalrusServiceInstance = createMockBrowserWalrusService();

    mockBrowserSuiService = mockBrowserSuiServiceInstance;
    mockBrowserWalrusService = mockBrowserWalrusServiceInstance;

    // Mock global localStorage
    global.localStorage = mockLocalStorage;

    testLogger.success('Mocks created successfully');

    // Import service dynamically after mocks are set up
    const { PoACertificationService } = await import('@/sdk/data-integrity/services/PoACertificationService.js');
    service = new PoACertificationService();
  });

  afterEach(() => {
    testLogger.suiteEnd('PoACertificationService', {
      passed: 0,
      failed: 0,
      total: 0,
      duration: 0
    });

    vi.clearAllMocks();
  });

  describe('requestCertification', () => {
    it('should successfully request certification for a blob', async () => {
      const testId = testLogger.testStart('should successfully request certification for a blob');

      try {
        // Arrange
        testLogger.setup('Preparing test data...');
        const blobId = generateBlobId();
        const options = { durationDays: 30 };
        const txDigest = generateTxDigest();

        testLogger.debug('Test data', { blobId, options, txDigest });

        mockBrowserSuiService.certifyBlob.mockResolvedValueOnce({
          success: true,
          transactionDigest: txDigest,
          durationDays: 30
        });

        // Act
        testLogger.execute('service.requestCertification', { blobId, options });
        const result = await service.requestCertification(blobId, options);

        testLogger.result('Certification result', result);

        // Assert
        testLogger.assertion(result.success === true, 'result.success === true');
        expect(result.success).toBe(true);

        testLogger.assertion(result.transactionDigest === txDigest, `result.transactionDigest === ${txDigest}`);
        expect(result.transactionDigest).toBe(txDigest);

        testLogger.assertion(result.status === 'completed', "result.status === 'completed'");
        expect(result.status).toBe('completed');

        // Verify service called correctly
        testLogger.assertion(mockBrowserSuiService.certifyBlob.mock.calls.length === 1, 'certifyBlob called once');
        expect(mockBrowserSuiService.certifyBlob).toHaveBeenCalledWith(blobId, options);

        testLogger.testPass('should successfully request certification for a blob');
      } catch (error) {
        testLogger.testFail('should successfully request certification for a blob', error, {
          blobId: 'test-blob-id',
          mockCalls: mockBrowserSuiService.certifyBlob.mock.calls
        });
        throw error;
      }
    });

    it('should handle certification failure', async () => {
      const testId = testLogger.testStart('should handle certification failure');

      try {
        // Arrange
        testLogger.setup('Preparing test data for failure scenario...');
        const blobId = generateBlobId();
        const options = { durationDays: 30 };
        const errorMessage = 'Wallet not connected';

        mockBrowserSuiService.certifyBlob.mockResolvedValueOnce({
          success: false,
          error: errorMessage
        });

        // Act
        testLogger.execute('service.requestCertification (expected to fail)', { blobId, options });
        const result = await service.requestCertification(blobId, options);

        testLogger.result('Certification result (failure)', result);

        // Assert
        testLogger.assertion(result.success === false, 'result.success === false');
        expect(result.success).toBe(false);

        testLogger.assertion(result.error === errorMessage, `result.error === '${errorMessage}'`);
        expect(result.error).toBe(errorMessage);

        testLogger.assertion(result.status === 'failed', "result.status === 'failed'");
        expect(result.status).toBe('failed');

        testLogger.testPass('should handle certification failure');
      } catch (error) {
        testLogger.testFail('should handle certification failure', error, {
          mockResponse: { success: false, error: 'Wallet not connected' }
        });
        throw error;
      }
    });

    it('should prevent duplicate certification requests', async () => {
      const testId = testLogger.testStart('should prevent duplicate certification requests');

      try {
        // Arrange
        testLogger.setup('Setting up duplicate request scenario...');
        const blobId = generateBlobId();
        const options = { durationDays: 30 };

        mockBrowserSuiService.certifyBlob.mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return { success: true, transactionDigest: generateTxDigest() };
        });

        // Act
        testLogger.execute('First certification request', { blobId });
        const firstRequest = service.requestCertification(blobId, options);

        testLogger.execute('Second certification request (should be rejected)', { blobId });
        const secondRequest = service.requestCertification(blobId, options);

        const [firstResult, secondResult] = await Promise.all([firstRequest, secondRequest]);

        testLogger.result('First request result', firstResult);
        testLogger.result('Second request result', secondResult);

        // Assert
        testLogger.assertion(firstResult.success === true, 'First request succeeded');
        expect(firstResult.success).toBe(true);

        testLogger.assertion(secondResult.success === false, 'Second request failed');
        expect(secondResult.success).toBe(false);

        testLogger.assertion(
          secondResult.error?.includes('already in progress'),
          'Error message indicates duplicate'
        );
        expect(secondResult.error).toContain('already in progress');

        testLogger.testPass('should prevent duplicate certification requests');
      } catch (error) {
        testLogger.testFail('should prevent duplicate certification requests', error);
        throw error;
      }
    });
  });

  describe('checkCertificationStatus', () => {
    it('should check and return certification status', async () => {
      const testId = testLogger.testStart('should check and return certification status');

      try {
        // Arrange
        testLogger.setup('Preparing status check test...');
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

        // Act
        testLogger.execute('service.checkCertificationStatus', { blobId });
        const result = await service.checkCertificationStatus(blobId);

        testLogger.result('Status check result', result);

        // Assert
        testLogger.assertion(result.success === true, 'result.success === true');
        expect(result.success).toBe(true);

        testLogger.assertion(result.certified === true, 'result.certified === true');
        expect(result.certified).toBe(true);

        testLogger.assertion(result.poaStatus === 'certified', "result.poaStatus === 'certified'");
        expect(result.poaStatus).toBe('certified');

        testLogger.testPass('should check and return certification status');
      } catch (error) {
        testLogger.testFail('should check and return certification status', error);
        throw error;
      }
    });
  });

  describe('startStatusPolling', () => {
    it('should poll until certification is confirmed', async () => {
      const testId = testLogger.testStart('should poll until certification is confirmed');

      try {
        // Arrange
        testLogger.setup('Setting up polling test...');
        const blobId = generateBlobId();
        let pollCount = 0;

        // First 2 polls return pending, third returns certified
        mockBrowserWalrusService.getPoACertificate.mockImplementation(async () => {
          pollCount++;
          testLogger.debug(`Poll attempt #${pollCount}`);

          if (pollCount < 3) {
            return {
              success: true,
              blobId,
              poaStatus: 'pending',
              certified: false
            };
          }

          return {
            success: true,
            blobId,
            poaStatus: 'certified',
            certified: true,
            certificate: { blobId, expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000 }
          };
        });

        // Set a shorter poll interval for testing
        service.defaultPollInterval = 100;

        // Act
        testLogger.execute('service.startStatusPolling', { blobId });
        service.startStatusPolling(blobId);

        // Wait for polling to complete
        await waitFor(() => pollCount >= 3, 2000);

        testLogger.debug(`Total polls: ${pollCount}`);

        // Assert
        testLogger.assertion(pollCount >= 3, 'Polled at least 3 times');
        expect(pollCount).toBeGreaterThanOrEqual(3);

        testLogger.testPass('should poll until certification is confirmed');
      } catch (error) {
        testLogger.testFail('should poll until certification is confirmed', error, {
          pollCount: 0
        });
        throw error;
      } finally {
        // Cleanup
        service.stopStatusPolling(generateBlobId());
      }
    });
  });

  describe('getCertificationHistory', () => {
    it('should return certification history for a blob', async () => {
      const testId = testLogger.testStart('should return certification history for a blob');

      try {
        // Arrange
        testLogger.setup('Adding history entries...');
        const blobId = generateBlobId();

        // Add some history
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

        // Act
        testLogger.execute('service.getCertificationHistory', { blobId });
        const history = service.getCertificationHistory(blobId);

        testLogger.result('History entries', { count: history.length });

        // Assert
        testLogger.assertion(Array.isArray(history), 'History is an array');
        expect(Array.isArray(history)).toBe(true);

        testLogger.assertion(history.length === 2, 'History has 2 entries');
        expect(history.length).toBe(2);

        testLogger.assertion(history[0].action === 'certified', "First entry action is 'certified'");
        expect(history[0].action).toBe('certified');

        testLogger.testPass('should return certification history for a blob');
      } catch (error) {
        testLogger.testFail('should return certification history for a blob', error);
        throw error;
      }
    });
  });

  describe('certification history tracking', () => {
    it('should track certification history in-memory (RAM-only mode)', async () => {
      const testId = testLogger.testStart('should track certification history in-memory');

      try {
        // Arrange
        testLogger.setup('Adding history entry...');
        const blobId = generateBlobId();

        // Act
        testLogger.execute('service.addToHistory', { blobId });
        service.addToHistory(blobId, {
          action: 'certified',
          timestamp: Date.now(),
          transactionDigest: generateTxDigest()
        });

        // Assert
        testLogger.assertion(true, 'addToHistory completed without error');

        // Verify history is tracked in memory
        const history = service.getCertificationHistory(blobId);
        testLogger.debug('History entries', { count: history.length });

        testLogger.assertion(
          Array.isArray(history),
          'history is an array'
        );
        expect(Array.isArray(history)).toBe(true);

        testLogger.assertion(
          history.length === 1,
          'one history entry exists'
        );
        expect(history.length).toBe(1);

        testLogger.testPass('should track certification history in-memory');
      } catch (error) {
        testLogger.testFail('should track certification history in-memory', error);
        throw error;
      }
    });
  });
});
