// Delta compression: cell-level change tracking

export interface CellChange {
  old?: unknown;
  new?: unknown;
}

export interface CellDelta {
  added: Record<string, unknown>;
  modified: Record<string, CellChange>;
  deleted: string[];
  metadata?: Record<string, any>;
}

export interface SpreadsheetDelta {
  type: 'delta' | 'full';
  version?: number;
  timestamp?: number;
  spreadsheetId?: string;
  baseVersion?: string;
  delta?: CellDelta;
}

/**
 * Create delta between two spreadsheet versions
 */
export function createCellDelta(
  previousData: Record<string, any>,
  newData: Record<string, any>
): CellDelta {
  const delta: CellDelta = {
    added: {},
    modified: {},
    deleted: [],
    metadata: {}
  };

  const prevCells = previousData.cells || {};
  const newCells = newData.cells || {};

  // Find added and modified cells
  for (const [cellKey, cellValue] of Object.entries(newCells)) {
    if (!(cellKey in prevCells)) {
      delta.added[cellKey] = cellValue;
    } else if (JSON.stringify(prevCells[cellKey]) !== JSON.stringify(cellValue)) {
      delta.modified[cellKey] = {
        old: prevCells[cellKey],
        new: cellValue
      };
    }
  }

  // Find deleted cells
  for (const cellKey of Object.keys(prevCells)) {
    if (!(cellKey in newCells)) {
      delta.deleted.push(cellKey);
    }
  }

  // Track metadata changes
  if (JSON.stringify(previousData.metadata) !== JSON.stringify(newData.metadata)) {
    delta.metadata = {
      old: previousData.metadata,
      new: newData.metadata
    };
  }

  return delta;
}

/**
 * Apply delta to base cells
 */
export function applyCellDelta(
  baseCells: Record<string, unknown>,
  delta: CellDelta | Record<string, any>
): Record<string, unknown> {
  if ((delta as any).type === 'full') {
    return (delta as any).cells;
  }

  const result = { ...(baseCells || {}) };

  const cellDelta = delta as CellDelta;

  // Apply additions
  for (const [cellKey, cellData] of Object.entries(cellDelta.added || {})) {
    result[cellKey] = cellData;
  }

  // Apply modifications
  for (const [cellKey, change] of Object.entries(cellDelta.modified || {})) {
    result[cellKey] = (change as CellChange).new;
  }

  // Apply removals
  for (const cellKey of cellDelta.deleted || []) {
    delete result[cellKey];
  }

  return result;
}

/**
 * Reconstruct full data from delta chain
 */
export async function reconstructFromDelta(
  deltaData: SpreadsheetDelta,
  retrievalFn: (blobId: string) => Promise<any>,
  retrievalCache: Map<string, any> = new Map()
): Promise<Record<string, any>> {
  if (deltaData.type === 'full') {
    return deltaData as any;
  }

  if (!deltaData.baseVersion) {
    throw new Error('Delta data missing baseVersion');
  }

  // Get base version (use cache to avoid repeated retrievals)
  let baseData;
  if (retrievalCache.has(deltaData.baseVersion)) {
    baseData = retrievalCache.get(deltaData.baseVersion);
  } else {
    baseData = await retrievalFn(deltaData.baseVersion);

    // If base is also a delta, reconstruct it first
    if (baseData.type === 'delta') {
      baseData = await reconstructFromDelta(baseData, retrievalFn, retrievalCache);
    }

    retrievalCache.set(deltaData.baseVersion, baseData);
  }

  // Apply delta to base data
  const reconstructed = JSON.parse(JSON.stringify(baseData)); // Deep copy

  if (!reconstructed.cells) {
    reconstructed.cells = {};
  }

  reconstructed.cells = applyCellDelta(reconstructed.cells, deltaData.delta || {});

  // Apply metadata changes
  if (deltaData.delta?.metadata?.new) {
    reconstructed.metadata = deltaData.delta.metadata.new;
  }

  // Update version info
  reconstructed.version = deltaData.version;
  reconstructed.timestamp = deltaData.timestamp;
  reconstructed.spreadsheetId = deltaData.spreadsheetId;

  return reconstructed;
}

/**
 * Calculate delta efficiency as ratio of delta size to full size
 */
export function calculateDeltaEfficiency(
  previousData: Record<string, any>,
  newData: Record<string, any>
): { efficiency: number; deltaSize: number; fullSize: number } {
  const delta = createCellDelta(previousData, newData);
  const deltaSize = JSON.stringify(delta).length;
  const fullSize = JSON.stringify(newData.cells || {}).length;
  const efficiency = fullSize > 0 ? deltaSize / fullSize : 1;

  return { efficiency, deltaSize, fullSize };
}
