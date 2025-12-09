/**
 * Interface for Walrus blob records from GraphQL queries
 */
export class IBlobRecord {
  blobId: string | null;
  objectId: string | null;
  version: number;
  digest: string | null;
  owner: string | null;
  type: string | null;
  size: number;
  contentType: string;
  encoding: string | null;
  metadata: Record<string, unknown>;
  storageRebate: number;
  timestamp: number;
  transactionDigest: string | null;
  poaStatus: string;

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
  constructor(data: Record<string, unknown> = {}) {
    this.blobId = (data.blobId as string) || null;
    this.objectId = (data.objectId as string) || null;
    this.version = (data.version as number) || 0;
    this.digest = (data.digest as string) || null;
    this.owner = (data.owner as string) || null;
    this.type = (data.type as string) || null;
    this.size = (data.size as number) || 0;
    this.contentType = (data.contentType as string) || 'application/octet-stream';
    this.encoding = (data.encoding as string) || null;
    this.metadata = (data.metadata as Record<string, unknown>) || {};
    this.storageRebate = (data.storageRebate as number) || 0;
    this.timestamp = (data.timestamp as number) || Date.now();
    this.transactionDigest = (data.transactionDigest as string) || null;
    this.poaStatus = (data.poaStatus as string) || 'unknown'; // 'certified', 'uncertified', 'pending', 'expired', 'unknown'
  }

  /**
   * Check if blob is certified with PoA
   * @returns {boolean}
   */
  isCertified(): boolean {
    return this.poaStatus === 'certified';
  }

  /**
   * Get human-readable size
   * @returns {string}
   */
  getFormattedSize(): string {
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
  getFormattedTimestamp(): string {
    if (!this.timestamp) return 'Unknown';

    const date = new Date(this.timestamp);
    return date.toLocaleString();
  }

  /**
   * Convert to plain object for serialization
   * @returns {Object}
   */
  toJSON(): Record<string, unknown> {
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
  static fromGraphQL(gqlData: Record<string, unknown>): IBlobRecord {
    const metadata = gqlData.metadata as Record<string, unknown>;
    return new IBlobRecord({
      blobId: gqlData.blobId || gqlData.address,
      objectId: gqlData.objectId,
      version: gqlData.version,
      digest: gqlData.digest,
      owner: gqlData.owner,
      type: gqlData.type,
      size: metadata?.size || gqlData.size,
      contentType: metadata?.content_type || gqlData.contentType,
      encoding: metadata?.encoding || gqlData.encoding,
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
  isValid(): boolean {
    return !!(this.blobId && this.objectId && this.owner);
  }
}

export default IBlobRecord;
