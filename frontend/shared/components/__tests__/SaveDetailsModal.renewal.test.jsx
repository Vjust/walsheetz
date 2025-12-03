/// <reference types="vitest" />
/// <reference types="@vitest/environment-happy-dom" />
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * SaveDetailsModal Renewal Tests
 *
 * Tests the core renewal functionality:
 * 1. Modal displays renewal button when expiry < 7 days
 * 2. extendBlobStorage is called with correct parameters
 * 3. StorageAdapter is updated after renewal
 * 4. Error handling works correctly
 */

// Import component first
import { SaveDetailsModal } from '@features/spreadsheet/components/SaveDetailsModal.jsx';
// Then import the service to mock it
import { browserWalrusService } from '../../../../packages/walrus/src/browser/BrowserWalrusService.ts';

// Mock BrowserWalrusService methods
const mockExtendBlobStorage = vi.spyOn(browserWalrusService, 'extendBlobStorage');

describe('SaveDetailsModal Renewal', () => {
  let mockStorageAdapter;
  let mockOnExpiryUpdate;
  let mockOnClose;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock implementation for each test
    mockExtendBlobStorage.mockReset();

    // Ensure mock is set to resolve by default
    mockExtendBlobStorage.mockResolvedValue({
      success: true,
      status: 'success',
      endEpoch: 110,
      remainingEpochs: 60,
      additionalEpochs: 10,
      expiryTimestamp: Date.now() + (17 * 24 * 60 * 60 * 1000)
    });

    mockStorageAdapter = {
      setWalrusBlobExpiry: vi.fn(),
      getWalrusBlobExpiry: vi.fn(() => null),
      getAllBlobExpiry: vi.fn(() => ({})),
      isBlobExpiryApproaching: vi.fn(() => false)
    };

    mockOnExpiryUpdate = vi.fn();
    mockOnClose = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createSaveInfo = (daysUntilExpiry = 5) => {
    const now = Date.now();
    return {
      blobId: 'test-blob-123',
      transactionDigest: '0xabc123',
      contentHash: 'hash-content-123',
      storageStatus: 'newly_created',
      expiryTimestamp: now + (daysUntilExpiry * 24 * 60 * 60 * 1000),
      endEpoch: 100,
      method: 'put',
      storageStrategy: 'standard',
      timestamp: now,
      isFirstSave: false
    };
  };

  describe('Renewal Button Display', () => {
    it('should display renewal button when expiry is within 7 days', async () => {
      const saveInfo = createSaveInfo(5); // 5 days = within 7 days

      render(
        <SaveDetailsModal
          isOpen={true}
          onClose={mockOnClose}
          saveInfo={saveInfo}
          network="testnet"
          storageAdapter={mockStorageAdapter}
          onExpiryUpdate={mockOnExpiryUpdate}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Extend Storage/)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('should not display renewal button when expiry is after 7 days', async () => {
      const saveInfo = createSaveInfo(10); // 10 days = after 7 days

      render(
        <SaveDetailsModal
          isOpen={true}
          onClose={mockOnClose}
          saveInfo={saveInfo}
          network="testnet"
          storageAdapter={mockStorageAdapter}
          onExpiryUpdate={mockOnExpiryUpdate}
        />
      );

      // Button should not be visible
      await waitFor(() => {
        expect(screen.queryByText(/Extend Storage/)).not.toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('should display expiry warning when storage expires soon', async () => {
      const saveInfo = createSaveInfo(3); // 3 days

      render(
        <SaveDetailsModal
          isOpen={true}
          onClose={mockOnClose}
          saveInfo={saveInfo}
          network="testnet"
          storageAdapter={mockStorageAdapter}
          onExpiryUpdate={mockOnExpiryUpdate}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Storage Expiring Soon/)).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  describe('Successful Renewal', () => {
    it('should call extendBlobStorage with blobId and epochs', async () => {
      const now = Date.now();
      mockExtendBlobStorage.mockResolvedValue({
        success: true,
        status: 'success',
        endEpoch: 110,
        remainingEpochs: 60,
        additionalEpochs: 10,
        expiryTimestamp: now + (17 * 24 * 60 * 60 * 1000)
      });

      const saveInfo = createSaveInfo(5);

      render(
        <SaveDetailsModal
          isOpen={true}
          onClose={mockOnClose}
          saveInfo={saveInfo}
          network="testnet"
          storageAdapter={mockStorageAdapter}
          onExpiryUpdate={mockOnExpiryUpdate}
        />
      );

      const renewalButton = await screen.findByText(/Extend Storage/, {}, { timeout: 5000 });

      await act(async () => {
        await userEvent.click(renewalButton);
      });

      await waitFor(() => {
        expect(mockExtendBlobStorage).toHaveBeenCalledWith('test-blob-123', 10);
      }, { timeout: 5000 });
    });

    it('should update StorageAdapter with new expiry after renewal', async () => {
      const now = Date.now();
      const newExpiryTimestamp = now + (17 * 24 * 60 * 60 * 1000);
      const newEndEpoch = 110;

      mockExtendBlobStorage.mockResolvedValue({
        success: true,
        status: 'success',
        endEpoch: newEndEpoch,
        remainingEpochs: 60,
        additionalEpochs: 10,
        expiryTimestamp: newExpiryTimestamp
      });

      const saveInfo = createSaveInfo(5);

      render(
        <SaveDetailsModal
          isOpen={true}
          onClose={mockOnClose}
          saveInfo={saveInfo}
          network="testnet"
          storageAdapter={mockStorageAdapter}
          onExpiryUpdate={mockOnExpiryUpdate}
        />
      );

      const renewalButton = await screen.findByText(/Extend Storage/, {}, { timeout: 5000 });

      await act(async () => {
        await userEvent.click(renewalButton);
      });

      await waitFor(() => {
        expect(mockStorageAdapter.setWalrusBlobExpiry).toHaveBeenCalledWith(
          'test-blob-123',
          expect.objectContaining({
            timestamp: newExpiryTimestamp,
            endEpoch: newEndEpoch
          })
        );
      }, { timeout: 5000 });
    });

    it('should call onExpiryUpdate callback after successful renewal', async () => {
      const now = Date.now();
      const newExpiryTimestamp = now + (17 * 24 * 60 * 60 * 1000);
      const newEndEpoch = 110;

      mockExtendBlobStorage.mockResolvedValue({
        success: true,
        status: 'success',
        endEpoch: newEndEpoch,
        remainingEpochs: 60,
        additionalEpochs: 10,
        expiryTimestamp: newExpiryTimestamp
      });

      const saveInfo = createSaveInfo(5);

      render(
        <SaveDetailsModal
          isOpen={true}
          onClose={mockOnClose}
          saveInfo={saveInfo}
          network="testnet"
          storageAdapter={mockStorageAdapter}
          onExpiryUpdate={mockOnExpiryUpdate}
        />
      );

      const renewalButton = await screen.findByText(/Extend Storage/, {}, { timeout: 5000 });

      await act(async () => {
        await userEvent.click(renewalButton);
      });

      await waitFor(() => {
        expect(mockOnExpiryUpdate).toHaveBeenCalledWith({
          expiryTimestamp: newExpiryTimestamp,
          endEpoch: newEndEpoch
        });
      }, { timeout: 5000 });
    });

    it('should emit blob:expiry-extended event after renewal', async () => {
      const now = Date.now();
      const newExpiryTimestamp = now + (17 * 24 * 60 * 60 * 1000);
      const newEndEpoch = 110;

      mockExtendBlobStorage.mockResolvedValue({
        success: true,
        status: 'success',
        endEpoch: newEndEpoch,
        remainingEpochs: 60,
        additionalEpochs: 10,
        expiryTimestamp: newExpiryTimestamp
      });

      const saveInfo = createSaveInfo(5);

      const eventListener = vi.fn();
      window.addEventListener('blob:expiry-extended', eventListener);

      render(
        <SaveDetailsModal
          isOpen={true}
          onClose={mockOnClose}
          saveInfo={saveInfo}
          network="testnet"
          storageAdapter={mockStorageAdapter}
          onExpiryUpdate={mockOnExpiryUpdate}
        />
      );

      const renewalButton = await screen.findByText(/Extend Storage/, {}, { timeout: 5000 });

      await act(async () => {
        await userEvent.click(renewalButton);
      });

      await waitFor(() => {
        expect(eventListener).toHaveBeenCalled();
        const event = eventListener.mock.calls[0][0];
        expect(event.detail).toMatchObject({
          blobId: 'test-blob-123',
          endEpoch: newEndEpoch,
          newExpiry: newExpiryTimestamp
        });
      }, { timeout: 5000 });

      window.removeEventListener('blob:expiry-extended', eventListener);
    });
  });

  describe('Renewal Error Handling', () => {
    it('should display error message when renewal fails', async () => {
      mockExtendBlobStorage.mockResolvedValue({
        success: false,
        error: 'Blob not found on aggregator'
      });

      const saveInfo = createSaveInfo(5);

      render(
        <SaveDetailsModal
          isOpen={true}
          onClose={mockOnClose}
          saveInfo={saveInfo}
          network="testnet"
          storageAdapter={mockStorageAdapter}
          onExpiryUpdate={mockOnExpiryUpdate}
        />
      );

      const renewalButton = await screen.findByText(/Extend Storage/, {}, { timeout: 5000 });

      await act(async () => {
        await userEvent.click(renewalButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/Blob not found on aggregator/)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('should not update StorageAdapter if renewal fails', async () => {
      mockExtendBlobStorage.mockResolvedValue({
        success: false,
        error: 'Network error'
      });

      const saveInfo = createSaveInfo(5);

      render(
        <SaveDetailsModal
          isOpen={true}
          onClose={mockOnClose}
          saveInfo={saveInfo}
          network="testnet"
          storageAdapter={mockStorageAdapter}
          onExpiryUpdate={mockOnExpiryUpdate}
        />
      );

      const renewalButton = await screen.findByText(/Extend Storage/, {}, { timeout: 5000 });

      await act(async () => {
        await userEvent.click(renewalButton);
      });

      await waitFor(() => {
        expect(mockStorageAdapter.setWalrusBlobExpiry).not.toHaveBeenCalled();
      }, { timeout: 5000 });
    });

    it('should handle exception thrown by extendBlobStorage', async () => {
      mockExtendBlobStorage.mockRejectedValue(new Error('Connection timeout'));

      const saveInfo = createSaveInfo(5);

      render(
        <SaveDetailsModal
          isOpen={true}
          onClose={mockOnClose}
          saveInfo={saveInfo}
          network="testnet"
          storageAdapter={mockStorageAdapter}
          onExpiryUpdate={mockOnExpiryUpdate}
        />
      );

      const renewalButton = await screen.findByText(/Extend Storage/, {}, { timeout: 5000 });

      await act(async () => {
        await userEvent.click(renewalButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/Connection timeout/)).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });

  describe('Button State During Renewal', () => {
    it('should disable renewal button while renewal is in progress', async () => {
      let resolveRenewal;
      const renewalPromise = new Promise(resolve => {
        resolveRenewal = resolve;
      });

      mockExtendBlobStorage.mockReturnValue(renewalPromise);

      const saveInfo = createSaveInfo(5);

      render(
        <SaveDetailsModal
          isOpen={true}
          onClose={mockOnClose}
          saveInfo={saveInfo}
          network="testnet"
          storageAdapter={mockStorageAdapter}
          onExpiryUpdate={mockOnExpiryUpdate}
        />
      );

      const renewalButton = await screen.findByText(/Extend Storage/, {}, { timeout: 5000 });

      await act(async () => {
        await userEvent.click(renewalButton);
      });

      // Should show "Extending..." while in progress
      await waitFor(() => {
        expect(screen.getByText(/Extending\.\.\./)).toBeInTheDocument();
      }, { timeout: 5000 });

      // Resolve the renewal
      await act(async () => {
        resolveRenewal({
          success: true,
          status: 'success',
          endEpoch: 110,
          remainingEpochs: 60,
          additionalEpochs: 10,
          expiryTimestamp: Date.now() + (17 * 24 * 60 * 60 * 1000)
        });
      });

      // Button text should revert to "Extend Storage"
      await waitFor(() => {
        expect(screen.getByText(/Extend Storage/)).toBeInTheDocument();
      }, { timeout: 5000 });
    });
  });
});
