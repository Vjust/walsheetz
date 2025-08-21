import React, { useEffect, useRef } from 'react'
import { useSpreadsheetContext } from './SpreadsheetProvider.jsx'

export function Spreadsheet() {
  const luckysheetRef = useRef(null)
  const containerRef = useRef(null)
  
  const { 
    handleCellEdit, 
    setCurrentCell, 
    handleFormulaChange 
  } = useSpreadsheetContext()

  useEffect(() => {
    // Handle keyboard events for entering edit mode
    const handleKeyDown = (event) => {
      if (window.luckysheet && luckysheetRef.current) {
        try {
          const selection = window.luckysheet_select_save
          if (selection && selection.length > 0) {
            const range = selection[0]
            const row = range.row[0]
            const col = range.column[0]
            
            const isInEditMode = window.luckysheetConfigsetting && 
                               window.luckysheetConfigsetting.editmode === true
            
            if (!isInEditMode) {
              if (event.key === 'Enter') {
                event.preventDefault()
                if (window.luckysheet.enterEditMode) {
                  window.luckysheet.enterEditMode(row, col)
                } else {
                  const cellElement = document.querySelector(`[data-r="${row}"][data-c="${col}"]`)
                  if (cellElement) {
                    const dblClickEvent = new MouseEvent('dblclick', { bubbles: true })
                    cellElement.dispatchEvent(dblClickEvent)
                  }
                }
              }
              else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                if (/^[a-zA-Z0-9\s=+\-*/().,!@#$%^&*;:'"<>?{}[\]|\\~`]$/.test(event.key)) {
                  event.preventDefault()
                  if (window.luckysheet.enterEditMode) {
                    window.luckysheet.enterEditMode(row, col)
                  } else {
                    const cellElement = document.querySelector(`[data-r="${row}"][data-c="${col}"]`)
                    if (cellElement) {
                      const dblClickEvent = new MouseEvent('dblclick', { bubbles: true })
                      cellElement.dispatchEvent(dblClickEvent)
                    }
                  }
                  
                  setTimeout(() => {
                    const editArea = document.querySelector('#luckysheet-rich-text-editor') || 
                                   document.querySelector('.luckysheet-formula-text-input') ||
                                   document.querySelector('input[type="text"]:focus') ||
                                   document.querySelector('[contenteditable="true"]')
                    if (editArea) {
                      if (editArea.tagName === 'INPUT' || editArea.tagName === 'TEXTAREA') {
                        editArea.value = event.key
                      } else {
                        editArea.textContent = event.key
                      }
                      editArea.focus()
                      if (window.getSelection) {
                        const range = document.createRange()
                        range.selectNodeContents(editArea)
                        range.collapse(false)
                        const selection = window.getSelection()
                        selection.removeAllRanges()
                        selection.addRange(range)
                      }
                      const inputEvent = new Event('input', { bubbles: true })
                      editArea.dispatchEvent(inputEvent)
                    }
                  }, 50)
                }
              }
            }
          }
        } catch (error) {
          console.warn('Error entering edit mode:', error)
        }
      }
    }

    const initLuckysheet = () => {
      const container = document.getElementById('luckysheet-container');
      
      if (typeof window.luckysheet === 'undefined') {
        console.log('WalSheetz spreadsheet engine not loaded yet, retrying...')
        return false
      }

      if (container && !luckysheetRef.current) {
        try {
          if (window.luckysheet.destroy) {
            window.luckysheet.destroy();
          }
        } catch (e) {
          // Ignore destroy errors
        }

        container.innerHTML = '';

        try {
          console.log('Initializing WalSheetz spreadsheet...');
          window.luckysheet.create({
            container: 'luckysheet-container',
            title: 'WalSheetz',
            lang: 'en',
            data: [{
              name: "Sheet1",
              color: "",
              index: 0,
              status: 1,
              order: 0,
              hide: 0,
              row: 100,
              column: 26,
              defaultRowHeight: 25,
              defaultColWidth: 80,
              celldata: [],
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
            }],
            hook: {
              workbookCreateAfter: function() {
                console.log('WalSheetz spreadsheet initialized successfully')
                luckysheetRef.current = true
                document.addEventListener('keydown', handleKeyDown)
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
                try {
                  if (range && range.length > 0) {
                    const cell = range[0]
                    const cellRef = String.fromCharCode(65 + cell.column) + (cell.row + 1)
                    setCurrentCell(cellRef)
                  }
                } catch (error) {
                  console.warn('Error in cellEditBefore:', error)
                }
              },
              cellEditEnd: function(range, value) {
                try {
                  if (range && range.length > 0) {
                    const cell = range[0]
                    const oldValue = window.luckysheet.getCellValue(cell.row, cell.column)
                    
                    handleCellEdit(cell.row, cell.column, oldValue, value)
                    
                    if (handleFormulaChange) {
                      if (typeof value === 'string' && value.startsWith('=')) {
                        handleFormulaChange(value)
                      } else {
                        handleFormulaChange(value || '')
                      }
                    }
                  }
                } catch (error) {
                  console.warn('Error in cellEditEnd:', error)
                }
              },
              cellMousedown: function(cell, postion, sheetFile, ctx) {
                try {
                  if (cell) {
                    const cellRef = String.fromCharCode(65 + cell.c) + (cell.r + 1)
                    setCurrentCell(cellRef)
                    
                    if (handleFormulaChange) {
                      const cellValue = window.luckysheet.getCellValue(cell.r, cell.c)
                      if (cellValue && typeof cellValue === 'object' && cellValue.f) {
                        handleFormulaChange('=' + cellValue.f)
                      } else {
                        handleFormulaChange(cellValue || '')
                      }
                    }
                  }
                } catch (error) {
                  console.warn('Error in cellMousedown:', error)
                }
              }
            }
          })
          return true
        } catch (error) {
          console.error('Failed to initialize WalSheetz spreadsheet:', error)
          return false
        }
      }
      return false
    }

    if (initLuckysheet()) {
      return
    }

    const checkLuckysheet = setInterval(() => {
      if (initLuckysheet()) {
        clearInterval(checkLuckysheet)
      }
    }, 100)

    const timeout = setTimeout(() => {
      clearInterval(checkLuckysheet)
      console.warn('WalSheetz spreadsheet initialization timeout')
    }, 10000)

    return () => {
      clearInterval(checkLuckysheet)
      clearTimeout(timeout)
      document.removeEventListener('keydown', handleKeyDown)
      
      if (luckysheetRef.current && window.luckysheet) {
        try {
          window.luckysheet.destroy()
        } catch (error) {
          console.error('Error destroying WalSheetz spreadsheet:', error)
        }
      }
    }
  }, [handleCellEdit, setCurrentCell, handleFormulaChange])

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