/**
 * BlockchainAdapter Atomic Operations Characterization Tests
 *
 * Locks in the current behavior of _createAtomicSaveOperations structure.
 * These are light characterization tests to verify operation definitions exist
 * and have the expected structure before refactoring.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest'
import { BlockchainAdapter } from '../BlockchainAdapter'

// Mock BlockchainAdapter dependencies
vi.mock('../services/BrowserWalletManager.js', () => ({
  browserWalletManager: {
    connectWallet: vi.fn(),
    getWalletAddress: vi.fn()
  }
}))

vi.mock('../services/BrowserSuiService.js', () => ({
  browserSuiService: {
    initialize: vi.fn(),
    createStorageTransaction: vi.fn(),
    executeTransaction: vi.fn()
  }
}))

vi.mock('../services/BrowserWalrusService.js', () => ({
  browserWalrusService: {
    initialize: vi.fn(),
    storeBlob: vi.fn()
  }
}))

vi.mock('../services/CollaborationService.js', () => ({
  collaborationService: {}
}))

vi.mock('../services/ErrorRecoveryService.js', () => ({
  errorRecoveryService: {}
}))

vi.mock('../services/ProgressiveEnhancementService.js', () => ({
  progressiveEnhancementService: {}
}))

vi.mock('../services/OfflineModeService.js', () => ({
  offlineModeService: {}
}))

vi.mock('../utils/Logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  },
  LogComponent: { BLOCKCHAIN_ADAPTER: 'BLOCKCHAIN_ADAPTER' },
  ErrorCategory: {}
}))

vi.mock('../utils/ConfigLoader.js', () => ({
  configLoader: {
    getConfig: vi.fn(() => ({ sui: { rpcUrl: 'http://localhost:9000' } }))
  }
}))

vi.mock('../utils/ValidationGuards.js', () => ({
  validationGuards: {}
}))

vi.mock('../services/TransactionManager.js', () => ({
  transactionManager: {}
}))

vi.mock('../utils/EventBus.js', () => ({
  transactionEventBus: {
    emit: vi.fn()
  }
}))

vi.mock('../utils/StandardizedErrorHandler.js', () => ({
  standardizedErrorHandler: {
    processError: vi.fn()
  }
}))

vi.mock('../utils/TransactionExperience.js', () => ({
  transactionExperienceManager: {
    prepareTransaction: vi.fn(),
    executeWithExperience: vi.fn(),
    emitTransactionEvent: vi.fn()
  }
}))

vi.mock('../services/blockchain/AtomicOperationManager.js', () => ({
  atomicOperationManager: {
    executeAtomic: vi.fn()
  }
}))

describe('BlockchainAdapter - Atomic Operations Characterization', () => {
  let adapter
  let mockStorageAdapter

  beforeEach(() => {
    vi.clearAllMocks()

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
    adapter.walletAddress = 'test-wallet-address-123'
  })

  describe('_createAtomicSaveOperations Structure', () => {
    test('should create 3 operations: walrus_storage, transaction_preparation, blockchain_execution', () => {
      const testData = {
        spreadsheetData: { cells: [] },
        metadata: { contentHash: 'hash123' }
      }

      const operations = adapter._createAtomicSaveOperations(testData)

      expect(operations).toHaveLength(3)

      const operationNames = operations.map(op => op.name)
      expect(operationNames).toContain('walrus_storage')
      expect(operationNames).toContain('transaction_preparation')
      expect(operationNames).toContain('blockchain_execution')
    })

    test('all operations should have name and execute properties', () => {
      const testData = {
        spreadsheetData: { cells: [] },
        metadata: { contentHash: 'hash123' }
      }

      const operations = adapter._createAtomicSaveOperations(testData)

      operations.forEach(op => {
        expect(op.name).toBeDefined()
        expect(typeof op.name).toBe('string')
        expect(op.execute).toBeDefined()
        expect(typeof op.execute).toBe('function')
      })
    })

    test('walrus_storage should not have dependencies', () => {
      const testData = {
        spreadsheetData: { cells: [] },
        metadata: { contentHash: 'hash123' }
      }

      const operations = adapter._createAtomicSaveOperations(testData)
      const walrusOp = operations.find(op => op.name === 'walrus_storage')

      expect(walrusOp.dependencies).toBeUndefined()
    })

    test('transaction_preparation should not have dependencies', () => {
      const testData = {
        spreadsheetData: { cells: [] },
        metadata: { contentHash: 'hash123' }
      }

      const operations = adapter._createAtomicSaveOperations(testData)
      const txPrepOp = operations.find(op => op.name === 'transaction_preparation')

      expect(txPrepOp.dependencies).toBeUndefined()
    })

    test('blockchain_execution should depend on walrus_storage and transaction_preparation', () => {
      const testData = {
        spreadsheetData: { cells: [] },
        metadata: { contentHash: 'hash123' }
      }

      const operations = adapter._createAtomicSaveOperations(testData)
      const blockchainOp = operations.find(op => op.name === 'blockchain_execution')

      expect(blockchainOp.dependencies).toBeDefined()
      expect(Array.isArray(blockchainOp.dependencies)).toBe(true)
      expect(blockchainOp.dependencies).toContain('walrus_storage')
      expect(blockchainOp.dependencies).toContain('transaction_preparation')
    })

    test('operations may have optional getCleanupHandler', () => {
      const testData = {
        spreadsheetData: { cells: [] },
        metadata: { contentHash: 'hash123' }
      }

      const operations = adapter._createAtomicSaveOperations(testData)

      operations.forEach(op => {
        if (op.getCleanupHandler) {
          expect(typeof op.getCleanupHandler).toBe('function')
        }
      })
    })
  })

  describe('Helper Methods', () => {
    test('_createNoOpCleanupHandler should return a function', () => {
      const handler = adapter._createNoOpCleanupHandler('test_op', 'testProperty')

      expect(typeof handler).toBe('function')
    })

    test('_validateOperationResult should not throw for valid result', () => {
      const result = { blobId: 'blob-123' }

      expect(() => {
        adapter._validateOperationResult(result, 'blobId', 'walrus_storage')
      }).not.toThrow()
    })

    test('_validateOperationResult should throw for missing field', () => {
      const result = {}

      expect(() => {
        adapter._validateOperationResult(result, 'blobId', 'walrus_storage')
      }).toThrow()
    })

    test('_getOperationResult should extract result from context', () => {
      const context = {
        results: [
          { name: 'walrus_storage', blobId: 'blob-123' }
        ]
      }

      const result = adapter._getOperationResult(context, 'walrus_storage')

      expect(result).toEqual({ name: 'walrus_storage', blobId: 'blob-123' })
    })
  })
})
