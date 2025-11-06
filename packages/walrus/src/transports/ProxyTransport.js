// Proxy transport for Walrus operations via /api/walrus-* endpoints
// Includes rate limiting support

import { Transport } from "@/walrus/transports/Transport.js";

export class ProxyTransport extends Transport {
  constructor(rateLimiters = null) {
    super();
    this.rateLimiters = rateLimiters;
  }

  async putBlob(url, payload, epochs) {
    const fullUrl = `${url}/v1/blobs?epochs=${epochs}`;

    const doFetch = async () => {
      const response = await fetch(fullUrl, {
        method: 'PUT',
        body: payload,
        headers: { 'Content-Type': 'application/octet-stream' }
      });

      if (!response.ok) {
        const error = new Error(`PUT ${fullUrl} failed: ${response.status} ${response.statusText}`);
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

  async getBlob(url, blobId) {
    const fullUrl = `${url}/v1/blobs/${blobId}`;

    const doFetch = async () => {
      const response = await fetch(fullUrl, { method: 'GET' });

      if (!response.ok) {
        const error = new Error(`GET ${fullUrl} failed: ${response.status} ${response.statusText}`);
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

  async headBlob(url, blobId) {
    const fullUrl = `${url}/v1/blobs/${blobId}`;

    const doFetch = async () => {
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