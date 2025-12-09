/**
 * Interface for standardized GraphQL query responses with pagination
 */
interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

export class IGraphQLResponse {
  items: unknown[];
  pageInfo: PageInfo;
  totalCount: number;
  error: unknown;
  metadata: Record<string, unknown>;
  timestamp: number;

  constructor(data: Record<string, unknown> = {}) {
    this.items = (data.items as unknown[]) || [];
    const pageInfoData = data.pageInfo as any;
    this.pageInfo = {
      hasNextPage: pageInfoData?.hasNextPage || false,
      hasPreviousPage: pageInfoData?.hasPreviousPage || false,
      startCursor: pageInfoData?.startCursor || null,
      endCursor: pageInfoData?.endCursor || null
    };
    this.totalCount = (data.totalCount as number) || this.items.length;
    this.error = data.error || null;
    this.metadata = (data.metadata as Record<string, unknown>) || {};
    this.timestamp = (data.timestamp as number) || Date.now();
  }

  /**
   * Check if response has data
   * @returns {boolean}
   */
  hasData(): boolean {
    return this.items.length > 0;
  }

  /**
   * Check if response has error
   * @returns {boolean}
   */
  hasError(): boolean {
    return !!this.error;
  }

  /**
   * Check if more pages are available
   * @returns {boolean}
   */
  hasNextPage(): boolean {
    return this.pageInfo.hasNextPage;
  }

  /**
   * Check if previous pages are available
   * @returns {boolean}
   */
  hasPreviousPage(): boolean {
    return this.pageInfo.hasPreviousPage;
  }

  /**
   * Get number of items in current page
   * @returns {number}
   */
  getItemCount(): number {
    return this.items.length;
  }

  /**
   * Get cursor for next page
   * @returns {string|null}
   */
  getNextCursor(): string | null {
    return this.pageInfo.endCursor;
  }

  /**
   * Get cursor for previous page
   * @returns {string|null}
   */
  getPreviousCursor(): string | null {
    return this.pageInfo.startCursor;
  }

  /**
   * Get error message
   * @returns {string|null}
   */
  getErrorMessage(): string | null {
    if (!this.error) return null;
    return (this.error as any).message || 'Unknown error';
  }

  /**
   * Get error code
   * @returns {string|null}
   */
  getErrorCode(): string | null {
    if (!this.error) return null;
    return (this.error as any).code || null;
  }

  /**
   * Check if response is successful
   * @returns {boolean}
   */
  isSuccess(): boolean {
    return !this.hasError();
  }

  /**
   * Get items with type conversion
   * @param {Function} converter - Optional converter function
   * @returns {Array}
   */
  getItems(converter: ((item: unknown) => unknown) | null = null): unknown[] {
    if (!converter) return this.items;
    return this.items.map(converter);
  }

  /**
   * Get paginated subset of items
   * @param {number} page - Page number (0-indexed)
   * @param {number} pageSize - Items per page
   * @returns {Array}
   */
  getPage(page: number, pageSize: number): unknown[] {
    const start = page * pageSize;
    const end = start + pageSize;
    return this.items.slice(start, end);
  }

  /**
   * Convert to plain object for serialization
   * @returns {Object}
   */
  toJSON(): Record<string, unknown> {
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
  static success(items: unknown[], pageInfo: Record<string, unknown> = {}, metadata: Record<string, unknown> = {}): IGraphQLResponse {
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
  static error(error: Error | string, code: string | null = null): IGraphQLResponse {
    const errorObj = typeof error === 'string'
      ? { message: error, code }
      : { message: error.message, code: code || (error as any).code, stack: error.stack };

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
  static empty(): IGraphQLResponse {
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
  static fromGraphQL(gqlResult: Record<string, unknown>, itemMapper: ((item: unknown) => unknown) | null = null): IGraphQLResponse {
    if (!gqlResult) {
      return IGraphQLResponse.empty();
    }

    if (gqlResult.error || gqlResult.errors) {
      const errorMessage = (gqlResult.error as any)?.message ||
                          (gqlResult.errors && (gqlResult.errors as any).map((e: any) => e.message).join(', '));
      return IGraphQLResponse.error(errorMessage);
    }

    const itemsData = (gqlResult.items || gqlResult.nodes || []) as unknown[];
    const items = itemMapper ? itemsData.map(itemMapper) : itemsData;

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
  static merge(responses: IGraphQLResponse[]): IGraphQLResponse {
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
