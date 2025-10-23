/**
 * AtomicOperationManager Unit Tests
 *
 * Tests atomic operation execution with rollback support, parallel/sequential
 * operation handling, and cleanup handler registration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock logger before importing AtomicOperationManager
vi.mock('../../../utils/Logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  },
  LogComponent: {
    BLOCKCHAIN_ADAPTER: 'BLOCKCHAIN_ADAPTER'
  }
}))

// Mock standardized error handler
vi.mock('../../../utils/StandardizedErrorHandler.js', () => ({
  standardizedErrorHandler: {
    processError: vi.fn(async (error, context) => ({
      userMessage: 'Test error message',
      technicalError: error.message,
      category: 'TEST_ERROR',
      recoveryActions: [],
      requiresUserAction: false
    }))
  }
}))

// Mock transaction experience manager
vi.mock('../../../utils/TransactionExperience.js', () => ({
  transactionExperienceManager: {
    prepareTransaction: vi.fn(() => ({})),
    executeWithExperience: vi.fn(async (operation, name, context) => {
      return await operation.execute(context)
    }),
    emitTransactionEvent: vi.fn()
  }
}))

describe('AtomicOperationManager', () => {
  let AtomicOperationManager
  let manager
  let logger

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks()

    // Import the module after mocks are set up
    const module = await import('../AtomicOperationManager.js')
    AtomicOperationManager = module.default
    manager = new AtomicOperationManager()

    // Get reference to logger for assertions
    const loggerModule = await import('../../../utils/Logger.js')
    logger = loggerModule.logger
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('executeAtomic', () => {
    it('should successfully execute a single operation', async () => {
      const mockOperation = {
        name: 'test-operation',
        execute: vi.fn(async () => ({ result: 'success' }))
      }

      const result = await manager.executeAtomic([mockOperation], {})

      expect(result.success).toBe(true)
      expect(result.results).toHaveLength(1)
      expect(result.results[0].name).toBe('test-operation')
      expect(result.results[0].result).toBe('success')
      expect(result.operationId).toBeDefined()
      expect(mockOperation.execute).toHaveBeenCalledTimes(1)
    })

    it('should execute multiple parallel operations concurrently', async () => {
      const operations = [
        {
          name: 'op1',
          execute: vi.fn(async () => {
            await new Promise(resolve => setTimeout(resolve, 10))
            return { value: 1 }
          })
        },
        {
          name: 'op2',
          execute: vi.fn(async () => {
            await new Promise(resolve => setTimeout(resolve, 10))
            return { value: 2 }
          })
        },
        {
          name: 'op3',
          execute: vi.fn(async () => {
            await new Promise(resolve => setTimeout(resolve, 10))
            return { value: 3 }
          })
        }
      ]

      const startTime = Date.now()
      const result = await manager.executeAtomic(operations, {})
      const duration = Date.now() - startTime

      expect(result.success).toBe(true)
      expect(result.results).toHaveLength(3)

      // Verify all operations executed
      expect(operations[0].execute).toHaveBeenCalled()
      expect(operations[1].execute).toHaveBeenCalled()
      expect(operations[2].execute).toHaveBeenCalled()

      // Parallel execution should be faster than sequential (< 30ms vs 30ms+)
      expect(duration).toBeLessThan(30)

      // Verify results are properly named
      expect(result.results.map(r => r.name)).toContain('op1')
      expect(result.results.map(r => r.name)).toContain('op2')
      expect(result.results.map(r => r.name)).toContain('op3')
    })

    it('should execute sequential operations with dependency resolution', async () => {
      const operations = [
        {
          name: 'step1',
          execute: vi.fn(async () => ({ blobId: 'blob-123' }))
        },
        {
          name: 'step2',
          dependencies: ['step1'],
          execute: vi.fn(async (context) => {
            const step1Result = context.operationResults['step1']
            return { objectId: `obj-${step1Result.blobId}` }
          })
        },
        {
          name: 'step3',
          dependencies: ['step1', 'step2'],
          execute: vi.fn(async (context) => {
            const step1Result = context.operationResults['step1']
            const step2Result = context.operationResults['step2']
            return {
              combined: `${step1Result.blobId}-${step2Result.objectId}`
            }
          })
        }
      ]

      const result = await manager.executeAtomic(operations, {})

      expect(result.success).toBe(true)
      expect(result.results).toHaveLength(3)

      // Verify operations executed in order with proper context
      expect(operations[0].execute).toHaveBeenCalled()
      expect(operations[1].execute).toHaveBeenCalledWith(
        expect.objectContaining({
          operationResults: expect.objectContaining({
            'step1': expect.objectContaining({ blobId: 'blob-123' })
          })
        }),
        expect.any(String)
      )
      expect(operations[2].execute).toHaveBeenCalledWith(
        expect.objectContaining({
          operationResults: expect.objectContaining({
            'step1': expect.objectContaining({ blobId: 'blob-123' }),
            'step2': expect.objectContaining({ objectId: 'obj-blob-123' })
          })
        }),
        expect.any(String)
      )

      // Verify final result
      const step3Result = result.results.find(r => r.name === 'step3')
      expect(step3Result.combined).toBe('blob-123-obj-blob-123')
    })

    it('should register and track cleanup handlers', async () => {
      const cleanupFn = vi.fn()
      const operation = {
        name: 'with-cleanup',
        execute: vi.fn(async () => ({ resourceId: 'res-123' })),
        getCleanupHandler: vi.fn((result) => {
          return async () => {
            cleanupFn(result.resourceId)
          }
        })
      }

      const result = await manager.executeAtomic([operation], {})

      expect(result.success).toBe(true)
      expect(operation.getCleanupHandler).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: 'res-123' })
      )
      expect(manager.operations).toHaveLength(1)
      expect(manager.operations[0]).toMatchObject({
        operationId: result.operationId,
        step: 0
      })
    })

    it('should rollback on parallel operation failure', async () => {
      const cleanup1 = vi.fn()
      const cleanup2 = vi.fn()

      const operations = [
        {
          name: 'op1',
          execute: vi.fn(async () => ({ value: 1 })),
          getCleanupHandler: () => cleanup1
        },
        {
          name: 'op2-fail',
          execute: vi.fn(async () => {
            throw new Error('Operation 2 failed')
          }),
          getCleanupHandler: () => cleanup2
        }
      ]

      const result = await manager.executeAtomic(operations, {})

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.rollbackCompleted).toBe(true)

      // Cleanup should be called for the successful operation
      expect(cleanup1).toHaveBeenCalled()

      // Failed operation should not have cleanup called (never succeeded)
      expect(cleanup2).not.toHaveBeenCalled()
    })

    it('should rollback on sequential operation failure', async () => {
      const cleanup1 = vi.fn()
      const cleanup2 = vi.fn()

      const operations = [
        {
          name: 'step1',
          execute: vi.fn(async () => ({ value: 1 })),
          getCleanupHandler: () => cleanup1
        },
        {
          name: 'step2-fail',
          dependencies: ['step1'],
          execute: vi.fn(async () => {
            throw new Error('Step 2 failed')
          }),
          getCleanupHandler: () => cleanup2
        }
      ]

      const result = await manager.executeAtomic(operations, {})

      expect(result.success).toBe(false)
      expect(result.rollbackCompleted).toBe(true)

      // Only successful operation should be cleaned up
      expect(cleanup1).toHaveBeenCalled()
      expect(cleanup2).not.toHaveBeenCalled()
    })

    it('should continue rollback even if cleanup fails', async () => {
      const cleanup1 = vi.fn(() => {
        throw new Error('Cleanup 1 failed')
      })
      const cleanup2 = vi.fn()

      const operations = [
        {
          name: 'op1',
          execute: vi.fn(async () => ({ value: 1 })),
          getCleanupHandler: () => cleanup1
        },
        {
          name: 'op2',
          execute: vi.fn(async () => ({ value: 2 })),
          getCleanupHandler: () => cleanup2
        },
        {
          name: 'op3-fail',
          execute: vi.fn(async () => {
            throw new Error('Op 3 failed')
          })
        }
      ]

      const result = await manager.executeAtomic(operations, {})

      expect(result.success).toBe(false)
      expect(result.rollbackCompleted).toBe(true)

      // Both cleanups should be attempted despite first one failing
      expect(cleanup1).toHaveBeenCalled()
      expect(cleanup2).toHaveBeenCalled()

      // Verify error was logged for failed cleanup
      expect(logger.error).toHaveBeenCalledWith(
        'BLOCKCHAIN_ADAPTER',
        'rollback_failed',
        expect.stringContaining('Rollback failed for step'),
        expect.any(Object)
      )
    })

    it('should pass context to operations', async () => {
      const testContext = {
        userId: 'user-123',
        metadata: { key: 'value' }
      }

      const operation = {
        name: 'context-test',
        execute: vi.fn(async (context) => ({ contextReceived: context }))
      }

      const result = await manager.executeAtomic([operation], testContext)

      expect(result.success).toBe(true)
      expect(operation.execute).toHaveBeenCalledWith(testContext)
    })

    it('should handle operations with mixed parallel and sequential', async () => {
      const operations = [
        // Parallel group
        {
          name: 'parallel1',
          execute: vi.fn(async () => ({ value: 'p1' }))
        },
        {
          name: 'parallel2',
          execute: vi.fn(async () => ({ value: 'p2' }))
        },
        // Sequential depending on parallel
        {
          name: 'sequential1',
          dependencies: ['parallel1'],
          execute: vi.fn(async (context) => ({
            value: `seq1-${context.operationResults['parallel1'].value}`
          }))
        }
      ]

      const result = await manager.executeAtomic(operations, {})

      expect(result.success).toBe(true)
      expect(result.results).toHaveLength(3)

      // Verify all executed
      expect(operations[0].execute).toHaveBeenCalled()
      expect(operations[1].execute).toHaveBeenCalled()
      expect(operations[2].execute).toHaveBeenCalled()

      // Verify sequential got parallel results
      const seq1Result = result.results.find(r => r.name === 'sequential1')
      expect(seq1Result.value).toBe('seq1-p1')
    })
  })

  describe('cleanup', () => {
    it('should remove operation tracking for completed operations', async () => {
      const operation = {
        name: 'test-op',
        execute: vi.fn(async () => ({ value: 1 })),
        getCleanupHandler: () => vi.fn()
      }

      const result = await manager.executeAtomic([operation], {})

      expect(manager.operations).toHaveLength(1)

      manager.cleanup(result.operationId)

      expect(manager.operations).toHaveLength(0)
    })

    it('should only remove operations for specified operation ID', async () => {
      const operation = {
        name: 'test-op',
        execute: vi.fn(async () => ({ value: 1 })),
        getCleanupHandler: () => vi.fn()
      }

      const result1 = await manager.executeAtomic([operation], {})
      const result2 = await manager.executeAtomic([operation], {})

      expect(manager.operations).toHaveLength(2)

      manager.cleanup(result1.operationId)

      expect(manager.operations).toHaveLength(1)
      expect(manager.operations[0].operationId).toBe(result2.operationId)
    })
  })

  describe('error handling', () => {
    it('should enhance operation errors with context', async () => {
      const operation = {
        name: 'failing-op',
        execute: vi.fn(async () => {
          throw new Error('Original error')
        })
      }

      const result = await manager.executeAtomic([operation], {})

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.technicalError).toContain('failing-op')
    })

    it('should handle string errors gracefully', async () => {
      const operation = {
        name: 'string-error-op',
        execute: vi.fn(async () => {
          throw 'String error message'
        })
      }

      const result = await manager.executeAtomic([operation], {})

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should include recovery actions from error handler', async () => {
      const operation = {
        name: 'test-op',
        execute: vi.fn(async () => {
          throw new Error('Test error')
        })
      }

      const result = await manager.executeAtomic([operation], {})

      expect(result.success).toBe(false)
      expect(result.recoveryActions).toBeDefined()
      expect(result.category).toBe('TEST_ERROR')
    })
  })

  describe('logging', () => {
    it('should log operation start and success', async () => {
      const operation = {
        name: 'test-op',
        execute: vi.fn(async () => ({ value: 1 }))
      }

      await manager.executeAtomic([operation], {})

      expect(logger.info).toHaveBeenCalledWith(
        'BLOCKCHAIN_ADAPTER',
        'atomic_start',
        expect.stringContaining('Starting atomic operation'),
        expect.any(Object)
      )

      expect(logger.info).toHaveBeenCalledWith(
        'BLOCKCHAIN_ADAPTER',
        'atomic_success',
        expect.stringContaining('Atomic operation completed successfully'),
        expect.any(Object)
      )
    })

    it('should log parallel and sequential operation execution', async () => {
      const operations = [
        {
          name: 'parallel',
          execute: vi.fn(async () => ({ value: 1 }))
        },
        {
          name: 'sequential',
          dependencies: ['parallel'],
          execute: vi.fn(async () => ({ value: 2 }))
        }
      ]

      await manager.executeAtomic(operations, {})

      expect(logger.info).toHaveBeenCalledWith(
        'BLOCKCHAIN_ADAPTER',
        'atomic_parallel',
        expect.stringContaining('Executing 1 parallel operations'),
        expect.any(Object)
      )

      expect(logger.info).toHaveBeenCalledWith(
        'BLOCKCHAIN_ADAPTER',
        'atomic_sequential',
        expect.stringContaining('Executing 1 sequential operations'),
        expect.any(Object)
      )
    })

    it('should log rollback operations', async () => {
      const operation = {
        name: 'failing-op',
        execute: vi.fn(async () => {
          throw new Error('Test error')
        })
      }

      await manager.executeAtomic([operation], {})

      expect(logger.error).toHaveBeenCalledWith(
        'BLOCKCHAIN_ADAPTER',
        'atomic_failed',
        expect.stringContaining('Atomic operation failed'),
        expect.any(Object)
      )

      expect(logger.info).toHaveBeenCalledWith(
        'BLOCKCHAIN_ADAPTER',
        'rollback_start',
        expect.stringContaining('Starting rollback'),
        expect.any(Object)
      )
    })
  })
})
