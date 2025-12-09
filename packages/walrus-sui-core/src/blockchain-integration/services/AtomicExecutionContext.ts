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
  private operations: unknown[];
  private initialContext: Record<string, unknown>;
  private operationResults: Map<string, Record<string, unknown>>;
  private results: Array<Record<string, unknown>>;
  private lastOperation: string | null;
  private executionStartTime: number;

  /**
   * Create a new AtomicExecutionContext
   * @param {Array} operations - Array of operations to execute
   * @param {Object} initialContext - Initial context data (user-provided)
   */
  constructor(operations: unknown[], initialContext: Record<string, unknown> = {}) {
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
  addResult(operationName: string, result: unknown, success: boolean = true, error: Error | null = null) {
    const trackingEntry: Record<string, unknown> = {
      name: operationName,
      result,
      success,
      endTime: Date.now(),
      duration: this.operationResults.has(operationName)
        ? Date.now() - ((this.operationResults.get(operationName) as any)?.startTime || this.executionStartTime)
        : 0
    };

    if (error) {
      trackingEntry.error = error;
    }

    // Store in both map (for quick lookup) and results array (for ordering)
    const mapEntry: Record<string, unknown> = typeof result === 'object' && result !== null
      ? { ...result as Record<string, unknown>, _meta: { success, error } }
      : { result, _meta: { success, error } };
    this.operationResults.set(operationName, mapEntry);

    this.results.push(trackingEntry);
    this.lastOperation = operationName;
  }

  /**
   * Get operation result by name
   * @param {string} operationName - Name of the operation
   * @returns {*} The operation result, or undefined if not found
   */
  getResult(operationName: string) {
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
  getAllResults(): Record<string, unknown> {
    const results: Record<string, unknown> = {};
    this.operationResults.forEach((entry, name) => {
      const { _meta, ...result } = entry;
      results[name] = result;
    });
    return results;
  }

  /**
   * Build dependency context for a given operation
   * Includes initial context plus all previous operation results
   * @param {string} operationName - Name of the operation
   * @returns {Object} Context object with operationResults and initial context
   */
  buildDependencyContext(operationName: string): Record<string, unknown> {
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
  updateLastOperation(operationName: string) {
    this.lastOperation = operationName;
  }

  /**
   * Check if an operation was executed
   * @param {string} operationName - Name of the operation
   * @returns {boolean} True if operation exists in results
   */
  hasOperation(operationName: string): boolean {
    return this.operationResults.has(operationName);
  }

  /**
   * Get execution duration in milliseconds
   * @returns {number} Duration since context creation
   */
  getExecutionDuration(): number {
    return Date.now() - this.executionStartTime;
  }

  /**
   * Get results array (public accessor for private results field)
   * @returns {Array} The results array
   */
  get Results(): Array<Record<string, unknown>> {
    return this.results;
  }

  /**
   * Get last operation (public accessor for private lastOperation field)
   * @returns {string | null} The last operation name or null
   */
  get LastOperation(): string | null {
    return this.lastOperation;
  }

  /**
   * Get operation results map (public accessor for private operationResults field)
   * @returns {Map} The operation results map
   */
  get OperationResults(): Map<string, Record<string, unknown>> {
    return this.operationResults;
  }

  /**
   * Get initial context (public accessor for private initialContext field)
   * @returns {Record<string, unknown>} The initial context
   */
  get InitialContext(): Record<string, unknown> {
    return this.initialContext;
  }
}
