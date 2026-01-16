import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { logger, LogComponent } from '@dreamlit/walrus';
import luckysheetApi from '@lib/spreadsheet/services/luckysheetApi.ts';

interface MenuConfig {
  label: string;
  action: string;
  shortcut?: string;
}

const menuItems: Record<string, MenuConfig[]> = {
  File: [
    { label: 'New', action: 'new' },
    { label: 'Download as Excel', action: 'download' },
  ],
  Edit: [
    { label: 'Undo', action: 'undo', shortcut: 'Ctrl+Z' },
    { label: 'Redo', action: 'redo', shortcut: 'Ctrl+Y' },
    { label: 'Cut', action: 'cut', shortcut: 'Ctrl+X' },
    { label: 'Copy', action: 'copy', shortcut: 'Ctrl+C' },
    { label: 'Paste', action: 'paste', shortcut: 'Ctrl+V' },
  ],
  View: [
    { label: 'Zoom In', action: 'zoomIn' },
    { label: 'Zoom Out', action: 'zoomOut' },
  ],
  Insert: [
    { label: 'Insert Row Above', action: 'insertRow' },
    { label: 'Insert Column Left', action: 'insertColumn' },
    { label: 'Delete Row', action: 'deleteRow' },
    { label: 'Delete Column', action: 'deleteColumn' },
  ],
  Format: [
    { label: 'Bold', action: 'bold', shortcut: 'Ctrl+B' },
    { label: 'Italic', action: 'italic', shortcut: 'Ctrl+I' },
    { label: 'Underline', action: 'underline', shortcut: 'Ctrl+U' },
    { label: 'Clear Format', action: 'clearFormat' },
  ],
  Data: [{ label: 'Sort Ascending', action: 'sort' }],
  Tools: [{ label: 'Function List', action: 'functions' }],
};

interface UseHeaderMenuProps {
  walletConnected: boolean;
  documentName: string;
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  clearFormat: () => void;
  getSelectedCells: () => { startRow: number; endRow: number; startCol: number; endCol: number } | null;
}

export function useHeaderMenu({
  walletConnected,
  documentName,
  toggleBold,
  toggleItalic,
  toggleUnderline,
  clearFormat,
  getSelectedCells,
}: UseHeaderMenuProps) {
  const navigate = useNavigate();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (activeMenu && !(event.target as Element).closest('.menu-dropdown')) {
        setActiveMenu(null);
      }
    };

    if (activeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activeMenu]);

  const handleMenuClick = useCallback((menuType: string) => {
    setActiveMenu((prev) => (prev === menuType ? null : menuType));
  }, []);

  const handleMenuAction = useCallback(async (action: string) => {
    setActiveMenu(null);
    if (!window.luckysheet) return;

    const selection = getSelectedCells();

    switch (action) {
      case 'new':
        if (!walletConnected) {
          alert('Please connect your wallet first to create a new spreadsheet');
          return;
        }
        navigate('/');
        break;

      case 'download':
        if (luckysheetApi.isReady) {
          luckysheetApi.exportToExcel(documentName);
        }
        break;

      case 'undo':
        luckysheetApi.isReady && luckysheetApi.undo();
        break;

      case 'redo':
        luckysheetApi.isReady && luckysheetApi.redo();
        break;

      case 'cut':
        luckysheetApi.isReady && luckysheetApi.cut();
        break;

      case 'copy':
        luckysheetApi.isReady && luckysheetApi.copy();
        break;

      case 'paste':
        luckysheetApi.isReady && luckysheetApi.paste();
        break;

      case 'insertRow':
        if (luckysheetApi.isReady && selection) {
          luckysheetApi.insertRow(selection.startRow || 0);
        }
        break;

      case 'insertColumn':
        if (luckysheetApi.isReady && selection) {
          luckysheetApi.insertColumn(selection.startCol || 0);
        }
        break;

      case 'deleteRow':
        if (luckysheetApi.isReady && selection) {
          luckysheetApi.deleteRow(selection.startRow || 0);
        }
        break;

      case 'deleteColumn':
        if (luckysheetApi.isReady && selection) {
          luckysheetApi.deleteColumn(selection.startCol || 0);
        }
        break;

      case 'bold':
        toggleBold();
        break;

      case 'italic':
        toggleItalic();
        break;

      case 'underline':
        toggleUnderline();
        break;

      case 'clearFormat':
        clearFormat();
        break;

      case 'sort':
        luckysheetApi.isReady && luckysheetApi.sortSelection(true);
        break;

      case 'zoomIn':
        luckysheetApi.isReady && luckysheetApi.zoom(1.2);
        break;

      case 'zoomOut':
        luckysheetApi.isReady && luckysheetApi.zoom(0.8);
        break;

      case 'functions':
        const functions = [
          'SUM(range)', 'AVERAGE(range)', 'COUNT(range)', 'MAX(range)', 'MIN(range)',
          'IF(condition, true_value, false_value)', 'VLOOKUP(lookup_value, table_array, col_index, exact)',
          'TODAY()', 'NOW()', 'CONCATENATE(text1, text2, ...)', 'LEN(text)',
        ];
        alert('Common Functions:\n\n' + functions.join('\n'));
        break;
    }
  }, [walletConnected, documentName, navigate, getSelectedCells, toggleBold, toggleItalic, toggleUnderline, clearFormat]);

  return {
    menuItems,
    activeMenu,
    handleMenuClick,
    handleMenuAction,
  };
}
