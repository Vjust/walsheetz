/**
 * @vitest-environment jsdom
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageAdapter } from "@/sdk/adapters/StorageAdapter.js";

describe('StorageAdapter Session Backup and Recovery', () => {
  let adapter;
  let sessionStorageMock;

  beforeEach(() => {
    adapter = new StorageAdapter();

    // Mock sessionStorage
    const sessionStorageData = {};
    sessionStorageMock = {
      getItem: vi.fn((key) => sessionStorageData[key] || null),
      setItem: vi.fn((key, value) => {
        sessionStorageData[key] = value;
      }),
      removeItem: vi.fn((key) => {
        delete sessionStorageData[key];
      }),
      clear: vi.fn(() => {
        Object.keys(sessionStorageData).forEach((key) => delete sessionStorageData[key]);
      })
    };
    global.sessionStorage = sessionStorageMock;
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete global.sessionStorage;
  });

  test('should save data to sessionStorage when saveData is called', async () => {
    const testData = {
      data: {
        cells: { 'A1': { value: 'test' }, 'B2': { value: 'data' } },
        metadata: { title: 'Test Sheet' }
      },
      timestamp: Date.now(),
      version: '1.0'
    };

    await adapter.saveData(testData);

    // Verify sessionStorage.setItem was called
    expect(sessionStorageMock.setItem).toHaveBeenCalled();

    // Verify the key used
    const callArgs = sessionStorageMock.setItem.mock.calls[0];
    expect(callArgs[0]).toBe('walsheetz_session_backup');

    // Verify data was saved
    const savedData = JSON.parse(callArgs[1]);
    expect(savedData.data.cells['A1'].value).toBe('test');
    expect(savedData.data.metadata.title).toBe('Test Sheet');
  });

  test('should restore data from sessionStorage when RAM is empty', async () => {
    const testData = {
      data: {
        cells: { 'A1': { value: 'saved' } },
        metadata: { title: 'Recovered' }
      },
      timestamp: Date.now(),
      version: '1.0',
      savedAt: Date.now()
    };

    // Pre-populate sessionStorage with backup
    const backupKey = 'walsheetz_session_backup';
    sessionStorageMock.setItem(backupKey, JSON.stringify(testData));

    // RAM is empty
    adapter._data = null;

    // Load should restore from sessionStorage
    const loaded = await adapter.loadData();

    expect(loaded.data.cells['A1'].value).toBe('saved');
    expect(loaded.data.metadata.title).toBe('Recovered');
    expect(adapter._data).toBeDefined(); // Should be restored to RAM
  });

  test('should return default data if no sessionStorage backup exists', async () => {
    // RAM is empty, sessionStorage is empty
    adapter._data = null;

    const loaded = await adapter.loadData();

    // Should return default empty data
    expect(loaded).toBeDefined();
    expect(loaded.data).toBeDefined(); // Should have default structure
  });

  test('should survive clearAllData and restore on next load', async () => {
    const testData = {
      data: {
        cells: { 'A1': { value: 'test' } },
        metadata: { title: 'Test' }
      },
      timestamp: Date.now(),
      version: '1.0'
    };

    // Save data
    await adapter.saveData(testData);
    expect(adapter._data).toBeDefined();

    // Simulate clearAllData being called (what health check does)
    adapter.clearAllData();
    expect(adapter._data).toBeNull();

    // Load should restore from sessionStorage
    const loaded = await adapter.loadData();
    expect(loaded.data.cells['A1'].value).toBe('test');
  });

  test('should handle sessionStorage quota exceeded gracefully', async () => {
    // Mock sessionStorage.setItem to throw quota exceeded error
    sessionStorageMock.setItem.mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError');
    });

    const testData = {
      data: { cells: {}, metadata: { title: 'Test' } },
      timestamp: Date.now(),
      version: '1.0'
    };

    // Save should succeed even if session backup fails
    const result = await adapter.saveData(testData);
    expect(result.success).toBe(true);
    expect(adapter._data).toBeDefined();
  });

  test('should handle corrupted sessionStorage data gracefully', async () => {
    // Pre-populate sessionStorage with invalid JSON
    sessionStorageMock.setItem('walsheetz_session_backup', 'not valid json');

    // RAM is empty
    adapter._data = null;

    // Load should fall back to default (not throw error)
    const loaded = await adapter.loadData();
    expect(loaded).toBeDefined();
  });

  test('should preserve cell count through backup cycle', async () => {
    const testData = {
      data: {
        cells: {
          'A1': { value: 1 },
          'A2': { value: 2 },
          'B1': { value: 3 },
          'B2': { value: 4 },
          'C1': { value: 5 }
        },
        metadata: { title: 'Large Sheet' }
      },
      timestamp: Date.now(),
      version: '1.0'
    };

    // Save
    await adapter.saveData(testData);
    expect(Object.keys(adapter._data.data.cells)).toHaveLength(5);

    // Clear RAM
    adapter.clearAllData();
    expect(adapter._data).toBeNull();

    // Restore
    const loaded = await adapter.loadData();
    expect(Object.keys(loaded.data.cells)).toHaveLength(5);
  });

  test('should handle session backup with large data', async () => {
    // Create large dataset
    const largeData = {
      data: {
        cells: {},
        metadata: { title: 'Large' }
      },
      timestamp: Date.now(),
      version: '1.0'
    };

    // Add 1000 cells
    for (let i = 0; i < 1000; i++) {
      largeData.data.cells[`R${Math.floor(i / 26)}C${i % 26}`] = {
        value: `cell_${i}`,
        formula: null
      };
    }

    // Save should work with large data
    await adapter.saveData(largeData);
    expect(adapter._data).toBeDefined();

    // Clear and restore
    adapter.clearAllData();
    const loaded = await adapter.loadData();
    expect(Object.keys(loaded.data.cells)).toHaveLength(1000);
  });

  test('should include version info in restored data', async () => {
    const testData = {
      data: { cells: {}, metadata: { title: 'Test' } },
      timestamp: Date.now(),
      version: 'v1.2.3',
      savedAt: Date.now()
    };

    await adapter.saveData(testData);
    adapter._data = null;

    const loaded = await adapter.loadData();
    expect(loaded.version).toBe('v1.2.3');
    expect(loaded.savedAt).toBeDefined();
  });
});