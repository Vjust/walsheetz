// Core Luckysheet Types
export interface LuckysheetCell {
  v?: any; // Cell value
  m?: string; // Display value
  ct?: { // Cell type
    fa: string; // Format
    t: string; // Type
  };
  f?: string; // Formula
  s?: LuckysheetCellStyle; // Style
}

export interface LuckysheetCellStyle {
  bl?: number; // Bold (0 or 1)
  it?: number; // Italic (0 or 1)
  un?: number; // Underline (0 or 1)
  ff?: string; // Font family
  fs?: number; // Font size
  fc?: string; // Font color
  bg?: string; // Background color
  ht?: number; // Text alignment horizontal
  vt?: number; // Text alignment vertical
}

export interface LuckysheetCellData {
  r: number; // Row
  c: number; // Column
  v: LuckysheetCell; // Cell data
}

export interface LuckysheetSheet {
  name: string;
  color?: string;
  index: number;
  status?: number;
  order?: number;
  celldata?: LuckysheetCellData[];
  config?: {
    merge?: any;
    rowlen?: { [key: string]: number };
    columnlen?: { [key: string]: number };
    rowhidden?: { [key: string]: number };
    colhidden?: { [key: string]: number };
  };
}

export interface LuckysheetSelection {
  row: number[] | number;
  column: number[] | number;
  r?: number;
  c?: number;
}

export interface NormalizedSelection {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

export interface LuckysheetRange extends LuckysheetSelection {}

export interface LuckysheetHook {
  cellEditBefore?: (range: LuckysheetRange[]) => boolean | void;
  cellEditEnd?: (range: LuckysheetRange[], oldValue: any, newValue: any) => void;
  cellUpdated?: (row: number, col: number, oldValue: any, newValue: any) => void;
  rangeSelect?: (sheet: LuckysheetSheet, range: LuckysheetRange[]) => void;
  rangeClear?: (range: LuckysheetRange[]) => void;
  sheetActivate?: (sheet: LuckysheetSheet, index: number) => void;
  workbookCreateAfter?: () => void;
  workbookCreateBefore?: () => void;
}

export interface LuckysheetConfig {
  container: string;
  title?: string;
  lang?: string;
  data?: LuckysheetSheet[];
  showinfobar?: boolean;
  showstatisticBar?: boolean;
  allowCopy?: boolean;
  allowEdit?: boolean;
  enableAddRow?: boolean;
  enableAddCol?: boolean;
  hook?: LuckysheetHook;
}

// Luckysheet Global API
export interface LuckysheetGlobal {
  // Core methods
  create(config: LuckysheetConfig): void;
  destroy(): void;

  // Selection methods
  getRange?(): LuckysheetRange[];
  getActiveRange?(): LuckysheetRange;
  getSelection?(): LuckysheetRange[];

  // Cell methods
  getCellValue?(row: number, col: number, options?: { type?: string }): any;
  setCellValue?(row: number, col: number, value: any): void;
  setCellFormat?(row: number, col: number, attr: string, value: any): void;

  // Sheet methods
  getAllSheets?(): LuckysheetSheet[];
  getSheet?(index?: number): LuckysheetSheet;
  renameSheet?(name: string, index?: number): void;

  // Edit methods
  undo?(): void;
  redo?(): void;
  copy?(): void;
  cut?(): void;
  paste?(): void;

  // Row/Column methods
  insertRow?(index: number): void;
  deleteRow?(start: number, end?: number): void;
  insertColumn?(index: number): void;
  deleteColumn?(start: number, end?: number): void;

  // Display methods
  zoom?(ratio: number): void;
  refresh?(): void;
  refreshAll?(): void;
  refreshFormula?(): void;

  // Export methods
  exportLuckyToExcel?(options?: any): void;

  // Sort methods
  sort?(options?: any): void;

  // Legacy compatibility
  setCellFormat?: (type: string, value: any) => void;
  getCellFormat?: () => any;
  setFontFamily?: (fontFamily: string) => void;
  setFontSize?: (fontSize: number) => void;
  getSheetData?: () => any;
  setSheetData?: (data: any) => void;

  [key: string]: any;
}

// Our Wrapper API Types
export interface LuckysheetApiConfig {
  containerId?: string;
  sheet?: Partial<LuckysheetSheet>;
  onReady?: () => void;
  hook?: LuckysheetHook;
  [key: string]: any;
}

export interface ActiveCell {
  row: number;
  col: number;
}

export interface SortOptions {
  range?: LuckysheetRange;
  order?: 'asc' | 'desc';
  column?: number;
}

export interface ExportOptions {
  title?: string;
  filename?: string;
  sheetIndex?: number;
}

export declare class LuckysheetApi {
  isReady: boolean;

  // Core lifecycle methods
  ensureLoaded(timeout?: number): Promise<boolean>;
  whenReady(): Promise<void>;
  init(config: LuckysheetApiConfig): Promise<void>;
  destroy(): Promise<void>;

  // Selection methods
  getSelection(): NormalizedSelection | null;
  getActiveCell(): ActiveCell | null;

  // Cell methods
  getCellValue(row: number, col: number, options?: { type?: string }): any;
  setCellFormat(row: number, col: number, attr: string, value: any): void;

  // Sheet methods
  getAllSheets(): LuckysheetSheet[];
  renameSheet(name: string): void;

  // Display methods
  zoom(ratio: number): void;
  refresh(type?: string): void;

  // Edit methods
  undo(): void;
  redo(): void;
  copy(): void;
  cut(): void;
  paste(): void;
  refreshFormula(): void;

  // Row/Column methods
  insertRow(index: number): void;
  deleteRow(index: number): void;
  insertColumn(index: number): void;
  deleteColumn(index: number): void;

  // Other methods
  sort(options?: SortOptions): void;
  exportToExcel(options?: ExportOptions): void;
}

declare global {
  interface Window {
    luckysheet: LuckysheetGlobal;
    luckysheetfile?: LuckysheetSheet[];
    luckysheet_select_save?: LuckysheetSelection[];
    luckysheetApi?: LuckysheetApi;

    luckysheetConfigsetting?: {
      merge?: any;
      [key: string]: any;
    };

    devTools?: {
      forceSave: () => void;
      getStatus: () => any;
      reset: () => void;
      connectWallet: () => void;
      [key: string]: any;
    };
  }

  interface ImportMeta {
    env?: {
      DEV?: boolean;
      [key: string]: any;
    };
  }

  interface Element {
    value?: string;
    focus?: () => void;
    style?: CSSStyleDeclaration;
    title?: string;
  }
}

// Utility types for common patterns
export type CellValue = string | number | boolean | null | undefined;
export type CellReference = `${string}${number}`; // e.g., "A1", "B2"
export type CellPosition = { row: number; col: number };
export type CellRange = {
  start: CellPosition;
  end: CellPosition;
};

// Format attribute keys
export type FormatAttribute =
  | 'bl' // Bold
  | 'it' // Italic
  | 'un' // Underline
  | 'ff' // Font family
  | 'fs' // Font size
  | 'fc' // Font color
  | 'bg' // Background color
  | 'ht' // Horizontal alignment
  | 'vt'; // Vertical alignment

// Font families commonly used
export type FontFamily =
  | 'Arial'
  | 'Times New Roman'
  | 'Courier New'
  | 'Helvetica'
  | 'Georgia'
  | 'Verdana'
  | string;

// Alignment types
export type HorizontalAlignment = 0 | 1 | 2; // Left, Center, Right
export type VerticalAlignment = 0 | 1 | 2; // Top, Middle, Bottom

export {};