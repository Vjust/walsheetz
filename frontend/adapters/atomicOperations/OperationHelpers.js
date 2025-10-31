/**
 * OperationHelpers Class
 *
 * Encapsulates shared helper methods for atomic operations with dependency injection.
 * These helpers are used by operation factories and BlockchainAdapter for:
 * - Logging operation lifecycle events
 * - Creating cleanup handler factories
 * - Validating operation results
 */

/**
 * Helper class for atomic operation utilities
 */
export class OperationHelpers {
  /**
   * Create a new OperationHelpers instance
   * @param {Object} dependencies - Injected dependencies
   * @param {Object} dependencies.logger - Logger instance
   * @param {Object} dependencies.logComponent - Log component identifier
   */
  constructor({ logger, logComponent }) {
    this.logger = logger;
    this.logComponent = logComponent;
  }

  /**
   * Log operation step with standard formatting
   * @param {string} operationName - Name of the operation (e.g., 'walrus', 'tx_prep', 'blockchain')
   * @param {string} stage - Stage identifier ('start', 'success', 'cleanup')
   * @param {string} message - Human-readable message
   * @param {Object} metadata - Additional metadata to log
   */
  logOperationStep(operationName, stage, message, metadata = {}) {
    const stageMap = {
      start: `atomic_${operationName}`,
      success: `atomic_${operationName}_success`,
      cleanup: `atomic_${operationName}_cleanup`
    };
    this.logger.info(this.logComponent, stageMap[stage], message, metadata);
  }

  /**
   * Create a no-op cleanup handler factory
   * @param {string} operationName - Name of the operation
   * @param {string} resultProperty - Optional property name to include in cleanup metadata
   * @returns {Function} Cleanup handler factory function
   */
  createNoOpCleanupHandler(operationName, resultProperty = null) {
    return (result) => {
      return async () => {
        const metadata = {};
        if (resultProperty && result[resultProperty]) {
          metadata[resultProperty] = result[resultProperty];
        }
        this.logOperationStep(operationName, 'cleanup', `Cleaning up ${operationName}`, metadata);
      };
    };
  }

  /**
   * Validate operation result field and throw if missing
   * @param {Object} result - Operation result object
   * @param {string} fieldName - Required field name
   * @param {string} operationName - Name of the operation for error messages
   * @throws {Error} If required field is missing
   */
  validateOperationResult(result, fieldName, operationName) {
    if (!result[fieldName]) {
      throw new Error(`${operationName} missing ${fieldName}: ${JSON.stringify(result)}`);
    }
  }

  /**
   * Get operation result from context by operation name
   * @param {Object} context - Execution context containing results
   * @param {string} operationName - Name of the operation to retrieve
   * @returns {Object|undefined} The operation result, or undefined if not found
   */
  getOperationResult(context, operationName) {
    return context.results.find(r => r.name === operationName);
  }
}
