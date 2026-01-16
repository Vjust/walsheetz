import { logger, LogComponent, standardizedErrorHandler } from "@dreamlit/walrus";
import { transactionExperienceManager } from "../../transaction-management/utils/TransactionExperience.js";
import { AtomicExecutionContext } from "./AtomicExecutionContext.js";

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
  private operations: Array<{ operationId: string; step: number | undefined; cleanup: (result: Record<string, unknown>) => Promise<void>; result: Record<string, unknown> }>;

  constructor() {
    this.operations = [];
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
  async executeAtomic(operations: Array<any>, context: Record<string, unknown> = {}) {
    const operationId = `atomic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_start', `Starting atomic operation [${operationId}]`, {
      operations: operations.length,
      context: Object.keys(context)
    });

    // Create execution context to manage results and state
    const execContext = new AtomicExecutionContext(operations, context);

    try {
      const parallelOperations = operations.filter((op) => !op.dependencies);
      const sequentialOperations = operations.filter((op) => op.dependencies);

      if (parallelOperations.length > 0) {
        await this._executeParallelOperations(parallelOperations, execContext, operationId);
      }

      if (sequentialOperations.length > 0) {
        await this._executeSequentialOperations(sequentialOperations, operations, execContext, operationId);
      }

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_success', `Atomic operation completed successfully [${operationId}]`, {
        operations: operations.length,
        parallel: parallelOperations.length,
        sequential: sequentialOperations.length,
        operationId
      });

      // Auto-cleanup after successful operations
      this.cleanup(operationId);

      return { success: true, results: execContext.Results, operationId };

    } catch (error) {
      const err = error as Error;
      const safeLastOperation = execContext.LastOperation || 'unknown';

      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_failed', `Atomic operation failed, initiating rollback [${operationId}]`, {
        error: this._extractErrorMessage(error),
        operationId,
        operations: operations.length,
        lastOperation: safeLastOperation
      });

      const rollbackSummary = await this.rollback(operationId, error);

      return await this._buildErrorResponse(error, operationId, operations.length, safeLastOperation, rollbackSummary, execContext.Results);
    }
  }

  /**
   * Execute parallel operations concurrently
   * @private
   */
  async _executeParallelOperations(parallelOperations: Array<any>, execContext: any, operationId: string) {
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_parallel', `Executing ${parallelOperations.length} parallel operations [${operationId}]`, {
      count: parallelOperations.length,
      operationId
    });

    transactionExperienceManager.emitTransactionEvent('atomic:progress', {
      operationId,
      stage: 'parallel_operations',
      parallelOperations: parallelOperations.length,
      description: 'Processing operations in parallel for better performance'
    });

    const parallelPromises = parallelOperations.map(async (operation, i) => {
      try {
        execContext.updateLastOperation(operation.name);

        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_step', `Executing parallel operation: ${operation.name} [${operationId}]`, {
          operationName: operation.name,
          operationId
        });

        // Execute with standardized transaction experience wrapper
        const result = await this._withTransactionExperience(operation, execContext.initialContext, operationId);

        const namedResult = { name: operation.name, ...result };
        this._registerCleanup(operation, namedResult, operationId, i);

        return namedResult;
      } catch (operationError) {
        const err = operationError as Error;
        throw this._decorateError(operationError, operation.name);
      }
    });

    const parallelResults = await Promise.allSettled(parallelPromises);

    for (let i = 0; i < parallelResults.length; i++) {
      const result = parallelResults[i];
      if (result.status === 'rejected') {
        throw new Error(`Parallel operation failed: ${parallelOperations[i].name} - ${result.reason}`);
      }
      execContext.results.push(result.value);
      // Also track in operationResults for dependency resolution
      execContext.operationResults.set(result.value.name, result.value);
    }

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_parallel_success', `All parallel operations completed [${operationId}]`, {
      completed: parallelOperations.length
    });
  }

  /**
   * Execute sequential operations with dependency resolution
   * @private
   */
  async _executeSequentialOperations(sequentialOperations: Array<any>, operations: Array<any>, execContext: any, operationId: string) {
    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_sequential', `Executing ${sequentialOperations.length} sequential operations [${operationId}]`, {
      count: sequentialOperations.length,
      operationId
    });

    // Build index map once to avoid O(n) indexOf per iteration
    const operationIndexMap = new Map(operations.map((op, idx) => [op, idx]));

    for (const operation of sequentialOperations) {
      try {
        execContext.updateLastOperation(operation.name);

        const dependencyContext = execContext.buildDependencyContext(operation.name);

        logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_step', `Executing sequential operation: ${operation.name} [${operationId}]`, {
          operationName: operation.name,
          dependencies: operation.dependencies,
          operationId
        });

        // Execute sequential operation directly with operationId as second parameter
        const result = await operation.execute(dependencyContext, operationId);
        const namedResult = { name: operation.name, ...result };
        execContext.results.push(namedResult);
        // Also track in operationResults for dependency resolution
        execContext.operationResults.set(operation.name, namedResult);
        this._registerCleanup(operation, namedResult, operationId, operationIndexMap.get(operation));
      } catch (operationError) {
        const err = operationError as Error;
        throw this._decorateError(operationError, operation.name, 'Sequential operation');
      }
    }

    logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_sequential_success', `All sequential operations completed [${operationId}]`, {
      completed: sequentialOperations.length
    });
  }

  /**
   * Wrap operation execution with transaction experience tracking
   * Standardizes instrumentation for both parallel and sequential operations
   * @private
   */
  async _withTransactionExperience(operation: any, context: Record<string, unknown>, operationId: string) {
    const operationName = operation.name;

    // Emit progress event
    transactionExperienceManager.emitTransactionEvent('atomic:operation_start', {
      operationId,
      operationName,
      stage: 'execution'
    });

    try {
      // Create wrapper that forwards operationId as second parameter
      const wrappedOperation = {
        execute: (preparedTransaction) => {
          return operation.execute(preparedTransaction, operationId);
        }
      };

      // Execute with transaction experience wrapper
      const result = await transactionExperienceManager.executeWithExperience(
        wrappedOperation,
        operationName,
        context
      );

      // Emit success event
      transactionExperienceManager.emitTransactionEvent('atomic:operation_success', {
        operationId,
        operationName
      });

      return result;
    } catch (error) {
      const err = error as Error;
      // Emit failure event
      transactionExperienceManager.emitTransactionEvent('atomic:operation_failed', {
        operationId,
        operationName,
        error: this._extractErrorMessage(error)
      });

      throw error;
    }
  }

  /**
   * Register cleanup handler for an operation
   * @private
   */
  _registerCleanup(operation: any, namedResult: Record<string, unknown>, operationId: string, step: number) {
    if (operation.getCleanupHandler) {
      const cleanupHandler = operation.getCleanupHandler(namedResult);
      if (cleanupHandler) {
        this.operations.push({
          operationId,
          step,
          cleanup: cleanupHandler,
          result: namedResult
        });
      }
    }
  }

  /**
   * Extract error message from various error types
   * @private
   */
  _extractErrorMessage(error: unknown): string {
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) {
      return (error as Record<string, unknown>).message as string;
    }
    return 'Unknown error';
  }

  /**
   * Build error response with standardized error handling
   * @private
   */
  async _buildErrorResponse(error: unknown, operationId: string, operationsCount: number, lastOperationName: string, rollbackSummary: Record<string, unknown> | null = null, results: Array<Record<string, unknown>> = []) {
    const errorResult = await standardizedErrorHandler.processError(error as Error | string, {
      operationId,
      operations: operationsCount,
      lastOperation: lastOperationName
    });

    const response: Record<string, unknown> = {
      success: false,
      error: errorResult.userMessage,
      technicalError: this._extractErrorMessage(error),
      operationId,
      rollbackCompleted: true,
      category: errorResult.category,
      recoveryActions: errorResult.recoveryActions,
      requiresUserAction: errorResult.requiresUserAction,
      results
    };

    // Include rollback summary if provided
    if (rollbackSummary) {
      response.rollbackSummary = rollbackSummary;
    }

    return response;
  }

  /**
   * Decorate error with operation context
   * @private
   */
  _decorateError(operationError: unknown, operationName: string, prefix: string = 'Operation') {
    const enhancedError = new Error(`${prefix} ${operationName} failed: ${this._extractErrorMessage(operationError)}`);
    (enhancedError as unknown as Record<string, unknown>).operationName = operationName;
    (enhancedError as unknown as Record<string, unknown>).originalError = operationError;
    return enhancedError;
  }

  /**
   * Log rollback event with standardized formatting
   * @private
   */
  _logRollbackEvent(eventType: string, operationId: string, data: Record<string, unknown> = {}) {
    const eventMap: Record<string, string> = {
      start: 'rollback_start',
      step: 'rollback_step',
      failed: 'rollback_failed',
      complete: 'rollback_complete'
    };

    const message = ((data as any).message as string) || '';
    const logData = { ...data, operationId };
    delete (logData as any).message;

    // Use logger.error for failures, logger.info for other events
    if (eventType === 'failed') {
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, eventMap[eventType], message, logData);
    } else {
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, eventMap[eventType], message, logData);
    }
  }

  /**
   * Rollback operations in reverse order
   *
   * Executes cleanup handlers for all operations in the atomic transaction,
   * proceeding in reverse order to properly undo changes. Continues even if
   * individual cleanup operations fail. Returns a summary documenting cleanup
   * operations and any failures.
   *
   * @param {string} operationId - The operation ID to rollback
   * @param {Error} originalError - The error that triggered the rollback
   * @returns {Promise<Object>} Summary object with { cleanedUp, failures, emittedEvents }
   */
  async rollback(operationId: string, originalError: unknown) {
    const operationsToRollback = this.operations.filter((op) => op.operationId === operationId);
    const summary = {
      cleanedUp: [],
      failures: [],
      emittedEvents: []
    };

    // Log rollback start
    this._logRollbackEvent('start', operationId, {
      message: `Starting rollback for operation [${operationId}]`,
      operationsToRollback: operationsToRollback.length,
      originalError: this._extractErrorMessage(originalError)
    });
    summary.emittedEvents.push('rollback_start');

    const rollbackOperations = operationsToRollback.reverse();

    // Execute cleanup handlers in reverse order
    for (const op of rollbackOperations) {
      try {
        this._logRollbackEvent('step', operationId, {
          message: `Rolling back step ${op.step}`,
          step: op.step
        });
        summary.emittedEvents.push('rollback_step');

        await op.cleanup(op.result);
        summary.cleanedUp.push(op.step);
      } catch (rollbackError) {
        const err = rollbackError as Error;
        this._logRollbackEvent('failed', operationId, {
          message: `Rollback failed for step ${op.step}`,
          step: op.step,
          rollbackError: this._extractErrorMessage(rollbackError)
        });
        summary.emittedEvents.push('rollback_failed');
        summary.failures.push({
          step: op.step,
          error: rollbackError
        });
      }
    }

    // Log rollback completion
    this._logRollbackEvent('complete', operationId, {
      message: `Rollback completed`,
      operationsRolledBack: rollbackOperations.length,
      cleanedUp: summary.cleanedUp.length,
      failures: summary.failures.length
    });
    summary.emittedEvents.push('rollback_complete');

    // Clean up operation tracking
    this.cleanup(operationId);

    return summary;
  }

  /**
   * Clean up operation tracking
   *
   * Removes operation tracking data for the specified operation ID.
   * Call this after successful completion to free resources.
   *
   * @param {string} operationId - The operation ID to clean up
   */
  cleanup(operationId: string) {
    this.operations = this.operations.filter((op) => op.operationId !== operationId);
    logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_cleanup', `Cleaned up operation tracking [${operationId}]`);
  }
}

// Create singleton instance
export const atomicOperationManager = new AtomicOperationManager();

// Export class for testing
export default AtomicOperationManager;