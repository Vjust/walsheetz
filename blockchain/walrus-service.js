// Walrus storage service for WalSheetz
import { getCurrentConfig } from './config.js';

class WalrusService {
  constructor() {
    this.config = getCurrentConfig().walrus;
    this.batchQueue = new Map(); // Store batches by spreadsheet ID
    this.uploadInProgress = new Set(); // Track ongoing uploads
  }

  // Convert spreadsheet data to binary JSON for efficient storage
  encodeSpreadsheetData(data) {
    try {
      // Create optimized data structure
      const optimizedData = {
        version: data.version || 1,
        timestamp: Date.now(),
        spreadsheetId: data.spreadsheetId,
        metadata: {
          title: data.title || 'Untitled Spreadsheet',
          createdAt: data.createdAt || Date.now(),
          lastModified: Date.now(),
          format: 'walsheetz-v1'
        },
        changes: data.changes || [],
        cells: this.optimizeCellData(data.cells || {}),
        sheets: data.sheets || []
      };

      // Convert to binary JSON (using TextEncoder for efficiency)
      const jsonString = JSON.stringify(optimizedData);
      const encoder = new TextEncoder();
      return encoder.encode(jsonString);
    } catch (error) {
      console.error('Failed to encode spreadsheet data:', error);
      throw error;
    }
  }

  // Optimize cell data structure for storage
  optimizeCellData(cells) {
    const optimized = {};
    
    for (const [cellKey, cellData] of Object.entries(cells)) {
      // Only store non-empty cells
      if (cellData && (cellData.v !== undefined || cellData.f !== undefined)) {
        optimized[cellKey] = {
          v: cellData.v, // value
          f: cellData.f, // formula
          t: cellData.t, // type
          s: cellData.s  // style (simplified)
        };
      }
    }
    
    return optimized;
  }

  // Store blob to Walrus
  async storeBlob(data, metadata = {}) {
    try {
      const binaryData = this.encodeSpreadsheetData(data);
      
      // Create FormData for multipart upload
      const formData = new FormData();
      const blob = new Blob([binaryData], { type: 'application/octet-stream' });
      formData.append('file', blob, `spreadsheet-${data.spreadsheetId}-v${data.version}.bin`);
      
      // Add metadata if provided
      if (Object.keys(metadata).length > 0) {
        formData.append('metadata', JSON.stringify(metadata));
      }

      // Upload to Walrus publisher
      const response = await fetch(`${this.config.publisherUrl}/v1/store`, {
        method: 'POST',
        body: formData,
        headers: {
          // Don't set Content-Type header, let browser set it for FormData
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Walrus storage failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      
      return {
        success: true,
        blobId: result.blobId,
        size: binaryData.length,
        url: `${this.config.blobUrl}/${result.blobId}`,
        metadata: {
          ...metadata,
          originalSize: binaryData.length,
          compression: 'binary-json',
          uploadedAt: Date.now()
        }
      };
    } catch (error) {
      console.error('Failed to store blob to Walrus:', error);
      throw error;
    }
  }

  // Retrieve blob from Walrus
  async retrieveBlob(blobId) {
    try {
      const response = await fetch(`${this.config.blobUrl}/${blobId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to retrieve blob: ${response.status}`);
      }

      const binaryData = await response.arrayBuffer();
      
      // Decode binary JSON back to object
      const decoder = new TextDecoder();
      const jsonString = decoder.decode(binaryData);
      const data = JSON.parse(jsonString);
      
      return {
        success: true,
        data,
        size: binaryData.byteLength,
        retrievedAt: Date.now()
      };
    } catch (error) {
      console.error('Failed to retrieve blob from Walrus:', error);
      throw error;
    }
  }

  // Batch storage using Walrus Quilt
  async storeBatch(spreadsheetId, changes, options = {}) {
    try {
      // Get existing batch or create new one
      if (!this.batchQueue.has(spreadsheetId)) {
        this.batchQueue.set(spreadsheetId, {
          changes: [],
          metadata: {
            spreadsheetId,
            batchStarted: Date.now(),
            tags: ['walsheetz', 'spreadsheet', `id:${spreadsheetId}`]
          }
        });
      }

      const batch = this.batchQueue.get(spreadsheetId);
      
      // Add changes to batch
      batch.changes.push(...changes);
      batch.metadata.lastUpdated = Date.now();
      batch.metadata.totalChanges = batch.changes.length;
      
      // Add custom tags if provided
      if (options.tags) {
        batch.metadata.tags.push(...options.tags);
      }

      // Check if batch should be uploaded
      const shouldUpload = 
        batch.changes.length >= (options.batchSize || getCurrentConfig().storage.batchSize) ||
        options.force ||
        (Date.now() - batch.metadata.batchStarted) > (options.maxBatchAge || 30000); // 30 seconds max

      if (shouldUpload) {
        return await this.uploadBatch(spreadsheetId);
      }

      return {
        success: true,
        batched: true,
        batchSize: batch.changes.length,
        message: 'Changes added to batch, waiting for upload threshold'
      };
    } catch (error) {
      console.error('Failed to batch changes:', error);
      throw error;
    }
  }

  // Upload batch to Walrus with Quilt
  async uploadBatch(spreadsheetId) {
    try {
      if (this.uploadInProgress.has(spreadsheetId)) {
        throw new Error('Upload already in progress for this spreadsheet');
      }

      this.uploadInProgress.add(spreadsheetId);
      
      const batch = this.batchQueue.get(spreadsheetId);
      if (!batch || batch.changes.length === 0) {
        throw new Error('No changes to upload');
      }

      // Prepare data for Walrus Quilt
      const quiltData = {
        spreadsheetId,
        version: Date.now(), // Use timestamp as version
        changes: batch.changes,
        metadata: batch.metadata,
        quilt: {
          format: 'walsheetz-quilt-v1',
          compression: 'binary-json',
          tags: batch.metadata.tags
        }
      };

      // Store using Quilt API (batched storage)
      const result = await this.storeWithQuilt(quiltData);
      
      // Clear the batch after successful upload
      this.batchQueue.delete(spreadsheetId);
      this.uploadInProgress.delete(spreadsheetId);
      
      return {
        success: true,
        blobId: result.blobId,
        batchSize: batch.changes.length,
        uploadedAt: Date.now(),
        metadata: result.metadata
      };
    } catch (error) {
      this.uploadInProgress.delete(spreadsheetId);
      console.error('Failed to upload batch:', error);
      throw error;
    }
  }

  // Store data using Walrus Quilt for optimized small file storage
  async storeWithQuilt(data) {
    try {
      const binaryData = this.encodeSpreadsheetData(data);
      
      // Prepare Quilt request with metadata and tags
      const quiltRequest = {
        data: Array.from(binaryData), // Convert Uint8Array to regular array for JSON
        metadata: {
          contentType: 'application/octet-stream',
          tags: data.quilt?.tags || [],
          customMetadata: {
            spreadsheetId: data.spreadsheetId,
            version: data.version,
            format: data.quilt?.format || 'walsheetz-v1',
            changeCount: data.changes?.length || 0
          }
        }
      };

      // Use Quilt API endpoint (this is a placeholder - actual Quilt API may differ)
      const response = await fetch(`${this.config.publisherUrl}/v1/quilt/store`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(quiltRequest)
      });

      if (!response.ok) {
        // Fallback to regular storage if Quilt is not available
        console.warn('Quilt storage failed, falling back to regular storage');
        return await this.storeBlob(data);
      }

      const result = await response.json();
      
      return {
        success: true,
        blobId: result.blobId,
        quiltId: result.quiltId,
        size: binaryData.length,
        url: `${this.config.blobUrl}/${result.blobId}`,
        metadata: quiltRequest.metadata
      };
    } catch (error) {
      console.error('Quilt storage failed, falling back to regular storage:', error);
      // Fallback to regular blob storage
      return await this.storeBlob(data);
    }
  }

  // Query stored blobs by metadata tags
  async queryByTags(tags, limit = 50) {
    try {
      const queryParams = new URLSearchParams({
        tags: tags.join(','),
        limit: limit.toString()
      });

      const response = await fetch(`${this.config.aggregatorUrl}/v1/query?${queryParams}`);
      
      if (!response.ok) {
        throw new Error(`Query failed: ${response.status}`);
      }

      const results = await response.json();
      
      return {
        success: true,
        results: results.blobs || [],
        total: results.total || 0
      };
    } catch (error) {
      console.error('Failed to query by tags:', error);
      throw error;
    }
  }

  // Get storage statistics
  async getStorageStats(spreadsheetId) {
    try {
      const tags = [`id:${spreadsheetId}`, 'walsheetz'];
      const results = await this.queryByTags(tags);
      
      const stats = {
        totalBlobs: results.total,
        totalSize: 0,
        versions: [],
        lastUpdate: null
      };

      for (const blob of results.results) {
        stats.totalSize += blob.size || 0;
        if (blob.metadata?.version) {
          stats.versions.push(blob.metadata.version);
        }
        if (blob.metadata?.uploadedAt) {
          if (!stats.lastUpdate || blob.metadata.uploadedAt > stats.lastUpdate) {
            stats.lastUpdate = blob.metadata.uploadedAt;
          }
        }
      }

      stats.versions.sort((a, b) => b - a); // Most recent first
      
      return stats;
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      throw error;
    }
  }

  // Get current batch status
  getBatchStatus(spreadsheetId) {
    const batch = this.batchQueue.get(spreadsheetId);
    
    if (!batch) {
      return {
        hasBatch: false,
        changeCount: 0
      };
    }

    return {
      hasBatch: true,
      changeCount: batch.changes.length,
      batchStarted: batch.metadata.batchStarted,
      lastUpdated: batch.metadata.lastUpdated,
      uploadInProgress: this.uploadInProgress.has(spreadsheetId)
    };
  }

  // Force upload current batch
  async forceUpload(spreadsheetId) {
    return await this.uploadBatch(spreadsheetId);
  }
}

// Create singleton instance
export const walrusService = new WalrusService();

// Convenience functions
export const storeSpreadsheetData = (data, metadata) => walrusService.storeBlob(data, metadata);
export const retrieveSpreadsheetData = (blobId) => walrusService.retrieveBlob(blobId);
export const batchChanges = (spreadsheetId, changes, options) => walrusService.storeBatch(spreadsheetId, changes, options);
export const getBatchStatus = (spreadsheetId) => walrusService.getBatchStatus(spreadsheetId);
export const forceUpload = (spreadsheetId) => walrusService.forceUpload(spreadsheetId);