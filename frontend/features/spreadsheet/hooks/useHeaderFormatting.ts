import { useState, useEffect, useCallback } from 'react';
import { logger, LogComponent } from '@dreamlit/walrus';
import luckysheetApi from '@lib/spreadsheet/services/luckysheetApi.ts';

interface FormattingState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fontFamily: string;
  fontSize: string;
}

export function useHeaderFormatting() {
  const [formatting, setFormatting] = useState<FormattingState>({
    bold: false,
    italic: false,
    underline: false,
    fontFamily: 'Arial',
    fontSize: '12',
  });

  const updateFormattingState = useCallback(() => {
    if (!luckysheetApi.isReady) return;
    try {
      const activeCell = luckysheetApi.getActiveCell();
      if (!activeCell) return;

      const cellInfo = luckysheetApi.getCellValue(activeCell.row, activeCell.col, { type: 'object' });
      if (cellInfo?.s) {
        const s = cellInfo.s;
        setFormatting({
          bold: Boolean(s.bl),
          italic: Boolean(s.it),
          underline: Boolean(s.un),
          fontFamily: s.ff || 'Arial',
          fontSize: String(s.fs || 12),
        });
      } else {
        setFormatting({ bold: false, italic: false, underline: false, fontFamily: 'Arial', fontSize: '12' });
      }
    } catch {
      // Silently handle formatting state errors
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(updateFormattingState, 250);
    return () => clearInterval(interval);
  }, [updateFormattingState]);

  const getSelectedCells = useCallback(() => {
    if (!luckysheetApi.isReady) return null;
    try {
      return luckysheetApi.getSelection();
    } catch {
      return null;
    }
  }, []);

  const getCurrentCellFormat = useCallback((row: number, col: number) => {
    if (!luckysheetApi.isReady) return {};
    try {
      const cellInfo = luckysheetApi.getCellValue(row, col, { type: 'object' });
      return cellInfo?.s || {};
    } catch {
      return {};
    }
  }, []);

  const applyCellFormat = useCallback((row: number, col: number, attr: string, value: unknown) => {
    if (!luckysheetApi.isReady) return false;
    try {
      luckysheetApi.setCellFormat(row, col, attr, value);
      return true;
    } catch {
      return false;
    }
  }, []);

  const applyFormatToSelection = useCallback((attr: string, value: unknown) => {
    if (!luckysheetApi.isReady) return false;

    const selection = getSelectedCells();
    if (selection) {
      const { startRow, endRow, startCol, endCol } = selection;
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          applyCellFormat(r, c, attr, value);
        }
      }
    } else {
      const activeCell = luckysheetApi.getActiveCell();
      if (activeCell) {
        applyCellFormat(activeCell.row, activeCell.col, attr, value);
      } else {
        return false;
      }
    }

    try {
      luckysheetApi.refresh();
    } catch {
      // Ignore refresh errors
    }
    return true;
  }, [getSelectedCells, applyCellFormat]);

  const toggleFormat = useCallback((formatAttr: string, formatKey: keyof FormattingState) => {
    if (!window.luckysheet) return;

    const activeCell = luckysheetApi.getActiveCell();
    let currentValue = false;
    if (activeCell) {
      const cellFormat = getCurrentCellFormat(activeCell.row, activeCell.col);
      currentValue = Boolean(cellFormat[formatAttr]);
    }

    const newValue = !currentValue;
    const success = applyFormatToSelection(formatAttr, newValue ? 1 : 0);
    if (success) {
      setTimeout(updateFormattingState, 50);
    }
  }, [getCurrentCellFormat, applyFormatToSelection, updateFormattingState]);

  const toggleBold = useCallback(() => toggleFormat('bl', 'bold'), [toggleFormat]);
  const toggleItalic = useCallback(() => toggleFormat('it', 'italic'), [toggleFormat]);
  const toggleUnderline = useCallback(() => toggleFormat('un', 'underline'), [toggleFormat]);

  const changeFontFamily = useCallback((fontFamily: string) => {
    if (!window.luckysheet) return;
    const success = applyFormatToSelection('ff', fontFamily);
    if (success) setTimeout(updateFormattingState, 50);
  }, [applyFormatToSelection, updateFormattingState]);

  const changeFontSize = useCallback((fontSize: number) => {
    if (!window.luckysheet) return;
    const success = applyFormatToSelection('fs', fontSize);
    if (success) setTimeout(updateFormattingState, 50);
  }, [applyFormatToSelection, updateFormattingState]);

  const clearFormat = useCallback(() => {
    const selection = getSelectedCells();
    if (!selection) return;

    const { startRow, endRow, startCol, endCol } = selection;
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        applyCellFormat(r, c, 'bl', 0);
        applyCellFormat(r, c, 'it', 0);
        applyCellFormat(r, c, 'un', 0);
        applyCellFormat(r, c, 'bg', null);
        applyCellFormat(r, c, 'fc', '#000000');
      }
    }
    setTimeout(updateFormattingState, 50);
  }, [getSelectedCells, applyCellFormat, updateFormattingState]);

  return {
    formatting,
    toggleBold,
    toggleItalic,
    toggleUnderline,
    changeFontFamily,
    changeFontSize,
    clearFormat,
    getSelectedCells,
  };
}
