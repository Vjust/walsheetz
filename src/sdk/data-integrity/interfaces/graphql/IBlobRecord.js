/**
 * Interface for Walrus blob records from GraphQL queries
 */
export class IBlobRecord {
  /**
   * @param {Object} data - Blob record data
   * @param {string} data.blobId - Unique blob identifier
   * @param {string} data.objectId - Sui object ID
   * @param {number} data.version - Object version number
   * @param {string} data.digest - Object digest hash
   * @param {string} data.owner - Owner's Sui address
   * @param {string} data.type - Blob type representation
   * @param {number} data.size - Blob size in bytes
   * @param {string} data.contentType - MIME type of blob content
   * @param {string} data.encoding - Content encoding
   * @param {Object} data.metadata - Additional blob metadata
   * @param {number} data.storageRebate - Storage rebate amount
   * @param {number} data.timestamp - Creation/modification timestamp
   * @param {string} data.transactionDigest - Associated transaction digest
   * @param {string} data.poaStatus - PoA certification status
   */
  constructor(data = {}) {
    this.blobId = data.blobId || null;
    this.objectId = data.objectId || null;
    this.version = data.version || 0;
    this.digest = data.digest || null;
    this.owner = data.owner || null;
    this.type = data.type || null;
    this.size = data.size || 0;
    this.contentType = data.contentType || 'application/octet-stream';
    this.encoding = data.encoding || null;
    this.metadata = data.metadata || {};
    this.storageRebate = data.storageRebate || 0;
    this.timestamp = data.timestamp || Date.now();
    this.transactionDigest = data.transactionDigest || null;
    this.poaStatus = data.poaStatus || 'unknown'; // 'certified', 'uncertified', 'pending', 'expired', 'unknown'
  }

  /**
   * Check if blob is certified with PoA
   * @returns {boolean}
   */
  isCertified() {
    return this.poaStatus === 'certified';
  }

  /**
   * Get human-readable size
   * @returns {string}
   */
  getFormattedSize() {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = this.size;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Get formatted timestamp
   * @returns {string}
   */
  getFormattedTimestamp() {
    if (!this.timestamp) return 'Unknown';

    const date = new Date(this.timestamp);
    return date.toLocaleString();
  }

  /**
   * Convert to plain object for serialization
   * @returns {Object}
   */
  toJSON() {
    return {
      blobId: this.blobId,
      objectId: this.objectId,
      version: this.version,
      digest: this.digest,
      owner: this.owner,
      type: this.type,
      size: this.size,
      contentType: this.contentType,
      encoding: this.encoding,
      metadata: this.metadata,
      storageRebate: this.storageRebate,
      timestamp: this.timestamp,
      transactionDigest: this.transactionDigest,
      poaStatus: this.poaStatus
    };
  }

  /**
   * Create instance from GraphQL response
   * @param {Object} gqlData - GraphQL response data
   * @returns {IBlobRecord}
   */
  static fromGraphQL(gqlData) {
    return new IBlobRecord({
      blobId: gqlData.blobId || gqlData.address,
      objectId: gqlData.objectId,
      version: gqlData.version,
      digest: gqlData.digest,
      owner: gqlData.owner,
      type: gqlData.type,
      size: gqlData.metadata?.size || gqlData.size,
      contentType: gqlData.metadata?.content_type || gqlData.contentType,
      encoding: gqlData.metadata?.encoding || gqlData.encoding,
      metadata: gqlData.metadata || gqlData.contents,
      storageRebate: gqlData.storageRebate,
      timestamp: gqlData.timestamp,
      transactionDigest: gqlData.transactionDigest,
      poaStatus: gqlData.poaStatus || 'unknown'
    });
  }

  /**
   * Validate blob record data
   * @returns {boolean}
   */
  isValid() {
    return !!(this.blobId && this.objectId && this.owner);
  }
}

export default IBlobRecord;
