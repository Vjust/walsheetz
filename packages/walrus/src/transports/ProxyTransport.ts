// Proxy transport for Walrus operations via /api/walrus-* endpoints
// Includes rate limiting support

import { Transport, PutBlobResult, GetBlobResult, HeadBlobResult } from "./Transport.js";

interface HttpError extends Error {
  status?: number;
}

export class ProxyTransport extends Transport {
  rateLimiters: Record<string, { schedule: <T>(key: string, fn: () => Promise<T>) => Promise<T> }> | null;

  constructor(rateLimiters: Record<string, unknown> | null = null) {
    super();
    this.rateLimiters = rateLimiters as typeof this.rateLimiters;
  }

  async putBlob(url: string, payload: Uint8Array, epochs: number): Promise<PutBlobResult> {
    const fullUrl = `${url}/v1/blobs?epochs=${epochs}`;

    const doFetch = async (): Promise<PutBlobResult> => {
      const response = await fetch(fullUrl, {
        method: 'PUT',
        body: payload as unknown as BodyInit,
        headers: { 'Content-Type': 'application/octet-stream' }
      });

      if (!response.ok) {
        const error: HttpError = new Error(`PUT ${fullUrl} failed: ${response.status} ${response.statusText}`);
        error.status = response.status;
        throw error;
      }

      const result = await response.json();
      return { blobId: result.newlyCreated?.blobObject?.blobId || result.blobId, response };
    };

    // Apply rate limiting if available
    if (this.rateLimiters?.walrusPub) {
      return await this.rateLimiters.walrusPub.schedule(`put:${url}:${Date.now()}`, doFetch);
    }

    return await doFetch();
  }

  async getBlob(url: string, blobId: string): Promise<GetBlobResult> {
    const fullUrl = `${url}/v1/blobs/${blobId}`;

    const doFetch = async (): Promise<GetBlobResult> => {
      const response = await fetch(fullUrl, { method: 'GET' });

      if (!response.ok) {
        const error: HttpError = new Error(`GET ${fullUrl} failed: ${response.status} ${response.statusText}`);
        error.status = response.status;
        throw error;
      }

      const arrayBuffer = await response.arrayBuffer();
      return { data: new Uint8Array(arrayBuffer), response };
    };

    // Apply rate limiting if available
    if (this.rateLimiters?.walrusAgg) {
      return await this.rateLimiters.walrusAgg.schedule(`get:${blobId}`, doFetch);
    }

    return await doFetch();
  }

  async headBlob(url: string, blobId: string): Promise<HeadBlobResult> {
    const fullUrl = `${url}/v1/blobs/${blobId}`;

    const doFetch = async (): Promise<HeadBlobResult> => {
      const response = await fetch(fullUrl, { method: 'HEAD' });
      return { exists: response.ok, response };
    };

    // Apply rate limiting if available
    if (this.rateLimiters?.walrusAgg) {
      return await this.rateLimiters.walrusAgg.schedule(`head:${blobId}`, doFetch);
    }

    return await doFetch();
  }
}