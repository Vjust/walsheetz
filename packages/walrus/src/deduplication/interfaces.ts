// Deduplication registry interface

export interface DeduplicationEntry {
  contentHash: string;
  blobId: string;
  timestamp: number;
  spreadsheetId?: string;
  metadata?: Record<string, any>;
}

export interface IDeduplicationRegistry {
  /**
   * Register a blob by content hash
   */
  register(contentHash: string, blobId: string, metadata?: Record<string, any>): Promise<void>;

  /**
   * Check if content hash exists
   */
  has(contentHash: string): Promise<boolean>;

  /**
   * Get blob ID for content hash
   */
  get(contentHash: string): Promise<DeduplicationEntry | null>;

  /**
   * Delete entry by content hash
   */
  delete(contentHash: string): Promise<void>;

  /**
   * Get all entries
   */
  getAll(): Promise<DeduplicationEntry[]>;

  /**
   * Clear all entries
   */
  clearAll(): Promise<void>;
}
