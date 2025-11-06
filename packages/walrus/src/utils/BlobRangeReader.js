// Blob Range Reader - Read partial blob data with Range headers

/**
 * Read a range of bytes from a blob
 * @param {string} aggregatorUrl - Aggregator base URL
 * @param {string} blobId - Blob ID to read from
 * @param {number} offset - Starting byte offset
 * @param {number} length - Number of bytes to read
 * @returns {Promise<{success: boolean, blobId: string, offset: number, length: number, data: ArrayBuffer, totalSize: number}>}
 */
export async function readBlobRange(aggregatorUrl, blobId, offset, length) {
  try {
    const rangeUrl = `${aggregatorUrl}/v1/blobs/${blobId}`;
    const rangeHeader = `bytes=${offset}-${offset + length - 1}`;

    const response = await fetch(rangeUrl, {
      method: 'GET',
      headers: { Range: rangeHeader }
    });

    if (!response.ok) {
      return {
        success: false,
        blobId,
        offset,
        length,
        data: null,
        totalSize: 0,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }

    // Get total size from Content-Range header (e.g., "bytes 0-99/1000")
    const contentRange = response.headers.get('Content-Range');
    const totalSize = contentRange ? parseInt(contentRange.split('/')[1]) : 0;

    const data = await response.arrayBuffer();

    return {
      success: true,
      blobId,
      offset,
      length: data.byteLength,
      data,
      totalSize
    };
  } catch (error) {
    return {
      success: false,
      blobId,
      offset,
      length,
      data: null,
      totalSize: 0,
      error: error.message
    };
  }
}
