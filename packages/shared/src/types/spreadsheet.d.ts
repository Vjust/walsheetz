/**
 * TypeScript interfaces for spreadsheet business logic
 */

export type SaveStatus = 'ready' | 'saving' | 'saved' | 'error';

export interface LoadingState {
  isLoading: boolean;
  message: string;
  details: string;
}

export interface SyncStatus {
  lastSync?: number;
  pending?: boolean;
  error?: string | null;
}

export interface CollaborationStatus {
  connected: boolean;
  users: unknown[];
  lockedCells: unknown[];
}

export interface SaveReminder {
  visible: boolean;
  lastChecked: number;
}

export interface SpreadsheetData {
  id?: string;
  title?: string;
  data?: unknown;
  last_modified?: string;
  [key: string]: unknown;
}

export interface ConnectWalletResult {
  success: boolean;
  wallet?: {
    address?: string;
    balance?: unknown;
    name?: string;
  };
  error?: string;
}

export interface LoadSpreadsheetResult {
  success: boolean;
  spreadsheet?: SpreadsheetData;
  error?: string;
}

export interface SaveToBlockchainResult {
  success: boolean;
  digest?: string;
  error?: string;
}

export interface UserSpreadsheetsResult {
  success: boolean;
  spreadsheets: SpreadsheetData[];
  error?: string;
}

export interface UseSpreadsheet {
  // State
  currentCell: string;
  formulaValue: string;
  editCount: number;
  saveStatus: SaveStatus;
  loadingState: LoadingState;
  syncStatus: SyncStatus | null;
  collaborationStatus: CollaborationStatus;
  spreadsheetCount: number;
  spreadsheetData: SpreadsheetData | null;
  saveReminder: SaveReminder;
  autoSaveEnabled: boolean;

  // Actions
  setCurrentCell: (cell: string) => void;
  updateFormula: (formula: string) => void;
  incrementEditCount: () => void;
  resetEditCount: () => void;
  connectWallet: (walletType?: string) => Promise<ConnectWalletResult>;
  loadSpreadsheetById: (id: string) => Promise<LoadSpreadsheetResult>;
  saveToBlockchain: (description?: string) => Promise<SaveToBlockchainResult>;
  createNewSpreadsheet: (title?: string) => Promise<SpreadsheetData>;
  getUserSpreadsheets: () => Promise<UserSpreadsheetsResult>;
  dismissSaveReminder: () => void;
  toggleAutoSave: () => void;

  // Internal methods (may not be exposed)
  initializeServices: () => Promise<void>;
  updateSyncStatus: () => void;
  autoDiscoverSpreadsheets: () => Promise<void>;
  checkSessionRestoration: () => Promise<void>;
}