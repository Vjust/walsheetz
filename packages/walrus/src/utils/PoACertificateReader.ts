// PoA Certificate Reader - Fetch PoA certificates from Walrus aggregator

/**
 * Get PoA certificate for a blob
 * @param {string} aggregatorUrl - Aggregator base URL
 * @param {string} blobId - Blob ID to get certificate for
 * @param {Object} transport - Transport instance with getBlob method
 * @returns {Promise<{success: boolean, blobId: string, poaStatus: string, certificate: Object|null}>}
 */
export async function getPoaCertificate(aggregatorUrl, blobId, transport) {
  try {
    // Fetch certificate from /v1/blobs/{blobId}/cert endpoint
    const certUrl = `${aggregatorUrl}/v1/blobs/${blobId}/cert`;
    const response = await fetch(certUrl, { method: 'GET' });

    if (response.status === 404) {
      return {
        success: true,
        blobId,
        poaStatus: 'not_found',
        certificate: null
      };
    }

    if (!response.ok) {
      return {
        success: false,
        blobId,
        poaStatus: 'error',
        certificate: null,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const certificate = await response.json();

    // Determine PoA status from certificate
    const poaStatus = certificate?.certified ? 'certified' : 'uncertified';

    return {
      success: true,
      blobId,
      poaStatus,
      certificate
    };
  } catch (error) {
    return {
      success: false,
      blobId,
      poaStatus: 'error',
      certificate: null,
      error: (error as Error).message
    };
  }
}
