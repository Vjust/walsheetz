// Compression utilities: compression and decompression algorithms

export type CompressionAlgorithm = 'gzip' | 'deflate' | 'none';

export interface CompressionResult {
  data: Uint8Array;
  algorithm: CompressionAlgorithm;
  originalSize: number;
  compressedSize?: number;
  compressionRatio?: number;
}

/**
 * Compress data with specified algorithm
 */
export async function compressDataWithAlgorithm(
  data: Uint8Array,
  algorithm: CompressionAlgorithm
): Promise<Uint8Array> {
  if (algorithm === 'none') {
    return data;
  }

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    }
  });

  const compressedStream = stream.pipeThrough(new CompressionStream(algorithm));
  const reader = compressedStream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Decompress data with specified algorithm
 */
export async function decompressDataWithAlgorithm(
  compressedData: Uint8Array,
  algorithm: CompressionAlgorithm
): Promise<Uint8Array> {
  if (algorithm === 'none') {
    return compressedData;
  }

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(compressedData);
      controller.close();
    }
  });

  const decompressedStream = stream.pipeThrough(new DecompressionStream(algorithm));
  const reader = decompressedStream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Detect compression type from data magic bytes
 */
export function detectCompressionAlgorithm(data: Uint8Array): CompressionAlgorithm {
  if (data.length < 2) return 'none';

  // Check gzip magic bytes (0x1f 0x8b)
  if (data[0] === 0x1f && data[1] === 0x8b) {
    return 'gzip';
  }

  // Check zlib/deflate magic bytes (0x78 followed by 0x01, 0x5e, 0x9c, 0xda)
  if (data[0] === 0x78 && (data[1] === 0x01 || data[1] === 0x5e || data[1] === 0x9c || data[1] === 0xda)) {
    return 'deflate';
  }

  return 'none';
}

/**
 * Check if data is compressed
 */
export function isCompressed(data: Uint8Array): boolean {
  return detectCompressionAlgorithm(data) !== 'none';
}
