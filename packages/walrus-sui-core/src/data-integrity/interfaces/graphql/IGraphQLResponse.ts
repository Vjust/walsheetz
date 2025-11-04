/**
 * Interface for standardized GraphQL query responses with pagination
 */
export class IGraphQLResponse {
  /**
   * @param {Object} data - Response data
   * @param {Array} data.items - Data items
   * @param {Object} data.pageInfo - Pagination information
   * @param {number} data.totalCount - Total number of items
   * @param {Object} data.error - Error information if any
   * @param {Object} data.metadata - Additional response metadata
   */
  constructor(data = {}) {
    this.items = data.items || [];
    this.pageInfo = {
      hasNextPage: data.pageInfo?.hasNextPage || false,
      hasPreviousPage: data.pageInfo?.hasPreviousPage || false,
      startCursor: data.pageInfo?.startCursor || null,
      endCursor: data.pageInfo?.endCursor || null
    };
    this.totalCount = data.totalCount || this.items.length;
    this.error = data.error || null;
    this.metadata = data.metadata || {};
    this.timestamp = data.timestamp || Date.now();
  }

  /**
   * Check if response has data
   * @returns {boolean}
   */
  hasData() {
    return this.items.length > 0;
  }

  /**
   * Check if response has error
   * @returns {boolean}
   */
  hasError() {
    return !!this.error;
  }

  /**
   * Check if more pages are available
   * @returns {boolean}
   */
  hasNextPage() {
    return this.pageInfo.hasNextPage;
  }

  /**
   * Check if previous pages are available
   * @returns {boolean}
   */
  hasPreviousPage() {
    return this.pageInfo.hasPreviousPage;
  }

  /**
   * Get number of items in current page
   * @returns {number}
   */
  getItemCount() {
    return this.items.length;
  }

  /**
   * Get cursor for next page
   * @returns {string|null}
   */
  getNextCursor() {
    return this.pageInfo.endCursor;
  }

  /**
   * Get cursor for previous page
   * @returns {string|null}
   */
  getPreviousCursor() {
    return this.pageInfo.startCursor;
  }

  /**
   * Get error message
   * @returns {string|null}
   */
  getErrorMessage() {
    if (!this.error) return null;
    return this.error.message || 'Unknown error';
  }

  /**
   * Get error code
   * @returns {string|null}
   */
  getErrorCode() {
    if (!this.error) return null;
    return this.error.code || null;
  }

  /**
   * Check if response is successful
   * @returns {boolean}
   */
  isSuccess() {
    return !this.hasError();
  }

  /**
   * Get items with type conversion
   * @param {Function} converter - Optional converter function
   * @returns {Array}
   */
  getItems(converter = null) {
    if (!converter) return this.items;
    return this.items.map(converter);
  }

  /**
   * Get paginated subset of items
   * @param {number} page - Page number (0-indexed)
   * @param {number} pageSize - Items per page
   * @returns {Array}
   */
  getPage(page, pageSize) {
    const start = page * pageSize;
    const end = start + pageSize;
    return this.items.slice(start, end);
  }

  /**
   * Convert to plain object for serialization
   * @returns {Object}
   */
  toJSON() {
    return {
      items: this.items,
      pageInfo: this.pageInfo,
      totalCount: this.totalCount,
      error: this.error,
      metadata: this.metadata,
      timestamp: this.timestamp
    };
  }

  /**
   * Create success response
   * @param {Array} items - Data items
   * @param {Object} pageInfo - Pagination info
   * @param {Object} metadata - Additional metadata
   * @returns {IGraphQLResponse}
   */
  static success(items, pageInfo = {}, metadata = {}) {
    return new IGraphQLResponse({
      items,
      pageInfo,
      totalCount: items.length,
      metadata,
      error: null
    });
  }

  /**
   * Create error response
   * @param {Error|string} error - Error object or message
   * @param {string} code - Error code
   * @returns {IGraphQLResponse}
   */
  static error(error, code = null) {
    const errorObj = typeof error === 'string'
      ? { message: error, code }
      : { message: error.message, code: code || error.code, stack: error.stack };

    return new IGraphQLResponse({
      items: [],
      pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
      totalCount: 0,
      error: errorObj,
      metadata: {}
    });
  }

  /**
   * Create empty response
   * @returns {IGraphQLResponse}
   */
  static empty() {
    return new IGraphQLResponse({
      items: [],
      pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
      totalCount: 0,
      error: null,
      metadata: {}
    });
  }

  /**
   * Create from GraphQL query result
   * @param {Object} gqlResult - Raw GraphQL result
   * @param {Function} itemMapper - Function to map each item
   * @returns {IGraphQLResponse}
   */
  static fromGraphQL(gqlResult, itemMapper = null) {
    if (!gqlResult) {
      return IGraphQLResponse.empty();
    }

    if (gqlResult.error || gqlResult.errors) {
      const errorMessage = gqlResult.error?.message ||
                          (gqlResult.errors && gqlResult.errors.map(e => e.message).join(', '));
      return IGraphQLResponse.error(errorMessage);
    }

    const items = itemMapper
      ? (gqlResult.items || gqlResult.nodes || []).map(itemMapper)
      : (gqlResult.items || gqlResult.nodes || []);

    return new IGraphQLResponse({
      items,
      pageInfo: gqlResult.pageInfo || { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
      totalCount: gqlResult.totalCount || items.length,
      error: null,
      metadata: gqlResult.metadata || {}
    });
  }

  /**
   * Merge multiple responses
   * @param {Array<IGraphQLResponse>} responses - Responses to merge
   * @returns {IGraphQLResponse}
   */
  static merge(responses) {
    const allItems = responses.flatMap(r => r.items);
    const hasError = responses.some(r => r.hasError());
    const errors = responses
      .filter(r => r.hasError())
      .map(r => r.getErrorMessage())
      .join('; ');

    return new IGraphQLResponse({
      items: allItems,
      pageInfo: {
        hasNextPage: responses.some(r => r.hasNextPage()),
        hasPreviousPage: responses.some(r => r.hasPreviousPage()),
        startCursor: responses[0]?.pageInfo.startCursor || null,
        endCursor: responses[responses.length - 1]?.pageInfo.endCursor || null
      },
      totalCount: allItems.length,
      error: hasError ? { message: errors } : null,
      metadata: {
        merged: true,
        responseCount: responses.length
      }
    });
  }
}

export default IGraphQLResponse;
