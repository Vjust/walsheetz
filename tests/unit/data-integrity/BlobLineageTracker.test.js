import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { testLogger } from '../../utils/TestLogger.js';
import {
  createMockEventBus,
  createMockLocalStorage,
  generateBlobId,
  generateObjectId,
  createBlobVersionFixture
} from '../../utils/TestHelpers.js';

let mockEventBusInstance;

vi.mock('@dreamlit/walrus', () => ({
  get eventBus() {
    return mockEventBusInstance;
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  },
  LogComponent: {
    STORAGE: 'STORAGE'
  }
}));

describe('BlobLineageTracker', () => {
  let tracker;

  beforeEach(async () => {
    testLogger.suiteStart('BlobLineageTracker');
    mockEventBusInstance = createMockEventBus();
    global.localStorage = createMockLocalStorage();

    const { BlobLineageTracker } = await import('../../../packages/walrus-sui-core/src/data-integrity/services/BlobLineageTracker.ts');
    tracker = new BlobLineageTracker();
  });

  afterEach(() => {
    testLogger.suiteEnd('BlobLineageTracker', { passed: 0, failed: 0, total: 0, duration: 0 });
    vi.clearAllMocks();
  });

  describe('trackVersion', () => {
    it('should track a new blob version successfully', () => {
      const versionData = createBlobVersionFixture();
      const result = tracker.trackVersion(versionData);

      expect(result.success).toBe(true);
      expect(result.lineage).toBeDefined();
      expect(result.version).toBeDefined();
      expect(result.lineage.totalVersions).toBe(1);
    });

    it('should track parent-child relationship', () => {
      const objectId = generateObjectId();
      const parentBlobId = generateBlobId();
      const childBlobId = generateBlobId();

      tracker.trackVersion(createBlobVersionFixture({
        blobId: parentBlobId,
        objectId,
        parentBlobId: null
      }));

      const result = tracker.trackVersion(createBlobVersionFixture({
        blobId: childBlobId,
        objectId,
        parentBlobId
      }));

      expect(result.lineage.totalVersions).toBe(2);
      expect(result.version.parentBlobId).toBe(parentBlobId);
    });
  });

  describe('getLineage', () => {
    it('should retrieve lineage by object ID', () => {
      const versionData = createBlobVersionFixture();
      tracker.trackVersion(versionData);

      const result = tracker.getLineageByObjectId(versionData.objectId);

      expect(result.success).toBe(true);
      expect(result.lineage).toBeDefined();
      expect(result.lineage.objectId).toBe(versionData.objectId);
    });

    it('should retrieve lineage by blob ID', () => {
      const versionData = createBlobVersionFixture();
      tracker.trackVersion(versionData);

      const result = tracker.getLineageByBlobId(versionData.blobId);

      expect(result.success).toBe(true);
      expect(result.lineage).toBeDefined();
    });

    it('should return error for non-existent lineage', () => {
      const result = tracker.getLineageByObjectId(generateObjectId());

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('version queries', () => {
    it('should get all versions for an object', () => {
      const objectId = generateObjectId();

      for (let i = 0; i < 3; i++) {
        tracker.trackVersion(createBlobVersionFixture({ objectId }));
      }

      const versions = tracker.getAllVersions(objectId);

      expect(Array.isArray(versions)).toBe(true);
      expect(versions.length).toBe(3);
    });

    it('should build version chain from blob to root', () => {
      const objectId = generateObjectId();
      const v1BlobId = generateBlobId();
      const v2BlobId = generateBlobId();
      const v3BlobId = generateBlobId();

      tracker.trackVersion(createBlobVersionFixture({
        blobId: v1BlobId,
        objectId,
        parentBlobId: null
      }));

      tracker.trackVersion(createBlobVersionFixture({
        blobId: v2BlobId,
        objectId,
        parentBlobId: v1BlobId
      }));

      tracker.trackVersion(createBlobVersionFixture({
        blobId: v3BlobId,
        objectId,
        parentBlobId: v2BlobId
      }));

      const chain = tracker.buildChain(v3BlobId);

      expect(chain.length).toBe(3);
      expect(chain[0].blobId).toBe(v3BlobId);
      expect(chain[2].blobId).toBe(v1BlobId);
    });
  });

  describe('statistics', () => {
    it('should calculate lineage statistics', () => {
      const objectId = generateObjectId();

      tracker.trackVersion(createBlobVersionFixture({
        objectId,
        size: 1000,
        poaStatus: 'certified'
      }));

      tracker.trackVersion(createBlobVersionFixture({
        objectId,
        size: 2000,
        poaStatus: 'uncertified'
      }));

      tracker.trackVersion(createBlobVersionFixture({
        objectId,
        size: 1500,
        poaStatus: 'certified'
      }));

      const stats = tracker.getStatistics(objectId);

      expect(stats).not.toBeNull();
      expect(stats.totalVersions).toBe(3);
      expect(stats.certifiedVersions).toBe(2);
      expect(stats.uncertifiedVersions).toBe(1);
      expect(stats.totalSize).toBe(4500);
      expect(stats.averageSize).toBe(1500);
    });
  });

  describe('update metadata', () => {
    it('should update version metadata', () => {
      const versionData = createBlobVersionFixture({ poaStatus: 'uncertified' });
      tracker.trackVersion(versionData);

      const success = tracker.updateVersionMetadata(versionData.blobId, {
        poaStatus: 'certified'
      });

      const version = tracker.getVersion(versionData.blobId);

      expect(success).toBe(true);
      expect(version.poaStatus).toBe('certified');
    });
  });

  describe('localStorage persistence', () => {
    it('should track lineage in-memory (RAM-only mode)', () => {
      const versionData = createBlobVersionFixture();
      const result = tracker.trackVersion(versionData);

      expect(result.success).toBe(true);
      expect(result.lineage.totalVersions).toBe(1);

      const lineage = tracker.getLineageByObjectId(versionData.objectId);
      expect(lineage.success).toBe(true);
    });
  });
});
