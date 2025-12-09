/// <reference lib="dom" />
// NOTE: Node/server/CLI usage only. The React UI must use @/sdk/* or @/walrus/* (Browser*Service).
// Walrus storage service for WalSheetz
import { getCurrentConfig } from './config.js';
// TODO: Extract ResilientExecutor and indexedDBCache to @dreamlit/walrus
// import { ResilientExecutor, indexedDBCache } from '@dreamlit/walrus';

// Stub implementations for optional features not yet extracted
const ResilientExecutor = class {
  config: unknown;
  constructor(config: unknown) {
    this.config = config;
  }
  async execute(fn: () => Promise<unknown>) {
    return await fn();
  }
  getStats() {
    return { averageExecutionTime: 0 };
  }
};

const indexedDBCache = {
  async getCachedVersion() { return null; },
  async cacheVersion() {},
  async getCacheStats() { return { size: 0, entries: 0 }; },
  async clearCache() {},
  policies: { maxCacheSize: 0, maxVersionAge: 0, compressionThreshold: 0 }
};

// SDK support for Node.js (if available)
let WalrusClient, SuiClient;
try {
  const walrusModule = await import('@mysten/walrus');
  const suiModule = await import('@mysten/sui/client');
  WalrusClient = walrusModule.WalrusClient;
  SuiClient = suiModule.SuiClient;
} catch (error) {
  const err = error as Error;
  console.warn('[WalrusService] SDK not available in Node.js environment:', err.message);
}

class WalrusService {
  private config: Record<string, unknown>;
  private batchQueue: Map<string, unknown>;
  private uploadInProgress: Set<string>;
  private storeExecutor: InstanceType<typeof ResilientExecutor>;
  private retrieveExecutor: InstanceType<typeof ResilientExecutor>;
  private sdkClient: unknown | null;
  private suiClient: unknown | null;

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
    if (WalrusClient && SuiClient && (this.config as Record<string, unknown>)?.features) {
      try {
        const fullConfig = getCurrentConfig();
        const features = ((this.config as Record<string, unknown>).features as Record<string, unknown>) || {};
        const useSdk = (features.useSdk as boolean) || false;

        if (useSdk) {
          const fullConfigObj = fullConfig as Record<string, unknown>;
          const suiConfig = (fullConfigObj.sui as Record<string, unknown>) || {};
          this.suiClient = new SuiClient({ url: (suiConfig.rpcUrl as string) || '' });

          const sdkNetwork = (features.sdkNetwork as string) ||
                           ((fullConfigObj.environment as string) === 'mainnet' ? 'mainnet' : 'testnet');

          this.sdkClient = new WalrusClient({
            network: sdkNetwork,
            suiClient: this.suiClient
          } as any);

          console.log('[WalrusService] SDK initialized for Node.js environment');
        }
      } catch (sdkError) {
        const err = sdkError as Error;
        console.warn('[WalrusService] Failed to initialize SDK, will use HTTP fallback:', err.message);
        this.sdkClient = null;
        this.suiClient = null;
      }
    }
  }

  // Convert spreadsheet data to binary JSON for efficient storage with optional compression
  async encodeSpreadsheetData(data: unknown, options: Record<string, unknown> = {}) {
    try {
      // Create optimized data structure
      const dataObj = data as Record<string, unknown>;
      const optionsObj = options as Record<string, unknown>;
      const optimizedData = {
        version: (dataObj.version as number) || 1,
        timestamp: Date.now(),
        spreadsheetId: dataObj.spreadsheetId,
        metadata: {
          title: (dataObj.title as string) || 'Untitled Spreadsheet',
          createdAt: (dataObj.createdAt as number) || Date.now(),
          lastModified: Date.now(),
          format: 'walsheetz-v1',
          chunk: this.buildChunkMetadata((dataObj.metadata as Record<string, unknown> | undefined)?.chunk as Record<string, unknown>, optionsObj.chunk as Record<string, unknown>)
        },
        changes: (dataObj.changes as unknown[]) || [],
        cells: this.optimizeCellData((dataObj.cells as Record<string, unknown>) || {}),
        sheets: (dataObj.sheets as unknown[]) || []
      };

      // Convert to binary JSON (using TextEncoder for efficiency)
      const jsonString = JSON.stringify(optimizedData);
      const encoder = new TextEncoder();
      const rawData = encoder.encode(jsonString);
      
      // Enhanced compression with multiple algorithms and lower threshold
      const compressionThreshold = (optionsObj.compressionThreshold as number) || 4096; // Lowered to 4KB
      const preferredAlgorithm = (optionsObj.compressionAlgorithm as string) || 'auto';
      const shouldCompress = rawData.length > compressionThreshold &&
                            typeof CompressionStream !== 'undefined';

      if (shouldCompress) {
        console.log(`📦 Compressing data (${rawData.length} bytes > ${compressionThreshold} threshold, algorithm: ${preferredAlgorithm})`);

        try {
          let bestResult: Record<string, unknown> | null = null;
          const algorithms = this.getAvailableCompressionAlgorithms(preferredAlgorithm);

          // Try each algorithm and pick the best one
          for (const algorithm of algorithms) {
            try {
              const compressedData = await this.compressDataWithAlgorithm(rawData, algorithm);
              const compressionRatio = rawData.length / compressedData.length;

              const result: Record<string, unknown> = {
                data: compressedData,
                compressed: true,
                originalSize: rawData.length,
                compressedSize: compressedData.length,
                compressionRatio,
                algorithm
              };

              // Pick the best compression ratio
              if (!bestResult || (result.compressionRatio as number) > (bestResult.compressionRatio as number)) {
                bestResult = result;
              }

              console.log(`  ${algorithm}: ${rawData.length} → ${compressedData.length} bytes (${compressionRatio.toFixed(2)}x)`);

              // If algorithm is not 'auto', use the first successful result
              if (preferredAlgorithm !== 'auto') {
                break;
              }
            } catch (algoError) {
              const err = algoError as Error;
              console.warn(`  ${algorithm} compression failed:`, typeof algoError === 'string' ? algoError : err.message || 'Unknown error');
            }
          }

          if (bestResult) {
            console.log(`✅ Best compression: ${bestResult.algorithm} with ${((bestResult.compressionRatio as number) * 100).toFixed(2)}% ratio`);
            return bestResult;
          } else {
            throw new Error('All compression algorithms failed');
          }
        } catch (compressError) {
          const err = compressError as Error;
          console.warn('Enhanced compression failed, falling back to raw data:', typeof compressError === 'string' ? compressError : err.message || 'Unknown error');
          return {
            data: rawData,
            compressed: false,
            originalSize: rawData.length,
            compressedSize: rawData.length,
            compressionRatio: 1.0,
            algorithm: 'none',
            compressionError: typeof compressError === 'string' ? compressError : err.message || 'Unknown error'
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
      const err = error as Error;
      console.error('Failed to encode spreadsheet data:', err);
      throw err;
    }
  }
  
  // Compress data using CompressionStream API (gzip)
  async compressData(data: Uint8Array): Promise<Uint8Array> {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      }
    });

    const compressedStream = stream.pipeThrough(new CompressionStream('gzip') as any);
    const reader = compressedStream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value as Uint8Array);
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
  async decompressData(compressedData: Uint8Array): Promise<Uint8Array> {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(compressedData);
        controller.close();
      }
    });

    const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip') as any);
    const reader = decompressedStream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value as Uint8Array);
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
  getAvailableCompressionAlgorithms(preferred = 'auto'): string[] {
    const algorithms: string[] = [];

    // Check what's available in the browser
    if (typeof CompressionStream !== 'undefined') {
      // Add algorithms in order of preference for spreadsheet data
      try {
        // Brotli is usually best for text data like JSON
        new CompressionStream('br' as CompressionFormat);
        algorithms.push('br');
      } catch (e) {
        // Brotli not supported
      }

      try {
        // Gzip is widely supported and good for JSON
        new CompressionStream('gzip' as CompressionFormat);
        algorithms.push('gzip');
      } catch (e) {
        // Gzip not supported (very rare)
      }

      try {
        // Deflate as fallback
        new CompressionStream('deflate' as CompressionFormat);
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
  async compressDataWithAlgorithm(data: Uint8Array, algorithm: string): Promise<Uint8Array> {
    if (algorithm === 'none') {
      return data;
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      }
    });

    const compressedStream = stream.pipeThrough(new CompressionStream(algorithm as CompressionFormat) as any);
    const reader = compressedStream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value as Uint8Array);
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
  async decompressDataWithAlgorithm(compressedData: Uint8Array, algorithm: string): Promise<Uint8Array> {
    if (algorithm === 'none') {
      return compressedData;
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(compressedData);
        controller.close();
      }
    });

    const decompressedStream = stream.pipeThrough(new DecompressionStream(algorithm as CompressionFormat) as any);
    const reader = decompressedStream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value as Uint8Array);
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
  async calculateContentHash(data: unknown) {
    try {
      const encoded = await this.encodeSpreadsheetData(data);
      const dataToHash = (encoded.data as any) instanceof Uint8Array ? encoded.data : new Uint8Array(encoded.data as any);
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataToHash as BufferSource);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      return {
        hash: hashHex,
        algorithm: 'SHA-256',
        dataSize: (dataToHash as Uint8Array).length,
        timestamp: Date.now()
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to calculate content hash:', err);
      throw err;
    }
  }

  // Calculate SHA-256 hash from already-encoded binary data
  async calculateHashFromBinary(binaryData: Uint8Array) {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', binaryData as BufferSource);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      return {
        hash: hashHex,
        algorithm: 'SHA-256',
        dataSize: binaryData.length,
        timestamp: Date.now()
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to calculate hash from binary data:', err);
      throw err;
    }
  }

  // Optimize cell data structure for storage
  // Accept both UI shape ({ value, formula, type, s }) and storage shape ({ v, f, t, s })
  optimizeCellData(cells: Record<string, unknown>): Record<string, unknown> {
    const optimized: Record<string, unknown> = {};

    // Handle null or undefined input
    if (!cells || typeof cells !== 'object') {
      return optimized;
    }

    for (const [cellKey, cellData] of Object.entries(cells)) {
      if (!cellData || typeof cellData !== 'object') continue;

      const cellObj = cellData as Record<string, unknown>;
      const value = cellObj.v !== undefined ? cellObj.v : cellObj.value;
      const formula = cellObj.f !== undefined ? cellObj.f : cellObj.formula;
      const type = cellObj.t !== undefined ? cellObj.t : cellObj.type;
      const style = cellObj.s;

      if (value !== undefined || formula !== undefined) {
        optimized[cellKey] = { v: value, f: formula, t: type, s: style };
      }
    }

    return optimized;
  }

  // Store blob to Walrus with integrity verification, compression, and resilient execution
  async storeBlob(data: unknown, metadata: Record<string, unknown> = {}) {
    // Note: SDK path in Node.js environment requires server-side keypair or transaction proxy
    // For now, server-side continues to use HTTP API. SDK path would require additional setup.
    // Client-side (BrowserWalrusService) uses SDK with wallet integration.

    // Step 1: Encode data with optional compression
    const encodedResult = await this.encodeSpreadsheetData(data, {
      compressionThreshold: (metadata.compressionThreshold as number) || 16384
    });
    
    // Step 2: Calculate hash from the final data (compressed or raw)
    const contentHash = await this.calculateHashFromBinary(encodedResult.data as Uint8Array);
    console.log(`📍 Content hash calculated: ${contentHash.hash.substring(0, 16)}...`);
    
    // Log compression stats if compressed
    const encodedObj = encodedResult as Record<string, unknown>;
    if (encodedObj.compressed) {
      console.log(`📦 Data compressed: ${encodedObj.originalSize} → ${encodedObj.compressedSize} bytes (${((encodedObj.compressionRatio as number) || 1).toFixed(2)}x)`);
    }

    // Execute store operation with circuit breaker and retry logic
    return (this.storeExecutor as any).execute(async () => {
      return this._performStoreOperation(
        data,
        encodedResult,
        contentHash,
        {
          ...metadata,
          compression: encodedObj.algorithm,
          originalSize: encodedObj.originalSize,
          compressedSize: encodedObj.compressedSize,
          compressionRatio: encodedObj.compressionRatio
        }
      );
    });
  }

  // Internal method for the actual store operation with timeout support
  async _performStoreOperation(data: unknown, encodedResult: Record<string, unknown>, contentHash: Record<string, unknown>, metadata: Record<string, unknown> = {}) {
    // Handle both old format (direct binaryData) and new format (encodedResult object)
    const binaryData = ((encodedResult.data as Uint8Array) || (encodedResult as any)) as Uint8Array;

    // CONTENT DEDUPLICATION CHECK
    const deduplicationResult = await this.checkContentDeduplication(data, encodedResult, contentHash);
    if (deduplicationResult) {
      console.log('🎯 Content deduplication successful - skipping upload');
      return deduplicationResult;
    }

    // Create blob directly for Walrus API
    const blob = new Blob([binaryData as any], { type: 'application/octet-stream' });

    // Default to 50 epochs for testnet (about 100 days)
    const epochs = 50;

    // Upload to Walrus publisher using correct API format with timeout
    const url = `${this.config.publisherUrl}/v1/blobs?epochs=${epochs}`;
    console.log('🚀 Attempting to store blob to:', url);
    
    // Create AbortController for timeout (default 20 seconds for PUT)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), (metadata.timeout as number) || 20000);
    
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
          const err = readError as Error;
          errorText = `Unable to read error response: ${typeof readError === 'string' ? readError : err.message || 'Unknown error'}`;
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
          publisherUrl: (this.config as Record<string, unknown>).publisherUrl,
          dataSize: (binaryData as any).length || ((binaryData as any) as ArrayBuffer).byteLength,
          contentType: response.headers.get('content-type'),
          correlationId,
          responseHeaders: Object.fromEntries((response.headers as any).entries() || []),
          errorBody: errorText,
          timestamp: new Date().toISOString()
        };

        console.error('Walrus HTTP request failed:', errorContext);
        throw new Error(`Walrus storage HTTP ${response.status} (${response.statusText}): ${errorText}. CorrelationId: ${correlationId}`);
      }

      const result = await response.json() as Record<string, unknown>;

      // Capture correlation ID from successful response
      const correlationId = response.headers.get('x-correlation-id') ||
                           response.headers.get('x-request-id') ||
                           'not-provided';

      // Handle both response types (newlyCreated and alreadyCertified)
      if (result.newlyCreated) {
        const newlyCreated = result.newlyCreated as Record<string, unknown>;
        const blobObject = newlyCreated.blobObject as Record<string, unknown>;
        const blobId = blobObject.blobId as string;

        // Add to deduplication registry for future efficiency
        this.addToContentRegistry(contentHash, blobId, {
          originalSize: (encodedResult.originalSize as number) || binaryData.length,
          algorithm: (encodedResult.algorithm as string) || 'none'
        });

        return {
          success: true,
          blobId: blobId,
          size: (binaryData as any).length || ((binaryData as unknown) as ArrayBuffer).byteLength,
          endEpoch: ((blobObject.storage as Record<string, unknown>).endEpoch),
          suiObjectId: blobObject.id,
          status: 'newly_created',
          url: `${(this.config as Record<string, unknown>).blobUrl}/${blobId}`,
          publisherUrl: (this.config as Record<string, unknown>).publisherUrl,
          correlationId,
          // Include content hash for integrity verification
          contentHash: contentHash,
          metadata: {
            ...metadata,
            originalSize: (encodedResult.originalSize as number) || binaryData.length,
            compressedSize: (encodedResult.compressedSize as number) || binaryData.length,
            compressionRatio: (encodedResult.compressionRatio as number) || 1.0,
            algorithm: (encodedResult.algorithm as string) || 'none',
            uploadedAt: Date.now(),
            contentHash: (contentHash.hash as string),
            hashAlgorithm: contentHash.algorithm
          }
        };
      } else if (result.alreadyCertified) {
        const alreadyCertified = result.alreadyCertified as Record<string, unknown>;
        const blobId = alreadyCertified.blobId as string;

        // Add to deduplication registry for future efficiency
        this.addToContentRegistry(contentHash, blobId, {
          originalSize: (encodedResult.originalSize as number) || binaryData.length,
          algorithm: (encodedResult.algorithm as string) || 'none'
        });

        return {
          success: true,
          blobId: blobId,
          size: (binaryData as any).length || ((binaryData as unknown) as ArrayBuffer).byteLength,
          endEpoch: alreadyCertified.endEpoch,
          eventTxDigest: ((alreadyCertified.event as Record<string, unknown>).txDigest),
          status: 'already_certified',
          url: `${(this.config as Record<string, unknown>).blobUrl}/${blobId}`,
          publisherUrl: (this.config as Record<string, unknown>).publisherUrl,
          correlationId,
          // Include content hash for integrity verification
          contentHash: contentHash,
          metadata: {
            ...metadata,
            originalSize: (encodedResult.originalSize as number) || binaryData.length,
            compressedSize: (encodedResult.compressedSize as number) || binaryData.length,
            compressionRatio: (encodedResult.compressionRatio as number) || 1.0,
            algorithm: (encodedResult.algorithm as string) || 'none',
            uploadedAt: Date.now(),
            contentHash: (contentHash.hash as string),
            hashAlgorithm: contentHash.algorithm
          }
        };
      } else {
        throw new Error('Unexpected response format from Walrus');
      }
    } catch (error) {
      const err = error as Error & { name?: string; code?: string; publisherUrl?: unknown; dataSize?: number };
      clearTimeout(timeout);

      // Handle timeout specifically
      if (err.name === 'AbortError') {
        const timeoutError = new Error(`Walrus store operation timed out after ${(metadata.timeout as number) || 20000}ms`) as Error & { code?: string; publisherUrl?: unknown; dataSize?: number };
        timeoutError.code = 'TIMEOUT';
        timeoutError.publisherUrl = (this.config as Record<string, unknown>).publisherUrl;
        timeoutError.dataSize = binaryData.length;
        throw timeoutError;
      }

      // Re-throw other errors
      throw err;
    }
  }

  // Get store operation statistics
  getStoreStats() {
    return (this.storeExecutor as any).getStats();
  }
  
  // Store blob to multiple endpoints for redundancy
  async storeBlobWithRedundancy(data: unknown, metadata: Record<string, unknown> = {}) {
    const fullConfig = getCurrentConfig() as Record<string, unknown>;
    const config = (fullConfig.walrus as Record<string, unknown>) || {};

    // Check if redundancy is enabled
    const redundancy = (config.redundancy as Record<string, unknown>) || {};
    const publishers = (config.publishers as string[]) || [];
    if (!(redundancy.enabled as boolean) || publishers.length <= 1) {
      console.log('🔔 Redundancy not enabled or insufficient endpoints, using single store');
      return this.storeBlob(data, metadata);
    }
    
    console.log(`🛡️ Starting redundant storage to ${publishers.length} endpoints`);

    // Step 1: Encode data with optional compression
    const encodedResult = await this.encodeSpreadsheetData(data, {
      compressionThreshold: (metadata.compressionThreshold as number) || 16384
    });

    // Step 2: Calculate hash from the final data
    const contentHash = await this.calculateHashFromBinary((encodedResult.data as Uint8Array));
    console.log(`📍 Content hash for redundancy: ${(contentHash.hash as string).substring(0, 16)}...`);

    // Step 3: Store to multiple endpoints
    const storePromises: Promise<any>[] = [];
    const maxRedundancy = (redundancy.maxEndpoints as number) || 3;
    const maxEndpoints = Math.min(maxRedundancy, publishers.length);

    for (let i = 0; i < maxEndpoints; i++) {
      const publisherUrl = (publishers[i] as string);
      const encodedObj = encodedResult as Record<string, unknown>;
      const endpointMetadata = {
        ...metadata,
        publisherUrl,
        endpointIndex: i,
        compression: encodedObj.algorithm,
        originalSize: encodedObj.originalSize,
        compressedSize: encodedObj.compressedSize,
        compressionRatio: encodedObj.compressionRatio
      };

      // Create promise for each endpoint
      const storePromise = this._storeToEndpoint(
        publisherUrl,
        (encodedObj.data as Uint8Array),
        contentHash,
        endpointMetadata
      ).catch((error: any) => ({
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
    const successfulStores: any[] = [];
    const failedStores: any[] = [];
    const blobIds: string[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled' && (result.value as any).success) {
        successfulStores.push(result.value);
        blobIds.push((result.value as any).blobId);
      } else {
        failedStores.push((result as any).reason || (result as any).value);
      }
    }

    // Check if minimum successful stores met
    const minSuccessful = ((redundancy.minSuccessful as number) || 1);
    if (successfulStores.length >= minSuccessful) {
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
      console.error(`❌ Redundant storage failed: only ${successfulStores.length}/${minSuccessful} succeeded`);
      return {
        success: false,
        error: `Insufficient successful stores: ${successfulStores.length}/${minSuccessful}`,
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
  async _storeToEndpoint(publisherUrl: string, binaryData: Uint8Array, contentHash: Record<string, unknown>, metadata: Record<string, unknown> = {}) {
    console.log(`📤 Storing to endpoint: ${publisherUrl}`);
    
    // Create blob
    const blob = new Blob([binaryData as any], { type: 'application/octet-stream' });
    const epochs = 50;
    const url = `${publisherUrl}/v1/blobs?epochs=${epochs}`;
    
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ((metadata as any).timeout as number) || 20000);
    
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
      
      const result = await response.json() as any;

      // Handle response types
      if ((result as any).newlyCreated || (result as any).alreadyCertified) {
        const blobId = (result as any).newlyCreated?.blobObject?.blobId || (result as any).alreadyCertified?.blobId;
        return {
          success: true,
          blobId,
          publisherUrl,
          size: (binaryData as any).length || ((binaryData as unknown) as ArrayBuffer).byteLength,
          contentHash,
          metadata
        };
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (error) {
      const err = error as Error & { name?: string };
      clearTimeout(timeout);

      if (err.name === 'AbortError') {
        throw new Error(`Timeout after ${metadata.timeout || 20000}ms`);
      }
      throw err;
    }
  }

  // Retrieve blob from Walrus with integrity verification and resilient execution
  async retrieveBlob(blobId: string, expectedHash: string | null = null) {
    // INDEXEDDB CACHE CHECK FIRST
    try {
      const cachedResult = await (indexedDBCache as any).getCachedVersion(blobId);
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
    return (this.retrieveExecutor as any).execute(async () => {
      const result = await this._performRetrieveOperation(blobId, expectedHash);

      // Cache successful results for future use
      if (result.success && result.data) {
        try {
          await (indexedDBCache as any).cacheVersion(blobId, result.data, {
            contentHash: expectedHash || result.contentHash,
            cachedFrom: 'walrus',
            blobUrl: result.url
          });
        } catch (cacheError) {
          console.warn('Failed to cache retrieved data:', typeof cacheError === 'string' ? cacheError : cacheError.message || 'Unknown error');
        }
      }

      return result;
    }).catch(async (error) => {
      // Enhanced fallback: try cache again as last resort
      const err = error as Error;
      console.warn('🔄 Retrieve operation failed, attempting cache fallback...', typeof error === 'string' ? error : (err && err.message) || 'Unknown error');

      try {
        const cachedResult = await (indexedDBCache as any).getCachedVersion(blobId);
        if (cachedResult) {
          console.log(`📦 Using stale cache as fallback for blob ${blobId.substring(0, 8)}...`);
          return {
            success: true,
            data: (cachedResult as Record<string, unknown>).data,
            fromCache: true,
            stale: true, // Indicate this is potentially stale data
            cacheInfo: (cachedResult as Record<string, unknown>).cacheInfo,
            fallbackReason: typeof error === 'string' ? error : (err && err.message) || 'Unknown error',
            warning: 'Using cached data due to network failure'
          };
        }
      } catch (fallbackCacheError) {
        const fallbackErr = fallbackCacheError as Error;
        console.error('Fallback cache lookup also failed:', typeof fallbackCacheError === 'string' ? fallbackCacheError : fallbackErr.message || 'Unknown error');
      }

      return {
        success: false,
        error: `Walrus retrieval unavailable: ${typeof error === 'string' ? error : (err && err.message) || 'Unknown error'}`,
        fallback: 'cache_or_local',
        blobId
      };
    });
  }

  // Internal method for the actual retrieve operation with timeout and HEAD validation
  async _performRetrieveOperation(blobId: string, expectedHash: string | null = null, timeout = 20000): Promise<Record<string, unknown>> {
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
      const err = error as Error & { name?: string };
      clearTimeout(headTimeout);
      if (err.name === 'AbortError') {
        throw new Error(`HEAD request timed out for blob ${blobId}`);
      }
      throw err;
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
      
      let decompressedData: ArrayBuffer | Uint8Array = binaryData;
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
      const jsonString = decoder.decode(decompressedData as any);
      let data = JSON.parse(jsonString);

      // Normalize cell shape for consumers (convert {v,f,t,s} -> {value, formula, type, s})
      if (data && typeof data === 'object' && (data as any).cells && typeof (data as any).cells === 'object') {
        const anyCell = Object.values((data as any).cells)[0];
        if (anyCell && ((anyCell as any).v !== undefined || (anyCell as any).f !== undefined)) {
          const uiCells: Record<string, any> = {};
          for (const [key, cell] of Object.entries((data as any).cells)) {
            if (!cell || typeof cell !== 'object') continue;
            uiCells[key] = {
              value: (cell as any).v,
              formula: (cell as any).f,
              type: (cell as any).t,
              s: (cell as any).s
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
      const err = error as Error & { name?: string; code?: string; aggregatorUrl?: unknown; blobId?: unknown };
      clearTimeout(getTimeout);

      // Handle timeout specifically
      if (err.name === 'AbortError') {
        const timeoutError = new Error(`Walrus retrieve operation timed out after ${timeout}ms`) as Error & { code?: string; aggregatorUrl?: unknown; blobId?: unknown };
        timeoutError.code = 'TIMEOUT';
        timeoutError.aggregatorUrl = this.config.aggregatorUrl;
        timeoutError.blobId = blobId;
        throw timeoutError;
      }

      // Re-throw other errors
      throw err;
    }
  }

  // Get retrieve operation statistics
  getRetrieveStats() {
    return (this.retrieveExecutor as any).getStats();
  }

  // Verify blob integrity without full retrieval (lightweight verification)
  async verifyBlobIntegrity(blobId: string, expectedHash: string | null) {
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
      const err = error as Error;
      console.error(`Failed to verify blob integrity: ${typeof error === 'string' ? error : (err && err.message) || 'Unknown error'}`);
      return {
        success: false,
        error: typeof error === 'string' ? error : (err && err.message) || 'Unknown error',
        blobId,
        accessible: false,
        integrityVerified: false
      };
    }
  }

  // Enhanced integrity verification with detailed reporting
  async performComprehensiveIntegrityCheck(blobId: string, expectedHash: string, metadata: Record<string, unknown> = {}) {
    console.log(`🔒 Starting comprehensive integrity check for blob: ${blobId}`);
    
    const startTime = Date.now();
    const report = {
      blobId,
      expectedHash: expectedHash?.substring(0, 16) + '...',
      metadata,
      startTime,
      steps: [],
      success: false,
      integrityVerified: false,
      error: null as string | null,
      endTime: null as number | null,
      totalDuration: null as number | null
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
      const err = error as Error;
      report.error = typeof error === 'string' ? error : (err && err.message) || 'Unknown error';
      report.endTime = Date.now();
      report.totalDuration = report.endTime - report.startTime;
      console.error(`🔒 Comprehensive integrity check failed for ${blobId}:`, err);
      return report;
    }
  }

  // Batch storage using Walrus Quilt
  async storeBatch(spreadsheetId: string, changes: unknown[], options: Record<string, unknown> = {}) {
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

      const batch = this.batchQueue.get(spreadsheetId) as any;

      // Add changes to batch
      (batch as any).changes.push(...changes);
      (batch as any).metadata.lastUpdated = Date.now();
      (batch as any).metadata.totalChanges = (batch as any).changes.length;
      
      // Add custom tags if provided
      if ((options.tags as unknown[]) && Array.isArray(options.tags)) {
        (batch as any).metadata.tags.push(...(options.tags as unknown[]));
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
        batchSize: (batch as any).changes.length,
        message: 'Changes added to batch, waiting for upload threshold'
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to batch changes:', err);
      throw err;
    }
  }

  // ADAPTIVE BATCHING SYSTEM

  // Determine if batch should be uploaded using adaptive criteria
  shouldUploadBatchAdaptive(batch: Record<string, unknown>, options: Record<string, unknown> = {}): boolean {
    const config = getCurrentConfig().storage;
    const now = Date.now();

    // 1. Force upload if explicitly requested
    if (options.force) {
      console.log('🚀 Force upload requested');
      return true;
    }

    // 2. Calculate current batch size in bytes
    const estimatedSize = this.estimateBatchSize(batch);
    console.log(`📊 Batch analysis: ${(batch as any).changes.length} changes, ~${estimatedSize} bytes`);

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

    const batchAge = now - (batch as any).metadata.batchStarted;

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

    if ((batch as any).changes.length >= (options.maxChanges || 100)) {
      console.log(`📊 Maximum change count exceeded (${(batch as any).changes.length})`);
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
    const isUserActive = this.isUserActivelyEditing((batch as any).metadata.spreadsheetId);
    if (!isUserActive && estimatedSize >= sizeThresholds.small) {
      console.log(`👤 User inactive, uploading pending changes`);
      return true;
    }

    console.log(`⏳ Batch not ready for upload yet (${estimatedSize} bytes, ${batchAge}ms, ${(batch as any).changes.length} changes)`);
    return false;
  }

  // Estimate batch size in bytes for adaptive batching
  estimateBatchSize(batch) {
    try {
      // Simple estimation based on JSON serialization
      const sampleChanges = (batch as any).changes.slice(0, Math.min(5, (batch as any).changes.length));
      const sampleSize = JSON.stringify(sampleChanges).length;
      const avgChangeSize = sampleSize / sampleChanges.length || 100; // fallback to 100 bytes

      return (batch as any).changes.length * avgChangeSize;
    } catch (error) {
      const err = error as Error;
      // Fallback estimation
      return (batch as any).changes.length * 150; // Conservative estimate
    }
  }

  // Get network performance score (0-1, higher is better)
  getNetworkPerformanceScore() {
    try {
      // Use browser Connection API if available
      if ((navigator as any).connection) {
        const connection = (navigator as any).connection;
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
      const err = error as Error;
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
      const hasRecentChanges = (batch as any).metadata.lastUpdated &&
        (now - (batch as any).metadata.lastUpdated) < recentChangeWindow;

      // Check batch frequency (multiple changes in short time = active editing)
      const isFrequentChanges = (batch as any).changes.length >= 3 &&
        (now - (batch as any).metadata.batchStarted) < 30000; // 30 seconds

      return hasRecentChanges || isFrequentChanges;
    } catch (error) {
      const err = error as Error;
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
      
      const batch = this.batchQueue.get(spreadsheetId) as any;
      if (!batch || (batch as any).changes.length === 0) {
        this.uploadInProgress.delete(spreadsheetId);
        this.markUploadInProgress(spreadsheetId, false);
        throw new Error('No changes to upload');
      }

      // Prepare data for Walrus Quilt
      const quiltData = {
        spreadsheetId,
        version: Date.now(), // Use timestamp as version
        changes: (batch as any).changes,
        metadata: (batch as any).metadata,
        quilt: {
          format: 'walsheetz-quilt-v1',
          compression: 'binary-json',
          tags: (batch as any).metadata.tags
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
        batchSize: (batch as any).changes.length,
        uploadedAt: Date.now(),
        metadata: result.metadata
      };
    } catch (error) {
      const err = error as Error;
      this.uploadInProgress.delete(spreadsheetId);
      this.markUploadInProgress(spreadsheetId, false);
      console.error('Failed to upload batch:', err);
      throw err;
    }
  }

  // Store data using Walrus API (compatible with batch operations)
  async storeWithQuilt(data) {
    try {
      const encoded = await this.encodeSpreadsheetData(data);
      const binaryData = encoded.data;

      // Create blob with raw binary data (no FormData - not supported by Walrus)
      const blob = new Blob([binaryData as any], { type: 'application/octet-stream' });
      
      // Store metadata locally for application use (cannot send to Walrus API)
      const metadata = {
        contentType: 'application/octet-stream',
        spreadsheetId: data.spreadsheetId,
        version: data.version,
        format: data.quilt?.format || 'walsheetz-v1',
        changeCount: (data as any).changes?.length || 0,
        timestamp: Date.now(),
        size: (binaryData as any).length || (binaryData as ArrayBuffer).byteLength,
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

      const result = await response.json() as any;

      // Handle both response types (newlyCreated and alreadyCertified)
      if ((result as any).newlyCreated) {
        return {
          success: true,
          blobId: (result as any).newlyCreated.blobObject.blobId,
          size: (binaryData as any).length || ((binaryData as unknown) as ArrayBuffer).byteLength,
          endEpoch: (result as any).newlyCreated.blobObject.storage.endEpoch,
          suiObjectId: (result as any).newlyCreated.blobObject.id,
          status: 'newly_created',
          metadata: metadata,
          url: `${this.config.blobUrl}/${(result as any).newlyCreated.blobObject.blobId}`
        };
      } else if ((result as any).alreadyCertified) {
        return {
          success: true,
          blobId: (result as any).alreadyCertified.blobId,
          size: (binaryData as any).length || ((binaryData as unknown) as ArrayBuffer).byteLength,
          endEpoch: (result as any).alreadyCertified.endEpoch,
          eventTxDigest: (result as any).alreadyCertified.event.txDigest,
          status: 'already_certified',
          metadata: metadata,
          url: `${this.config.blobUrl}/${(result as any).alreadyCertified.blobId}`
        };
      } else {
        // Enhanced error with response details for debugging
        const errorDetails = {
          responseKeys: Object.keys(result),
          responseContent: result,
          expectedFields: ['newlyCreated', 'alreadyCertified'],
          publisherUrl: this.config.publisherUrl,
          dataSize: (binaryData as any).length || (binaryData as ArrayBuffer).byteLength
        };
        console.error('Unexpected Walrus response format:', errorDetails);
        throw new Error(`Unexpected response format from Walrus: ${JSON.stringify(errorDetails, null, 2)}`);
      }
    } catch (error) {
      const err = error as Error & { name?: string };
      // Enhanced error logging with context
      const debugInfo = {
        method: 'storeWithQuilt',
        spreadsheetId: data?.spreadsheetId,
        dataSize: data ? JSON.stringify(data).length : 0,
        publisherUrl: this.config.publisherUrl,
        errorType: err.name,
        errorMessage: typeof error === 'string' ? error : (err && err.message) || 'Unknown error',
        timestamp: new Date().toISOString()
      };

      console.error('Walrus storeWithQuilt operation failed:', debugInfo);

      // Re-throw with enhanced context
      throw new Error(`Walrus storage failed for spreadsheet ${data?.spreadsheetId || 'unknown'}: ${typeof error === 'string' ? error : (err && err.message) || 'Unknown error'}. Debug info: ${JSON.stringify(debugInfo)}`);
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

      const results = await response.json() as any;

      return {
        success: true,
        results: (results as any).blobs || [],
        total: (results as any).total || 0
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to query by tags:', err);
      throw err;
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
      const err = error as Error;
      console.error('Failed to get storage stats:', err);
      throw err;
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
      changeCount: (batch as any).changes.length,
      batchStarted: (batch as any).metadata.batchStarted,
      lastUpdated: (batch as any).metadata.lastUpdated,
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
      const err = error as Error;
      console.error(`Failed to store delta version: ${typeof error === 'string' ? error : (err && err.message) || 'Unknown error'}`);
      throw err;
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
      for (const [cellKey, change] of Object.entries((delta as any).modified || {})) {
        (reconstructed as any).cells[cellKey] = (change as any).new;
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
      const err = error as Error;
      console.error(`Failed to reconstruct from delta: ${typeof error === 'string' ? error : (err && err.message) || 'Unknown error'}`);
      throw err;
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
      const err = error as Error;
      console.error(`Failed to retrieve blob with reconstruction: ${typeof error === 'string' ? error : (err && err.message) || 'Unknown error'}`);
      return {
        success: false,
        error: typeof error === 'string' ? error : (err && err.message) || 'Unknown error',
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
      const err = error as Error;
      console.error(`Failed to store data with redundancy: ${typeof error === 'string' ? error : (err && err.message) || 'Unknown error'}`);
      return {
        success: false,
        error: typeof error === 'string' ? error : (err && err.message) || 'Unknown error',
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
          const err = error as Error;
          console.warn(`⚠️ Failed to retrieve from ${blobId}: ${typeof error === 'string' ? error : (err && err.message) || 'Unknown error'}`);
          retrieval.attemptResults.push({
            blobId,
            success: false,
            error: typeof error === 'string' ? error : (err && err.message) || 'Unknown error'
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
      const err = error as Error;
      console.error(`Failed to retrieve data with redundancy: ${typeof error === 'string' ? error : (err && err.message) || 'Unknown error'}`);
      return {
        success: false,
        error: typeof error === 'string' ? error : (err && err.message) || 'Unknown error',
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
          const err = error as Error;
          healthCheck.unhealthyBlobs++;
          healthCheck.accessFailures++;
          return {
            blobId,
            index: index + 1,
            accessible: false,
            integrityVerified: false,
            healthy: false,
            error: typeof error === 'string' ? error : (err && err.message) || 'Unknown error',
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
      const err = error as Error;
      console.error(`Failed to check redundancy health: ${typeof error === 'string' ? error : (err && err.message) || 'Unknown error'}`);
      return {
        totalBlobs: blobIds.length,
        healthyBlobs: 0,
        unhealthyBlobs: blobIds.length,
        overallHealth: 'critical',
        redundancyLevel: 'failed',
        error: typeof error === 'string' ? error : (err && err.message) || 'Unknown error'
      };
    }
  }
  
  // Load persisted batches from localStorage
  loadPersistedBatches() {
    const storage = typeof window !== 'undefined' ? window.localStorage : null;
    if (!storage) {
      return; // Not in browser environment
    }

    const config = getCurrentConfig().storage.features.batchPersistence;
    if (!config.enabled) {
      return;
    }

    try {
      const storagePrefix = config.storageKey || 'walsheetz_batch_';
      const keys = Object.keys(storage).filter(key => key.startsWith(storagePrefix));

      for (const key of keys) {
        try {
          const spreadsheetId = key.replace(storagePrefix, '');
          const batchData = JSON.parse(storage.getItem(key) || '{}');

          // Validate batch age
          const age = Date.now() - (batchData as any).metadata.batchStarted;
          if (age > config.maxBatchAge * 2) {
            // Too old, discard
            storage.removeItem(key);
            console.log(`Discarded stale batch for ${spreadsheetId} (age: ${age}ms)`);
            continue;
          }

          // Check if upload was in progress
          const uploadKey = `${storagePrefix}upload_${spreadsheetId}`;
          const uploadInProgress = storage.getItem(uploadKey);

          if (uploadInProgress) {
            // Clear the flag and restore the batch
            storage.removeItem(uploadKey);
          }

          // Restore batch to memory
          this.batchQueue.set(spreadsheetId, batchData);
          console.log(`Restored batch for ${spreadsheetId} with ${(batchData as any).changes.length} changes`);

        } catch (error) {
          const err = error as Error;
          console.error(`Failed to restore batch from ${key}:`, err);
          storage.removeItem(key);
        }
      }
    } catch (error) {
      const err = error as Error;
      console.error('Failed to load persisted batches:', err);
    }
  }
  
  // Persist batch to localStorage
  persistBatch(spreadsheetId: any) {
    const storage = typeof window !== 'undefined' ? window.localStorage : null;
    if (!storage) {
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
      storage.setItem(storageKey, JSON.stringify(batch));
      console.log(`Persisted batch for ${spreadsheetId} with ${(batch as any).changes.length} changes`);

    } catch (error) {
      const err = error as Error;
      console.error(`Failed to persist batch for ${spreadsheetId}:`, err);
    }
  }
  
  // Clear persisted batch
  clearPersistedBatch(spreadsheetId: any) {
    const storage = typeof window !== 'undefined' ? window.localStorage : null;
    if (!storage) {
      return;
    }

    const config = getCurrentConfig().storage.features.batchPersistence;
    const storageKey = `${config.storageKey || 'walsheetz_batch_'}${spreadsheetId}`;
    const uploadKey = `${config.storageKey || 'walsheetz_batch_'}upload_${spreadsheetId}`;

    storage.removeItem(storageKey);
    storage.removeItem(uploadKey);
    console.log(`Cleared persisted batch for ${spreadsheetId}`);
  }

  // Mark upload in progress
  markUploadInProgress(spreadsheetId: any, inProgress = true) {
    const storage = typeof window !== 'undefined' ? window.localStorage : null;
    if (!storage) {
      return;
    }

    const config = getCurrentConfig().storage.features.batchPersistence;
    const uploadKey = `${config.storageKey || 'walsheetz_batch_'}upload_${spreadsheetId}`;

    if (inProgress) {
      storage.setItem(uploadKey, Date.now().toString());
    } else {
      storage.removeItem(uploadKey);
    }
  }

  // CONTENT DEDUPLICATION SYSTEM

  // Store content hash registry for deduplication
  getContentHashRegistry() {
    const storage = typeof window !== 'undefined' ? window.localStorage : null;
    if (!storage) {
      return {};
    }

    try {
      const registry = storage.getItem('walsheetz_content_registry');
      return registry ? JSON.parse(registry) : {};
    } catch (error) {
      const err = error as Error;
      console.warn('Failed to load content hash registry:', err);
      return {};
    }
  }

  // Save content hash registry
  saveContentHashRegistry(registry: any) {
    const storage = typeof window !== 'undefined' ? window.localStorage : null;
    if (!storage) {
      return;
    }

    try {
      // Limit registry size to prevent localStorage overflow
      const maxEntries = 1000;
      const entries = Object.entries(registry);

      if (entries.length > maxEntries) {
        // Keep only the most recent entries
        const sortedEntries = entries.sort((a, b) => ((b[1] as any).timestamp as number) - ((a[1] as any).timestamp as number));
        const limitedRegistry = Object.fromEntries(sortedEntries.slice(0, maxEntries));
        storage.setItem('walsheetz_content_registry', JSON.stringify(limitedRegistry));
        console.log(`Trimmed content registry to ${maxEntries} entries`);
      } else {
        storage.setItem('walsheetz_content_registry', JSON.stringify(registry));
      }
    } catch (error) {
      const err = error as Error;
      console.warn('Failed to save content hash registry:', err);
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
      const err = error as Error;
      console.warn('Content deduplication check failed:', err);
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
        size: ((metadata as any).originalSize as number) || 0,
        algorithm: ((metadata as any).algorithm as string) || 'none'
      };
      this.saveContentHashRegistry(registry);
      console.log(`📝 Added to content registry: ${contentHash.hash.substring(0, 16)}... → ${blobId.substring(0, 16)}...`);
    } catch (error) {
      const err = error as Error;
      console.warn('Failed to add to content registry:', err);
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
      totalAccesses: entries.reduce((sum: number, entry) => (sum as number) + ((((entry as any).accessCount as number) || 1) as number), 0),
      oldestEntry: entries.length > 0 ? Math.min(...entries.map(e => ((e as any).timestamp as number))) : null,
      newestEntry: entries.length > 0 ? Math.max(...entries.map(e => ((e as any).timestamp as number))) : null,
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
      const err = error as Error;
      console.error('Failed to get cache stats:', err);
      return null;
    }
  }

  // Clear all caches
  async clearAllCaches() {
    try {
      // Clear IndexedDB cache
      await indexedDBCache.clearCache();

      // Clear deduplication registry
      const storage = typeof window !== 'undefined' ? window.localStorage : null;
      if (storage) {
        const registryKeys = Object.keys(storage).filter(key =>
          key.startsWith('walsheetz_content_registry')
        );
        registryKeys.forEach(key => storage.removeItem(key));
      }

      console.log('All caches cleared successfully');
      return true;
    } catch (error) {
      const err = error as Error;
      console.error('Failed to clear caches:', err);
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
          const cached = await (indexedDBCache as any).getCachedVersion(versionId);
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
          const err = error as Error;
          console.warn(`Failed to preload version ${versionId}:`, typeof error === 'string' ? error : (err && err.message) || 'Unknown error');
        }
      });

      await Promise.allSettled(preloadPromises);
      console.log(`✅ Cache preloading completed for spreadsheet ${spreadsheetId.substring(0, 8)}...`);
    } catch (error) {
      const err = error as Error;
      console.error('Cache preloading failed:', err);
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
            parentBlobId: (metadata as any).parentBlobId,
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
      const err = error as Error;
      console.error('Delta storage failed, falling back to full storage:', err);

      // Fallback to full storage
      const result = await this.storeBlob(currentData, {
        ...metadata,
        storageType: 'full_fallback'
      });

      return {
        ...result,
        deltaInfo: {
          type: 'full_fallback',
          error: typeof error === 'string' ? error : (err && err.message) || 'Unknown error',
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
      if (!(metadata as any).parentBlobId) {
        throw new Error('Parent blob ID required for delta reconstruction');
      }

      console.log(`🔄 Reconstructing delta version from parent: ${(metadata as any).parentBlobId.substring(0, 16)}...`);

      // Recursively get parent data
      const parentData = await this.retrieveDeltaVersion((metadata as any).parentBlobId);

      // Apply delta to reconstruct full data
      const reconstructedCells = this.applyCellDelta(parentData.cells, data.cells);

      return {
        ...data,
        cells: reconstructedCells,
        reconstructed: true,
        reconstructionChain: (parentData.reconstructionChain || 0) + 1
      };
    } catch (error) {
      const err = error as Error;
      console.error('Delta reconstruction failed:', err);
      throw err;
    }
  }

  getRenewalThresholdDays(options: Record<string, unknown> = {}) {
    const config = getCurrentConfig();
    const override = (options as Record<string, unknown>).renewalWarningDays;
    const defaultWarning = ((config.storage as any)?.features as any)?.chunk?.renewalWarningDays ||
      ((config.walrus as any)?.features as any)?.renewalWarningDays ||
      7;
    return Math.max(1, (override as number) || (defaultWarning as number));
  }

  buildChunkMetadata(existingChunk: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
    const config = getCurrentConfig();
    const now = Date.now();
    const chunkOptions = overrides || {};

    const epochsDefault = (chunkOptions as Record<string, unknown>).epochs ||
      (existingChunk as Record<string, unknown>).epochsPurchased ||
      ((config.walrus as any)?.features as any)?.epochsDefault ||
      50;

    const epochSeconds = (((config.walrus as any)?.features as any)?.epochSeconds as number) || 60 * 60 * 24 * 2;
    const epochStart = (existingChunk as Record<string, unknown>).epochStart || (chunkOptions as Record<string, unknown>).epochStart || Math.floor(now / 1000 / (epochSeconds as number));
    const epochEnd = (epochStart as number) + (epochsDefault as number);

    const expiryTimestamp = (chunkOptions as Record<string, unknown>).expiryTimestamp ||
      (existingChunk as Record<string, unknown>).expiryTimestamp ||
      ((epochEnd as number) * (epochSeconds as number) * 1000);

    return {
      epochsPurchased: epochsDefault,
      epochStart,
      epochEnd,
      expiryTimestamp,
      renewalCount: (existingChunk as Record<string, unknown>).renewalCount || 0,
      lastRenewedAt: (existingChunk as Record<string, unknown>).lastRenewedAt || now,
      renewalWarningDays: this.getRenewalThresholdDays(chunkOptions as Record<string, unknown>),
      purchaseReceipt: (chunkOptions as Record<string, unknown>).purchaseReceipt || (existingChunk as Record<string, unknown>).purchaseReceipt || null,
      walrusPublisher: ((chunkOptions as Record<string, unknown>).publisherUrl as string) || ((this.config as Record<string, unknown>).publisherUrl as string),
      walrusBlobId: ((chunkOptions as Record<string, unknown>).blobId as string) || ((existingChunk as Record<string, unknown>).walrusBlobId as string) || null
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
