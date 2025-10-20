/**
 * Generated ABI Type Definitions for WalSheetz
 *
 * Generated on: 2025-10-20T18:32:25.373Z
 * Package ID: 0x991454976a4ef8535ed3572bb1c500dcd565855d49a51f1fadc7f70a316c9631
 * Network: mainnet
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
   * spreadsheet::add_collaborator
   * Parameters: 5
   * 
   * 
   */
  export interface add_collaboratorArgs {
        arg0: object;
    arg1: any;
    arg2: any;
    arg3: object;
    arg4: object;
  }

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
   * spreadsheet::delete_spreadsheet
   * Parameters: 3
   * 
   * 
   */
  export interface delete_spreadsheetArgs {
        arg0: object;
    arg1: object;
    arg2: object;
  }

  /**
   * spreadsheet::delete_spreadsheet_with_versions
   * Parameters: 4
   * 
   * 
   */
  export interface delete_spreadsheet_with_versionsArgs {
        arg0: object;
    arg1: object;
    arg2: object;
    arg3: object;
  }

  /**
   * spreadsheet::force_unlock_all_cells
   * Parameters: 2
   * 
   * 
   */
  export interface force_unlock_all_cellsArgs {
        arg0: object;
    arg1: object;
  }

  /**
   * spreadsheet::get_active_editors
   * Parameters: 1
   * 
   * 
   */
  export interface get_active_editorsArgs {
        arg0: object;
  }

  /**
   * spreadsheet::get_locked_cells
   * Parameters: 2
   * 
   * 
   */
  export interface get_locked_cellsArgs {
        arg0: object;
    arg1: object;
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
   * spreadsheet::get_spreadsheet_stats
   * Parameters: 1
   * 
   * 
   */
  export interface get_spreadsheet_statsArgs {
        arg0: object;
  }

  /**
   * spreadsheet::get_version_chain
   * Parameters: 2
   * 
   * 
   */
  export interface get_version_chainArgs {
        arg0: object;
    arg1: any;
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
   * spreadsheet::list_spreadsheets
   * Parameters: 3
   * 
   * 
   */
  export interface list_spreadsheetsArgs {
        arg0: object;
    arg1: any;
    arg2: any;
  }

  /**
   * spreadsheet::lock_cell
   * Parameters: 4
   * 
   * 
   */
  export interface lock_cellArgs {
        arg0: object;
    arg1: object;
    arg2: object;
    arg3: object;
  }

  /**
   * spreadsheet::make_private
   * Parameters: 2
   * 
   * 
   */
  export interface make_privateArgs {
        arg0: object;
    arg1: object;
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
   * spreadsheet::prune_old_versions
   * Parameters: 3
   * 
   * 
   */
  export interface prune_old_versionsArgs {
        arg0: object;
    arg1: any;
    arg2: object;
  }

  /**
   * spreadsheet::remove_collaborator
   * Parameters: 3
   * 
   * 
   */
  export interface remove_collaboratorArgs {
        arg0: object;
    arg1: any;
    arg2: object;
  }

  /**
   * spreadsheet::remove_spreadsheet
   * Parameters: 3
   * 
   * 
   */
  export interface remove_spreadsheetArgs {
        arg0: object;
    arg1: object;
    arg2: object;
  }

  /**
   * spreadsheet::rollback_to_version
   * Parameters: 4
   * 
   * 
   */
  export interface rollback_to_versionArgs {
        arg0: object;
    arg1: any;
    arg2: object;
    arg3: object;
  }

  /**
   * spreadsheet::save_version
   * Parameters: 7
   * 
   * 
   */
  export interface save_versionArgs {
        arg0: object;
    arg1: object;
    arg2: object;
    arg3: any;
    arg4: object;
    arg5: object;
    arg6: object;
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
   * Parameters: 4
   * 
   * 
   */
  export interface unlock_cellArgs {
        arg0: object;
    arg1: object;
    arg2: object;
    arg3: object;
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
  'spreadsheet::add_collaborator': add_collaboratorArgs;
  'spreadsheet::create_spreadsheet': create_spreadsheetArgs;
  'spreadsheet::delete_spreadsheet': delete_spreadsheetArgs;
  'spreadsheet::delete_spreadsheet_with_versions': delete_spreadsheet_with_versionsArgs;
  'spreadsheet::force_unlock_all_cells': force_unlock_all_cellsArgs;
  'spreadsheet::get_active_editors': get_active_editorsArgs;
  'spreadsheet::get_locked_cells': get_locked_cellsArgs;
  'spreadsheet::get_spreadsheet_info': get_spreadsheet_infoArgs;
  'spreadsheet::get_spreadsheet_stats': get_spreadsheet_statsArgs;
  'spreadsheet::get_version_chain': get_version_chainArgs;
  'spreadsheet::get_version_info': get_version_infoArgs;
  'spreadsheet::list_spreadsheets': list_spreadsheetsArgs;
  'spreadsheet::lock_cell': lock_cellArgs;
  'spreadsheet::make_private': make_privateArgs;
  'spreadsheet::make_public': make_publicArgs;
  'spreadsheet::prune_old_versions': prune_old_versionsArgs;
  'spreadsheet::remove_collaborator': remove_collaboratorArgs;
  'spreadsheet::remove_spreadsheet': remove_spreadsheetArgs;
  'spreadsheet::rollback_to_version': rollback_to_versionArgs;
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
