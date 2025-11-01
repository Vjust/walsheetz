/**
 * Blob Lineage Tracking Interface
 * Defines the structure for tracking blob version history and relationships
 */

/**
 * Represents a single blob version in the lineage chain
 */
export interface IBlobVersion {
  /** Walrus blob ID */
  blobId: string;

  /** Sui object ID of the spreadsheet */
  objectId: string;

  /** Version number (1-based) */
  version: number;

  /** Timestamp when this version was created */
  timestamp: number;

  /** Transaction digest that created this blob */
  transactionDigest?: string;

  /** Parent blob ID (previous version) */
  parentBlobId?: string;

  /** Size of the blob in bytes */
  size?: number;

  /** Content hash for verification */
  contentHash?: string;

  /** User who created this version */
  createdBy?: string;

  /** Optional change description */
  description?: string;

  /** PoA certification status */
  poaStatus?: 'certified' | 'uncertified' | 'pending' | 'expired' | 'unknown';

  /** Expiry timestamp for Walrus storage */
  expiryTimestamp?: number;
}

/**
 * Represents the complete lineage chain for a blob
 */
export interface IBlobLineage {
  /** Current (HEAD) blob ID */
  currentBlobId: string;

  /** Current Sui object ID */
  objectId: string;

  /** Array of all versions, ordered from oldest to newest */
  versions: IBlobVersion[];

  /** Total number of versions */
  totalVersions: number;

  /** First version timestamp */
  createdAt: number;

  /** Last version timestamp */
  updatedAt: number;

  /** Root blob ID (first version) */
  rootBlobId: string;
}

/**
 * Lineage relationship metadata
 */
export interface IBlobRelationship {
  /** Child blob ID */
  childBlobId: string;

  /** Parent blob ID */
  parentBlobId: string;

  /** Relationship type */
  relationshipType: 'version' | 'fork' | 'merge';

  /** When the relationship was created */
  timestamp: number;

  /** Transaction that created the relationship */
  transactionDigest?: string;
}

/**
 * Lineage query result
 */
export interface IBlobLineageQuery {
  /** Whether the query was successful */
  success: boolean;

  /** Lineage data if successful */
  lineage?: IBlobLineage;

  /** Error message if failed */
  error?: string;

  /** Query timestamp */
  timestamp: number;
}

/**
 * Lineage tracking event
 */
export interface IBlobLineageEvent {
  /** Event type */
  type: 'version_created' | 'lineage_updated' | 'lineage_loaded';

  /** Blob ID associated with the event */
  blobId: string;

  /** Object ID associated with the event */
  objectId: string;

  /** Event timestamp */
  timestamp: number;

  /** Additional event data */
  data?: any;
}

/**
 * Lineage storage format (localStorage)
 */
export interface IBlobLineageStorage {
  /** Map of objectId -> lineage data */
  lineages: Record<string, IBlobLineage>;

  /** Map of blobId -> objectId for quick lookup */
  blobToObject: Record<string, string>;

  /** Last updated timestamp */
  lastUpdated: number;

  /** Storage format version */
  version: string;
}
