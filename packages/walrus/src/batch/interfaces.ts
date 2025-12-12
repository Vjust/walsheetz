// Batch persistence interface

export interface Batch {
  spreadsheetId: string;
  changes: any[];
  metadata: {
    spreadsheetId: string;
    batchStarted: number;
    lastUpdated?: number;
    totalChanges?: number;
    tags: string[];
  };
}

export interface IBatchPersistence {
  /**
   * Retrieve batch by spreadsheet ID
   */
  getBatch(spreadsheetId: string): Promise<Batch | null>;

  /**
   * Save batch
   */
  setBatch(spreadsheetId: string, batch: Batch): Promise<void>;

  /**
   * Delete batch
   */
  deleteBatch(spreadsheetId: string): Promise<void>;

  /**
   * Get all batch IDs
   */
  getAllBatchIds(): Promise<string[]>;

  /**
   * Clear all batches
   */
  clearAll(): Promise<void>;
}
