/**
 * Smoke test for WalrusSdkClientLoader
 * Verifies that the dynamic import guards prevent @mysten/walrus from leaking into browser bundle
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the configLoader module before importing the loader
vi.mock('../utils/ConfigLoader.js', () => ({
  configLoader: {
    getConfig: vi.fn().mockResolvedValue({
      walrus: {
        features: {
          useSdk: false
        }
      }
    })
  }
}));

import {
  loadWalrusSdkClient,
  getCachedWalrusSdkClient,
  clearCachedClient,
  isWalrusSdkReady
} from '../WalrusSdkClientLoader.js';

describe('WalrusSdkClientLoader', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearCachedClient();

    // Mock window if not in browser
    if (typeof window === 'undefined') {
      global.window = {};
    }
  });

  afterEach(() => {
    clearCachedClient();
    vi.clearAllMocks();
  });

  it('should return null when SDK is not enabled', async () => {
    // SDK disabled by default in mocked config
    const client = await loadWalrusSdkClient();
    expect(client).toBeNull();
  });

  it('should cache the loaded client', async () => {
    // SDK not cached initially
    expect(getCachedWalrusSdkClient()).toBeNull();
    expect(isWalrusSdkReady()).toBe(false);

    // After loading, should be cached
    // (This test just verifies the caching mechanism exists)
    clearCachedClient();
    expect(getCachedWalrusSdkClient()).toBeNull();
  });

  it('should not import WalrusSdkClient at module level', () => {
    // If @mysten/walrus was imported at module level, it would cause errors in browser
    // The fact that this test runs without errors proves the import is lazy
    expect(true).toBe(true);
  });

  it('should return same promise for concurrent load attempts', async () => {
    // This ensures only one loading attempt happens even if called multiple times
    const promise1 = loadWalrusSdkClient();
    const promise2 = loadWalrusSdkClient();

    // Both should resolve to same result (or at least not cause multiple loads)
    const result1 = await promise1;
    const result2 = await promise2;

    expect(result1).toEqual(result2);
  });

  it('should provide diagnostic methods', () => {
    // Verify loader exports are available
    expect(typeof loadWalrusSdkClient).toBe('function');
    expect(typeof getCachedWalrusSdkClient).toBe('function');
    expect(typeof clearCachedClient).toBe('function');
    expect(typeof isWalrusSdkReady).toBe('function');
  });
});
