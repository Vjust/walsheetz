/**
 * BlockchainAdapter Partial Save Tests
 * Tests for Walrus success + blockchain failure scenarios
 */
import { describe, test, expect, beforeEach, vi } from 'vitest'
import { BlockchainAdapter } from '../BlockchainAdapter'

describe('BlockchainAdapter - Partial Saves', () => {
  let adapter
  let mockWalrusService
  let mockSuiService
  let mockStorageAdapter

  beforeEach(() => {
    // Mock Walrus service
    mockWalrusService = {
      storeBlob: vi.fn(),
      extendBlobStorage: vi.fn()
    }

    // Mock Sui service
    mockSuiService = {
      createStorageTransaction: vi.fn(),
      executeTransaction: vi.fn(),
      validateSpreadsheetObjectExists: vi.fn()
    }

    // Mock Storage adapter
    mockStorageAdapter = {
      getPartialSaveInfo: vi.fn(() => null),
      setPartialSaveInfo: vi.fn(),
      clearPartialSaveInfo: vi.fn(),
      getSessionInfo: vi.fn(() => ({
        hasSpreadsheet: false,
        hasWalrusBlobId: false,
        hasWalletAddress: false
      }))
    }

    // Create adapter with mocked services
    adapter = new BlockchainAdapter(mockStorageAdapter)
    adapter.walrusService = mockWalrusService
    adapter.suiService = mockSuiService
    adapter.storageAdapter = mockStorageAdapter
  })

  describe('retryBlockchainCommit', () => {
    test('should retry blockchain commit without re-uploading to Walrus', async () => {
      // Setup partial save data
      const pendingData = {
        spreadsheetObjectId: 'sheet-123',
        walrusBlobId: 'blob-456',
        contentHash: 'hash789',
        cellCount: 10
      }

      const partialSaveInfo = {
        status: 'walrus_only',
        blobId: 'blob-456',
        blockchainStatus: 'failed',
        blockchainError: 'Insufficient gas',
        pendingBlockchainData: pendingData
      }

      mockStorageAdapter.getPartialSaveInfo.mockReturnValue(partialSaveInfo)

      // Mock transaction execution
      const mockTx = { _tx: true }
      mockSuiService.createStorageTransaction.mockResolvedValue(mockTx)
      mockSuiService.executeTransaction.mockResolvedValue({
        success: true,
        digest: 'tx-digest-123'
      })

      // Execute retry
      const result = await adapter.retryBlockchainCommit()

      // Verify no Walrus re-upload occurred
      expect(mockWalrusService.storeBlob).not.toHaveBeenCalled()

      // Verify blockchain transaction was created with pending data
      expect(mockSuiService.createStorageTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          walrusBlobId: 'blob-456',
          spreadsheetObjectId: 'sheet-123'
        })
      )

      // Verify transaction was executed
      expect(mockSuiService.executeTransaction).toHaveBeenCalledWith(mockTx)

      // Verify partial save info was cleared
      expect(mockStorageAdapter.clearPartialSaveInfo).toHaveBeenCalled()

      // Verify result
      expect(result.success).toBe(true)
      expect(result.digest).toBe('tx-digest-123')
      expect(result.blobId).toBe('blob-456')
    })

    test('should return error if no pending blockchain data', async () => {
      // Setup: no partial save info
      mockStorageAdapter.getPartialSaveInfo.mockReturnValue(null)

      const result = await adapter.retryBlockchainCommit()

      expect(result.success).toBe(false)
      expect(result.error).toContain('No pending blockchain data')
    })

    test('should return error if blockchain execution fails', async () => {
      // Setup partial save data
      const pendingData = {
        spreadsheetObjectId: 'sheet-123',
        walrusBlobId: 'blob-456',
        contentHash: 'hash789',
        cellCount: 10
      }

      const partialSaveInfo = {
        status: 'walrus_only',
        blobId: 'blob-456',
        pendingBlockchainData: pendingData
      }

      mockStorageAdapter.getPartialSaveInfo.mockReturnValue(partialSaveInfo)

      // Mock failed transaction
      const mockTx = { _tx: true }
      mockSuiService.createStorageTransaction.mockResolvedValue(mockTx)
      mockSuiService.executeTransaction.mockResolvedValue({
        success: false,
        error: 'Insufficient gas fee'
      })

      const result = await adapter.retryBlockchainCommit()

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()

      // Partial save info should NOT be cleared on failure
      expect(mockStorageAdapter.clearPartialSaveInfo).not.toHaveBeenCalled()
    })
  })

  describe('Partial save flow integration', () => {
    test('partial save info should be retrievable from storage adapter', () => {
      const testInfo = {
        status: 'walrus_only',
        blobId: 'test-blob',
        blockchainError: 'Test error'
      }

      mockStorageAdapter.getPartialSaveInfo.mockReturnValue(testInfo)

      const retrieved = mockStorageAdapter.getPartialSaveInfo()

      expect(retrieved).toEqual(testInfo)
      expect(retrieved.status).toBe('walrus_only')
    })

    test('partial save info should be clearable', () => {
      const testInfo = {
        status: 'walrus_only',
        blobId: 'test-blob'
      }

      mockStorageAdapter.getPartialSaveInfo.mockReturnValue(testInfo)

      // Clear partial save
      mockStorageAdapter.clearPartialSaveInfo()

      // Verify clear was called
      expect(mockStorageAdapter.clearPartialSaveInfo).toHaveBeenCalled()
    })
  })
})
