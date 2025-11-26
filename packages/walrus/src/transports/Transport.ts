// Transport interface for Walrus storage operations
// Defines the contract for all transport implementations

export interface PutBlobResult {
  blobId: string;
  response?: Response;
}

export interface GetBlobResult {
  data: Uint8Array;
  response?: Response;
}

export interface HeadBlobResult {
  exists: boolean;
  response?: Response;
}

/**
 * Base transport interface for Walrus blob operations
 * Implementations: ProxyTransport (via /api/walrus-*), DirectTransport (direct Walrus URLs)
 */
export class Transport {
  async putBlob(url: string, payload: Uint8Array, epochs: number): Promise<PutBlobResult> {
    throw new Error('putBlob() must be implemented by subclass');
  }

  async getBlob(url: string, blobId: string): Promise<GetBlobResult> {
    throw new Error('getBlob() must be implemented by subclass');
  }

  async headBlob(url: string, blobId: string): Promise<HeadBlobResult> {
    throw new Error('headBlob() must be implemented by subclass');
  }
}
