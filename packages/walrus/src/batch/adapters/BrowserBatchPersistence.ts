// Browser localStorage batch persistence adapter

import type { IBatchPersistence, Batch } from '../interfaces.js';

const BATCH_PREFIX = 'walsheetz_batch_';

export class BrowserBatchPersistence implements IBatchPersistence {
  async getBatch(spreadsheetId: string): Promise<Batch | null> {
    try {
      const key = `${BATCH_PREFIX}${spreadsheetId}`;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[BrowserBatchPersistence] Failed to get batch:', error);
      return null;
    }
  }

  async setBatch(spreadsheetId: string, batch: Batch): Promise<void> {
    try {
      const key = `${BATCH_PREFIX}${spreadsheetId}`;
      localStorage.setItem(key, JSON.stringify(batch));
    } catch (error) {
      console.error('[BrowserBatchPersistence] Failed to set batch:', error);
      throw error;
    }
  }

  async deleteBatch(spreadsheetId: string): Promise<void> {
    try {
      const key = `${BATCH_PREFIX}${spreadsheetId}`;
      localStorage.removeItem(key);
    } catch (error) {
      console.error('[BrowserBatchPersistence] Failed to delete batch:', error);
      throw error;
    }
  }

  async getAllBatchIds(): Promise<string[]> {
    try {
      const ids: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(BATCH_PREFIX)) {
          ids.push(key.substring(BATCH_PREFIX.length));
        }
      }
      return ids;
    } catch (error) {
      console.error('[BrowserBatchPersistence] Failed to get batch IDs:', error);
      return [];
    }
  }

  async clearAll(): Promise<void> {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(BATCH_PREFIX)) {
          keys.push(key);
        }
      }
      for (const key of keys) {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.error('[BrowserBatchPersistence] Failed to clear all:', error);
      throw error;
    }
  }
}
