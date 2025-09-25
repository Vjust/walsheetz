/**
 * Generated ABI Type Definitions for WalSheetz
 *
 * Generated on: 2025-09-25T16:29:42.608Z
 * Package ID: 0xe7f62142b48f1b1746bd7dd7b695f0e2e5952879662ab7d755fdd9081b189fa7
 * Network: testnet
 *
 * @fileoverview Type definitions for Sui Move contract functions
 */

declare module '@/types/abi' {
  /**
   * Parameter types for Move functions
   */
  export interface MoveParameter {
    type: string;
    isReference?: boolean;
    isMutable?: boolean;
  }

  /**
   * Function signature metadata
   */
  export interface FunctionSignature {
    name: string;
    module: string;
    fullName: string;
    parameters: (string | object)[];
    parameterCount: number;
    returnTypes: (string | object)[];
    visibility: string;
    typeParameters: string[];
    analysis: {
      stringCount: number;
      u64Count: number;
      objectCount: number;
      referenceCount: number;
      mutableReferenceCount: number;
      clockPosition: number;
      contextPosition: number;
      stringPositions: number[];
      u64Positions: number[];
    };
    isMutable: boolean;
    hasContext: boolean;
    hasClock: boolean;
  }

  /**
   * Complete ABI data structure
   */
  export interface ABI {
    metadata: {
      packageId: string;
      network: string;
      generatedAt: string;
      moduleCount: number;
      functionCount: number;
    };
    signatures: Record<string, FunctionSignature>;
    modules: Record<string, any>;
  }

  // Specific function signatures for WalSheetz
  /**
   * spreadsheet::create_spreadsheet
   * Parameters: 3
   * 
   * 
   */
  export interface create_spreadsheetArgs {
        arg0: object;
    arg1: object;
    arg2: object;
  }

  /**
   * spreadsheet::get_spreadsheet_info
   * Parameters: 1
   * 
   * 
   */
  export interface get_spreadsheet_infoArgs {
        arg0: object;
  }

  /**
   * spreadsheet::get_version_info
   * Parameters: 1
   * 
   * 
   */
  export interface get_version_infoArgs {
        arg0: object;
  }

  /**
   * spreadsheet::lock_cell
   * Parameters: 3
   * 
   * 
   */
  export interface lock_cellArgs {
        arg0: any;
    arg1: object;
    arg2: object;
  }

  /**
   * spreadsheet::make_public
   * Parameters: 2
   * 
   * 
   */
  export interface make_publicArgs {
        arg0: object;
    arg1: object;
  }

  /**
   * spreadsheet::save_version
   * Parameters: 5
   * 
   * 
   */
  export interface save_versionArgs {
        arg0: object;
    arg1: object;
    arg2: any;
    arg3: object;
    arg4: object;
  }

  /**
   * spreadsheet::transfer_ownership
   * Parameters: 3
   * 
   * 
   */
  export interface transfer_ownershipArgs {
        arg0: object;
    arg1: any;
    arg2: object;
  }

  /**
   * spreadsheet::unlock_cell
   * Parameters: 2
   * 
   * 
   */
  export interface unlock_cellArgs {
        arg0: object;
    arg1: object;
  }

  /**
   * spreadsheet::update_title
   * Parameters: 3
   * 
   * 
   */
  export interface update_titleArgs {
        arg0: object;
    arg1: object;
    arg2: object;
  }

  /**
   * Main ABI export
   */
  export const abi: ABI;
  export const signatures: Record<string, FunctionSignature>;
}

/**
 * Utility types for function argument construction
 */
export type SpreadsheetFunctionArgs = {
  'spreadsheet::create_spreadsheet': create_spreadsheetArgs;
  'spreadsheet::get_spreadsheet_info': get_spreadsheet_infoArgs;
  'spreadsheet::get_version_info': get_version_infoArgs;
  'spreadsheet::lock_cell': lock_cellArgs;
  'spreadsheet::make_public': make_publicArgs;
  'spreadsheet::save_version': save_versionArgs;
  'spreadsheet::transfer_ownership': transfer_ownershipArgs;
  'spreadsheet::unlock_cell': unlock_cellArgs;
  'spreadsheet::update_title': update_titleArgs;
};

/**
 * Type guards for function signature validation
 */
export interface FunctionTypeGuards {
  isSpreadsheetFunction(fullName: string): boolean;
  requiresContentHash(fullName: string): boolean;
  getExpectedArgCount(fullName: string): number;
  validateArguments(fullName: string, args: any[]): boolean;
}
