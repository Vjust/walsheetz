import React, { useState, useEffect } from 'react'
import { useSpreadsheetContext } from './SpreadsheetProvider.jsx'
import { WalletModal } from './WalletModal.jsx'
import { SpreadsheetSelector } from './SpreadsheetSelector.jsx'
import { logger, LogComponent } from '../../utils/Logger.js'
import '../styles/wallet-modal.css'
import '../styles/spreadsheet-selector.css'

export function Header() {
  const [documentName, setDocumentName] = useState('Untitled Spreadsheet')
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [activeMenu, setActiveMenu] = useState(null)
  const [formatting, setFormatting] = useState({
    bold: false,
    italic: false,
    underline: false,
    fontFamily: 'Arial',
    fontSize: '12'
  })

  const { spreadsheetData } = useSpreadsheetContext()

  // Keep the header's document name in sync with the current dataset
  useEffect(() => {
    const t = spreadsheetData?.data?.metadata?.title || spreadsheetData?.title
    if (t) setDocumentName(t)
  }, [spreadsheetData])

  // Get context values first before using them in useEffect
  const {
    walletConnected,
    walletAddress,
    connectWallet,
    disconnectWallet,
    saveToBlockchain,
    getCurrentSpreadsheetId,
    getUserSpreadsheets,
    loadSpreadsheet,
    createNewSpreadsheet,
    renameSpreadsheet,
    makeSpreadsheetPublic,
    makeSpreadsheetPrivate,
    transferOwnership,
    pruneOldVersions,
    deleteSpreadsheet
  } = useSpreadsheetContext()

  // Debug helper to check available Luckysheet methods
  const checkLuckysheetMethods = () => {
    if (!window.luckysheet) {
      logger.warn(LogComponent.UI_COMPONENT, 'luckysheet_debug', 'window.luckysheet is not available');
      return
    }
    
    const methodsToCheck = [
      'getRange', 'setCellFormat', 'getCellValue', 'refresh', 'refreshCanvas',
      'undo', 'redo', 'cut', 'copy', 'paste',
      'insertRow', 'insertColumn', 'deleteRow', 'deleteColumn',
      'exportLuckyToExcel', 'export', 'zoom', 'sortSelection',
      'create', 'destroy', 'getActiveRange'
    ]
    
    const availableMethods = []
    const unavailableMethods = []
    
    methodsToCheck.forEach(method => {
      if (typeof window.luckysheet[method] === 'function') {
        availableMethods.push(method)
      } else {
        unavailableMethods.push(method)
      }
    })
    
    logger.info(LogComponent.UI_COMPONENT, 'luckysheet_methods_available', 'Available Luckysheet methods', {
      availableMethods,
      availableCount: availableMethods.length
    });
    
    if (unavailableMethods.length > 0) {
      logger.warn(LogComponent.UI_COMPONENT, 'luckysheet_methods_unavailable', 'Unavailable Luckysheet methods', {
        unavailableMethods,
        unavailableCount: unavailableMethods.length
      });
    }
    
    // Also check global variables
    const globalVarsToCheck = [
      'luckysheet_select_save', 'luckysheetCurrentRow', 'luckysheetCurrentCol', 
      'luckysheetCurrentCell', 'luckysheetConfigsetting'
    ]
    
    const availableVars = []
    const unavailableVars = []
    
    globalVarsToCheck.forEach(variable => {
      if (window[variable] !== undefined) {
        availableVars.push(variable)
      } else {
        unavailableVars.push(variable)
      }
    })
    
    logger.info(LogComponent.UI_COMPONENT, 'luckysheet_vars_available', 'Available Luckysheet global variables', {
      availableVars
    });
    
    if (unavailableVars.length > 0) {
      logger.debug(LogComponent.UI_COMPONENT, 'luckysheet_vars_unavailable', 'Unavailable Luckysheet global variables', {
        unavailableVars
      });
    }
  }

  // Log component mount and check Luckysheet methods
  useEffect(() => {
    logger.info(LogComponent.UI_COMPONENT, 'header_mount', 'Header component mounted');
    
    // Check Luckysheet methods after a short delay to ensure it's loaded
    const checkTimer = setTimeout(() => {
      checkLuckysheetMethods()
    }, 1000)
    
    return () => {
      clearTimeout(checkTimer)
      logger.info(LogComponent.UI_COMPONENT, 'header_unmount', 'Header component unmounted');
    };
  }, []);

  // Handle click outside to close dropdown menus
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (activeMenu && !event.target.closest('.menu-dropdown')) {
        setActiveMenu(null)
      }
    }
    
    if (activeMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [activeMenu])

  // Sync document name from Luckysheet data when loaded
  useEffect(() => {
    const syncDocumentName = () => {
      try {
        if (window.luckysheetfile && window.luckysheetfile[0] && window.luckysheetfile[0].name) {
          const currentLuckysheetTitle = window.luckysheetfile[0].name
          if (currentLuckysheetTitle !== documentName && currentLuckysheetTitle !== 'Sheet1') {
            logger.info(LogComponent.UI_COMPONENT, 'title_sync', 'Syncing document name from Luckysheet data', {
              previousName: documentName,
              newName: currentLuckysheetTitle
            })
            setDocumentName(currentLuckysheetTitle)
          }
        }
      } catch (error) {
        logger.warn(LogComponent.UI_COMPONENT, 'title_sync_error', 'Error syncing document name', {
          error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
        })
      }
    }

    // Check immediately
    syncDocumentName()

    // Set up a periodic check to catch title updates
    const syncInterval = setInterval(syncDocumentName, 2000)

    return () => {
      clearInterval(syncInterval)
    }
  }, [documentName])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Ctrl+S or Cmd+S to save
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        console.error('🚀 DEBUG: Manual save triggered via keyboard shortcut (Ctrl+S)');
        
        if (!walletConnected) {
          alert('Please connect your wallet first to save');
          return;
        }
        
        // Trigger manual save
        const currentTitle = documentName || 'Untitled Spreadsheet';
        console.error('🚀 DEBUG: Calling saveToBlockchain with title:', currentTitle);
        saveToBlockchain(currentTitle).then(result => {
          console.error('🚀 DEBUG: Manual save result:', result);
          if (result.success) {
            // Show brief success message
            console.log('✅ Spreadsheet saved successfully!');
          } else {
            console.error('❌ Save failed:', result.error);
            alert('Save failed: ' + result.error);
          }
        }).catch(error => {
          console.error('❌ Save error:', error);
          alert('Save error: ' + error.message);
        });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [walletConnected, documentName, saveToBlockchain]);

  // Update formatting state based on current cell
  useEffect(() => {
    const updateFormattingState = () => {
      if (!window.luckysheet || typeof window.luckysheet.getCellValue !== 'function') return
      try {
        const sel = getSelectedCells()
        if (!sel) return

        const idx = (arrOrNumA, arrOrNumB) => {
          if (Array.isArray(arrOrNumA)) return arrOrNumA.length ? arrOrNumA[0] : 0
          if (typeof arrOrNumA === 'number') return arrOrNumA
          if (Array.isArray(arrOrNumB)) return arrOrNumB.length ? arrOrNumB[0] : 0
          if (typeof arrOrNumB === 'number') return arrOrNumB
          return 0
        }

        const row = idx(sel.row, sel.r)
        const col = idx(sel.column, sel.c)

        const cellInfo = window.luckysheet.getCellValue(row, col, { type: 'object' })
        if (cellInfo && cellInfo.s) {
          const s = cellInfo.s
          setFormatting({
            bold: s.bl === 1, italic: s.it === 1, underline: s.un === 1,
            fontFamily: s.ff || 'Arial', fontSize: String(s.fs || 12)
          })
        } else {
          setFormatting({ bold: false, italic: false, underline: false, fontFamily: 'Arial', fontSize: '12' })
        }
      } catch {}
    }
    const interval = setInterval(updateFormattingState, 250)
    return () => clearInterval(interval)
  }, [])

  const formatAddress = (address) => {
    if (!address) return ''
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const handleWalletConnect = () => {
    logger.logUserAction('wallet_connect_modal_open', {
      walletConnected,
      currentAddress: walletAddress
    });
    setShowWalletModal(true)
  }

  const handleSave = async () => {
    logger.startTimer('ui_save_action');
    logger.logUserAction('save_button_click', {
      walletConnected,
      documentName
    });
    
    try {
      const result = await saveToBlockchain(documentName)
      const saveDuration = logger.endTimer('ui_save_action');
      
      if (!result.success) {
        logger.error(LogComponent.UI_COMPONENT, 'save_failed', 'Save operation failed', {
          error: result.error,
          duration: saveDuration
        });
      } else {
        logger.info(LogComponent.UI_COMPONENT, 'save_success', 'Save operation completed', {
          duration: saveDuration,
          method: result.method
        });
      }
    } catch (error) {
      logger.endTimer('ui_save_action');
      logger.error(LogComponent.UI_COMPONENT, 'save_error', 'Save operation threw exception', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  const handleUndo = () => {
    logger.logUserAction('undo_button_click');
    
    if (window.luckysheet && window.luckysheet.undo) {
      window.luckysheet.undo()
      logger.info(LogComponent.UI_COMPONENT, 'undo_executed', 'Undo operation executed');
    } else {
      logger.warn(LogComponent.UI_COMPONENT, 'undo_unavailable', 'Undo function not available');
    }
  }

  const handleRedo = () => {
    logger.logUserAction('redo_button_click');
    
    if (window.luckysheet && window.luckysheet.redo) {
      window.luckysheet.redo()
      logger.info(LogComponent.UI_COMPONENT, 'redo_executed', 'Redo operation executed');
    } else {
      logger.warn(LogComponent.UI_COMPONENT, 'redo_unavailable', 'Redo function not available');
    }
  }

  // Helper function to get selected cells
  const getSelectedCells = () => {
    if (window.luckysheet && window.luckysheet.getRange) {
      try {
        const ranges = window.luckysheet.getRange()
        if (ranges && Array.isArray(ranges) && ranges.length > 0) {
          return ranges[0]
        }
      } catch (error) {
        logger.warn(LogComponent.UI_COMPONENT, 'get_selection_error', 'Error getting selection range', {
          error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
        });
      }
    }
    
    // Fallback: try using luckysheet_select_save as backup
    if (window.luckysheet_select_save && Array.isArray(window.luckysheet_select_save) && window.luckysheet_select_save[0]) {
      return window.luckysheet_select_save[0]
    }
    
    // Last resort: use current active cell if available
    if (window.luckysheet && window.luckysheet.getActiveRange) {
      try {
        return window.luckysheet.getActiveRange()
      } catch (error) {
        logger.debug(LogComponent.UI_COMPONENT, 'fallback_selection', 'Active range not available');
      }
    }
    
    return null
  }

  // Helper function to get current cell formatting
  const getCurrentCellFormat = (row, col) => {
    try {
      if (window.luckysheet && window.luckysheet.getCellValue) {
        const cellInfo = window.luckysheet.getCellValue(row, col, { type: 'object' })
        return cellInfo && cellInfo.s ? cellInfo.s : {}
      }
    } catch (error) {
      logger.debug(LogComponent.UI_COMPONENT, 'get_format_error', 'Error getting cell format', { error: error.message })
    }
    return {}
  }

  // Helper function to apply format to a single cell while preserving existing formatting
  const applyCellFormat = (row, col, attr, value) => {
    try {
      // Get existing format
      const existingFormat = getCurrentCellFormat(row, col)
      
      // Create new format with the updated attribute
      const newFormat = { ...existingFormat, [attr]: value }
      
      // Apply all format attributes at once to avoid conflicts
      if (newFormat.bl !== undefined) window.luckysheet.setCellFormat(row, col, 'bl', newFormat.bl)
      if (newFormat.it !== undefined) window.luckysheet.setCellFormat(row, col, 'it', newFormat.it)
      if (newFormat.un !== undefined) window.luckysheet.setCellFormat(row, col, 'un', newFormat.un)
      if (newFormat.ff !== undefined) window.luckysheet.setCellFormat(row, col, 'ff', newFormat.ff)
      if (newFormat.fs !== undefined) window.luckysheet.setCellFormat(row, col, 'fs', newFormat.fs)
      if (newFormat.fc !== undefined) window.luckysheet.setCellFormat(row, col, 'fc', newFormat.fc)
      if (newFormat.bg !== undefined) window.luckysheet.setCellFormat(row, col, 'bg', newFormat.bg)
      
      return true
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'apply_cell_format_error', 'Error applying cell format', {
        error: error.message,
        row, col, attr, value
      });
      return false
    }
  }

  // Helper function to apply format to all selected cells while preserving existing formatting
  const applyFormatToSelection = (attr, value) => {
    if (!window.luckysheet) {
      logger.warn(LogComponent.UI_COMPONENT, 'format_no_luckysheet', 'Luckysheet not available');
      return false
    }
    
    if (!window.luckysheet.setCellFormat) {
      logger.warn(LogComponent.UI_COMPONENT, 'format_no_method', 'setCellFormat method not available');
      return false
    }
    
    const selection = getSelectedCells()
    
    if (selection) {
      // Format selected range
      try {
        const startRow = selection.row ? selection.row[0] : selection.r || 0
        const endRow = selection.row ? selection.row[1] : selection.r || 0
        const startCol = selection.column ? selection.column[0] : selection.c || 0
        const endCol = selection.column ? selection.column[1] : selection.c || 0
        
        for (let r = startRow; r <= endRow; r++) {
          for (let c = startCol; c <= endCol; c++) {
            applyCellFormat(r, c, attr, value)
          }
        }
        
        logger.debug(LogComponent.UI_COMPONENT, 'format_applied_range', `Applied ${attr}=${value} to range`, {
          startRow, endRow, startCol, endCol
        });
      } catch (error) {
        logger.error(LogComponent.UI_COMPONENT, 'format_error', 'Error applying format', {
          error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
          attr, value
        });
        return false
      }
    } else {
      // No selection - try to format current active cell
      try {
        // Try different methods to get current cell
        let row = 0, col = 0
        
        if (window.luckysheetCurrentRow !== undefined && window.luckysheetCurrentCol !== undefined) {
          row = window.luckysheetCurrentRow
          col = window.luckysheetCurrentCol
        } else if (window.luckysheetCurrentCell) {
          // Parse cell reference like "A1" to row/col
          const match = window.luckysheetCurrentCell.match(/([A-Z]+)(\d+)/)
          if (match) {
            col = match[1].charCodeAt(0) - 65
            row = parseInt(match[2]) - 1
          }
        }
        
        applyCellFormat(row, col, attr, value)
        
        logger.debug(LogComponent.UI_COMPONENT, 'format_applied_current', `Applied ${attr}=${value} to current cell`, {
          row, col
        });
      } catch (error) {
        logger.error(LogComponent.UI_COMPONENT, 'format_current_error', 'Error applying format to current cell', {
          error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
          attr, value
        });
        return false
      }
    }
    
    // Refresh the display
    try {
      if (window.luckysheet.refresh) {
        window.luckysheet.refresh()
      } else if (window.luckysheet.refreshCanvas) {
        window.luckysheet.refreshCanvas()
      }
    } catch (error) {
      logger.debug(LogComponent.UI_COMPONENT, 'refresh_error', 'Could not refresh display');
    }
    
    return true
  }

  const toggleBold = () => {
    logger.logUserAction('format_bold_toggle', {
      currentBold: formatting.bold,
      newBold: !formatting.bold
    });
    
    if (window.luckysheet) {
      const newBold = !formatting.bold
      const success = applyFormatToSelection('bl', newBold ? 1 : 0)
      
      if (success) {
        setFormatting(prev => ({ ...prev, bold: newBold }))
        
        logger.info(LogComponent.UI_COMPONENT, 'format_applied', 'Bold formatting applied', {
          formatType: 'bold',
          value: newBold
        });
      } else {
        logger.warn(LogComponent.UI_COMPONENT, 'format_failed', 'Failed to apply bold formatting - no cells selected');
      }
    } else {
      logger.warn(LogComponent.UI_COMPONENT, 'format_unavailable', 'Format function not available', {
        formatType: 'bold'
      });
    }
  }

  const toggleItalic = () => {
    logger.logUserAction('format_italic_toggle', {
      currentItalic: formatting.italic,
      newItalic: !formatting.italic
    });
    
    if (window.luckysheet) {
      const newItalic = !formatting.italic
      const success = applyFormatToSelection('it', newItalic ? 1 : 0)
      
      if (success) {
        setFormatting(prev => ({ ...prev, italic: newItalic }))
        
        logger.info(LogComponent.UI_COMPONENT, 'format_applied', 'Italic formatting applied', {
          formatType: 'italic',
          value: newItalic
        });
      } else {
        logger.warn(LogComponent.UI_COMPONENT, 'format_failed', 'Failed to apply italic formatting - no cells selected');
      }
    } else {
      logger.warn(LogComponent.UI_COMPONENT, 'format_unavailable', 'Format function not available', {
        formatType: 'italic'
      });
    }
  }

  const toggleUnderline = () => {
    logger.logUserAction('format_underline_toggle', {
      currentUnderline: formatting.underline,
      newUnderline: !formatting.underline
    });
    
    if (window.luckysheet) {
      const newUnderline = !formatting.underline
      const success = applyFormatToSelection('un', newUnderline ? 1 : 0)
      
      if (success) {
        setFormatting(prev => ({ ...prev, underline: newUnderline }))
        
        logger.info(LogComponent.UI_COMPONENT, 'format_applied', 'Underline formatting applied', {
          formatType: 'underline',
          value: newUnderline
        });
      } else {
        logger.warn(LogComponent.UI_COMPONENT, 'format_failed', 'Failed to apply underline formatting - no cells selected');
      }
    } else {
      logger.warn(LogComponent.UI_COMPONENT, 'format_unavailable', 'Format function not available', {
        formatType: 'underline'
      });
    }
  }

  const changeFontFamily = (event) => {
    const fontFamily = event.target.value
    logger.logUserAction('format_font_family_change', {
      previousFont: formatting.fontFamily,
      newFont: fontFamily
    });
    
    if (window.luckysheet) {
      const success = applyFormatToSelection('ff', fontFamily)
      
      if (success) {
        setFormatting(prev => ({ ...prev, fontFamily }))
        
        logger.info(LogComponent.UI_COMPONENT, 'format_applied', 'Font family changed', {
          formatType: 'fontFamily',
          value: fontFamily
        });
      } else {
        logger.warn(LogComponent.UI_COMPONENT, 'format_failed', 'Failed to change font family - no cells selected');
      }
    } else {
      logger.warn(LogComponent.UI_COMPONENT, 'format_unavailable', 'Format function not available', {
        formatType: 'fontFamily'
      });
    }
  }

  const changeFontSize = (event) => {
    const fontSize = parseInt(event.target.value)
    logger.logUserAction('format_font_size_change', {
      previousSize: formatting.fontSize,
      newSize: fontSize
    });
    
    if (window.luckysheet) {
      const success = applyFormatToSelection('fs', fontSize)
      
      if (success) {
        setFormatting(prev => ({ ...prev, fontSize: fontSize.toString() }))
        
        logger.info(LogComponent.UI_COMPONENT, 'format_applied', 'Font size changed', {
          formatType: 'fontSize',
          value: fontSize
        });
      } else {
        logger.warn(LogComponent.UI_COMPONENT, 'format_failed', 'Failed to change font size - no cells selected');
      }
    } else {
      logger.warn(LogComponent.UI_COMPONENT, 'format_unavailable', 'Format function not available', {
        formatType: 'fontSize'
      });
    }
  }

  // Menu action handlers
  const handleMenuClick = (menuType) => {
    logger.logUserAction('menu_click', {
      menuItem: menuType
    });
    setActiveMenu(activeMenu === menuType ? null : menuType)
  }

  const handleMenuAction = async (action, menuType) => {
    logger.logUserAction('menu_action', {
      action,
      menuType
    });
    setActiveMenu(null) // Close menu after action
    
    if (!window.luckysheet) {
      logger.warn(LogComponent.UI_COMPONENT, 'menu_action_failed', 'Luckysheet not available');
      return
    }

    const selection = getSelectedCells()

    switch (action) {
      // File Menu Actions
      case 'new':
        logger.logUserAction('new_spreadsheet_from_menu');
        
        if (!walletConnected) {
          alert('Please connect your wallet first to create a new spreadsheet');
          return;
        }

        try {
          // Create a new spreadsheet
          const result = await createNewSpreadsheet('Untitled Spreadsheet');
          
          if (result.success) {
            setDocumentName('Untitled Spreadsheet');
            
            // Clear the current sheet data and reset to empty
            if (window.luckysheet && window.luckysheet.destroy) {
              window.luckysheet.destroy();
              setTimeout(() => {
                window.location.reload();
              }, 100);
            } else {
              window.location.reload();
            }
            
            logger.info(LogComponent.UI_COMPONENT, 'new_spreadsheet_from_menu_success', 'New spreadsheet created from File menu', {
              spreadsheetId: result.spreadsheetId,
              title: 'Untitled Spreadsheet'
            });
          } else {
            logger.error(LogComponent.UI_COMPONENT, 'new_spreadsheet_from_menu_failed', 'Failed to create new spreadsheet from File menu', {
              error: result.error
            });
            alert(`Failed to create new spreadsheet: ${result.error}`);
          }
        } catch (error) {
          logger.error(LogComponent.UI_COMPONENT, 'new_spreadsheet_from_menu_error', 'Error creating new spreadsheet from File menu', {
            error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
          });
          alert(`Error creating new spreadsheet: ${error.message}`);
        }
        break
      
      case 'download':
        if (window.luckysheet && window.luckysheet.exportLuckyToExcel) {
          window.luckysheet.exportLuckyToExcel(documentName)
        } else if (window.luckysheet && window.luckysheet.export) {
          // Try alternative export method
          window.luckysheet.export('excel', documentName)
        } else {
          logger.warn(LogComponent.UI_COMPONENT, 'download_unavailable', 'Export function not available');
          alert('Export functionality is not available in this version of Luckysheet')
        }
        break

      // Edit Menu Actions
      case 'undo':
        if (window.luckysheet.undo) {
          window.luckysheet.undo()
        }
        break
      
      case 'redo':
        if (window.luckysheet.redo) {
          window.luckysheet.redo()
        }
        break
        
      case 'cut':
        if (window.luckysheet.cut) {
          window.luckysheet.cut()
        }
        break
      
      case 'copy':
        if (window.luckysheet.copy) {
          window.luckysheet.copy()
        }
        break
      
      case 'paste':
        if (window.luckysheet.paste) {
          window.luckysheet.paste()
        }
        break

      // Insert Menu Actions
      case 'insertRow':
        if (window.luckysheet && window.luckysheet.insertRow && selection) {
          const row = selection.row ? selection.row[0] : selection.r || 0
          window.luckysheet.insertRow(row)
        } else {
          logger.warn(LogComponent.UI_COMPONENT, 'insertRow_unavailable', 'Insert row function not available or no selection');
        }
        break
      
      case 'insertColumn':
        if (window.luckysheet && window.luckysheet.insertColumn && selection) {
          const col = selection.column ? selection.column[0] : selection.c || 0
          window.luckysheet.insertColumn(col)
        } else {
          logger.warn(LogComponent.UI_COMPONENT, 'insertColumn_unavailable', 'Insert column function not available or no selection');
        }
        break
      
      case 'deleteRow':
        if (window.luckysheet && window.luckysheet.deleteRow && selection) {
          const startRow = selection.row ? selection.row[0] : selection.r || 0
          const endRow = selection.row ? selection.row[1] : selection.r || 0
          window.luckysheet.deleteRow(startRow, endRow)
        } else {
          logger.warn(LogComponent.UI_COMPONENT, 'deleteRow_unavailable', 'Delete row function not available or no selection');
        }
        break
      
      case 'deleteColumn':
        if (window.luckysheet && window.luckysheet.deleteColumn && selection) {
          const startCol = selection.column ? selection.column[0] : selection.c || 0
          const endCol = selection.column ? selection.column[1] : selection.c || 0
          window.luckysheet.deleteColumn(startCol, endCol)
        } else {
          logger.warn(LogComponent.UI_COMPONENT, 'deleteColumn_unavailable', 'Delete column function not available or no selection');
        }
        break

      // Format Menu Actions
      case 'bold':
        toggleBold()
        break
      
      case 'italic':
        toggleItalic()
        break
        
      case 'underline':
        toggleUnderline()
        break
        
      case 'clearFormat':
        if (selection) {
          for (let r = selection.row[0]; r <= selection.row[1]; r++) {
            for (let c = selection.column[0]; c <= selection.column[1]; c++) {
              // Clear common formatting
              window.luckysheet.setCellFormat(r, c, 'bl', 0) // Bold
              window.luckysheet.setCellFormat(r, c, 'it', 0) // Italic  
              window.luckysheet.setCellFormat(r, c, 'un', 0) // Underline
              window.luckysheet.setCellFormat(r, c, 'bg', null) // Background
              window.luckysheet.setCellFormat(r, c, 'fc', '#000000') // Font color
            }
          }
          // Update formatting state
          setFormatting(prev => ({
            ...prev,
            bold: false,
            italic: false,
            underline: false
          }))
        }
        break

      // Data Menu Actions
      case 'sort':
        if (window.luckysheet.sortSelection) {
          window.luckysheet.sortSelection(true) // Ascending
        } else {
          logger.warn(LogComponent.UI_COMPONENT, 'sort_unavailable', 'Sort function not available');
        }
        break

      // View Menu Actions
      case 'zoomIn':
        if (window.luckysheet.zoom) {
          window.luckysheet.zoom(1.2) // Zoom in 20%
        } else {
          logger.warn(LogComponent.UI_COMPONENT, 'zoom_unavailable', 'Zoom function not available');
        }
        break
        
      case 'zoomOut':
        if (window.luckysheet.zoom) {
          window.luckysheet.zoom(0.8) // Zoom out 20%
        } else {
          logger.warn(LogComponent.UI_COMPONENT, 'zoom_unavailable', 'Zoom function not available');
        }
        break

      // Tools Menu Actions
      case 'functions':
        // Show a simple alert with available functions (since we can't open a complex dialog)
        if (window.alert) {
          const functions = [
            'SUM(range)', 'AVERAGE(range)', 'COUNT(range)', 'MAX(range)', 'MIN(range)',
            'IF(condition, true_value, false_value)', 'VLOOKUP(lookup_value, table_array, col_index, exact)',
            'TODAY()', 'NOW()', 'CONCATENATE(text1, text2, ...)', 'LEN(text)'
          ]
          window.alert('Common Functions:\n\n' + functions.join('\n'))
        } else {
          // Fallback: log to console
          console.log('Available Functions:', [
            'SUM(range)', 'AVERAGE(range)', 'COUNT(range)', 'MAX(range)', 'MIN(range)',
            'IF(condition, true_value, false_value)', 'VLOOKUP(lookup_value, table_array, col_index, exact)',
            'TODAY()', 'NOW()', 'CONCATENATE(text1, text2, ...)', 'LEN(text)'
          ])
          logger.info(LogComponent.UI_COMPONENT, 'functions_list_console', 'Function list logged to console');
        }
        break

      default:
        logger.warn(LogComponent.UI_COMPONENT, 'menu_action_unknown', `Unknown menu action: ${action}`);
    }
  }

  // Menu configurations
  const menuItems = {
    File: [
      { label: 'New', action: 'new' },
      { label: 'Download as Excel', action: 'download' }
    ],
    Edit: [
      { label: 'Undo', action: 'undo', shortcut: 'Ctrl+Z' },
      { label: 'Redo', action: 'redo', shortcut: 'Ctrl+Y' },
      { label: 'Cut', action: 'cut', shortcut: 'Ctrl+X' },
      { label: 'Copy', action: 'copy', shortcut: 'Ctrl+C' },
      { label: 'Paste', action: 'paste', shortcut: 'Ctrl+V' }
    ],
    View: [
      { label: 'Zoom In', action: 'zoomIn' },
      { label: 'Zoom Out', action: 'zoomOut' }
    ],
    Insert: [
      { label: 'Insert Row Above', action: 'insertRow' },
      { label: 'Insert Column Left', action: 'insertColumn' },
      { label: 'Delete Row', action: 'deleteRow' },
      { label: 'Delete Column', action: 'deleteColumn' }
    ],
    Format: [
      { label: 'Bold', action: 'bold', shortcut: 'Ctrl+B' },
      { label: 'Italic', action: 'italic', shortcut: 'Ctrl+I' },
      { label: 'Underline', action: 'underline', shortcut: 'Ctrl+U' },
      { label: 'Clear Format', action: 'clearFormat' }
    ],
    Data: [
      { label: 'Sort Ascending', action: 'sort' }
    ],
    Tools: [
      { label: 'Function List', action: 'functions' }
    ]
  }

  return (
    <header className="header frost-overlay">
      {/* Main Header Row */}
      <div className="header-main">
        {/* Logo and Document Name */}
        <div className="header-left">
          <div className="logo-section">
            <div className="logo-icon ice-glow-animate">
              <span>🦭</span>
            </div>
            <span className="app-name">WalSheetz</span>
          </div>
          
          <input
            type="text"
            value={documentName}
            onChange={(e) => {
              const newName = e.target.value;
              logger.logUserAction('document_name_change', {
                previousName: documentName,
                newName
              });
              setDocumentName(newName);
            }}
            onBlur={async () => {
              // Save title when editing is finished
              try {
                const spreadsheetId = getCurrentSpreadsheetId?.();
                logger.logUserAction('document_name_save_trigger', {
                  title: documentName,
                  spreadsheetId
                });
                // If we have an on-chain spreadsheet, rename it; otherwise just persist locally
                if (spreadsheetId) {
                  const res = await renameSpreadsheet(spreadsheetId, documentName);
                  if (!res.success) {
                    logger.warn(LogComponent.UI_COMPONENT, 'title_rename_failed', 'On-chain rename failed, will persist locally', { error: res.error });
                  }
                }
                // Update Luckysheet sheet name locally for immediate UI consistency
                if (window.luckysheetfile && window.luckysheetfile[0]) {
                  window.luckysheetfile[0].name = documentName;
                }
                // Fall back to regular save to record latest metadata in storage
                await saveToBlockchain(documentName);
                logger.info(LogComponent.UI_COMPONENT, 'title_save_success', 'Title change saved');
              } catch (error) {
                logger.error(LogComponent.UI_COMPONENT, 'title_save_failed', 'Failed to save title change', {
                  error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
                });
              }
            }}
            className="document-name"
            placeholder="Untitled Spreadsheet"
          />
        </div>

        {/* Menu Bar */}
        <nav className="menu-bar">
          {Object.keys(menuItems).map((menuType) => (
            <div key={menuType} className="menu-dropdown">
              <button 
                className={`menu-item ${activeMenu === menuType ? 'active' : ''}`}
                onClick={() => handleMenuClick(menuType)}
              >
                {menuType}
              </button>
              {activeMenu === menuType && (
                <div className="dropdown-menu">
                  {menuItems[menuType].map((item) => (
                    <button
                      key={item.action}
                      className="dropdown-item"
                      onClick={() => handleMenuAction(item.action, menuType)}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && <span className="shortcut">{item.shortcut}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Wallet and Actions */}
        <div className="header-right">
          {/* Save Button */}
          <button onClick={handleSave} className="save-button">
            💾 Save
          </button>

          {/* Spreadsheet Selector */}
          <SpreadsheetSelector
            onLoadSpreadsheet={async (spreadsheetId) => {
              logger.logUserAction('spreadsheet_load_from_selector', { spreadsheetId });
              const result = await loadSpreadsheet(spreadsheetId);
              if (result.success) {
                setDocumentName(result.title);
              }
              return result;
            }}
            onCreateNew={async () => {
              logger.logUserAction('create_new_spreadsheet_from_selector');
              
              if (!walletConnected) {
                alert('Please connect your wallet first to create a new spreadsheet');
                return;
              }

              try {
                // Show loading state
                setDocumentName('Creating new spreadsheet...');
                
                const result = await createNewSpreadsheet('Untitled Spreadsheet');
                
                if (result.success) {
                  setDocumentName(result.title);
                  
                  // Refresh Luckysheet with empty data if available
                  if (window.luckysheet && window.luckysheet.refreshAll) {
                    setTimeout(() => {
                      window.luckysheet.refreshAll();
                    }, 100);
                  }
                  
                  logger.info(LogComponent.UI_COMPONENT, 'new_spreadsheet_created', 'New spreadsheet created successfully', {
                    spreadsheetId: result.spreadsheetId,
                    title: result.title
                  });
                } else {
                  setDocumentName('Untitled Spreadsheet');
                  logger.error(LogComponent.UI_COMPONENT, 'new_spreadsheet_failed', 'Failed to create new spreadsheet', {
                    error: result.error
                  });
                  alert(`Failed to create new spreadsheet: ${result.error}`);
                }
              } catch (error) {
                setDocumentName('Untitled Spreadsheet');
                logger.error(LogComponent.UI_COMPONENT, 'new_spreadsheet_error', 'Error creating new spreadsheet', {
                  error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
                });
                alert(`Error creating new spreadsheet: ${error.message}`);
              }
            }}
            getUserSpreadsheets={getUserSpreadsheets}
            walletConnected={walletConnected}
            onRenameSpreadsheet={async (spreadsheetId, newTitle) => {
              logger.logUserAction('rename_spreadsheet', { spreadsheetId, newTitle });
              const result = await renameSpreadsheet(spreadsheetId, newTitle);
              if (result.success) {
                logger.logEvent(LogComponent.UI_COMPONENT, 'spreadsheet_renamed', 'Spreadsheet renamed successfully', {
                  spreadsheetId,
                  newTitle
                });
              }
              return result;
            }}
            onMakePublic={async (spreadsheetId) => {
              logger.logUserAction('make_spreadsheet_public', { spreadsheetId });
              return await makeSpreadsheetPublic(spreadsheetId);
            }}
            onMakePrivate={async (spreadsheetId) => {
              logger.logUserAction('make_spreadsheet_private', { spreadsheetId });
              return await makeSpreadsheetPrivate(spreadsheetId);
            }}
            onTransferOwnership={async (spreadsheetId, newOwnerAddress) => {
              logger.logUserAction('transfer_spreadsheet_ownership', { spreadsheetId, newOwnerAddress });
              return await transferOwnership(spreadsheetId, newOwnerAddress);
            }}
            onPruneVersions={async (spreadsheetId) => {
              logger.logUserAction('prune_spreadsheet_versions', { spreadsheetId });
              return await pruneOldVersions(spreadsheetId);
            }}
            onDeleteSpreadsheet={async (spreadsheetId, title) => {
              logger.logUserAction('delete_spreadsheet', { spreadsheetId, title });
              const result = await deleteSpreadsheet(spreadsheetId, title);
              if (result.success) {
                // Reset document name if the deleted spreadsheet was currently loaded
                setDocumentName('Untitled Spreadsheet');
                logger.logEvent(LogComponent.UI_COMPONENT, 'spreadsheet_deleted', 'Spreadsheet deleted successfully', {
                  spreadsheetId,
                  title,
                  versionsDeleted: result.deletedVersionCount
                });
              }
              return result;
            }}
          />

          {/* Wallet Connection */}
          {walletConnected ? (
            <div className="wallet-connected">
              <div className="wallet-info">
                <div className="status-indicator"></div>
                <span className="wallet-address">
                  {formatAddress(walletAddress)}
                </span>
              </div>
              <button onClick={() => {
                logger.logUserAction('wallet_disconnect_click', {
                  walletAddress
                });
                disconnectWallet();
              }} className="disconnect-button">
                Disconnect
              </button>
            </div>
          ) : (
            <button onClick={handleWalletConnect} className="connect-button">
              🦭 Connect Slush
            </button>
          )}

          {/* Deposit Button */}
          {walletConnected && (
            <button 
              className="deposit-button"
              onClick={() => {
                logger.logUserAction('deposit_button_click', {
                  walletAddress
                });
              }}
            >
              💰 Deposit
            </button>
          )}
        </div>
      </div>

      {/* Toolbar Row */}
      <div className="header-toolbar">
        <div className="toolbar-section">
          <button className="toolbar-button" onClick={handleUndo} title="Undo (Ctrl+Z)">
            ↶
          </button>
          <button className="toolbar-button" onClick={handleRedo} title="Redo (Ctrl+Y)">
            ↷
          </button>
        </div>
        
        <div className="toolbar-section">
          <button 
            className={`toolbar-button ${formatting.bold ? 'active' : ''}`}
            onClick={toggleBold}
            title="Bold (Ctrl+B)"
          >
            <strong>B</strong>
          </button>
          <button 
            className={`toolbar-button ${formatting.italic ? 'active' : ''}`}
            onClick={toggleItalic}
            title="Italic (Ctrl+I)"
          >
            <em>I</em>
          </button>
          <button 
            className={`toolbar-button ${formatting.underline ? 'active' : ''}`}
            onClick={toggleUnderline}
            title="Underline (Ctrl+U)"
          >
            <u>U</u>
          </button>
        </div>
        
        <div className="toolbar-section">
          <select 
            className="toolbar-select" 
            value={formatting.fontFamily} 
            onChange={changeFontFamily}
            title="Font Family"
          >
            <option value="Arial">Arial</option>
            <option value="Helvetica">Helvetica</option>
            <option value="Times New Roman">Times</option>
            <option value="Courier New">Courier</option>
            <option value="Verdana">Verdana</option>
          </select>
          <select 
            className="toolbar-select" 
            value={formatting.fontSize} 
            onChange={changeFontSize}
            title="Font Size"
          >
            <option value="8">8</option>
            <option value="10">10</option>
            <option value="12">12</option>
            <option value="14">14</option>
            <option value="16">16</option>
            <option value="18">18</option>
            <option value="24">24</option>
            <option value="32">32</option>
          </select>
        </div>
      </div>
      
      {/* Wallet Modal */}
      <WalletModal 
        isOpen={showWalletModal} 
        onClose={() => setShowWalletModal(false)} 
      />
    </header>
  )
}
