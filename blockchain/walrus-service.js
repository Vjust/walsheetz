// NOTE: Node/server/CLI usage only. The React UI must use frontend/services/* (Browser*Service).
// Walrus storage service for WalSheetz
import { getCurrentConfig } from './config.js';
import { ResilientExecutor } from '@/sdk/utils/CircuitBreaker.js';
import { indexedDBCache } from '@/sdk/services/IndexedDBCache.js';

// SDK support for Node.js (if available)
let WalrusClient, SuiClient;
try {
  const walrusModule = await import('@mysten/walrus');
  const suiModule = await import('@mysten/sui/client');
  WalrusClient = walrusModule.WalrusClient;
  SuiClient = suiModule.SuiClient;
} catch (error) {
  console.warn('[WalrusService] SDK not available in Node.js environment:', error.message);
}

class WalrusService {
  constructor() {
    this.config = getCurrentConfig().walrus;
    this.batchQueue = new Map(); // Store batches by spreadsheet ID
    this.uploadInProgress = new Set(); // Track ongoing uploads
    
    // Load persisted batches from localStorage
    this.loadPersistedBatches();
    
    // Initialize resilient executors for different operations
    this.storeExecutor = new ResilientExecutor({
      name: 'WalrusStore',
      circuit: {
        failureThreshold: 3,
        recoveryTimeout: 30000, // 30 seconds
        expectedErrors: ['NetworkError', 'fetch failed', 'ECONNRESET']
      },
      retry: {
        maxAttempts: 3,
        baseDelay: 2000, // 2 seconds
        maxDelay: 10000, // 10 seconds
        retryCondition: (error) => {
          // Retry on network errors but not on validation errors
          const errorMsg = typeof error === 'string' ? error : (error && error.message) || 'Unknown error';
          return !errorMsg.includes('400') &&
                 !errorMsg.includes('401') &&
                 !errorMsg.includes('403');
        }
      }
    });

    this.retrieveExecutor = new ResilientExecutor({
      name: 'WalrusRetrieve',
      circuit: {
        failureThreshold: 5,
        recoveryTimeout: 15000, // 15 seconds
        expectedErrors: ['NetworkError', 'fetch failed']
      },
      retry: {
        maxAttempts: 4,
        baseDelay: 1000, // 1 second
        maxDelay: 8000, // 8 seconds
      }
    });

    // Initialize SDK client if available in Node.js environment
    this.sdkClient = null;
    this.suiClient = null;
    if (WalrusClient && SuiClient && this.config?.features?.useSdk) {
      try {
        const fullConfig = getCurrentConfig();
        this.suiClient = new SuiClient({ url: fullConfig.sui.rpcUrl });

        const sdkNetwork = this.config.features.sdkNetwork ||
                         (fullConfig.environment === 'mainnet' ? 'mainnet' : 'testnet');

        this.sdkClient = new WalrusClient({
          network: sdkNetwork,
          suiClient: this.suiClient
        });

        console.log('[WalrusService] SDK initialized for Node.js environment');
      } catch (sdkError) {
        console.warn('[WalrusService] Failed to initialize SDK, will use HTTP fallback:', sdkError.message);
        this.sdkClient = null;
        this.suiClient = null;
      }
    }
  }

  // Convert spreadsheet data to binary JSON for efficient storage with optional compression
  async encodeSpreadsheetData(data, options = {}) {
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
          format: 'walsheetz-v1',
          chunk: this.buildChunkMetadata(data.metadata?.chunk, options.chunk)
        },
        changes: data.changes || [],
        cells: this.optimizeCellData(data.cells || {}),
        sheets: data.sheets || []
      };

      // Convert to binary JSON (using TextEncoder for efficiency)
      const jsonString = JSON.stringify(optimizedData);
      const encoder = new TextEncoder();
      const rawData = encoder.encode(jsonString);
      
      // Enhanced compression with multiple algorithms and lower threshold
      const compressionThreshold = options.compressionThreshold || 4096; // Lowered to 4KB
      const preferredAlgorithm = options.compressionAlgorithm || 'auto';
      const shouldCompress = rawData.length > compressionThreshold &&
                            typeof CompressionStream !== 'undefined';

      if (shouldCompress) {
        console.log(`📦 Compressing data (${rawData.length} bytes > ${compressionThreshold} threshold, algorithm: ${preferredAlgorithm})`);

        try {
          let bestResult = null;
          const algorithms = this.getAvailableCompressionAlgorithms(preferredAlgorithm);

          // Try each algorithm and pick the best one
          for (const algorithm of algorithms) {
            try {
              const compressedData = await this.compressDataWithAlgorithm(rawData, algorithm);
              const compressionRatio = rawData.length / compressedData.length;

              const result = {
                data: compressedData,
                compressed: true,
                originalSize: rawData.length,
                compressedSize: compressedData.length,
                compressionRatio,
                algorithm
              };

              // Pick the best compression ratio
              if (!bestResult || result.compressionRatio > bestResult.compressionRatio) {
                bestResult = result;
              }

              console.log(`  ${algorithm}: ${rawData.length} → ${compressedData.length} bytes (${compressionRatio.toFixed(2)}x)`);

              // If algorithm is not 'auto', use the first successful result
              if (preferredAlgorithm !== 'auto') {
                break;
              }
            } catch (algoError) {
              console.warn(`  ${algorithm} compression failed:`, typeof algoError === 'string' ? algoError : algoError.message || 'Unknown error');
            }
          }

          if (bestResult) {
            console.log(`✅ Best compression: ${bestResult.algorithm} with ${bestResult.compressionRatio.toFixed(2)}x ratio`);
            return bestResult;
          } else {
            throw new Error('All compression algorithms failed');
          }
        } catch (compressError) {
          console.warn('Enhanced compression failed, falling back to raw data:', typeof compressError === 'string' ? compressError : compressError.message || 'Unknown error');
          return {
            data: rawData,
            compressed: false,
            originalSize: rawData.length,
            compressedSize: rawData.length,
            compressionRatio: 1.0,
            algorithm: 'none',
            compressionError: typeof compressError === 'string' ? compressError : compressError.message || 'Unknown error'
          };
        }
      }
      
      // Return raw data if below threshold or compression unavailable
      return {
        data: rawData,
        compressed: false,
        originalSize: rawData.length,
        compressedSize: rawData.length,
        compressionRatio: 1.0,
        algorithm: 'none'
      };
    } catch (error) {
      console.error('Failed to encode spreadsheet data:', error);
      throw error;
    }
  }
  
  // Compress data using CompressionStream API (gzip)
  async compressData(data) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      }
    });
    
    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    const reader = compressedStream.getReader();
    const chunks = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    
    // Combine chunks into single Uint8Array
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    return result;
  }
  
  // Decompress data using DecompressionStream API (gzip)
  async decompressData(compressedData) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(compressedData);
        controller.close();
      }
    });

    const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
    const reader = decompressedStream.getReader();
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    // Combine chunks into single Uint8Array
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  // ENHANCED COMPRESSION SYSTEM

  // Get available compression algorithms based on browser support
  getAvailableCompressionAlgorithms(preferred = 'auto') {
    const algorithms = [];

    // Check what's available in the browser
    if (typeof CompressionStream !== 'undefined') {
      // Add algorithms in order of preference for spreadsheet data
      try {
        // Brotli is usually best for text data like JSON
        new CompressionStream('br');
        algorithms.push('br');
      } catch (e) {
        // Brotli not supported
      }

      try {
        // Gzip is widely supported and good for JSON
        new CompressionStream('gzip');
        algorithms.push('gzip');
      } catch (e) {
        // Gzip not supported (very rare)
      }

      try {
        // Deflate as fallback
        new CompressionStream('deflate');
        algorithms.push('deflate');
      } catch (e) {
        // Deflate not supported
      }
    }

    // If specific algorithm requested, prioritize it
    if (preferred !== 'auto' && algorithms.includes(preferred)) {
      return [preferred];
    }

    return algorithms.length > 0 ? algorithms : ['none'];
  }

  // Compress data with specific algorithm
  async compressDataWithAlgorithm(data, algorithm) {
    if (algorithm === 'none') {
      return data;
    }

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      }
    });

    const compressedStream = stream.pipeThrough(new CompressionStream(algorithm));
    const reader = compressedStream.getReader();
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    // Combine chunks into single Uint8Array
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  // Decompress data with automatic algorithm detection
  async decompressDataWithAlgorithm(compressedData, algorithm) {
    if (algorithm === 'none') {
      return compressedData;
    }

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(compressedData);
        controller.close();
      }
    });

    const decompressedStream = stream.pipeThrough(new DecompressionStream(algorithm));
    const reader = decompressedStream.getReader();
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    // Combine chunks into single Uint8Array
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  // Calculate SHA-256 hash of data for integrity verification
  async calculateContentHash(data) {
    try {
      const encoded = await this.encodeSpreadsheetData(data);
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoded.data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      return {
        hash: hashHex,
        algorithm: 'SHA-256',
        dataSize: encoded.data.length,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Failed to calculate content hash:', error);
      throw error;
    }
  }

  // Calculate SHA-256 hash from already-encoded binary data
  async calculateHashFromBinary(binaryData) {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', binaryData);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      return {
        hash: hashHex,
        algorithm: 'SHA-256',
        dataSize: binaryData.length,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Failed to calculate hash from binary data:', error);
      throw error;
    }
  }

  // Optimize cell data structure for storage
  // Accept both UI shape ({ value, formula, type, s }) and storage shape ({ v, f, t, s })
  optimizeCellData(cells) {
    const optimized = {};

    // Handle null or undefined input
    if (!cells || typeof cells !== 'object') {
      return optimized;
    }

    for (const [cellKey, cellData] of Object.entries(cells)) {
      if (!cellData || typeof cellData !== 'object') continue;

      const value = cellData.v !== undefined ? cellData.v : cellData.value;
      const formula = cellData.f !== undefined ? cellData.f : cellData.formula;
      const type = cellData.t !== undefined ? cellData.t : cellData.type;
      const style = cellData.s;

      if (value !== undefined || formula !== undefined) {
        optimized[cellKey] = { v: value, f: formula, t: type, s: style };
      }
    }

    return optimized;
  }

  // Store blob to Walrus with integrity verification, compression, and resilient execution
  async storeBlob(data, metadata = {}) {
    // Note: SDK path in Node.js environment requires server-side keypair or transaction proxy
    // For now, server-side continues to use HTTP API. SDK path would require additional setup.
    // Client-side (BrowserWalrusService) uses SDK with wallet integration.

    // Step 1: Encode data with optional compression
    const encodedResult = await this.encodeSpreadsheetData(data, {
      compressionThreshold: metadata.compressionThreshold || 16384
    });
    
    // Step 2: Calculate hash from the final data (compressed or raw)
    const contentHash = await this.calculateHashFromBinary(encodedResult.data);
    console.log(`📍 Content hash calculated: ${contentHash.hash.substring(0, 16)}...`);
    
    // Log compression stats if compressed
    if (encodedResult.compressed) {
      console.log(`📦 Data compressed: ${encodedResult.originalSize} → ${encodedResult.compressedSize} bytes (${encodedResult.compressionRatio.toFixed(2)}x)`);
    }

    // Execute store operation with circuit breaker and retry logic
    return this.storeExecutor.execute(async () => {
      return this._performStoreOperation(
        data, 
        encodedResult, 
        contentHash, 
        {
          ...metadata,
          compression: encodedResult.algorithm,
          originalSize: encodedResult.originalSize,
          compressedSize: encodedResult.compressedSize,
          compressionRatio: encodedResult.compressionRatio
        }
      );
    }, async (error) => {
      // Fallback: try local storage or provide degraded functionality
      console.warn('🔄 Store operation failed, attempting fallback...', typeof error === 'string' ? error : (error && error.message) || 'Unknown error');
      return {
        success: false,
        error: `Walrus storage unavailable: ${typeof error === 'string' ? error : (error && error.message) || 'Unknown error'}`,
        fallback: 'local_storage',
        contentHash
      };
    });
  }

  // Internal method for the actual store operation with timeout support
  async _performStoreOperation(data, encodedResult, contentHash, metadata = {}) {
    // Handle both old format (direct binaryData) and new format (encodedResult object)
    const binaryData = encodedResult.data || encodedResult;

    // CONTENT DEDUPLICATION CHECK
    const deduplicationResult = await this.checkContentDeduplication(data, encodedResult, contentHash);
    if (deduplicationResult) {
      console.log('🎯 Content deduplication successful - skipping upload');
      return deduplicationResult;
    }

    // Create blob directly for Walrus API
    const blob = new Blob([binaryData], { type: 'application/octet-stream' });

    // Default to 50 epochs for testnet (about 100 days)
    const epochs = 50;

    // Upload to Walrus publisher using correct API format with timeout
    const url = `${this.config.publisherUrl}/v1/blobs?epochs=${epochs}`;
    console.log('🚀 Attempting to store blob to:', url);
    
    // Create AbortController for timeout (default 20 seconds for PUT)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), metadata.timeout || 20000);
    
    try {
      const response = await fetch(url, {
        method: 'PUT',
        body: blob,
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeout);

      if (!response.ok) {
        let errorText;
        try {
          errorText = await response.text();
        } catch (readError) {
          errorText = `Unable to read error response: ${typeof readError === 'string' ? readError : readError.message || 'Unknown error'}`;
        }
        
        // Capture server correlation ID if present
        const correlationId = response.headers.get('x-correlation-id') || 
                             response.headers.get('x-request-id') || 
                             response.headers.get('request-id') || 
                             'not-provided';
        
        // Enhanced error with debugging context and correlation ID
        const errorContext = {
          httpStatus: response.status,
          httpStatusText: response.statusText,
          publisherUrl: this.config.publisherUrl,
          dataSize: binaryData.length,
          contentType: response.headers.get('content-type'),
          correlationId,
          responseHeaders: Object.fromEntries(response.headers.entries()),
          errorBody: errorText,
          timestamp: new Date().toISOString()
        };
        
        console.error('Walrus HTTP request failed:', errorContext);
        throw new Error(`Walrus storage HTTP ${response.status} (${response.statusText}): ${errorText}. CorrelationId: ${correlationId}`);
      }

      const result = await response.json();

      // Capture correlation ID from successful response
      const correlationId = response.headers.get('x-correlation-id') || 
                           response.headers.get('x-request-id') || 
                           'not-provided';

      // Handle both response types (newlyCreated and alreadyCertified)
      if (result.newlyCreated) {
        const blobId = result.newlyCreated.blobObject.blobId;

        // Add to deduplication registry for future efficiency
        this.addToContentRegistry(contentHash, blobId, {
          originalSize: encodedResult.originalSize || binaryData.length,
          algorithm: encodedResult.algorithm || 'none'
        });

        return {
          success: true,
          blobId: blobId,
          size: binaryData.length,
          endEpoch: result.newlyCreated.blobObject.storage.endEpoch,
          suiObjectId: result.newlyCreated.blobObject.id,
          status: 'newly_created',
          url: `${this.config.blobUrl}/${blobId}`,
          publisherUrl: this.config.publisherUrl,
          correlationId,
          // Include content hash for integrity verification
          contentHash: contentHash,
          metadata: {
            ...metadata,
            originalSize: encodedResult.originalSize || binaryData.length,
            compressedSize: encodedResult.compressedSize || binaryData.length,
            compressionRatio: encodedResult.compressionRatio || 1.0,
            algorithm: encodedResult.algorithm || 'none',
            uploadedAt: Date.now(),
            contentHash: contentHash.hash,
            hashAlgorithm: contentHash.algorithm
          }
        };
      } else if (result.alreadyCertified) {
        const blobId = result.alreadyCertified.blobId;

        // Add to deduplication registry for future efficiency
        this.addToContentRegistry(contentHash, blobId, {
          originalSize: encodedResult.originalSize || binaryData.length,
          algorithm: encodedResult.algorithm || 'none'
        });

        return {
          success: true,
          blobId: blobId,
          size: binaryData.length,
          endEpoch: result.alreadyCertified.endEpoch,
          eventTxDigest: result.alreadyCertified.event.txDigest,
          status: 'already_certified',
          url: `${this.config.blobUrl}/${blobId}`,
          publisherUrl: this.config.publisherUrl,
          correlationId,
          // Include content hash for integrity verification
          contentHash: contentHash,
          metadata: {
            ...metadata,
            originalSize: encodedResult.originalSize || binaryData.length,
            compressedSize: encodedResult.compressedSize || binaryData.length,
            compressionRatio: encodedResult.compressionRatio || 1.0,
            algorithm: encodedResult.algorithm || 'none',
            uploadedAt: Date.now(),
            contentHash: contentHash.hash,
            hashAlgorithm: contentHash.algorithm
          }
        };
      } else {
        throw new Error('Unexpected response format from Walrus');
      }
    } catch (error) {
      clearTimeout(timeout);
      
      // Handle timeout specifically
      if (error.name === 'AbortError') {
        const timeoutError = new Error(`Walrus store operation timed out after ${metadata.timeout || 20000}ms`);
        timeoutError.code = 'TIMEOUT';
        timeoutError.publisherUrl = this.config.publisherUrl;
        timeoutError.dataSize = binaryData.length;
        throw timeoutError;
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  // Get store operation statistics
  getStoreStats() {
    return this.storeExecutor.getStats();
  }
  
  // Store blob to multiple endpoints for redundancy
  async storeBlobWithRedundancy(data, metadata = {}) {
    const config = getCurrentConfig().walrus;
    
    // Check if redundancy is enabled
    if (!config.redundancy?.enabled || !config.publishers || config.publishers.length <= 1) {
      console.log('🔔 Redundancy not enabled or insufficient endpoints, using single store');
      return this.storeBlob(data, metadata);
    }
    
    console.log(`🛡️ Starting redundant storage to ${config.publishers.length} endpoints`);
    
    // Step 1: Encode data with optional compression
    const encodedResult = await this.encodeSpreadsheetData(data, {
      compressionThreshold: metadata.compressionThreshold || 16384
    });
    
    // Step 2: Calculate hash from the final data
    const contentHash = await this.calculateHashFromBinary(encodedResult.data);
    console.log(`📍 Content hash for redundancy: ${contentHash.hash.substring(0, 16)}...`);
    
    // Step 3: Store to multiple endpoints
    const storePromises = [];
    const maxEndpoints = Math.min(config.redundancy.maxEndpoints, config.publishers.length);
    
    for (let i = 0; i < maxEndpoints; i++) {
      const publisherUrl = config.publishers[i];
      const endpointMetadata = {
        ...metadata,
        publisherUrl,
        endpointIndex: i,
        compression: encodedResult.algorithm,
        originalSize: encodedResult.originalSize,
        compressedSize: encodedResult.compressedSize,
        compressionRatio: encodedResult.compressionRatio
      };
      
      // Create promise for each endpoint
      const storePromise = this._storeToEndpoint(
        publisherUrl,
        encodedResult.data,
        contentHash,
        endpointMetadata
      ).catch(error => ({
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        publisherUrl,
        endpointIndex: i
      }));
      
      storePromises.push(storePromise);
    }
    
    // Wait for all store operations
    const results = await Promise.allSettled(storePromises);
    
    // Analyze results
    const successfulStores = [];
    const failedStores = [];
    const blobIds = [];
    
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success) {
        successfulStores.push(result.value);
        blobIds.push(result.value.blobId);
      } else {
        failedStores.push(result.reason || result.value);
      }
    }
    
    // Check if minimum successful stores met
    if (successfulStores.length >= config.redundancy.minSuccessful) {
      console.log(`✅ Redundant storage successful: ${successfulStores.length}/${maxEndpoints} endpoints`);
      
      // Return the first successful result with redundancy info
      const primaryResult = successfulStores[0];
      return {
        ...primaryResult,
        redundantBlobIds: blobIds.slice(1), // All except primary
        redundancyInfo: {
          totalAttempts: maxEndpoints,
          successful: successfulStores.length,
          failed: failedStores.length,
          endpoints: successfulStores.map(s => s.publisherUrl)
        }
      };
    } else {
      console.error(`❌ Redundant storage failed: only ${successfulStores.length}/${config.redundancy.minSuccessful} succeeded`);
      return {
        success: false,
        error: `Insufficient successful stores: ${successfulStores.length}/${config.redundancy.minSuccessful}`,
        redundancyInfo: {
          totalAttempts: maxEndpoints,
          successful: successfulStores.length,
          failed: failedStores.length,
          failures: failedStores
        }
      };
    }
  }
  
  // Store to a specific endpoint
  async _storeToEndpoint(publisherUrl, binaryData, contentHash, metadata = {}) {
    console.log(`📤 Storing to endpoint: ${publisherUrl}`);
    
    // Create blob
    const blob = new Blob([binaryData], { type: 'application/octet-stream' });
    const epochs = 50;
    const url = `${publisherUrl}/v1/blobs?epochs=${epochs}`;
    
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), metadata.timeout || 20000);
    
    try {
      const response = await fetch(url, {
        method: 'PUT',
        body: blob,
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        let errorText = 'Unknown error';
        try {
          errorText = await response.text();
        } catch (e) {
          // Ignore
        }
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const result = await response.json();
      
      // Handle response types
      if (result.newlyCreated || result.alreadyCertified) {
        const blobId = result.newlyCreated?.blobObject?.blobId || result.alreadyCertified?.blobId;
        return {
          success: true,
          blobId,
          publisherUrl,
          size: binaryData.length,
          contentHash,
          metadata
        };
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (error) {
      clearTimeout(timeout);
      
      if (error.name === 'AbortError') {
        throw new Error(`Timeout after ${metadata.timeout || 20000}ms`);
      }
      throw error;
    }
  }

  // Retrieve blob from Walrus with integrity verification and resilient execution
  async retrieveBlob(blobId, expectedHash = null) {
    // INDEXEDDB CACHE CHECK FIRST
    try {
      const cachedResult = await indexedDBCache.getCachedVersion(blobId);
      if (cachedResult) {
        console.log(`📦 Cache hit for blob ${blobId.substring(0, 8)}...`);

        // Verify hash if provided
        if (expectedHash && cachedResult.metadata.contentHash !== expectedHash) {
          console.warn(`⚠️ Cached data hash mismatch for ${blobId}, fetching fresh copy`);
        } else {
          // Return cached data with success format
          return {
            success: true,
            data: cachedResult.data,
            fromCache: true,
            cacheInfo: cachedResult.cacheInfo,
            integrityVerified: !!expectedHash,
            url: `${this.config.blobUrl}/${blobId}`,
            metadata: cachedResult.metadata
          };
        }
      }
    } catch (cacheError) {
      console.warn('Cache lookup failed, proceeding with network fetch:', typeof cacheError === 'string' ? cacheError : cacheError.message || 'Unknown error');
    }

    // If cache miss or hash mismatch, fetch from network
    return this.retrieveExecutor.execute(async () => {
      const result = await this._performRetrieveOperation(blobId, expectedHash);

      // Cache successful results for future use
      if (result.success && result.data) {
        try {
          await indexedDBCache.cacheVersion(blobId, result.data, {
            contentHash: expectedHash || result.contentHash,
            cachedFrom: 'walrus',
            blobUrl: result.url
          });
        } catch (cacheError) {
          console.warn('Failed to cache retrieved data:', typeof cacheError === 'string' ? cacheError : cacheError.message || 'Unknown error');
        }
      }

      return result;
    }, async (error) => {
      // Enhanced fallback: try cache again as last resort
      console.warn('🔄 Retrieve operation failed, attempting cache fallback...', typeof error === 'string' ? error : (error && error.message) || 'Unknown error');

      try {
        const cachedResult = await indexedDBCache.getCachedVersion(blobId);
        if (cachedResult) {
          console.log(`📦 Using stale cache as fallback for blob ${blobId.substring(0, 8)}...`);
          return {
            success: true,
            data: cachedResult.data,
            fromCache: true,
            stale: true, // Indicate this is potentially stale data
            cacheInfo: cachedResult.cacheInfo,
            fallbackReason: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
            warning: 'Using cached data due to network failure'
          };
        }
      } catch (fallbackCacheError) {
        console.error('Fallback cache lookup also failed:', typeof fallbackCacheError === 'string' ? fallbackCacheError : fallbackCacheError.message || 'Unknown error');
      }

      return {
        success: false,
        error: `Walrus retrieval unavailable: ${typeof error === 'string' ? error : (error && error.message) || 'Unknown error'}`,
        fallback: 'cache_or_local',
        blobId
      };
    });
  }

  // Internal method for the actual retrieve operation with timeout and HEAD validation
  async _performRetrieveOperation(blobId, expectedHash = null, timeout = 20000) {
    console.log(`📥 Attempting to retrieve blob: ${blobId}`);
    
    // First, perform HEAD request to validate blob exists and get metadata
    const headController = new AbortController();
    const headTimeout = setTimeout(() => headController.abort(), 5000); // 5 seconds for HEAD
    
    try {
      const headResponse = await fetch(`${this.config.aggregatorUrl}/v1/blobs/${blobId}`, {
        method: 'HEAD',
        signal: headController.signal
      });
      
      clearTimeout(headTimeout);
      
      if (!headResponse.ok) {
        throw new Error(`Blob not accessible: HTTP ${headResponse.status}: ${headResponse.statusText}`);
      }
      
      // Log size and mime type if available
      const contentLength = headResponse.headers.get('content-length');
      const contentType = headResponse.headers.get('content-type');
      if (contentLength || contentType) {
        console.log(`📋 Blob metadata - Size: ${contentLength || 'unknown'}, Type: ${contentType || 'unknown'}`);
      }
    } catch (error) {
      clearTimeout(headTimeout);
      if (error.name === 'AbortError') {
        throw new Error(`HEAD request timed out for blob ${blobId}`);
      }
      throw error;
    }
    
    // Now perform the actual GET request with timeout
    const getController = new AbortController();
    const getTimeout = setTimeout(() => getController.abort(), timeout);
    
    try {
      const response = await fetch(`${this.config.aggregatorUrl}/v1/blobs/${blobId}`, {
        signal: getController.signal
      });
      
      clearTimeout(getTimeout);
      
      if (!response.ok) {
        // Capture correlation ID for error tracking
        const correlationId = response.headers.get('x-correlation-id') || 
                             response.headers.get('x-request-id') || 
                             'not-provided';
        throw new Error(`HTTP ${response.status}: ${response.statusText}. CorrelationId: ${correlationId}`);
      }

      const binaryData = await response.arrayBuffer();
      
      // Capture correlation ID from successful response
      const correlationId = response.headers.get('x-correlation-id') || 
                           response.headers.get('x-request-id') || 
                           'not-provided';
    
      // Check if data is compressed (detect gzip magic bytes: 1f 8b)
      const dataView = new DataView(binaryData);
      const isCompressed = dataView.byteLength >= 2 && 
                          dataView.getUint8(0) === 0x1f && 
                          dataView.getUint8(1) === 0x8b;
      
      let decompressedData = binaryData;
      if (isCompressed) {
        console.log('📦 Detected compressed data, decompressing...');
        try {
          const compressedArray = new Uint8Array(binaryData);
          decompressedData = await this.decompressData(compressedArray);
          console.log(`✅ Decompression successful: ${binaryData.byteLength} → ${decompressedData.byteLength} bytes`);
        } catch (decompressError) {
          console.error('Failed to decompress data:', decompressError);
          // Try to parse as-is in case it's not actually compressed
          decompressedData = binaryData;
        }
      }
      
      // Decode binary JSON back to object
      const decoder = new TextDecoder();
      const jsonString = decoder.decode(decompressedData);
      let data = JSON.parse(jsonString);

      // Normalize cell shape for consumers (convert {v,f,t,s} -> {value, formula, type, s})
      if (data && typeof data === 'object' && data.cells && typeof data.cells === 'object') {
        const anyCell = Object.values(data.cells)[0];
        if (anyCell && (anyCell.v !== undefined || anyCell.f !== undefined)) {
          const uiCells = {};
          for (const [key, cell] of Object.entries(data.cells)) {
            if (!cell || typeof cell !== 'object') continue;
            uiCells[key] = {
              value: cell.v,
              formula: cell.f,
              type: cell.t,
              s: cell.s
            };
          }
          data = { ...data, cells: uiCells };
        }
      }

      // Verify integrity if expected hash is provided
      let integrityVerified = null;
      if (expectedHash) {
        console.log(`🔍 Verifying content integrity for blob ${blobId}...`);
        const calculatedHash = await this.calculateHashFromBinary(new Uint8Array(binaryData));
        integrityVerified = calculatedHash.hash === expectedHash;
        
        if (integrityVerified) {
          console.log('✅ Content integrity verified - data is authentic');
        } else {
          const errorDetails = {
            expected: expectedHash.substring(0, 16) + '...',
            calculated: calculatedHash.hash.substring(0, 16) + '...',
            blobId,
            fullExpectedHash: expectedHash,
            fullCalculatedHash: calculatedHash.hash,
            dataSize: binaryData.byteLength,
            correlationId
          };
          
          console.error('❌ CRITICAL: Content integrity verification FAILED!', errorDetails);
          
          // SECURITY: Reject corrupted/tampered data immediately
          throw new Error(`Content integrity verification failed for blob ${blobId}. Expected hash: ${expectedHash.substring(0, 16)}..., got: ${calculatedHash.hash.substring(0, 16)}... This indicates data corruption or tampering.`);
        }
      }
      
      return {
        success: true,
        data,
        size: binaryData.byteLength,
        retrievedAt: Date.now(),
        integrityVerified,
        verificationPerformed: !!expectedHash,
        aggregatorUrl: this.config.aggregatorUrl,
        correlationId
      };
    } catch (error) {
      clearTimeout(getTimeout);
      
      // Handle timeout specifically
      if (error.name === 'AbortError') {
        const timeoutError = new Error(`Walrus retrieve operation timed out after ${timeout}ms`);
        timeoutError.code = 'TIMEOUT';
        timeoutError.aggregatorUrl = this.config.aggregatorUrl;
        timeoutError.blobId = blobId;
        throw timeoutError;
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  // Get retrieve operation statistics
  getRetrieveStats() {
    return this.retrieveExecutor.getStats();
  }

  // Verify blob integrity without full retrieval (lightweight verification)
  async verifyBlobIntegrity(blobId, expectedHash) {
    try {
      console.log(`🔍 Performing lightweight integrity check for blob: ${blobId}`);
      
      // Make a HEAD request to get blob metadata without downloading (with timeout)
      const headController = new AbortController();
      const headTimeout = setTimeout(() => headController.abort(), 5000);
      const response = await fetch(`${this.config.aggregatorUrl}/v1/blobs/${blobId}`, {
        method: 'HEAD',
        signal: headController.signal
      });
      clearTimeout(headTimeout);
      
      if (!response.ok) {
        return {
          success: false,
          error: `Blob not accessible: HTTP ${response.status}`,
          blobId,
          accessible: false
        };
      }
      
      // If HEAD request succeeds, perform full verification
      const result = await this.retrieveBlob(blobId, expectedHash);
      
      return {
        success: result.success,
        integrityVerified: result.integrityVerified,
        verificationPerformed: result.verificationPerformed,
        blobId,
        accessible: true,
        dataSize: result.size,
        error: result.error
      };
    } catch (error) {
      console.error(`Failed to verify blob integrity: ${typeof error === 'string' ? error : (error && error.message) || 'Unknown error'}`);
      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        blobId,
        accessible: false,
        integrityVerified: false
      };
    }
  }

  // Enhanced integrity verification with detailed reporting
  async performComprehensiveIntegrityCheck(blobId, expectedHash, metadata = {}) {
    console.log(`🔒 Starting comprehensive integrity check for blob: ${blobId}`);
    
    const startTime = Date.now();
    const report = {
      blobId,
      expectedHash: expectedHash?.substring(0, 16) + '...',
      metadata,
      startTime,
      steps: [],
      success: false,
      integrityVerified: false
    };
    
    try {
      // Step 1: Check blob accessibility
      report.steps.push({ step: 1, action: 'Checking blob accessibility', startTime: Date.now() });
      const headCtl = new AbortController();
      const headT = setTimeout(() => headCtl.abort(), 5000);
      const headResponse = await fetch(`${this.config.aggregatorUrl}/v1/blobs/${blobId}`, {
        method: 'HEAD',
        signal: headCtl.signal
      });
      clearTimeout(headT);
      
      if (!headResponse.ok) {
        report.steps[0].result = 'FAILED';
        report.steps[0].error = `HTTP ${headResponse.status}: ${headResponse.statusText}`;
        report.error = `Blob not accessible: ${headResponse.status}`;
        return report;
      }
      
      report.steps[0].result = 'PASSED';
      report.steps[0].endTime = Date.now();
      
      // Step 2: Retrieve and verify content
      report.steps.push({ step: 2, action: 'Retrieving and verifying content', startTime: Date.now() });
      const retrievalResult = await this.retrieveBlob(blobId, expectedHash);
      
      if (!retrievalResult.success) {
        report.steps[1].result = 'FAILED';
        report.steps[1].error = retrievalResult.error;
        report.error = retrievalResult.error;
        return report;
      }
      
      report.steps[1].result = retrievalResult.integrityVerified ? 'PASSED' : 'FAILED';
      report.steps[1].endTime = Date.now();
      report.steps[1].integrityVerified = retrievalResult.integrityVerified;
      report.steps[1].dataSize = retrievalResult.size;
      
      // Step 3: Validate data structure
      report.steps.push({ step: 3, action: 'Validating data structure', startTime: Date.now() });
      try {
        const data = retrievalResult.data;
        const validationChecks = {
          hasValidStructure: !!(data && typeof data === 'object'),
          hasTimestamp: !!data.timestamp,
          hasSpreadsheetId: !!data.spreadsheetId,
          hasVersion: !!data.version,
          hasMetadata: !!data.metadata
        };
        
        report.steps[2].result = validationChecks.hasValidStructure ? 'PASSED' : 'FAILED';
        report.steps[2].validationChecks = validationChecks;
        report.steps[2].endTime = Date.now();
      } catch (validationError) {
        report.steps[2].result = 'FAILED';
        report.steps[2].error = typeof validationError === 'string' ? validationError : validationError.message || 'Unknown error';
      }
      
      // Final assessment
      report.success = retrievalResult.success;
      report.integrityVerified = retrievalResult.integrityVerified;
      report.endTime = Date.now();
      report.totalDuration = report.endTime - report.startTime;
      
      console.log(`🔒 Comprehensive integrity check completed for ${blobId}:`, {
        success: report.success,
        integrityVerified: report.integrityVerified,
        duration: report.totalDuration + 'ms'
      });
      
      return report;
    } catch (error) {
      report.error = typeof error === 'string' ? error : (error && error.message) || 'Unknown error';
      report.endTime = Date.now();
      report.totalDuration = report.endTime - report.startTime;
      console.error(`🔒 Comprehensive integrity check failed for ${blobId}:`, error);
      return report;
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
      
      // Persist batch after adding changes
      this.persistBatch(spreadsheetId);

      // ADAPTIVE BATCHING: Check if batch should be uploaded based on multiple criteria
      const shouldUpload = this.shouldUploadBatchAdaptive(batch, options);

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

  // ADAPTIVE BATCHING SYSTEM

  // Determine if batch should be uploaded using adaptive criteria
  shouldUploadBatchAdaptive(batch, options = {}) {
    const config = getCurrentConfig().storage;
    const now = Date.now();

    // 1. Force upload if explicitly requested
    if (options.force) {
      console.log('🚀 Force upload requested');
      return true;
    }

    // 2. Calculate current batch size in bytes
    const estimatedSize = this.estimateBatchSize(batch);
    console.log(`📊 Batch analysis: ${batch.changes.length} changes, ~${estimatedSize} bytes`);

    // 3. Size-based thresholds (adaptive)
    const sizeThresholds = {
      small: 8192,    // 8KB - quick upload for small changes
      medium: 32768,  // 32KB - good balance
      large: 131072,  // 128KB - efficiency threshold
      max: 524288     // 512KB - safety limit
    };

    // 4. Time-based thresholds (adaptive based on size)
    const timeThresholds = {
      immediate: 2000,   // 2 seconds for tiny changes
      quick: 5000,       // 5 seconds for small batches
      normal: 15000,     // 15 seconds for medium batches
      long: 45000,       // 45 seconds for large batches
      max: 120000        // 2 minutes absolute maximum
    };

    const batchAge = now - batch.metadata.batchStarted;

    // 5. Adaptive logic based on size and time
    if (estimatedSize >= sizeThresholds.max) {
      console.log(`📦 Size threshold exceeded (${estimatedSize} >= ${sizeThresholds.max})`);
      return true;
    }

    if (estimatedSize >= sizeThresholds.large && batchAge >= timeThresholds.quick) {
      console.log(`📦 Large batch with sufficient age (${estimatedSize} bytes, ${batchAge}ms)`);
      return true;
    }

    if (estimatedSize >= sizeThresholds.medium && batchAge >= timeThresholds.normal) {
      console.log(`📦 Medium batch with normal age (${estimatedSize} bytes, ${batchAge}ms)`);
      return true;
    }

    if (estimatedSize >= sizeThresholds.small && batchAge >= timeThresholds.long) {
      console.log(`📦 Small batch with extended age (${estimatedSize} bytes, ${batchAge}ms)`);
      return true;
    }

    // 6. Absolute maximums
    if (batchAge >= timeThresholds.max) {
      console.log(`⏰ Maximum batch age exceeded (${batchAge}ms >= ${timeThresholds.max}ms)`);
      return true;
    }

    if (batch.changes.length >= (options.maxChanges || 100)) {
      console.log(`📊 Maximum change count exceeded (${batch.changes.length})`);
      return true;
    }

    // 7. Network condition adaptive logic
    const networkScore = this.getNetworkPerformanceScore();
    if (networkScore > 0.8 && estimatedSize >= sizeThresholds.small) {
      console.log(`🌐 Good network conditions, uploading small batch (score: ${networkScore.toFixed(2)})`);
      return true;
    }

    if (networkScore < 0.3 && estimatedSize < sizeThresholds.medium && batchAge < timeThresholds.long) {
      console.log(`🌐 Poor network conditions, delaying upload (score: ${networkScore.toFixed(2)})`);
      return false;
    }

    // 8. User activity adaptive logic
    const isUserActive = this.isUserActivelyEditing(batch.metadata.spreadsheetId);
    if (!isUserActive && estimatedSize >= sizeThresholds.small) {
      console.log(`👤 User inactive, uploading pending changes`);
      return true;
    }

    console.log(`⏳ Batch not ready for upload yet (${estimatedSize} bytes, ${batchAge}ms, ${batch.changes.length} changes)`);
    return false;
  }

  // Estimate batch size in bytes for adaptive batching
  estimateBatchSize(batch) {
    try {
      // Simple estimation based on JSON serialization
      const sampleChanges = batch.changes.slice(0, Math.min(5, batch.changes.length));
      const sampleSize = JSON.stringify(sampleChanges).length;
      const avgChangeSize = sampleSize / sampleChanges.length || 100; // fallback to 100 bytes

      return batch.changes.length * avgChangeSize;
    } catch (error) {
      // Fallback estimation
      return batch.changes.length * 150; // Conservative estimate
    }
  }

  // Get network performance score (0-1, higher is better)
  getNetworkPerformanceScore() {
    try {
      // Use browser Connection API if available
      if (navigator.connection) {
        const connection = navigator.connection;
        let score = 0.5; // baseline

        // Adjust based on effective connection type
        switch (connection.effectiveType) {
          case '4g': score = 0.9; break;
          case '3g': score = 0.6; break;
          case '2g': score = 0.2; break;
          case 'slow-2g': score = 0.1; break;
          default: score = 0.5;
        }

        // Adjust based on downlink speed (Mbps)
        if (connection.downlink) {
          if (connection.downlink >= 10) score = Math.min(1.0, score + 0.2);
          else if (connection.downlink < 1) score = Math.max(0.1, score - 0.3);
        }

        // Adjust based on RTT (round trip time)
        if (connection.rtt) {
          if (connection.rtt <= 100) score = Math.min(1.0, score + 0.1);
          else if (connection.rtt >= 500) score = Math.max(0.1, score - 0.2);
        }

        return Math.max(0.1, Math.min(1.0, score));
      }

      // Fallback: use recent upload performance
      const recentPerformance = this.storeExecutor.getStats();
      if (recentPerformance.averageExecutionTime) {
        // Good performance if average execution < 5 seconds
        const performanceScore = Math.max(0.1, Math.min(1.0,
          5000 / recentPerformance.averageExecutionTime
        ));
        return performanceScore;
      }

      return 0.6; // Default moderate score
    } catch (error) {
      return 0.5; // Safe fallback
    }
  }

  // Check if user is actively editing (heuristic)
  isUserActivelyEditing(spreadsheetId) {
    try {
      const batch = this.batchQueue.get(spreadsheetId);
      if (!batch) return false;

      const recentChangeWindow = 10000; // 10 seconds
      const now = Date.now();

      // Check if recent changes were made
      const hasRecentChanges = batch.metadata.lastUpdated &&
        (now - batch.metadata.lastUpdated) < recentChangeWindow;

      // Check batch frequency (multiple changes in short time = active editing)
      const isFrequentChanges = batch.changes.length >= 3 &&
        (now - batch.metadata.batchStarted) < 30000; // 30 seconds

      return hasRecentChanges || isFrequentChanges;
    } catch (error) {
      return false;
    }
  }

  // Upload batch to Walrus with Quilt
  async uploadBatch(spreadsheetId) {
    try {
      if (this.uploadInProgress.has(spreadsheetId)) {
        throw new Error('Upload already in progress for this spreadsheet');
      }

      this.uploadInProgress.add(spreadsheetId);
      this.markUploadInProgress(spreadsheetId, true);
      
      const batch = this.batchQueue.get(spreadsheetId);
      if (!batch || batch.changes.length === 0) {
        this.uploadInProgress.delete(spreadsheetId);
        this.markUploadInProgress(spreadsheetId, false);
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
      this.clearPersistedBatch(spreadsheetId);
      
      return {
        success: true,
        blobId: result.blobId,
        batchSize: batch.changes.length,
        uploadedAt: Date.now(),
        metadata: result.metadata
      };
    } catch (error) {
      this.uploadInProgress.delete(spreadsheetId);
      this.markUploadInProgress(spreadsheetId, false);
      console.error('Failed to upload batch:', error);
      throw error;
    }
  }

  // Store data using Walrus API (compatible with batch operations)
  async storeWithQuilt(data) {
    try {
      const encoded = await this.encodeSpreadsheetData(data);
      const binaryData = encoded.data;

      // Create blob with raw binary data (no FormData - not supported by Walrus)
      const blob = new Blob([binaryData], { type: 'application/octet-stream' });
      
      // Store metadata locally for application use (cannot send to Walrus API)
      const metadata = {
        contentType: 'application/octet-stream',
        spreadsheetId: data.spreadsheetId,
        version: data.version,
        format: data.quilt?.format || 'walsheetz-v1',
        changeCount: data.changes?.length || 0,
        timestamp: Date.now(),
        size: binaryData.length,
        tags: [
          'walsheetz',
          'spreadsheet',
          `id:${data.spreadsheetId}`,
          `version:${data.version}`,
          ...(data.quilt?.tags || [])
        ]
      };
      
      // Default to 50 epochs for testnet (about 100 days)
      const epochs = 50;

      // Use standard Walrus API with raw binary data
      const response = await fetch(`${this.config.publisherUrl}/v1/blobs?epochs=${epochs}`, {
        method: 'PUT',
        body: blob,
        headers: {
          'Content-Type': 'application/octet-stream',
        }
      });

      if (!response.ok) {
        let errorText;
        try {
          errorText = await response.text();
        } catch (readError) {
          errorText = `Unable to read error response: ${typeof readError === 'string' ? readError : readError.message || 'Unknown error'}`;
        }
        throw new Error(`Walrus storage failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      
      // Handle both response types (newlyCreated and alreadyCertified)
      if (result.newlyCreated) {
        return {
          success: true,
          blobId: result.newlyCreated.blobObject.blobId,
          size: binaryData.length,
          endEpoch: result.newlyCreated.blobObject.storage.endEpoch,
          suiObjectId: result.newlyCreated.blobObject.id,
          status: 'newly_created',
          metadata: metadata,
          url: `${this.config.blobUrl}/${result.newlyCreated.blobObject.blobId}`
        };
      } else if (result.alreadyCertified) {
        return {
          success: true,
          blobId: result.alreadyCertified.blobId,
          size: binaryData.length,
          endEpoch: result.alreadyCertified.endEpoch,
          eventTxDigest: result.alreadyCertified.event.txDigest,
          status: 'already_certified',
          metadata: metadata,
          url: `${this.config.blobUrl}/${result.alreadyCertified.blobId}`
        };
      } else {
        // Enhanced error with response details for debugging
        const errorDetails = {
          responseKeys: Object.keys(result),
          responseContent: result,
          expectedFields: ['newlyCreated', 'alreadyCertified'],
          publisherUrl: this.config.publisherUrl,
          dataSize: binaryData.length
        };
        console.error('Unexpected Walrus response format:', errorDetails);
        throw new Error(`Unexpected response format from Walrus: ${JSON.stringify(errorDetails, null, 2)}`);
      }
    } catch (error) {
      // Enhanced error logging with context
      const debugInfo = {
        method: 'storeWithQuilt',
        spreadsheetId: data?.spreadsheetId,
        dataSize: data ? JSON.stringify(data).length : 0,
        publisherUrl: this.config.publisherUrl,
        errorType: error.name,
        errorMessage: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        timestamp: new Date().toISOString()
      };
      
      console.error('Walrus storeWithQuilt operation failed:', debugInfo);
      
      // Re-throw with enhanced context
      throw new Error(`Walrus storage failed for spreadsheet ${data?.spreadsheetId || 'unknown'}: ${typeof error === 'string' ? error : (error && error.message) || 'Unknown error'}. Debug info: ${JSON.stringify(debugInfo)}`);
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

  // Delta compression for efficient version storage
  async storeDeltaVersion(spreadsheetId, newData, previousBlobId = null) {
    try {
      console.log(`📊 Creating delta version for spreadsheet: ${spreadsheetId}`);
      
      let deltaData;
      let compressionInfo = {
        method: 'full',
        originalSize: JSON.stringify(newData).length,
        compressedSize: 0,
        compressionRatio: 1.0,
        deltaSize: 0
      };
      
      // If we have a previous version, create a delta
      if (previousBlobId) {
        try {
          console.log(`🔄 Creating delta from previous version: ${previousBlobId}`);
          
          // Retrieve previous version
          const previousResult = await this.retrieveBlob(previousBlobId);
          if (previousResult.success) {
            const previousData = previousResult.data;
            
            // Create delta using cell-level diffing
            const delta = this.createCellDelta(previousData, newData);
            
            compressionInfo.method = 'delta';
            compressionInfo.deltaSize = JSON.stringify(delta).length;
            compressionInfo.compressedSize = compressionInfo.deltaSize;
            compressionInfo.compressionRatio = compressionInfo.originalSize / compressionInfo.compressedSize;
            
            // Use delta if it's significantly smaller (>30% reduction)
            if (compressionInfo.compressionRatio > 1.3) {
              deltaData = {
                type: 'delta',
                baseVersion: previousBlobId,
                spreadsheetId,
                version: newData.version,
                timestamp: Date.now(),
                delta: delta,
                compressionInfo,
                metadata: {
                  ...newData.metadata,
                  isDelta: true,
                  baseVersionBlobId: previousBlobId,
                  compressionRatio: compressionInfo.compressionRatio
                }
              };
              
              console.log(`✅ Delta compression effective: ${(compressionInfo.compressionRatio * 100).toFixed(1)}% compression`);
            }
          }
        } catch (deltaError) {
          console.warn(`⚠️ Delta compression failed, falling back to full storage: ${typeof deltaError === 'string' ? deltaError : deltaError.message || 'Unknown error'}`);
        }
      }
      
      // Fall back to full data if delta wasn't created or effective
      if (!deltaData) {
        deltaData = {
          type: 'full',
          ...newData,
          compressionInfo,
          metadata: {
            ...newData.metadata,
            isDelta: false,
            compressionMethod: 'full'
          }
        };
        
        compressionInfo.compressedSize = compressionInfo.originalSize;
      }
      
      // Store the optimized data
      const result = await this.storeBlob(deltaData, {
        spreadsheetId,
        compressionMethod: compressionInfo.method,
        compressionRatio: compressionInfo.compressionRatio
      });
      
      if (result.success) {
        result.compressionInfo = compressionInfo;
        console.log(`💾 Delta version stored successfully:`, {
          blobId: result.blobId,
          method: compressionInfo.method,
          ratio: `${(compressionInfo.compressionRatio * 100).toFixed(1)}%`,
          originalSize: compressionInfo.originalSize,
          compressedSize: compressionInfo.compressedSize
        });
      }
      
      return result;
    } catch (error) {
      console.error(`Failed to store delta version: ${typeof error === 'string' ? error : (error && error.message) || 'Unknown error'}`);
      throw error;
    }
  }

  // Create cell-level delta between two spreadsheet versions
  createCellDelta(previousData, newData) {
    const delta = {
      added: {},
      modified: {},
      deleted: [],
      metadata: {}
    };
    
    const prevCells = previousData.cells || {};
    const newCells = newData.cells || {};
    
    // Find added and modified cells
    for (const [cellKey, cellValue] of Object.entries(newCells)) {
      if (!(cellKey in prevCells)) {
        // New cell
        delta.added[cellKey] = cellValue;
      } else if (JSON.stringify(prevCells[cellKey]) !== JSON.stringify(cellValue)) {
        // Modified cell
        delta.modified[cellKey] = {
          old: prevCells[cellKey],
          new: cellValue
        };
      }
    }
    
    // Find deleted cells
    for (const cellKey of Object.keys(prevCells)) {
      if (!(cellKey in newCells)) {
        delta.deleted.push(cellKey);
      }
    }
    
    // Track metadata changes
    if (JSON.stringify(previousData.metadata) !== JSON.stringify(newData.metadata)) {
      delta.metadata = {
        old: previousData.metadata,
        new: newData.metadata
      };
    }
    
    return delta;
  }

  // Reconstruct full data from delta
  async reconstructFromDelta(deltaData, retrievalCache = new Map()) {
    try {
      if (deltaData.type === 'full') {
        return deltaData;
      }
      
      console.log(`🔄 Reconstructing data from delta, base version: ${deltaData.baseVersion}`);
      
      // Get base version (use cache to avoid repeated retrievals)
      let baseData;
      if (retrievalCache.has(deltaData.baseVersion)) {
        baseData = retrievalCache.get(deltaData.baseVersion);
      } else {
        const baseResult = await this.retrieveBlob(deltaData.baseVersion);
        if (!baseResult.success) {
          throw new Error(`Failed to retrieve base version: ${deltaData.baseVersion}`);
        }
        baseData = baseResult.data;
        
        // If base is also a delta, reconstruct it first
        if (baseData.type === 'delta') {
          baseData = await this.reconstructFromDelta(baseData, retrievalCache);
        }
        
        retrievalCache.set(deltaData.baseVersion, baseData);
      }
      
      // Apply delta to base data
      const reconstructed = JSON.parse(JSON.stringify(baseData)); // Deep copy
      const delta = deltaData.delta;
      
      // Apply cell changes
      if (!reconstructed.cells) reconstructed.cells = {};
      
      // Add new cells
      for (const [cellKey, cellValue] of Object.entries(delta.added || {})) {
        reconstructed.cells[cellKey] = cellValue;
      }
      
      // Modify existing cells
      for (const [cellKey, change] of Object.entries(delta.modified || {})) {
        reconstructed.cells[cellKey] = change.new;
      }
      
      // Delete cells
      for (const cellKey of delta.deleted || []) {
        delete reconstructed.cells[cellKey];
      }
      
      // Apply metadata changes
      if (delta.metadata && delta.metadata.new) {
        reconstructed.metadata = delta.metadata.new;
      }
      
      // Update version info
      reconstructed.version = deltaData.version;
      reconstructed.timestamp = deltaData.timestamp;
      reconstructed.spreadsheetId = deltaData.spreadsheetId;
      
      console.log(`✅ Data reconstructed from delta successfully`);
      return reconstructed;
      
    } catch (error) {
      console.error(`Failed to reconstruct from delta: ${typeof error === 'string' ? error : (error && error.message) || 'Unknown error'}`);
      throw error;
    }
  }

  // Enhanced retrieve method that handles both full and delta versions
  async retrieveBlobWithReconstruction(blobId, expectedHash = null) {
    try {
      const result = await this.retrieveBlob(blobId, expectedHash);
      
      if (!result.success) {
        return result;
      }
      
      // If it's a delta version, reconstruct the full data
      if (result.data.type === 'delta') {
        console.log(`🔄 Retrieved delta version, reconstructing full data...`);
        const reconstructedData = await this.reconstructFromDelta(result.data);
        
        return {
          ...result,
          data: reconstructedData,
          reconstructed: true,
          originalDelta: result.data
        };
      }
      
      return {
        ...result,
        reconstructed: false
      };
    } catch (error) {
      console.error(`Failed to retrieve blob with reconstruction: ${typeof error === 'string' ? error : (error && error.message) || 'Unknown error'}`);
      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        blobId,
        reconstructed: false
      };
    }
  }

  // Multi-blob redundancy for critical data resilience
  async storeWithRedundancy(data, redundancyLevel = 3, metadata = {}) {
    try {
      console.log(`🛡️ Storing data with ${redundancyLevel}x redundancy`);
      
      const redundantStorage = {
        primaryBlobId: null,
        redundantBlobIds: [],
        successCount: 0,
        failureCount: 0,
        totalAttempts: redundancyLevel,
        redundancyLevel,
        contentHash: null,
        errors: []
      };
      
      // Calculate content hash first
      const contentHashInfo = await this.calculateContentHash(data);
      redundantStorage.contentHash = contentHashInfo;
      
      // Enhanced metadata with redundancy info
      const enhancedMetadata = {
        ...metadata,
        redundancyLevel,
        isRedundant: true,
        redundancyId: `redundant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        originalTimestamp: Date.now()
      };
      
      // Store multiple copies
      const storePromises = [];
      for (let i = 0; i < redundancyLevel; i++) {
        const copyMetadata = {
          ...enhancedMetadata,
          redundancyCopy: i + 1,
          redundancyTotal: redundancyLevel
        };
        
        storePromises.push(
          this.storeBlob(data, copyMetadata)
            .then(result => ({ copyIndex: i, result }))
            .catch(error => ({ copyIndex: i, error }))
        );
      }
      
      // Wait for all storage attempts
      const results = await Promise.allSettled(storePromises);
      
      // Process results
      for (const settledResult of results) {
        if (settledResult.status === 'fulfilled') {
          const { copyIndex, result, error } = settledResult.value;
          
          if (result && result.success) {
            redundantStorage.successCount++;
            if (copyIndex === 0) {
              redundantStorage.primaryBlobId = result.blobId;
            } else {
              redundantStorage.redundantBlobIds.push(result.blobId);
            }
            
            console.log(`✅ Redundant copy ${copyIndex + 1} stored: ${result.blobId}`);
          } else {
            redundantStorage.failureCount++;
            redundantStorage.errors.push({
              copy: copyIndex + 1,
              error: error?.message || result?.error || 'Unknown error'
            });
            console.warn(`❌ Redundant copy ${copyIndex + 1} failed: ${typeof error === 'string' ? error : error?.message || result?.error || 'Unknown error'}`);
          }
        } else {
          redundantStorage.failureCount++;
          redundantStorage.errors.push({
            copy: 'unknown',
            error: typeof settledResult.reason === 'string' ? settledResult.reason : settledResult.reason?.message || 'Promise rejected'
          });
        }
      }
      
      // Determine overall success
      const minSuccessRequired = Math.ceil(redundancyLevel / 2); // At least half must succeed
      const overallSuccess = redundantStorage.successCount >= minSuccessRequired;
      
      console.log(`🛡️ Redundant storage completed:`, {
        success: overallSuccess,
        successCount: redundantStorage.successCount,
        failureCount: redundantStorage.failureCount,
        primaryBlobId: redundantStorage.primaryBlobId,
        redundantBlobIds: redundantStorage.redundantBlobIds,
        minRequired: minSuccessRequired
      });
      
      return {
        success: overallSuccess,
        redundancyInfo: redundantStorage,
        primaryBlobId: redundantStorage.primaryBlobId,
        allBlobIds: [redundantStorage.primaryBlobId, ...redundantStorage.redundantBlobIds].filter(Boolean),
        contentHash: contentHashInfo,
        metadata: enhancedMetadata
      };
      
    } catch (error) {
      console.error(`Failed to store data with redundancy: ${typeof error === 'string' ? error : (error && error.message) || 'Unknown error'}`);
      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        redundancyInfo: null
      };
    }
  }

  // Retrieve data with redundancy fallback
  async retrieveWithRedundancy(blobIds, expectedHash = null) {
    try {
      console.log(`🛡️ Retrieving data with redundancy from ${blobIds.length} sources`);
      
      const retrieval = {
        primaryBlobId: blobIds[0],
        fallbackBlobIds: blobIds.slice(1),
        successfulBlobId: null,
        attemptResults: [],
        integrityVerified: false,
        data: null
      };
      
      // Try each blob ID in order until one succeeds
      for (const blobId of blobIds) {
        try {
          console.log(`🔄 Attempting retrieval from: ${blobId}`);
          
          const result = await this.retrieveBlob(blobId, expectedHash);
          retrieval.attemptResults.push({
            blobId,
            success: result.success,
            integrityVerified: result.integrityVerified,
            error: result.error
          });
          
          if (result.success) {
            console.log(`✅ Successfully retrieved from: ${blobId}`);
            retrieval.successfulBlobId = blobId;
            retrieval.integrityVerified = result.integrityVerified;
            retrieval.data = result.data;
            
            return {
              success: true,
              data: result.data,
              size: result.size,
              retrievedAt: result.retrievedAt,
              integrityVerified: result.integrityVerified,
              verificationPerformed: result.verificationPerformed,
              redundancyInfo: retrieval,
              usedFallback: blobId !== retrieval.primaryBlobId
            };
          }
        } catch (error) {
          console.warn(`⚠️ Failed to retrieve from ${blobId}: ${typeof error === 'string' ? error : (error && error.message) || 'Unknown error'}`);
          retrieval.attemptResults.push({
            blobId,
            success: false,
            error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
          });
        }
      }
      
      // All attempts failed
      console.error(`❌ All redundant retrieval attempts failed`);
      return {
        success: false,
        error: 'All redundant blob retrieval attempts failed',
        redundancyInfo: retrieval,
        usedFallback: false
      };
      
    } catch (error) {
      console.error(`Failed to retrieve data with redundancy: ${typeof error === 'string' ? error : (error && error.message) || 'Unknown error'}`);
      return {
        success: false,
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
        redundancyInfo: null
      };
    }
  }

  // Health check for redundant blob storage
  async checkRedundancyHealth(blobIds, expectedHash = null) {
    try {
      console.log(`🏥 Checking health of ${blobIds.length} redundant blobs`);
      
      const healthCheck = {
        totalBlobs: blobIds.length,
        healthyBlobs: 0,
        unhealthyBlobs: 0,
        integrityFailures: 0,
        accessFailures: 0,
        blobStatuses: [],
        overallHealth: 'unknown',
        redundancyLevel: 'unknown'
      };
      
      const checkPromises = blobIds.map(async (blobId, index) => {
        try {
          const result = await this.verifyBlobIntegrity(blobId, expectedHash);
          
          const status = {
            blobId,
            index: index + 1,
            accessible: result.accessible,
            integrityVerified: result.integrityVerified,
            healthy: result.success && result.accessible && (result.integrityVerified !== false),
            error: result.error,
            dataSize: result.dataSize
          };
          
          if (status.healthy) {
            healthCheck.healthyBlobs++;
          } else {
            healthCheck.unhealthyBlobs++;
            if (!result.accessible) {
              healthCheck.accessFailures++;
            } else if (result.integrityVerified === false) {
              healthCheck.integrityFailures++;
            }
          }
          
          return status;
        } catch (error) {
          healthCheck.unhealthyBlobs++;
          healthCheck.accessFailures++;
          return {
            blobId,
            index: index + 1,
            accessible: false,
            integrityVerified: false,
            healthy: false,
            error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
            dataSize: 0
          };
        }
      });
      
      healthCheck.blobStatuses = await Promise.all(checkPromises);
      
      // Determine overall health
      const healthPercentage = (healthCheck.healthyBlobs / healthCheck.totalBlobs) * 100;
      
      if (healthCheck.healthyBlobs >= Math.ceil(healthCheck.totalBlobs / 2)) {
        healthCheck.overallHealth = healthPercentage >= 80 ? 'excellent' : 'good';
        healthCheck.redundancyLevel = 'sufficient';
      } else if (healthCheck.healthyBlobs > 0) {
        healthCheck.overallHealth = 'degraded';
        healthCheck.redundancyLevel = 'insufficient';
      } else {
        healthCheck.overallHealth = 'critical';
        healthCheck.redundancyLevel = 'failed';
      }
      
      console.log(`🏥 Redundancy health check completed:`, {
        health: healthCheck.overallHealth,
        redundancy: healthCheck.redundancyLevel,
        healthy: `${healthCheck.healthyBlobs}/${healthCheck.totalBlobs}`,
        percentage: `${healthPercentage.toFixed(1)}%`
      });
      
      return healthCheck;
    } catch (error) {
      console.error(`Failed to check redundancy health: ${typeof error === 'string' ? error : (error && error.message) || 'Unknown error'}`);
      return {
        totalBlobs: blobIds.length,
        healthyBlobs: 0,
        unhealthyBlobs: blobIds.length,
        overallHealth: 'critical',
        redundancyLevel: 'failed',
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      };
    }
  }
  
  // Load persisted batches from localStorage
  loadPersistedBatches() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return; // Not in browser environment
    }
    
    const config = getCurrentConfig().storage.features.batchPersistence;
    if (!config.enabled) {
      return;
    }
    
    try {
      const storagePrefix = config.storageKey || 'walsheetz_batch_';
      const keys = Object.keys(localStorage).filter(key => key.startsWith(storagePrefix));
      
      for (const key of keys) {
        try {
          const spreadsheetId = key.replace(storagePrefix, '');
          const batchData = JSON.parse(localStorage.getItem(key));
          
          // Validate batch age
          const age = Date.now() - batchData.metadata.batchStarted;
          if (age > config.maxBatchAge * 2) {
            // Too old, discard
            localStorage.removeItem(key);
            console.log(`🗑️ Discarded stale batch for ${spreadsheetId} (age: ${age}ms)`);
            continue;
          }
          
          // Check if upload was in progress
          const uploadKey = `${storagePrefix}upload_${spreadsheetId}`;
          const uploadInProgress = localStorage.getItem(uploadKey);
          
          if (uploadInProgress) {
            // Clear the flag and restore the batch
            localStorage.removeItem(uploadKey);
          }
          
          // Restore batch to memory
          this.batchQueue.set(spreadsheetId, batchData);
          console.log(`✅ Restored batch for ${spreadsheetId} with ${batchData.changes.length} changes`);
          
        } catch (error) {
          console.error(`Failed to restore batch from ${key}:`, error);
          localStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.error('Failed to load persisted batches:', error);
    }
  }
  
  // Persist batch to localStorage
  persistBatch(spreadsheetId) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return; // Not in browser environment
    }
    
    const config = getCurrentConfig().storage.features.batchPersistence;
    if (!config.enabled) {
      return;
    }
    
    try {
      const batch = this.batchQueue.get(spreadsheetId);
      if (!batch) {
        return;
      }
      
      const storageKey = `${config.storageKey || 'walsheetz_batch_'}${spreadsheetId}`;
      localStorage.setItem(storageKey, JSON.stringify(batch));
      console.log(`💾 Persisted batch for ${spreadsheetId} with ${batch.changes.length} changes`);
      
    } catch (error) {
      console.error(`Failed to persist batch for ${spreadsheetId}:`, error);
    }
  }
  
  // Clear persisted batch
  clearPersistedBatch(spreadsheetId) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    
    const config = getCurrentConfig().storage.features.batchPersistence;
    const storageKey = `${config.storageKey || 'walsheetz_batch_'}${spreadsheetId}`;
    const uploadKey = `${config.storageKey || 'walsheetz_batch_'}upload_${spreadsheetId}`;
    
    localStorage.removeItem(storageKey);
    localStorage.removeItem(uploadKey);
    console.log(`🗑️ Cleared persisted batch for ${spreadsheetId}`);
  }
  
  // Mark upload in progress
  markUploadInProgress(spreadsheetId, inProgress = true) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    const config = getCurrentConfig().storage.features.batchPersistence;
    const uploadKey = `${config.storageKey || 'walsheetz_batch_'}upload_${spreadsheetId}`;

    if (inProgress) {
      localStorage.setItem(uploadKey, Date.now().toString());
    } else {
      localStorage.removeItem(uploadKey);
    }
  }

  // CONTENT DEDUPLICATION SYSTEM

  // Store content hash registry for deduplication
  getContentHashRegistry() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return {};
    }

    try {
      const registry = localStorage.getItem('walsheetz_content_registry');
      return registry ? JSON.parse(registry) : {};
    } catch (error) {
      console.warn('Failed to load content hash registry:', error);
      return {};
    }
  }

  // Save content hash registry
  saveContentHashRegistry(registry) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    try {
      // Limit registry size to prevent localStorage overflow
      const maxEntries = 1000;
      const entries = Object.entries(registry);

      if (entries.length > maxEntries) {
        // Keep only the most recent entries
        const sortedEntries = entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
        const limitedRegistry = Object.fromEntries(sortedEntries.slice(0, maxEntries));
        localStorage.setItem('walsheetz_content_registry', JSON.stringify(limitedRegistry));
        console.log(`📝 Trimmed content registry to ${maxEntries} entries`);
      } else {
        localStorage.setItem('walsheetz_content_registry', JSON.stringify(registry));
      }
    } catch (error) {
      console.warn('Failed to save content hash registry:', error);
    }
  }

  // Check if content already exists by hash
  async checkContentDeduplication(data, encodedResult, contentHash) {
    try {
      const registry = this.getContentHashRegistry();
      const hashKey = contentHash.hash;

      if (registry[hashKey]) {
        const existingEntry = registry[hashKey];
        const ageMs = Date.now() - existingEntry.timestamp;
        const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days

        // Check if entry is still valid (not too old)
        if (ageMs < maxAgeMs) {
          console.log(`🔍 Content deduplication hit! Using existing blob: ${existingEntry.blobId.substring(0, 16)}... (age: ${Math.round(ageMs / (60 * 60 * 1000))}h)`);

          // Verify the blob still exists
          try {
            await this.verifyBlobExists(existingEntry.blobId);

            // Update timestamp to keep it fresh
            registry[hashKey].timestamp = Date.now();
            registry[hashKey].accessCount = (registry[hashKey].accessCount || 0) + 1;
            this.saveContentHashRegistry(registry);

            return {
              success: true,
              deduplicated: true,
              blobId: existingEntry.blobId,
              size: encodedResult.compressedSize || encodedResult.originalSize,
              contentHash: contentHash,
              metadata: {
                originalSize: encodedResult.originalSize,
                compressedSize: encodedResult.compressedSize,
                compressionRatio: encodedResult.compressionRatio,
                algorithm: encodedResult.algorithm,
                deduplicatedAt: Date.now(),
                originalUploadedAt: existingEntry.timestamp,
                accessCount: registry[hashKey].accessCount
              }
            };
          } catch (verifyError) {
            console.warn(`❌ Blob verification failed for ${existingEntry.blobId}, removing from registry:`, typeof verifyError === 'string' ? verifyError : verifyError.message || 'Unknown error');
            delete registry[hashKey];
            this.saveContentHashRegistry(registry);
          }
        } else {
          // Entry too old, remove it
          console.log(`🗑️ Removing stale registry entry (age: ${Math.round(ageMs / (24 * 60 * 60 * 1000))} days)`);
          delete registry[hashKey];
          this.saveContentHashRegistry(registry);
        }
      }

      return null; // No deduplication possible
    } catch (error) {
      console.warn('Content deduplication check failed:', error);
      return null;
    }
  }

  // Add successful upload to deduplication registry
  addToContentRegistry(contentHash, blobId, metadata = {}) {
    try {
      const registry = this.getContentHashRegistry();
      registry[contentHash.hash] = {
        blobId,
        timestamp: Date.now(),
        accessCount: 1,
        size: metadata.originalSize || 0,
        algorithm: metadata.algorithm || 'none'
      };
      this.saveContentHashRegistry(registry);
      console.log(`📝 Added to content registry: ${contentHash.hash.substring(0, 16)}... → ${blobId.substring(0, 16)}...`);
    } catch (error) {
      console.warn('Failed to add to content registry:', error);
    }
  }

  // Verify blob still exists on Walrus
  async verifyBlobExists(blobId) {
    const url = `${this.config.blobUrl}/${blobId}`;
    const response = await fetch(url, { method: 'HEAD' });

    if (!response.ok) {
      throw new Error(`Blob verification failed: HTTP ${response.status}`);
    }

    return true;
  }

  // Get deduplication statistics
  getDeduplicationStats() {
    const registry = this.getContentHashRegistry();
    const entries = Object.values(registry);

    return {
      totalEntries: entries.length,
      totalAccesses: entries.reduce((sum, entry) => sum + (entry.accessCount || 1), 0),
      oldestEntry: entries.length > 0 ? Math.min(...entries.map(e => e.timestamp)) : null,
      newestEntry: entries.length > 0 ? Math.max(...entries.map(e => e.timestamp)) : null,
      registrySize: JSON.stringify(registry).length
    };
  }

  // CACHE MANAGEMENT

  // Get comprehensive cache statistics
  async getCacheStats() {
    try {
      const indexedDBStats = await indexedDBCache.getCacheStats();
      const deduplicationStats = this.getDeduplicationStats();

      return {
        indexedDB: indexedDBStats,
        deduplication: deduplicationStats,
        performance: {
          storeStats: this.storeExecutor.getStats(),
          retrieveStats: this.retrieveExecutor.getStats()
        },
        policies: {
          maxCacheSize: indexedDBCache.policies.maxCacheSize,
          maxVersionAge: indexedDBCache.policies.maxVersionAge,
          compressionThreshold: indexedDBCache.policies.compressionThreshold
        }
      };
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return null;
    }
  }

  // Clear all caches
  async clearAllCaches() {
    try {
      // Clear IndexedDB cache
      await indexedDBCache.clearCache();

      // Clear deduplication registry
      if (typeof window !== 'undefined' && window.localStorage) {
        const registryKeys = Object.keys(localStorage).filter(key =>
          key.startsWith('walsheetz_content_registry')
        );
        registryKeys.forEach(key => localStorage.removeItem(key));
      }

      console.log('🧹 All caches cleared successfully');
      return true;
    } catch (error) {
      console.error('Failed to clear caches:', error);
      return false;
    }
  }

  // Cache preloader for frequently accessed data
  async preloadCache(spreadsheetId, versionIds = []) {
    try {
      console.log(`🔄 Preloading cache for spreadsheet ${spreadsheetId.substring(0, 8)}...`);

      const preloadPromises = versionIds.map(async (versionId) => {
        try {
          // Check if already cached
          const cached = await indexedDBCache.getCachedVersion(versionId);
          if (cached) {
            console.log(`📦 Version ${versionId.substring(0, 8)}... already cached`);
            return;
          }

          // Fetch and cache
          const result = await this.retrieveBlob(versionId);
          if (result.success) {
            console.log(`📦 Preloaded version ${versionId.substring(0, 8)}...`);
          }
        } catch (error) {
          console.warn(`Failed to preload version ${versionId}:`, typeof error === 'string' ? error : (error && error.message) || 'Unknown error');
        }
      });

      await Promise.allSettled(preloadPromises);
      console.log(`✅ Cache preloading completed for spreadsheet ${spreadsheetId.substring(0, 8)}...`);
    } catch (error) {
      console.error('Cache preloading failed:', error);
    }
  }

  // DELTA STORAGE OPTIMIZATION SYSTEM

  // Create delta between two cell data objects for efficient storage
  createCellsDelta(previousCells, currentCells) {
    if (!previousCells) {
      // If no previous data, return full snapshot
      return {
        type: 'full',
        cells: currentCells,
        operations: Object.keys(currentCells || {}).length
      };
    }

    const delta = {
      type: 'delta',
      added: {},
      modified: {},
      removed: [],
      operations: 0
    };

    const prevKeys = new Set(Object.keys(previousCells || {}));
    const currKeys = new Set(Object.keys(currentCells || {}));

    // Find added and modified cells
    for (const cellKey of currKeys) {
      const currentCell = currentCells[cellKey];
      const previousCell = previousCells[cellKey];

      if (!prevKeys.has(cellKey)) {
        // New cell
        delta.added[cellKey] = currentCell;
        delta.operations++;
      } else {
        // Check if cell was modified
        const currentValue = JSON.stringify(currentCell);
        const previousValue = JSON.stringify(previousCell);

        if (currentValue !== previousValue) {
          delta.modified[cellKey] = currentCell;
          delta.operations++;
        }
      }
    }

    // Find removed cells
    for (const cellKey of prevKeys) {
      if (!currKeys.has(cellKey)) {
        delta.removed.push(cellKey);
        delta.operations++;
      }
    }

    return delta;
  }

  // Apply delta to reconstruct full cell data
  applyCellDelta(baseCells, delta) {
    if (delta.type === 'full') {
      return delta.cells;
    }

    const result = { ...(baseCells || {}) };

    // Apply additions
    for (const [cellKey, cellData] of Object.entries(delta.added || {})) {
      result[cellKey] = cellData;
    }

    // Apply modifications
    for (const [cellKey, cellData] of Object.entries(delta.modified || {})) {
      result[cellKey] = cellData;
    }

    // Apply removals
    for (const cellKey of delta.removed || []) {
      delete result[cellKey];
    }

    return result;
  }

  // Store delta version with fallback to full storage
  async storeCellsDeltaVersion(currentData, previousData, metadata = {}) {
    try {
      const delta = this.createCellsDelta(
        previousData?.cells,
        currentData.cells
      );

      // Calculate delta efficiency - use delta if it saves >40% space
      const currentSize = JSON.stringify(currentData.cells || {}).length;
      const deltaSize = JSON.stringify(delta).length;
      const efficiency = deltaSize / currentSize;

      console.log(`📊 Delta efficiency: ${deltaSize}/${currentSize} = ${(efficiency * 100).toFixed(1)}%`);

      if (efficiency < 0.6 && delta.type === 'delta') {
        // Delta is efficient - store delta
        const deltaData = {
          ...currentData,
          deltaInfo: {
            type: 'delta',
            parentBlobId: metadata.parentBlobId,
            operations: delta.operations,
            efficiency: efficiency
          },
          cells: delta
        };

        console.log(`✅ Using delta storage (${delta.operations} operations, ${(efficiency * 100).toFixed(1)}% of full size)`);

        const result = await this.storeBlob(deltaData, {
          ...metadata,
          storageType: 'delta',
          compressionThreshold: 4096 // Lower threshold for deltas
        });

        return {
          ...result,
          deltaInfo: {
            type: 'delta',
            operations: delta.operations,
            efficiency: efficiency,
            compressionInfo: result.metadata
          }
        };
      } else {
        // Delta not efficient or is a full snapshot - store full version
        console.log(`📁 Using full storage (delta not efficient: ${(efficiency * 100).toFixed(1)}% of full size)`);

        const result = await this.storeBlob(currentData, {
          ...metadata,
          storageType: 'full',
          compressionThreshold: 4096 // Improved compression threshold
        });

        return {
          ...result,
          deltaInfo: {
            type: 'full',
            operations: Object.keys(currentData.cells || {}).length,
            efficiency: 1.0,
            compressionInfo: result.metadata
          }
        };
      }
    } catch (error) {
      console.error('Delta storage failed, falling back to full storage:', error);

      // Fallback to full storage
      const result = await this.storeBlob(currentData, {
        ...metadata,
        storageType: 'full_fallback'
      });

      return {
        ...result,
        deltaInfo: {
          type: 'full_fallback',
          error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
          operations: Object.keys(currentData.cells || {}).length
        }
      };
    }
  }

  // Retrieve and reconstruct data from delta chain
  async retrieveDeltaVersion(blobId, metadata = {}) {
    try {
      const data = await this.retrieveBlob(blobId);

      if (!data.deltaInfo || data.deltaInfo.type === 'full') {
        // Full version - return as is
        return data;
      }

      // Delta version - need to reconstruct
      if (!metadata.parentBlobId) {
        throw new Error('Parent blob ID required for delta reconstruction');
      }

      console.log(`🔄 Reconstructing delta version from parent: ${metadata.parentBlobId.substring(0, 16)}...`);

      // Recursively get parent data
      const parentData = await this.retrieveDeltaVersion(metadata.parentBlobId);

      // Apply delta to reconstruct full data
      const reconstructedCells = this.applyCellDelta(parentData.cells, data.cells);

      return {
        ...data,
        cells: reconstructedCells,
        reconstructed: true,
        reconstructionChain: (parentData.reconstructionChain || 0) + 1
      };
    } catch (error) {
      console.error('Delta reconstruction failed:', error);
      throw error;
    }
  }

  getRenewalThresholdDays(options = {}) {
    const config = getCurrentConfig();
    const override = options.renewalWarningDays;
    const defaultWarning = config.storage?.features?.chunk?.renewalWarningDays ||
      config.walrus?.features?.renewalWarningDays ||
      7;
    return Math.max(1, override || defaultWarning);
  }

  buildChunkMetadata(existingChunk = {}, overrides = {}) {
    const config = getCurrentConfig();
    const now = Date.now();
    const chunkOptions = overrides || {};

    const epochsDefault = chunkOptions.epochs ||
      existingChunk.epochsPurchased ||
      config.walrus?.features?.epochsDefault ||
      50;

    const epochSeconds = config.walrus?.features?.epochSeconds || 60 * 60 * 24 * 2;
    const epochStart = existingChunk.epochStart || chunkOptions.epochStart || Math.floor(now / 1000 / epochSeconds);
    const epochEnd = epochStart + epochsDefault;

    const expiryTimestamp = chunkOptions.expiryTimestamp ||
      existingChunk.expiryTimestamp ||
      (epochEnd * epochSeconds * 1000);

    return {
      epochsPurchased: epochsDefault,
      epochStart,
      epochEnd,
      expiryTimestamp,
      renewalCount: existingChunk.renewalCount || 0,
      lastRenewedAt: existingChunk.lastRenewedAt || now,
      renewalWarningDays: this.getRenewalThresholdDays(chunkOptions),
      purchaseReceipt: chunkOptions.purchaseReceipt || existingChunk.purchaseReceipt || null,
      walrusPublisher: chunkOptions.publisherUrl || this.config.publisherUrl,
      walrusBlobId: chunkOptions.blobId || existingChunk.walrusBlobId || null
    };
  }
}

// Export the class for testing
export { WalrusService };

// Create singleton instance
export const walrusService = new WalrusService();

// Convenience functions
export const storeSpreadsheetData = (data, metadata) => walrusService.storeBlob(data, metadata);
export const retrieveSpreadsheetData = (blobId) => walrusService.retrieveBlob(blobId);
export const batchChanges = (spreadsheetId, changes, options) => walrusService.storeBatch(spreadsheetId, changes, options);
export const getBatchStatus = (spreadsheetId) => walrusService.getBatchStatus(spreadsheetId);
export const forceUpload = (spreadsheetId) => walrusService.forceUpload(spreadsheetId);
