/**
 * Blob Lineage Tracker Unit Tests
 * Comprehensive tests with extensive logging
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { testLogger } from '../../utils/TestLogger.js';
import {
  createMockEventBus,
  createMockLocalStorage,
  generateBlobId,
  generateObjectId,
  generateTxDigest,
  createBlobVersionFixture
} from '../../utils/TestHelpers.js';

// Mock imports
vi.mock('@/sdk/utils/EventBus.js', () => ({
  EventBus: createMockEventBus()
}));

vi.mock('@/sdk/utils/Logger.js', () => ({
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
  let mockEventBus;
  let mockLocalStorage;

  beforeEach(async () => {
    testLogger.suiteStart('BlobLineageTracker');

    testLogger.setup('Creating mocks...');
    mockEventBus = createMockEventBus();
    mockLocalStorage = createMockLocalStorage();
    global.localStorage = mockLocalStorage;
    testLogger.success('Mocks created');

    const { BlobLineageTracker } = await import('@/sdk/services/BlobLineageTracker.js');
    tracker = new BlobLineageTracker();
  });

  afterEach(() => {
    testLogger.suiteEnd('BlobLineageTracker', {
      passed: 0,
      failed: 0,
      total: 0,
      duration: 0
    });
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('trackVersion', () => {
    it('should track a new blob version successfully', async () => {
      const testId = testLogger.testStart('should track a new blob version successfully');

      try {
        // Arrange
        testLogger.setup('Preparing version data...');
        const versionData = createBlobVersionFixture();
        testLogger.debug('Version data', versionData);

        // Act
        testLogger.execute('tracker.trackVersion', versionData);
        const result = tracker.trackVersion(versionData);

        testLogger.result('Track result', result);

        // Assert
        testLogger.assertion(result.success === true, 'result.success === true');
        expect(result.success).toBe(true);

        testLogger.assertion(result.lineage !== undefined, 'result.lineage exists');
        expect(result.lineage).toBeDefined();

        testLogger.assertion(result.version !== undefined, 'result.version exists');
        expect(result.version).toBeDefined();

        testLogger.assertion(result.lineage.totalVersions === 1, 'lineage.totalVersions === 1');
        expect(result.lineage.totalVersions).toBe(1);

        testLogger.testPass('should track a new blob version successfully');
      } catch (error) {
        testLogger.testFail('should track a new blob version successfully', error);
        throw error;
      }
    });

    it('should track parent-child relationship', async () => {
      const testId = testLogger.testStart('should track parent-child relationship');

      try {
        // Arrange
        testLogger.setup('Creating parent and child versions...');
        const objectId = generateObjectId();
        const parentBlobId = generateBlobId();
        const childBlobId = generateBlobId();

        // Track parent version
        testLogger.execute('Tracking parent version', { parentBlobId });
        const parentVersion = createBlobVersionFixture({
          blobId: parentBlobId,
          objectId,
          parentBlobId: null
        });
        tracker.trackVersion(parentVersion);

        // Track child version
        testLogger.execute('Tracking child version', { childBlobId, parentBlobId });
        const childVersion = createBlobVersionFixture({
          blobId: childBlobId,
          objectId,
          parentBlobId: parentBlobId
        });
        const result = tracker.trackVersion(childVersion);

        testLogger.result('Child version result', result);

        // Assert
        testLogger.assertion(result.lineage.totalVersions === 2, 'lineage has 2 versions');
        expect(result.lineage.totalVersions).toBe(2);

        testLogger.assertion(result.version.parentBlobId === parentBlobId, 'child has correct parent');
        expect(result.version.parentBlobId).toBe(parentBlobId);

        testLogger.testPass('should track parent-child relationship');
      } catch (error) {
        testLogger.testFail('should track parent-child relationship', error);
        throw error;
      }
    });
  });

  describe('getLineage', () => {
    it('should retrieve lineage by object ID', async () => {
      const testId = testLogger.testStart('should retrieve lineage by object ID');

      try {
        // Arrange
        testLogger.setup('Creating lineage...');
        const versionData = createBlobVersionFixture();
        tracker.trackVersion(versionData);

        // Act
        testLogger.execute('tracker.getLineageByObjectId', { objectId: versionData.objectId });
        const result = tracker.getLineageByObjectId(versionData.objectId);

        testLogger.result('Lineage result', result);

        // Assert
        testLogger.assertion(result.success === true, 'result.success === true');
        expect(result.success).toBe(true);

        testLogger.assertion(result.lineage !== undefined, 'lineage exists');
        expect(result.lineage).toBeDefined();

        testLogger.assertion(result.lineage.objectId === versionData.objectId, 'objectId matches');
        expect(result.lineage.objectId).toBe(versionData.objectId);

        testLogger.testPass('should retrieve lineage by object ID');
      } catch (error) {
        testLogger.testFail('should retrieve lineage by object ID', error);
        throw error;
      }
    });

    it('should retrieve lineage by blob ID', async () => {
      const testId = testLogger.testStart('should retrieve lineage by blob ID');

      try {
        // Arrange
        testLogger.setup('Creating lineage...');
        const versionData = createBlobVersionFixture();
        tracker.trackVersion(versionData);

        // Act
        testLogger.execute('tracker.getLineageByBlobId', { blobId: versionData.blobId });
        const result = tracker.getLineageByBlobId(versionData.blobId);

        testLogger.result('Lineage result', result);

        // Assert
        testLogger.assertion(result.success === true, 'result.success === true');
        expect(result.success).toBe(true);

        testLogger.assertion(result.lineage !== undefined, 'lineage exists');
        expect(result.lineage).toBeDefined();

        testLogger.testPass('should retrieve lineage by blob ID');
      } catch (error) {
        testLogger.testFail('should retrieve lineage by blob ID', error);
        throw error;
      }
    });

    it('should return error for non-existent lineage', async () => {
      const testId = testLogger.testStart('should return error for non-existent lineage');

      try {
        // Act
        const nonExistentId = generateObjectId();
        testLogger.execute('tracker.getLineageByObjectId (non-existent)', { objectId: nonExistentId });
        const result = tracker.getLineageByObjectId(nonExistentId);

        testLogger.result('Result for non-existent lineage', result);

        // Assert
        testLogger.assertion(result.success === false, 'result.success === false');
        expect(result.success).toBe(false);

        testLogger.assertion(result.error !== undefined, 'error message exists');
        expect(result.error).toBeDefined();

        testLogger.testPass('should return error for non-existent lineage');
      } catch (error) {
        testLogger.testFail('should return error for non-existent lineage', error);
        throw error;
      }
    });
  });

  describe('version queries', () => {
    it('should get all versions for an object', async () => {
      const testId = testLogger.testStart('should get all versions for an object');

      try {
        // Arrange
        testLogger.setup('Creating multiple versions...');
        const objectId = generateObjectId();

        for (let i = 0; i < 3; i++) {
          const version = createBlobVersionFixture({ objectId });
          tracker.trackVersion(version);
        }

        // Act
        testLogger.execute('tracker.getAllVersions', { objectId });
        const versions = tracker.getAllVersions(objectId);

        testLogger.result('All versions', { count: versions.length });

        // Assert
        testLogger.assertion(Array.isArray(versions), 'versions is an array');
        expect(Array.isArray(versions)).toBe(true);

        testLogger.assertion(versions.length === 3, 'has 3 versions');
        expect(versions.length).toBe(3);

        testLogger.testPass('should get all versions for an object');
      } catch (error) {
        testLogger.testFail('should get all versions for an object', error);
        throw error;
      }
    });

    it('should build version chain from blob to root', async () => {
      const testId = testLogger.testStart('should build version chain from blob to root');

      try {
        // Arrange
        testLogger.setup('Creating version chain...');
        const objectId = generateObjectId();
        const v1BlobId = generateBlobId();
        const v2BlobId = generateBlobId();
        const v3BlobId = generateBlobId();

        // Create chain: v1 -> v2 -> v3
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

        // Act
        testLogger.execute('tracker.buildChain', { blobId: v3BlobId });
        const chain = tracker.buildChain(v3BlobId);

        testLogger.result('Version chain', { length: chain.length });

        // Assert
        testLogger.assertion(chain.length === 3, 'chain has 3 versions');
        expect(chain.length).toBe(3);

        testLogger.assertion(chain[0].blobId === v3BlobId, 'first is v3 (current)');
        expect(chain[0].blobId).toBe(v3BlobId);

        testLogger.assertion(chain[2].blobId === v1BlobId, 'last is v1 (root)');
        expect(chain[2].blobId).toBe(v1BlobId);

        testLogger.testPass('should build version chain from blob to root');
      } catch (error) {
        testLogger.testFail('should build version chain from blob to root', error);
        throw error;
      }
    });
  });

  describe('statistics', () => {
    it('should calculate lineage statistics', async () => {
      const testId = testLogger.testStart('should calculate lineage statistics');

      try {
        // Arrange
        testLogger.setup('Creating versions with different statuses...');
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

        // Act
        testLogger.execute('tracker.getStatistics', { objectId });
        const stats = tracker.getStatistics(objectId);

        testLogger.result('Statistics', stats);

        // Assert
        testLogger.assertion(stats !== null, 'statistics exist');
        expect(stats).not.toBeNull();

        testLogger.assertion(stats.totalVersions === 3, 'totalVersions === 3');
        expect(stats.totalVersions).toBe(3);

        testLogger.assertion(stats.certifiedVersions === 2, 'certifiedVersions === 2');
        expect(stats.certifiedVersions).toBe(2);

        testLogger.assertion(stats.uncertifiedVersions === 1, 'uncertifiedVersions === 1');
        expect(stats.uncertifiedVersions).toBe(1);

        testLogger.assertion(stats.totalSize === 4500, 'totalSize === 4500');
        expect(stats.totalSize).toBe(4500);

        testLogger.assertion(stats.averageSize === 1500, 'averageSize === 1500');
        expect(stats.averageSize).toBe(1500);

        testLogger.testPass('should calculate lineage statistics');
      } catch (error) {
        testLogger.testFail('should calculate lineage statistics', error);
        throw error;
      }
    });
  });

  describe('update metadata', () => {
    it('should update version metadata', async () => {
      const testId = testLogger.testStart('should update version metadata');

      try {
        // Arrange
        testLogger.setup('Creating version...');
        const versionData = createBlobVersionFixture({ poaStatus: 'uncertified' });
        tracker.trackVersion(versionData);

        // Act
        testLogger.execute('tracker.updateVersionMetadata', {
          blobId: versionData.blobId,
          updates: { poaStatus: 'certified' }
        });
        const success = tracker.updateVersionMetadata(versionData.blobId, {
          poaStatus: 'certified'
        });

        // Verify update
        const version = tracker.getVersion(versionData.blobId);
        testLogger.result('Updated version', version);

        // Assert
        testLogger.assertion(success === true, 'update succeeded');
        expect(success).toBe(true);

        testLogger.assertion(version.poaStatus === 'certified', "poaStatus updated to 'certified'");
        expect(version.poaStatus).toBe('certified');

        testLogger.testPass('should update version metadata');
      } catch (error) {
        testLogger.testFail('should update version metadata', error);
        throw error;
      }
    });
  });

  describe('localStorage persistence', () => {
    it('should track lineage in-memory (RAM-only mode)', async () => {
      const testId = testLogger.testStart('should track lineage in-memory');

      try {
        // Arrange & Act
        testLogger.setup('Creating version...');
        const versionData = createBlobVersionFixture();

        testLogger.execute('tracker.trackVersion', versionData);
        const result = tracker.trackVersion(versionData);

        // Assert
        testLogger.assertion(result.success === true, 'trackVersion succeeded');
        expect(result.success).toBe(true);

        testLogger.assertion(result.lineage.totalVersions === 1, 'lineage tracked in memory');
        expect(result.lineage.totalVersions).toBe(1);

        // Verify in-memory state
        const lineage = tracker.getLineageByObjectId(versionData.objectId);
        testLogger.assertion(lineage.success === true, 'lineage retrievable from memory');
        expect(lineage.success).toBe(true);

        testLogger.testPass('should track lineage in-memory');
      } catch (error) {
        testLogger.testFail('should track lineage in-memory', error);
        throw error;
      }
    });
  });
});
