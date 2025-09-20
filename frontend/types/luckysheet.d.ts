declare global {
  interface Window {
    luckysheet: {
      create: (options: {
        container: string;
        showinfobar?: boolean;
        showstatisticBar?: boolean;
        data?: any[];
        title?: string;
        lang?: string;
        [key: string]: any;
      }) => void;
      
      setCellFormat: (type: string, value: any) => void;
      getCellFormat: () => any;
      getSelection: () => any;
      refresh: () => void;
      destroy: () => void;
      
      undo: () => void;
      redo: () => void;
      
      setFontFamily: (fontFamily: string) => void;
      setFontSize: (fontSize: number) => void;
      
      getSheetData: () => any;
      setSheetData: (data: any) => void;
      
      [key: string]: any;
    };
    
    luckysheet_select_save: any[];
    luckysheetConfigsetting: {
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

export {};