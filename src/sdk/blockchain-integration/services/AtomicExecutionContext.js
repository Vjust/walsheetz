/**
 * AtomicExecutionContext Class
 *
 * Encapsulates shared state and context management for atomic operation execution.
 * Reduces parameter passing throughout execution methods and provides structured
 * access to operation results and execution state.
 */

/**
 * Context object for atomic operation execution
 */
export class AtomicExecutionContext {
  /**
   * Create a new AtomicExecutionContext
   * @param {Array} operations - Array of operations to execute
   * @param {Object} initialContext - Initial context data (user-provided)
   */
  constructor(operations, initialContext = {}) {
    this.operations = operations;
    this.initialContext = initialContext;

    // Track results from all operations
    // Key: operationName, Value: operation result
    this.operationResults = new Map();

    // Track execution results with metadata
    // Array of { name, result, success, error?, startTime?, endTime?, duration? }
    this.results = [];

    // Track the last executed operation for error reporting
    this.lastOperation = null;

    // Track execution start time
    this.executionStartTime = Date.now();
  }

  /**
   * Add an operation result to the context
   * @param {string} operationName - Name of the operation
   * @param {*} result - The operation result
   * @param {boolean} success - Whether the operation succeeded
   * @param {Error} error - Optional error if operation failed
   */
  addResult(operationName, result, success = true, error = null) {
    const resultEntry = {
      name: operationName,
      result,
      success,
      endTime: Date.now(),
      duration: this.operationResults.has(operationName)
        ? Date.now() - (this.operationResults.get(operationName).startTime || this.executionStartTime)
        : 0
    };

    if (error) {
      resultEntry.error = error;
    }

    // Store in both map (for quick lookup) and results array (for ordering)
    this.operationResults.set(operationName, {
      ...result,
      _meta: { success, error }
    });

    this.results.push(resultEntry);
    this.lastOperation = operationName;
  }

  /**
   * Get operation result by name
   * @param {string} operationName - Name of the operation
   * @returns {*} The operation result, or undefined if not found
   */
  getResult(operationName) {
    const entry = this.operationResults.get(operationName);
    if (!entry) return undefined;

    // Return without metadata
    const { _meta, ...result } = entry;
    return result;
  }

  /**
   * Get all operation results as an object
   * @returns {Object} Map of operationName -> result
   */
  getAllResults() {
    const results = {};
    for (const [name, entry] of this.operationResults) {
      const { _meta, ...result } = entry;
      results[name] = result;
    }
    return results;
  }

  /**
   * Build dependency context for a given operation
   * Includes initial context plus all previous operation results
   * @param {string} operationName - Name of the operation
   * @returns {Object} Context object with operationResults and initial context
   */
  buildDependencyContext(operationName) {
    return {
      ...this.initialContext,
      operationResults: this.getAllResults(),
      results: this.results,
      lastOperation: this.lastOperation,
      currentOperation: operationName
    };
  }

  /**
   * Update the last operation tracker
   * @param {string} operationName - Name of the operation
   */
  updateLastOperation(operationName) {
    this.lastOperation = operationName;
  }

  /**
   * Check if an operation was executed
   * @param {string} operationName - Name of the operation
   * @returns {boolean} True if operation exists in results
   */
  hasOperation(operationName) {
    return this.operationResults.has(operationName);
  }

  /**
   * Get execution duration in milliseconds
   * @returns {number} Duration since context creation
   */
  getExecutionDuration() {
    return Date.now() - this.executionStartTime;
  }
}
