import { logger, LogComponent } from '../../utils/Logger.js'
import { standardizedErrorHandler } from '../../utils/StandardizedErrorHandler.js'
import { transactionExperienceManager } from '../../utils/TransactionExperience.js'

/**
 * Atomic Operation Manager - Ensures operations can be rolled back if any step fails
 *
 * This service provides transactional execution for complex multi-step operations,
 * with support for parallel/sequential execution, automatic rollback on failure,
 * and dependency resolution between operations.
 *
 * Features:
 * - Atomic execution with automatic rollback on any failure
 * - Parallel execution for independent operations
 * - Sequential execution with dependency resolution
 * - Cleanup handler registration and execution
 * - Operation tracking and resource management
 * - Transaction experience integration for progress tracking
 *
 * @example
 * const result = await atomicOperationManager.executeAtomic([
 *   {
 *     name: 'upload-blob',
 *     execute: async (context) => { ... },
 *     getCleanupHandler: (result) => async () => { ... }
 *   },
 *   {
 *     name: 'create-object',
 *     dependencies: ['upload-blob'],
 *     execute: async (context) => {
 *       // Access results from dependencies
 *       const blobId = context.operationResults['upload-blob'].blobId
 *       ...
 *     }
 *   }
 * ])
 */
export class AtomicOperationManager {
  constructor() {
    this.operations = []
    this.resources = new Map()
  }

  /**
   * Execute operations atomically with rollback support and dependency handling
   *
   * Operations are divided into parallel (no dependencies) and sequential (with dependencies).
   * Parallel operations execute concurrently for better performance. Sequential operations
   * execute in order and receive results from their dependencies via context.
   *
   * @param {Array<Operation>} operations - Array of operation objects
   * @param {Object} operations[].name - Unique name for the operation
   * @param {Function} operations[].execute - Async function to execute
   * @param {Array<string>} [operations[].dependencies] - Names of operations this depends on
   * @param {Function} [operations[].getCleanupHandler] - Function returning cleanup handler
   * @param {Object} context - Context object passed to all operations
   * @returns {Promise<Object>} Result object with success, results, and operationId
   */
  async executeAtomic(operations, context = {}) {
    const operationId = `atomic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_start', `Starting atomic operation [${operationId}]`, {
      operations: operations.length,
      context: Object.keys(context)
    })

    let lastOperation = { name: 'initialization', type: 'setup' }

    try {
      const results = []
      const operationResults = new Map()

      const parallelOperations = operations.filter(op => !op.dependencies)
      const sequentialOperations = operations.filter(op => op.dependencies)

      if (parallelOperations.length > 0) {
        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_parallel', `Executing ${parallelOperations.length} parallel operations [${operationId}]`, {
          count: parallelOperations.length,
          operationId
        })

        transactionExperienceManager.emitTransactionEvent('atomic:progress', {
          operationId,
          stage: 'parallel_operations',
          parallelOperations: parallelOperations.length,
          description: 'Processing operations in parallel for better performance'
        })

        const parallelPromises = parallelOperations.map(async (operation, i) => {
          try {
            lastOperation = operation

            logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_step', `Executing parallel operation: ${operation.name} [${operationId}]`, {
              operationName: operation.name,
              operationId
            })

            const txExperience = transactionExperienceManager.prepareTransaction(
              operation.name,
              context
            )

            const result = await transactionExperienceManager.executeWithExperience(
              { execute: operation.execute.bind(operation) },
              operation.name,
              context
            )

            const namedResult = { name: operation.name, ...result }
            operationResults.set(operation.name, namedResult)

            if (operation.getCleanupHandler) {
              const cleanupHandler = operation.getCleanupHandler(namedResult)
              if (cleanupHandler) {
                this.operations.push({
                  operationId,
                  step: i,
                  cleanup: cleanupHandler,
                  result: namedResult
                })
              }
            }

            return namedResult
          } catch (operationError) {
            const enhancedError = new Error(`Operation ${operation.name} failed: ${typeof operationError === 'string' ? operationError : operationError.message || 'Unknown error'}`)
            enhancedError.operationName = operation.name
            enhancedError.originalError = operationError
            throw enhancedError
          }
        })

        const parallelResults = await Promise.allSettled(parallelPromises)

        for (let i = 0; i < parallelResults.length; i++) {
          const result = parallelResults[i]
          if (result.status === 'rejected') {
            throw new Error(`Parallel operation failed: ${parallelOperations[i].name} - ${result.reason}`)
          }
          results.push(result.value)
        }

        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_parallel_success', `All parallel operations completed [${operationId}]`, {
          completed: parallelOperations.length
        })
      }

      if (sequentialOperations.length > 0) {
        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_sequential', `Executing ${sequentialOperations.length} sequential operations [${operationId}]`, {
          count: sequentialOperations.length,
          operationId
        })

        for (const operation of sequentialOperations) {
          try {
            lastOperation = operation

            const dependencyContext = {
              ...context,
              results: Array.from(operationResults.values()),
              operationResults: Object.fromEntries(operationResults)
            }

            logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_step', `Executing sequential operation: ${operation.name} [${operationId}]`, {
              operationName: operation.name,
              dependencies: operation.dependencies,
              operationId
            })

            const result = await operation.execute(dependencyContext, operationId)
            const namedResult = { name: operation.name, ...result }
            results.push(namedResult)
            operationResults.set(operation.name, namedResult)

            if (operation.getCleanupHandler) {
              const cleanupHandler = operation.getCleanupHandler(namedResult)
              if (cleanupHandler) {
                this.operations.push({
                  operationId,
                  step: operations.indexOf(operation),
                  cleanup: cleanupHandler,
                  result: namedResult
                })
              }
            }
          } catch (operationError) {
            const enhancedError = new Error(`Sequential operation ${operation.name} failed: ${typeof operationError === 'string' ? operationError : operationError.message || 'Unknown error'}`)
            enhancedError.operationName = operation.name
            enhancedError.originalError = operationError
            throw enhancedError
          }
        }

        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_sequential_success', `All sequential operations completed [${operationId}]`, {
          completed: sequentialOperations.length
        })
      }

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_success', `Atomic operation completed successfully [${operationId}]`, {
        operations: operations.length,
        parallel: parallelOperations.length,
        sequential: sequentialOperations.length,
        operationId
      })

      return { success: true, results, operationId }

    } catch (error) {
      const safeLastOperation = lastOperation || { name: 'unknown', type: 'unknown' }

      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_failed', `Atomic operation failed, initiating rollback [${operationId}]`, {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        operationId,
        operations: operations.length,
        lastOperation: safeLastOperation.name
      })

      await this.rollback(operationId, error)

      const errorResult = await standardizedErrorHandler.processError(error, {
        operationId,
        operations: operations.length,
        lastOperation: safeLastOperation.name
      })

      return {
        success: false,
        error: errorResult.userMessage,
        technicalError: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        operationId,
        rollbackCompleted: true,
        category: errorResult.category,
        recoveryActions: errorResult.recoveryActions,
        requiresUserAction: errorResult.requiresUserAction
      }
    }
  }

  /**
   * Rollback operations in reverse order
   *
   * Executes cleanup handlers for all operations in the atomic transaction,
   * proceeding in reverse order to properly undo changes. Continues even if
   * individual cleanup operations fail.
   *
   * @param {string} operationId - The operation ID to rollback
   * @param {Error} originalError - The error that triggered the rollback
   * @returns {Promise<void>}
   */
  async rollback(operationId, originalError) {
    const operationsToRollback = this.operations.filter(op => op.operationId === operationId)

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'rollback_start', `Starting rollback for operation [${operationId}]`, {
      operationsToRollback: operationsToRollback.length,
      originalError: typeof originalError === 'string' ? originalError : originalError.message || 'Unknown error'
    })

    const rollbackOperations = operationsToRollback.reverse()

    for (const op of rollbackOperations) {
      try {
        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'rollback_step', `Rolling back step ${op.step} [${operationId}]`, {
          step: op.step,
          operationId
        })

        await op.cleanup(op.result)
      } catch (rollbackError) {
        logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'rollback_failed', `Rollback failed for step ${op.step} [${operationId}]`, {
          step: op.step,
          rollbackError: typeof rollbackError === 'string' ? rollbackError : rollbackError.message || 'Unknown error',
          operationId
        })
      }
    }

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'rollback_complete', `Rollback completed [${operationId}]`, {
      operationId,
      operationsRolledBack: rollbackOperations.length
    })
  }

  /**
   * Clean up operation tracking
   *
   * Removes operation tracking data for the specified operation ID.
   * Call this after successful completion to free resources.
   *
   * @param {string} operationId - The operation ID to clean up
   */
  cleanup(operationId) {
    this.operations = this.operations.filter(op => op.operationId !== operationId)
    logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_cleanup', `Cleaned up operation tracking [${operationId}]`)
  }
}

// Create singleton instance
export const atomicOperationManager = new AtomicOperationManager()

// Export class for testing
export default AtomicOperationManager
