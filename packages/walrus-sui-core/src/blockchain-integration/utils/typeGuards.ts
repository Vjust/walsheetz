/**
 * Type guards for Sui SDK types
 * Provides runtime type checking for discriminated unions and optional types
 */

import type {
  SuiObjectResponse,
  SuiParsedData,
  ObjectOwner,
  SuiObjectChange,
  TransactionEffects,
  SuiObjectData,
} from '@mysten/sui/client';

// =============================================================================
// Object Response Guards
// =============================================================================

/**
 * Type guard for SuiObjectResponse with data
 */
export function hasObjectData(
  response: SuiObjectResponse
): response is SuiObjectResponse & { data: SuiObjectData } {
  return response.data !== null && response.data !== undefined;
}

/**
 * Type guard for object with content
 */
export function hasContent(
  data: SuiObjectData | null | undefined
): data is SuiObjectData & { content: SuiParsedData } {
  return data !== null && data !== undefined && data.content !== null && data.content !== undefined;
}

// =============================================================================
// Parsed Data Guards
// =============================================================================

/**
 * Type guard for MoveObject parsed data
 */
export function isMoveObject(
  data: SuiParsedData | null | undefined
): data is Extract<SuiParsedData, { dataType: 'moveObject' }> {
  return data !== null && data !== undefined && data.dataType === 'moveObject';
}

/**
 * Type guard for Package parsed data
 */
export function isPackage(
  data: SuiParsedData | null | undefined
): data is Extract<SuiParsedData, { dataType: 'package' }> {
  return data !== null && data !== undefined && data.dataType === 'package';
}

/**
 * Extract fields from MoveObject if available
 */
export function getMoveObjectFields(
  data: SuiParsedData | null | undefined
): Record<string, unknown> | null {
  if (isMoveObject(data)) {
    return data.fields as Record<string, unknown>;
  }
  return null;
}

// =============================================================================
// Owner Guards
// =============================================================================

/**
 * Type guard for Shared owner
 */
export function isSharedOwner(
  owner: ObjectOwner | null | undefined
): owner is { Shared: { initial_shared_version: string } } {
  return owner !== null && typeof owner === 'object' && 'Shared' in owner;
}

/**
 * Type guard for AddressOwner
 */
export function isAddressOwner(
  owner: ObjectOwner | null | undefined
): owner is { AddressOwner: string } {
  return owner !== null && typeof owner === 'object' && 'AddressOwner' in owner;
}

/**
 * Type guard for ObjectOwner (owned by another object)
 */
export function isObjectOwner(
  owner: ObjectOwner | null | undefined
): owner is { ObjectOwner: string } {
  return owner !== null && typeof owner === 'object' && 'ObjectOwner' in owner;
}

/**
 * Type guard for Immutable owner
 */
export function isImmutableOwner(owner: ObjectOwner | null | undefined): owner is 'Immutable' {
  return owner === 'Immutable';
}

/**
 * Extract owner address if available
 */
export function getOwnerAddress(owner: ObjectOwner | null | undefined): string | null {
  if (isAddressOwner(owner)) {
    return owner.AddressOwner;
  }
  if (isObjectOwner(owner)) {
    return owner.ObjectOwner;
  }
  return null;
}

// =============================================================================
// Object Change Guards
// =============================================================================

/**
 * Type guard for created object change
 */
export function isCreatedObjectChange(
  change: SuiObjectChange
): change is Extract<SuiObjectChange, { type: 'created' }> {
  return change.type === 'created';
}

/**
 * Type guard for mutated object change
 */
export function isMutatedObjectChange(
  change: SuiObjectChange
): change is Extract<SuiObjectChange, { type: 'mutated' }> {
  return change.type === 'mutated';
}

/**
 * Type guard for deleted object change
 */
export function isDeletedObjectChange(
  change: SuiObjectChange
): change is Extract<SuiObjectChange, { type: 'deleted' }> {
  return change.type === 'deleted';
}

/**
 * Type guard for published package change
 */
export function isPublishedObjectChange(
  change: SuiObjectChange
): change is Extract<SuiObjectChange, { type: 'published' }> {
  return change.type === 'published';
}

/**
 * Type guard for wrapped object change
 */
export function isWrappedObjectChange(
  change: SuiObjectChange
): change is Extract<SuiObjectChange, { type: 'wrapped' }> {
  return change.type === 'wrapped';
}

/**
 * Filter object changes by type and objectType pattern
 */
export function filterCreatedObjects(
  changes: SuiObjectChange[] | null | undefined,
  typePattern?: string
): Extract<SuiObjectChange, { type: 'created' }>[] {
  if (!changes) return [];

  const created = changes.filter(isCreatedObjectChange);

  if (typePattern) {
    return created.filter((change) => change.objectType?.includes(typePattern));
  }

  return created;
}

// =============================================================================
// Transaction Effects Guards
// =============================================================================

/**
 * Type guard for response with effects
 */
export function hasEffects<T extends { effects?: TransactionEffects | null }>(
  response: T
): response is T & { effects: TransactionEffects } {
  return response.effects !== null && response.effects !== undefined;
}

/**
 * Type guard for successful transaction status
 */
export function isSuccessfulTransaction(effects: TransactionEffects | null | undefined): boolean {
  if (!effects) return false;
  return effects.status?.status === 'success';
}

// =============================================================================
// Gas Cost Helpers
// =============================================================================

/**
 * Extract gas cost summary from effects
 */
export function getGasCost(effects: TransactionEffects | null | undefined): {
  computationCost: number;
  storageCost: number;
  storageRebate: number;
  totalCost: number;
} | null {
  if (!effects?.gasUsed) return null;

  const computationCost = parseInt(effects.gasUsed.computationCost || '0', 10);
  const storageCost = parseInt(effects.gasUsed.storageCost || '0', 10);
  const storageRebate = parseInt(effects.gasUsed.storageRebate || '0', 10);

  return {
    computationCost,
    storageCost,
    storageRebate,
    totalCost: computationCost + storageCost - storageRebate,
  };
}

// =============================================================================
// Spreadsheet-specific Helpers
// =============================================================================

/**
 * Check if object type is a Spreadsheet
 */
export function isSpreadsheetType(objectType: string | null | undefined): boolean {
  if (!objectType) return false;
  return objectType.includes('::spreadsheet::Spreadsheet') && !objectType.includes('Registry');
}

/**
 * Check if object type is a SpreadsheetRegistry
 */
export function isSpreadsheetRegistryType(objectType: string | null | undefined): boolean {
  if (!objectType) return false;
  return objectType.includes('::spreadsheet::SpreadsheetRegistry');
}

/**
 * Check if object type is a Version
 */
export function isVersionType(objectType: string | null | undefined): boolean {
  if (!objectType) return false;
  return objectType.includes('::spreadsheet::Version');
}

/**
 * Extract package ID from object type
 * Object types are formatted as "0xPACKAGE_ID::module::Type"
 */
export function extractPackageId(objectType: string | null | undefined): string | null {
  if (!objectType) return null;
  const match = objectType.match(/^(0x[a-fA-F0-9]+)::/);
  return match ? match[1] : null;
}
