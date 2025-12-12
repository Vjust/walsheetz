// Node.js in-memory batch persistence adapter

import type { IBatchPersistence, Batch } from '../interfaces.js';

export class NodeBatchPersistence implements IBatchPersistence {
  private batches: Map<string, Batch>;

  constructor() {
    this.batches = new Map();
  }

  async getBatch(spreadsheetId: string): Promise<Batch | null> {
    const batch = this.batches.get(spreadsheetId);
    return batch ? JSON.parse(JSON.stringify(batch)) : null;
  }

  async setBatch(spreadsheetId: string, batch: Batch): Promise<void> {
    // Store a deep copy to prevent external mutations
    this.batches.set(spreadsheetId, JSON.parse(JSON.stringify(batch)));
  }

  async deleteBatch(spreadsheetId: string): Promise<void> {
    this.batches.delete(spreadsheetId);
  }

  async getAllBatchIds(): Promise<string[]> {
    return Array.from(this.batches.keys());
  }

  async clearAll(): Promise<void> {
    this.batches.clear();
  }
}
