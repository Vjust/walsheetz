/**
 * Interface for Proof of Availability (PoA) certificate status
 */
export class IPoAStatus {
  blobId: string | null;
  objectId: string | null;
  status: string;
  certificate: Record<string, unknown> | null;
  validators: string[];
  timestamp: number | null;
  expiry: number | null;
  metadata: Record<string, unknown>;

  /**
   * @param {Object} data - PoA status data
   * @param {string} data.blobId - Associated blob ID
   * @param {string} data.objectId - Sui object ID
   * @param {string} data.status - Certification status
   * @param {Object} data.certificate - Certificate data
   * @param {Array<string>} data.validators - List of validator addresses
   * @param {number} data.timestamp - Certificate issuance timestamp
   * @param {number} data.expiry - Certificate expiry timestamp
   * @param {Object} data.metadata - Additional certificate metadata
   */
  constructor(data: Record<string, unknown> = {}) {
    this.blobId = (data.blobId as string | null) || null;
    this.objectId = (data.objectId as string | null) || null;
    this.status = (data.status as string) || 'unknown'; // 'certified', 'uncertified', 'pending', 'expired', 'invalid', 'unknown'
    this.certificate = (data.certificate as Record<string, unknown> | null) || null;
    this.validators = (data.validators as string[]) || [];
    this.timestamp = (data.timestamp as number | null) || null;
    this.expiry = (data.expiry as number | null) || null;
    this.metadata = (data.metadata as Record<string, unknown>) || {};
  }

  /**
   * Check if certificate is currently valid
   * @returns {boolean}
   */
  isValid(): boolean {
    if (this.status !== 'certified') return false;
    if (!this.expiry) return true; // No expiry means permanent

    const now = Date.now();
    return now < this.expiry;
  }

  /**
   * Check if certificate is expired
   * @returns {boolean}
   */
  isExpired(): boolean {
    if (this.status !== 'certified') return false;
    if (!this.expiry) return false;

    const now = Date.now();
    return now >= this.expiry;
  }

  /**
   * Check if certificate is pending
   * @returns {boolean}
   */
  isPending(): boolean {
    return this.status === 'pending';
  }

  /**
   * Check if blob is certified
   * @returns {boolean}
   */
  isCertified(): boolean {
    return this.status === 'certified' && this.isValid();
  }

  /**
   * Get number of validators
   * @returns {number}
   */
  getValidatorCount(): number {
    return this.validators.length;
  }

  /**
   * Get time until expiry in milliseconds
   * @returns {number|null} Milliseconds until expiry, null if no expiry
   */
  getTimeUntilExpiry(): number | null {
    if (!this.expiry) return null;

    const now = Date.now();
    const remaining = this.expiry - now;
    return Math.max(0, remaining);
  }

  /**
   * Get human-readable expiry time
   * @returns {string}
   */
  getFormattedExpiry(): string {
    if (!this.expiry) return 'Never';

    const date = new Date(this.expiry);
    return date.toLocaleString();
  }

  /**
   * Get human-readable certificate age
   * @returns {string}
   */
  getCertificateAge(): string {
    if (!this.timestamp) return 'Unknown';

    const now = Date.now();
    const ageMs = now - this.timestamp;
    const ageSeconds = Math.floor(ageMs / 1000);
    const ageMinutes = Math.floor(ageSeconds / 60);
    const ageHours = Math.floor(ageMinutes / 60);
    const ageDays = Math.floor(ageHours / 24);

    if (ageDays > 0) return `${ageDays} day${ageDays > 1 ? 's' : ''} ago`;
    if (ageHours > 0) return `${ageHours} hour${ageHours > 1 ? 's' : ''} ago`;
    if (ageMinutes > 0) return `${ageMinutes} minute${ageMinutes > 1 ? 's' : ''} ago`;
    return `${ageSeconds} second${ageSeconds !== 1 ? 's' : ''} ago`;
  }

  /**
   * Get status badge color for UI
   * @returns {string} CSS color class
   */
  getStatusColor(): string {
    switch (this.status) {
      case 'certified':
        return this.isValid() ? 'success' : 'warning';
      case 'pending':
        return 'info';
      case 'expired':
      case 'invalid':
        return 'error';
      case 'uncertified':
      case 'unknown':
      default:
        return 'neutral';
    }
  }

  /**
   * Get status label for UI
   * @returns {string}
   */
  getStatusLabel(): string {
    if (this.status === 'certified' && this.isExpired()) {
      return 'Expired';
    }

    const labels: Record<string, string> = {
      'certified': 'Certified',
      'uncertified': 'Uncertified',
      'pending': 'Pending',
      'expired': 'Expired',
      'invalid': 'Invalid',
      'unknown': 'Unknown'
    };

    return labels[this.status] || 'Unknown';
  }

  /**
   * Convert to plain object for serialization
   * @returns {Object}
   */
  toJSON(): Record<string, unknown> {
    return {
      blobId: this.blobId,
      objectId: this.objectId,
      status: this.status,
      certificate: this.certificate,
      validators: this.validators,
      timestamp: this.timestamp,
      expiry: this.expiry,
      metadata: this.metadata
    };
  }

  /**
   * Create instance from GraphQL response
   * @param {Object} gqlData - GraphQL response data
   * @returns {IPoAStatus}
   */
  static fromGraphQL(gqlData: Record<string, unknown>): IPoAStatus {
    const certificate = (gqlData.certificate as Record<string, unknown>) || {};

    return new IPoAStatus({
      blobId: gqlData.blobId,
      objectId: gqlData.objectId,
      status: gqlData.poaStatus || gqlData.status,
      certificate: certificate,
      validators: (certificate.validators as string[]) || (gqlData.validators as string[]) || [],
      timestamp: (certificate.timestamp as number) || (gqlData.timestamp as number),
      expiry: (certificate.expiry as number) || (gqlData.expiry as number),
      metadata: (certificate.metadata as Record<string, unknown>) || certificate
    });
  }

  /**
   * Create uncertified status
   * @param {string} blobId - Blob ID
   * @returns {IPoAStatus}
   */
  static uncertified(blobId: string): IPoAStatus {
    return new IPoAStatus({
      blobId,
      status: 'uncertified'
    });
  }

  /**
   * Create pending status
   * @param {string} blobId - Blob ID
   * @returns {IPoAStatus}
   */
  static pending(blobId: string): IPoAStatus {
    return new IPoAStatus({
      blobId,
      status: 'pending'
    });
  }
}

export default IPoAStatus;
