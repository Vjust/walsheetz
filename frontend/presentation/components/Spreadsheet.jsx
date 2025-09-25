import React, { useEffect, useRef } from 'react'
import { useSpreadsheetContext } from './SpreadsheetProvider.jsx'
import luckysheetApi from '../../services/luckysheetApi.js'

// Helper function to convert column letters to numbers (A=0, B=1, ..., AA=26, AB=27, etc.)
function columnLettersToNumber(letters) {
  let result = 0;
  for (let i = 0; i < letters.length; i++) {
    result = result * 26 + (letters.charCodeAt(i) - 64); // A=1, B=2, etc.
  }
  return result - 1; // Convert to 0-based indexing
}

// Helper function to convert column number to letters (0=A, 1=B, ..., 26=AA, 27=AB, etc.)
function columnNumberToLetters(num) {
  let result = '';
  let n = num + 1; // Convert to 1-based
  while (n > 0) {
    n--; // Adjust for 0-based alphabet
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

// Helper function to convert loaded data to Luckysheet celldata format
function convertToLuckysheetData(spreadsheetData) {
  try {
    // Accept {success,data:{data:{cells}}}, {data:{cells}}, {cells}, or prebuilt {celldata}
    const prebuilt = spreadsheetData?.data?.celldata || spreadsheetData?.celldata
    if (Array.isArray(prebuilt)) return prebuilt

    const cells =
      spreadsheetData?.data?.data?.cells ??
      spreadsheetData?.data?.cells ??
      spreadsheetData?.cells ??
      null
    if (!cells || typeof cells !== 'object') return []

    const celldata = []
    for (const cellRef of Object.keys(cells)) {
      const cell = cells[cellRef]
      const m = cellRef.match(/^([A-Z]+)(\d+)$/)
      if (!m) continue
      const col = columnLettersToNumber(m[1])
      const row = parseInt(m[2], 10) - 1
      celldata.push({
        r: row,
        c: col,
        v: {
          v: cell?.value,
          m: cell?.value != null ? String(cell.value) : '',
          ct: cell?.type ? { fa: cell.type, t: 'g' } : { fa: 'General', t: 'g' }
        }
      })
    }
    return celldata
  } catch { return [] }
}

export function Spreadsheet() {
  const luckysheetRef = useRef(null)
  const containerRef = useRef(null)
  const previousCellValueRef = useRef(null)
  const domEventListenersRef = useRef([])
  const luckysheetReadyRef = useRef(false)
  
  const {
    handleCellEdit,
    setCurrentCell,
    handleFormulaChange,
    saveToBlockchain,
    spreadsheetData,
    setLuckysheetReady
  } = useSpreadsheetContext()

  useEffect(() => {
    // Handle keyboard events for shortcuts only - let Luckysheet handle cell input naturally
    const handleKeyDown = (event) => {
      if (window.luckysheet && luckysheetRef.current) {
        try {
          // Only handle keyboard shortcuts - don't interfere with normal typing
          if (event.ctrlKey || event.metaKey) {
            switch (event.key.toLowerCase()) {
              case 'z':
                if (!event.shiftKey) {
                  event.preventDefault()
                  window.luckysheet.undo && window.luckysheet.undo()
                  return
                }
                break
              case 'y':
                event.preventDefault()
                window.luckysheet.redo && window.luckysheet.redo()
                return
              case 'b':
                event.preventDefault()
                // Toggle bold formatting using proper API while preserving other formats
                if (window.luckysheet && window.luckysheet.setCellFormat) {
                  const getCurrentCellFormat = (row, col) => {
                    try {
                      if (window.luckysheet.getCellValue) {
                        const cellInfo = window.luckysheet.getCellValue(row, col, { type: 'object' })
                        return cellInfo && cellInfo.s ? cellInfo.s : {}
                      }
                    } catch (error) {
                      console.debug('Error getting cell format:', error)
                    }
                    return {}
                  }
                  
                  const applyCellFormat = (row, col, attr, value) => {
                    try {
                      const existingFormat = getCurrentCellFormat(row, col)
                      const newFormat = { ...existingFormat, [attr]: value }
                      
                      if (newFormat.bl !== undefined) window.luckysheet.setCellFormat(row, col, 'bl', newFormat.bl)
                      if (newFormat.it !== undefined) window.luckysheet.setCellFormat(row, col, 'it', newFormat.it)
                      if (newFormat.un !== undefined) window.luckysheet.setCellFormat(row, col, 'un', newFormat.un)
                      if (newFormat.ff !== undefined) window.luckysheet.setCellFormat(row, col, 'ff', newFormat.ff)
                      if (newFormat.fs !== undefined) window.luckysheet.setCellFormat(row, col, 'fs', newFormat.fs)
                      if (newFormat.fc !== undefined) window.luckysheet.setCellFormat(row, col, 'fc', newFormat.fc)
                      if (newFormat.bg !== undefined) window.luckysheet.setCellFormat(row, col, 'bg', newFormat.bg)
                    } catch (error) {
                      console.error('Error applying cell format:', error)
                    }
                  }
                  
                  const getCurrentSelection = () => {
                    if (window.luckysheet.getRange) {
                      try {
                        const ranges = window.luckysheet.getRange()
                        return ranges && ranges.length > 0 ? ranges[0] : null
                      } catch (e) { return null }
                    }
                    return window.luckysheet_select_save && window.luckysheet_select_save[0] || null
                  }
                  
                  const selection = getCurrentSelection()
                  if (selection) {
                    const startRow = selection.row ? selection.row[0] : selection.r || 0
                    const endRow = selection.row ? selection.row[1] : selection.r || 0
                    const startCol = selection.column ? selection.column[0] : selection.c || 0
                    const endCol = selection.column ? selection.column[1] : selection.c || 0
                    
                    // Check current bold state of first cell to determine toggle direction
                    const firstCellFormat = getCurrentCellFormat(startRow, startCol)
                    const currentBold = firstCellFormat.bl === 1
                    const newBold = currentBold ? 0 : 1
                    
                    for (let r = startRow; r <= endRow; r++) {
                      for (let c = startCol; c <= endCol; c++) {
                        applyCellFormat(r, c, 'bl', newBold)
                      }
                    }
                  } else {
                    // Apply to current cell (0,0 as fallback)
                    const currentFormat = getCurrentCellFormat(0, 0)
                    const currentBold = currentFormat.bl === 1
                    applyCellFormat(0, 0, 'bl', currentBold ? 0 : 1)
                  }
                }
                return
              case 'i':
                event.preventDefault()
                // Toggle italic formatting using proper API while preserving other formats
                if (window.luckysheet && window.luckysheet.setCellFormat) {
                  const getCurrentCellFormat = (row, col) => {
                    try {
                      if (window.luckysheet.getCellValue) {
                        const cellInfo = window.luckysheet.getCellValue(row, col, { type: 'object' })
                        return cellInfo && cellInfo.s ? cellInfo.s : {}
                      }
                    } catch (error) {
                      console.debug('Error getting cell format:', error)
                    }
                    return {}
                  }
                  
                  const applyCellFormat = (row, col, attr, value) => {
                    try {
                      const existingFormat = getCurrentCellFormat(row, col)
                      const newFormat = { ...existingFormat, [attr]: value }
                      
                      if (newFormat.bl !== undefined) window.luckysheet.setCellFormat(row, col, 'bl', newFormat.bl)
                      if (newFormat.it !== undefined) window.luckysheet.setCellFormat(row, col, 'it', newFormat.it)
                      if (newFormat.un !== undefined) window.luckysheet.setCellFormat(row, col, 'un', newFormat.un)
                      if (newFormat.ff !== undefined) window.luckysheet.setCellFormat(row, col, 'ff', newFormat.ff)
                      if (newFormat.fs !== undefined) window.luckysheet.setCellFormat(row, col, 'fs', newFormat.fs)
                      if (newFormat.fc !== undefined) window.luckysheet.setCellFormat(row, col, 'fc', newFormat.fc)
                      if (newFormat.bg !== undefined) window.luckysheet.setCellFormat(row, col, 'bg', newFormat.bg)
                    } catch (error) {
                      console.error('Error applying cell format:', error)
                    }
                  }
                  
                  const getCurrentSelection = () => {
                    if (window.luckysheet.getRange) {
                      try {
                        const ranges = window.luckysheet.getRange()
                        return ranges && ranges.length > 0 ? ranges[0] : null
                      } catch (e) { return null }
                    }
                    return window.luckysheet_select_save && window.luckysheet_select_save[0] || null
                  }
                  
                  const selection = getCurrentSelection()
                  if (selection) {
                    const startRow = selection.row ? selection.row[0] : selection.r || 0
                    const endRow = selection.row ? selection.row[1] : selection.r || 0
                    const startCol = selection.column ? selection.column[0] : selection.c || 0
                    const endCol = selection.column ? selection.column[1] : selection.c || 0
                    
                    // Check current italic state of first cell to determine toggle direction
                    const firstCellFormat = getCurrentCellFormat(startRow, startCol)
                    const currentItalic = firstCellFormat.it === 1
                    const newItalic = currentItalic ? 0 : 1
                    
                    for (let r = startRow; r <= endRow; r++) {
                      for (let c = startCol; c <= endCol; c++) {
                        applyCellFormat(r, c, 'it', newItalic)
                      }
                    }
                  } else {
                    // Apply to current cell (0,0 as fallback)
                    const currentFormat = getCurrentCellFormat(0, 0)
                    const currentItalic = currentFormat.it === 1
                    applyCellFormat(0, 0, 'it', currentItalic ? 0 : 1)
                  }
                }
                return
              case 'u':
                event.preventDefault()
                // Toggle underline formatting using proper API while preserving other formats
                if (window.luckysheet && window.luckysheet.setCellFormat) {
                  const getCurrentCellFormat = (row, col) => {
                    try {
                      if (window.luckysheet.getCellValue) {
                        const cellInfo = window.luckysheet.getCellValue(row, col, { type: 'object' })
                        return cellInfo && cellInfo.s ? cellInfo.s : {}
                      }
                    } catch (error) {
                      console.debug('Error getting cell format:', error)
                    }
                    return {}
                  }
                  
                  const applyCellFormat = (row, col, attr, value) => {
                    try {
                      const existingFormat = getCurrentCellFormat(row, col)
                      const newFormat = { ...existingFormat, [attr]: value }
                      
                      if (newFormat.bl !== undefined) window.luckysheet.setCellFormat(row, col, 'bl', newFormat.bl)
                      if (newFormat.it !== undefined) window.luckysheet.setCellFormat(row, col, 'it', newFormat.it)
                      if (newFormat.un !== undefined) window.luckysheet.setCellFormat(row, col, 'un', newFormat.un)
                      if (newFormat.ff !== undefined) window.luckysheet.setCellFormat(row, col, 'ff', newFormat.ff)
                      if (newFormat.fs !== undefined) window.luckysheet.setCellFormat(row, col, 'fs', newFormat.fs)
                      if (newFormat.fc !== undefined) window.luckysheet.setCellFormat(row, col, 'fc', newFormat.fc)
                      if (newFormat.bg !== undefined) window.luckysheet.setCellFormat(row, col, 'bg', newFormat.bg)
                    } catch (error) {
                      console.error('Error applying cell format:', error)
                    }
                  }
                  
                  const getCurrentSelection = () => {
                    if (window.luckysheet.getRange) {
                      try {
                        const ranges = window.luckysheet.getRange()
                        return ranges && ranges.length > 0 ? ranges[0] : null
                      } catch (e) { return null }
                    }
                    return window.luckysheet_select_save && window.luckysheet_select_save[0] || null
                  }
                  
                  const selection = getCurrentSelection()
                  if (selection) {
                    const startRow = selection.row ? selection.row[0] : selection.r || 0
                    const endRow = selection.row ? selection.row[1] : selection.r || 0
                    const startCol = selection.column ? selection.column[0] : selection.c || 0
                    const endCol = selection.column ? selection.column[1] : selection.c || 0
                    
                    // Check current underline state of first cell to determine toggle direction
                    const firstCellFormat = getCurrentCellFormat(startRow, startCol)
                    const currentUnderline = firstCellFormat.un === 1
                    const newUnderline = currentUnderline ? 0 : 1
                    
                    for (let r = startRow; r <= endRow; r++) {
                      for (let c = startCol; c <= endCol; c++) {
                        applyCellFormat(r, c, 'un', newUnderline)
                      }
                    }
                  } else {
                    // Apply to current cell (0,0 as fallback)
                    const currentFormat = getCurrentCellFormat(0, 0)
                    const currentUnderline = currentFormat.un === 1
                    applyCellFormat(0, 0, 'un', currentUnderline ? 0 : 1)
                  }
                }
                return
              case 's':
                event.preventDefault()
                // Trigger save via context
                saveToBlockchain && saveToBlockchain()
                return
            }
          }
          // Let Luckysheet handle all normal keyboard input naturally
          // Don't intercept regular typing events
        } catch (error) {
          console.warn('Error in keyboard handler:', error)
        }
      }
    }

    const initLuckysheet = async () => {
      const container = document.getElementById('luckysheet-container')

      if (typeof window.luckysheet === 'undefined') {
        console.log('WalSheetz spreadsheet engine not loaded yet, retrying...')
        return false
      }

      if (!container) {
        console.warn('Luckysheet container not found, retrying...')
        return false
      }

      try {
        if (window.luckysheet && typeof window.luckysheet.destroy === 'function') {
          window.luckysheet.destroy()
        }
      } catch (e) {
        // Ignore destroy errors
      }

      luckysheetRef.current = false
      luckysheetReadyRef.current = false
      container.innerHTML = ''

      try {
        console.log('Initializing WalSheetz spreadsheet...')

          // Convert loaded data to Luckysheet format
          const celldata = convertToLuckysheetData(spreadsheetData);
          console.log('Converted celldata for Luckysheet:', celldata);

          await luckysheetApi.init({
            containerId: 'luckysheet-container',
            sheet: {
              name: (spreadsheetData?.data?.metadata?.title || spreadsheetData?.title || "Sheet1"),
              color: "",
              index: 0,
              status: 1,
              order: 0,
              hide: 0,
              row: 100,
              column: 26,
              defaultRowHeight: 25,
              defaultColWidth: 80,
              celldata: celldata,
              config: {},
              scrollLeft: 0,
              scrollTop: 0,
              luckysheet_select_save: [],
              calcChain: [],
              isPivotTable: false,
              pivotTable: {},
              filter_select: {},
              filter: null,
              luckysheet_alternateformat_save: [],
              luckysheet_alternateformat_save_modelCustom: [],
              luckysheet_conditionformat_save: {},
              frozen: {},
              chart: [],
              zoomRatio: 1,
              image: [],
              showGridLines: 1,
              dataVerification: {}
            },
            title: 'WalSheetz',
            lang: 'en',
            showinfobar: false,
            showstatisticBar: false,
            hook: {
              workbookCreateAfter: function() {
                console.log('WalSheetz spreadsheet initialized successfully')
                luckysheetRef.current = true
                luckysheetReadyRef.current = true

                // Notify the engine that Luckysheet is ready
                if (setLuckysheetReady) {
                  setLuckysheetReady(true)
                  console.log('🔧 Notified engine that Luckysheet is ready')
                }

                document.addEventListener('keydown', handleKeyDown)

                // Set up cell edit tracking override
                if (typeof window !== 'undefined' && window.devTools && window.devTools.setupCellEditTracking) {
                  console.log('🔧 Auto-setting up cell edit tracking override...')
                  window.devTools.setupCellEditTracking()
                } else {
                  console.warn('🔧 devTools.setupCellEditTracking not available, cell edits may not be tracked')
                }

                // Add additional DOM event listeners as fallback for cell edits
                setTimeout(() => {
                  try {
                    const luckysheetContainer = document.getElementById('luckysheet-container')
                    if (luckysheetContainer) {
                      // Create input handler and store reference for cleanup
                      const inputHandler = function(e) {
                        if (e.target && (e.target.className === 'luckysheet-cell-input' ||
                                       e.target.id === 'luckysheet-rich-text-editor')) {
                          console.log('🔧 Input event detected on cell editor')
                          // Get current cell position using wrapper
                          try {
                            const selection = luckysheetApi.getSelection()
                            if (selection) {
                              const row = selection.startRow
                              const col = selection.startCol
                              if (handleCellEdit && typeof row === 'number' && typeof col === 'number') {
                                const oldValue = luckysheetApi.getCellValue(row, col) || ''
                                const newValue = e.target.textContent || e.target.value || ''
                                if (oldValue !== newValue) {
                                  console.log('🔧 DOM input fallback triggered cell edit', { row, col, oldValue, newValue })
                                  handleCellEdit(row, col, oldValue, newValue)
                                }
                              }
                            }
                          } catch (err) {
                            console.warn('🔧 Error in DOM input fallback:', err)
                          }
                        }
                      }

                      // Create paste handler and store reference for cleanup
                      const pasteHandler = function(e) {
                        console.log('🔧 Paste event detected')
                        setTimeout(() => {
                          try {
                            const selection = luckysheetApi.getSelection()
                            if (selection && handleCellEdit) {
                              const row = selection.startRow
                              const col = selection.startCol
                              const newValue = luckysheetApi.getCellValue(row, col) || ''
                              console.log('🔧 Paste fallback triggered cell edit', { row, col, newValue })
                              handleCellEdit(row, col, '', newValue) // Don't know old value for paste
                            }
                          } catch (err) {
                            console.warn('🔧 Error in paste fallback:', err)
                          }
                        }, 100) // Short delay to let paste complete
                      }

                      // Add listeners and store references for cleanup
                      luckysheetContainer.addEventListener('input', inputHandler)
                      luckysheetContainer.addEventListener('paste', pasteHandler)

                      domEventListenersRef.current.push(
                        { element: luckysheetContainer, event: 'input', handler: inputHandler },
                        { element: luckysheetContainer, event: 'paste', handler: pasteHandler }
                      )

                      console.log('🔧 DOM event listeners for cell editing fallback installed')
                    }
                  } catch (error) {
                    console.warn('🔧 Error setting up DOM event listeners:', error)
                  }
                }, 1000) // Delay to ensure Luckysheet is fully loaded
              },
              cellRenderAfter: function(cell, position, sheetFile, ctx) {
                try {
                  if (ctx && ctx.canvas) {
                    ctx.canvas.style.visibility = 'visible'
                  }
                } catch (error) {
                  // Ignore rendering errors
                }
              },
              cellEditBefore: function(range) {
                console.debug('🚀 DEBUG: cellEditBefore triggered!', { range })
                try {
                  if (range && range.length > 0) {
                    const cell = range[0]

                    // Handle multiple property naming conventions from Luckysheet
                    let row, column

                    if (cell.row !== undefined && typeof cell.row === 'number') {
                      row = cell.row
                    } else if (cell.r !== undefined && typeof cell.r === 'number') {
                      row = cell.r
                    } else if (Array.isArray(cell.row) && cell.row.length > 0) {
                      row = cell.row[0]
                    } else if (Array.isArray(cell.r) && cell.r.length > 0) {
                      row = cell.r[0]
                    }

                    if (cell.column !== undefined && typeof cell.column === 'number') {
                      column = cell.column
                    } else if (cell.c !== undefined && typeof cell.c === 'number') {
                      column = cell.c
                    } else if (Array.isArray(cell.column) && cell.column.length > 0) {
                      column = cell.column[0]
                    } else if (Array.isArray(cell.c) && cell.c.length > 0) {
                      column = cell.c[0]
                    }

                    // Validate that we have valid row and column values
                    if (row == null || column == null) {
                      console.warn('cellEditBefore: Invalid cell coordinates', {
                        cell,
                        row,
                        column,
                        cellStructure: JSON.stringify(cell, null, 2)
                      })
                      return
                    }

                    // Cache the old value before editing starts
                    try {
                      const oldValue = window.luckysheet.getCellValue(row, column)
                      previousCellValueRef.current = { row, column, oldValue }
                      console.debug('cellEditBefore: Cached old value', { row, column, oldValue })
                    } catch (valueError) {
                      console.warn('cellEditBefore: Error caching old value', valueError)
                      previousCellValueRef.current = { row, column, oldValue: '' }
                    }

                    const cellRef = columnNumberToLetters(column) + (row + 1)
                    setCurrentCell(cellRef)
                  }
                } catch (error) {
                  console.warn('Error in cellEditBefore:', error)
                }
              },
              cellEditEnd: function(range, value) {
                console.debug('🚀 DEBUG: cellEditEnd triggered!', { range, value, hasHandleCellEdit: !!handleCellEdit })
                try {
                  if (!range || range.length === 0) {
                    console.warn('cellEditEnd: Invalid range', { range })
                    return
                  }
                  
                  const cell = range[0]
                  if (!cell) {
                    console.warn('cellEditEnd: No cell in range', { range })
                    return
                  }
                  
                  // Handle multiple property naming conventions from Luckysheet
                  // Try row/column first, then r/c as fallback, then row/col arrays
                  let row, column

                  if (cell.row !== undefined && typeof cell.row === 'number') {
                    row = cell.row
                  } else if (cell.r !== undefined && typeof cell.r === 'number') {
                    row = cell.r
                  } else if (Array.isArray(cell.row) && cell.row.length > 0) {
                    row = cell.row[0]
                  } else if (Array.isArray(cell.r) && cell.r.length > 0) {
                    row = cell.r[0]
                  }

                  if (cell.column !== undefined && typeof cell.column === 'number') {
                    column = cell.column
                  } else if (cell.c !== undefined && typeof cell.c === 'number') {
                    column = cell.c
                  } else if (Array.isArray(cell.column) && cell.column.length > 0) {
                    column = cell.column[0]
                  } else if (Array.isArray(cell.c) && cell.c.length > 0) {
                    column = cell.c[0]
                  }

                  // Enhanced validation for row and column values
                  if (row == null || column == null || row === undefined || column === undefined) {
                    console.warn('cellEditEnd: Invalid cell coordinates - null/undefined', {
                      cell,
                      row,
                      column,
                      rowType: typeof row,
                      columnType: typeof column,
                      cellKeys: Object.keys(cell),
                      cellStructure: JSON.stringify(cell, null, 2)
                    })
                    return
                  }
                  
                  // Validate coordinates are numbers
                  if (typeof row !== 'number' || typeof column !== 'number' || 
                      row < 0 || column < 0 || 
                      !Number.isInteger(row) || !Number.isInteger(column)) {
                    console.warn('cellEditEnd: Invalid cell coordinate values', { 
                      row, 
                      column, 
                      rowType: typeof row, 
                      columnType: typeof column,
                      rowValid: Number.isInteger(row),
                      columnValid: Number.isInteger(column)
                    })
                    return
                  }

                  // Use cached old value from cellEditBefore instead of reading after edit
                  let oldValue = ''
                  if (previousCellValueRef.current &&
                      previousCellValueRef.current.row === row &&
                      previousCellValueRef.current.column === column) {
                    oldValue = previousCellValueRef.current.oldValue
                    console.debug('cellEditEnd: Using cached old value', { oldValue })
                  } else {
                    // Fallback to current value if cache miss (shouldn't happen normally)
                    oldValue = window.luckysheet.getCellValue(row, column)
                    console.warn('cellEditEnd: Cache miss, using current value as fallback', { oldValue })
                  }

                  console.debug('🚀 DEBUG: cellEditEnd about to call handleCellEdit', {
                    row,
                    column,
                    oldValue,
                    newValue: value,
                    cellRef: columnNumberToLetters(column) + (row + 1),
                    hasHandleCellEdit: !!handleCellEdit
                  })

                  if (handleCellEdit) {
                    const result = handleCellEdit(row, column, oldValue, value)
                    console.debug('🚀 DEBUG: handleCellEdit result:', result)
                  } else {
                    console.debug('🚀 DEBUG: handleCellEdit is not defined!')
                  }
                  
                  if (handleFormulaChange) {
                    if (typeof value === 'string' && value.startsWith('=')) {
                      handleFormulaChange(value)
                    } else {
                      handleFormulaChange(value || '')
                    }
                  }
                } catch (error) {
                  console.warn('Error in cellEditEnd:', error, {
                    range,
                    value,
                    stack: error.stack
                  })
                }
              },
              cellMousedown: function(cell, postion, sheetFile, ctx) {
                try {
                  // Guard: Don't process clicks until Luckysheet is fully ready
                  if (!luckysheetReadyRef.current) {
                    console.debug('cellMousedown: Luckysheet not ready yet, ignoring click', {
                      luckysheetReady: luckysheetReadyRef.current
                    })
                    return
                  }

                  if (!cell) {
                    console.debug('cellMousedown: No cell provided', { cell })
                    return
                  }

                  // Handle multiple property naming conventions from Luckysheet
                  let row, column

                  if (cell.row !== undefined && typeof cell.row === 'number') {
                    row = cell.row
                  } else if (cell.r !== undefined && typeof cell.r === 'number') {
                    row = cell.r
                  } else if (Array.isArray(cell.row) && cell.row.length > 0) {
                    row = cell.row[0]
                  } else if (Array.isArray(cell.r) && cell.r.length > 0) {
                    row = cell.r[0]
                  }

                  if (cell.column !== undefined && typeof cell.column === 'number') {
                    column = cell.column
                  } else if (cell.c !== undefined && typeof cell.c === 'number') {
                    column = cell.c
                  } else if (Array.isArray(cell.column) && cell.column.length > 0) {
                    column = cell.column[0]
                  } else if (Array.isArray(cell.c) && cell.c.length > 0) {
                    column = cell.c[0]
                  }

                  // Validate that we have valid row and column values
                  if (row == null || column == null) {
                    console.warn('cellMousedown: Invalid cell coordinates', {
                      cell,
                      row,
                      column,
                      cellStructure: JSON.stringify(cell, null, 2)
                    })
                    return
                  }

                  // Validate coordinates are numbers
                  if (typeof row !== 'number' || typeof column !== 'number' ||
                      row < 0 || column < 0 ||
                      !Number.isInteger(row) || !Number.isInteger(column)) {
                    console.warn('cellMousedown: Invalid cell coordinate values', {
                      row,
                      column,
                      rowType: typeof row,
                      columnType: typeof column
                    })
                    return
                  }

                  const cellRef = columnNumberToLetters(column) + (row + 1)
                  setCurrentCell(cellRef)
                  
                  if (handleFormulaChange) {
                    const cellValue = window.luckysheet.getCellValue(row, column)
                    if (cellValue && typeof cellValue === 'object' && cellValue.f) {
                      handleFormulaChange('=' + cellValue.f)
                    } else {
                      handleFormulaChange(cellValue || '')
                    }
                  }

                  console.debug('cellMousedown: Selected cell', { cellRef, row, column })
                } catch (error) {
                  console.warn('Error in cellMousedown:', error)
                }
              }
            },
            onReady: () => {
              console.log('luckysheetApi marked as ready');
            }
          });
        return true;
      } catch (error) {
        console.error('Failed to initialize WalSheetz spreadsheet:', error);
        return false;
      }
    }

    let initializeRetryInterval = null
    let initializeTimeout = null

    const scheduleRetry = () => {
      initializeRetryInterval = setInterval(async () => {
        try {
          if (await initLuckysheet()) {
            clearInterval(initializeRetryInterval)
            initializeRetryInterval = null
            if (initializeTimeout) {
              clearTimeout(initializeTimeout)
              initializeTimeout = null
            }
          }
        } catch (error) {
          console.warn('Error in retry initialization:', error)
        }
      }, 100)

      initializeTimeout = setTimeout(() => {
        if (initializeRetryInterval) {
          clearInterval(initializeRetryInterval)
          initializeRetryInterval = null
        }
        console.warn('WalSheetz spreadsheet initialization timeout')
      }, 10000)
    }

    const initializeAsync = async () => {
      try {
        const initResult = await initLuckysheet();
        if (!initResult) {
          scheduleRetry();
        }
      } catch (error) {
        console.error('Error initializing spreadsheet:', error);
        scheduleRetry();
      }
    }

    initializeAsync();

    return () => {
      if (initializeRetryInterval) {
        clearInterval(initializeRetryInterval);
        initializeRetryInterval = null;
      }
      if (initializeTimeout) {
        clearTimeout(initializeTimeout);
        initializeTimeout = null;
      }
      document.removeEventListener('keydown', handleKeyDown);

      // Clean up DOM event listeners
      domEventListenersRef.current.forEach(({ element, event, handler }) => {
        try {
          element.removeEventListener(event, handler);
          console.debug('🔧 Removed DOM event listener', { event });
        } catch (error) {
          console.warn('🔧 Error removing DOM event listener', { event, error });
        }
      })
      domEventListenersRef.current = [];

      if (luckysheetRef.current && window.luckysheet) {
        const destroyLuckysheet = () => {
          return Promise.resolve()
            .then(() => luckysheetApi.destroy?.())
            .catch((error) => {
              console.error('Error destroying WalSheetz spreadsheet via API wrapper:', error)
            })
            .then(() => {
              const destroyFn = window.luckysheet && window.luckysheet.destroy
              if (typeof destroyFn === 'function') destroyFn()
            })
            .catch((error) => {
              console.error('Error destroying WalSheetz spreadsheet via global instance:', error)
            })
            .finally(() => {
              luckysheetRef.current = false
              luckysheetReadyRef.current = false
            })
        }

        destroyLuckysheet()
      }
    }
  }, [handleCellEdit, setCurrentCell, handleFormulaChange, saveToBlockchain, spreadsheetData])

  return (
    <div className="spreadsheet-wrapper" ref={containerRef}>
      <div 
        id="luckysheet-container"
        className="luckysheet-container"
        tabIndex={0}
      ></div>
    </div>
  )
}
