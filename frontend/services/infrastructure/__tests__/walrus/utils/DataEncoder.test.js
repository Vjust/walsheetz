import { describe, it, expect } from 'vitest';
import {
  encodeSpreadsheetData,
  decodeSpreadsheetData,
  isGzipCompressed,
  calculateContentHash
} from '@services/walrus/utils/DataEncoder.js';

describe('DataEncoder', () => {
  const sampleData = {
    spreadsheetId: 'test-123',
    version: 1,
    metadata: { title: 'Test Sheet' },
    cells: {
      A1: { value: 'Hello', type: 'string' },
      B1: { value: 42, type: 'number' }
    },
    sheets: []
  };

  it('should encode spreadsheet data without compression for small data', async () => {
    const result = await encodeSpreadsheetData(sampleData, { compressionEnabled: false });

    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(result.isCompressed).toBe(false);
    expect(result.originalSize).toBeGreaterThan(0);
  });

  it('should decode encoded data back to original structure', async () => {
    const encoded = await encodeSpreadsheetData(sampleData, { compressionEnabled: false });
    const decoded = await decodeSpreadsheetData(encoded.data);

    expect(decoded.spreadsheetId).toBe('test-123');
    expect(decoded.metadata.title).toBe('Test Sheet');
    expect(decoded.cells.A1.value).toBe('Hello');
    expect(decoded.cells.B1.value).toBe(42);
  });

  it('should detect gzip compression', () => {
    const gzipData = new Uint8Array([0x1f, 0x8b, 0x01, 0x02]);
    const nonGzipData = new Uint8Array([0x00, 0x00, 0x01, 0x02]);

    expect(isGzipCompressed(gzipData)).toBe(true);
    expect(isGzipCompressed(nonGzipData)).toBe(false);
  });

  it('should calculate consistent content hash', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const hash1 = await calculateContentHash(data);
    const hash2 = await calculateContentHash(data);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex format
  });
});
