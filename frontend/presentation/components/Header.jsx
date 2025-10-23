import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSpreadsheetContext } from './SpreadsheetProvider.jsx'
import { WalletModal } from './WalletModal.jsx'
import { SaveStatusIndicator } from './SaveStatusIndicator.jsx'
import { SaveDetailsModal } from './SaveDetailsModal.jsx'
import { ImportButton } from './ImportButton.jsx'
import { ExportButton } from './ExportButton.jsx'
import { ImportPreviewModal } from './ImportPreviewModal.jsx'
import { NetworkSelector } from './NetworkSelector.jsx'
import { logger, LogComponent } from '../../utils/Logger.js'
import luckysheetApi from '../../services/luckysheetApi.js'
import SpreadsheetImportExportService from '../../services/SpreadsheetImportExportService.js'
import { gridSizeManager } from '../../services/GridSizeManager.js'
import { configLoader } from '../../utils/ConfigLoader.js'
import '../styles/wallet-modal.css'

export function Header() {
  const navigate = useNavigate()
  const [documentName, setDocumentName] = useState('Untitled Spreadsheet')
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [showSaveDetails, setShowSaveDetails] = useState(false)
  const [activeMenu, setActiveMenu] = useState(null)
  const [formatting, setFormatting] = useState({
    bold: false,
    italic: false,
    underline: false,
    fontFamily: 'Arial',
    fontSize: '12'
  })
  const [importExportService] = useState(() => new SpreadsheetImportExportService())
  const [importError, setImportError] = useState(null)
  const [exportError, setExportError] = useState(null)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [previewFileName, setPreviewFileName] = useState('')
  const [pendingImportFile, setPendingImportFile] = useState(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ processed: 0, total: 0 })

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
    saveReminder,
    autoSaveEnabled,
    lastSaveInfo,
    dismissSaveReminder,
    toggleAutoSave,
    syncToBlockchain,
    getStatus,
    renameSpreadsheet,
    getCurrentSpreadsheetId,
    snoozeCommitPrompt,
    suppressCommitPrompts,
    smartSaveStatus,
    queryDatasets,
    storageAdapter,
    updateLastSaveInfo,
    walletSyncReady
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

  // Extract formatting state update logic into reusable function
  const updateFormattingState = () => {
    if (!luckysheetApi.isReady) return
    try {
      const activeCell = luckysheetApi.getActiveCell()
      if (!activeCell) return

      const cellInfo = luckysheetApi.getCellValue(activeCell.row, activeCell.col, { type: 'object' })
      if (cellInfo && cellInfo.s) {
        const s = cellInfo.s
        setFormatting({
          bold: Boolean(s.bl), italic: Boolean(s.it), underline: Boolean(s.un),
          fontFamily: s.ff || 'Arial', fontSize: String(s.fs || 12)
        })
      } else {
        // Reset to default formatting if no cell style exists
        setFormatting({
          bold: false, italic: false, underline: false,
          fontFamily: 'Arial', fontSize: '12'
        })
      }
    } catch (error) {
      console.warn('Error updating formatting state:', error)
    }
  }

  // Update formatting state based on current cell
  useEffect(() => {
    const interval = setInterval(updateFormattingState, 250)
    return () => clearInterval(interval)
  }, [])

  // Suppress unused warnings for queryDatasets
  useEffect(() => {
    void queryDatasets;
  }, [queryDatasets])

  // Auto-open SaveDetailsModal on first save
  useEffect(() => {
    if (lastSaveInfo && lastSaveInfo.isFirstSave) {
      const hasShownFirstSave = localStorage.getItem('walsheetz_first_save_shown');
      if (!hasShownFirstSave) {
        setShowSaveDetails(true);
        localStorage.setItem('walsheetz_first_save_shown', 'true');
      }
    }
  }, [lastSaveInfo])

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

    if (luckysheetApi.isReady) {
      luckysheetApi.undo()
      logger.info(LogComponent.UI_COMPONENT, 'undo_executed', 'Undo operation executed');
    } else {
      logger.warn(LogComponent.UI_COMPONENT, 'undo_unavailable', 'Undo function not available');
    }
  }

  const handleRedo = () => {
    logger.logUserAction('redo_button_click');

    if (luckysheetApi.isReady) {
      luckysheetApi.redo()
      logger.info(LogComponent.UI_COMPONENT, 'redo_executed', 'Redo operation executed');
    } else {
      logger.warn(LogComponent.UI_COMPONENT, 'redo_unavailable', 'Redo function not available');
    }
  }

  // Helper function to get selected cells (using wrapper)
  const getSelectedCells = () => {
    if (!luckysheetApi.isReady) return null

    try {
      return luckysheetApi.getSelection()
    } catch (error) {
      logger.warn(LogComponent.UI_COMPONENT, 'get_selection_error', 'Error getting selection range', {
        error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error'
      });
      return null
    }
  }

  // Helper function to get current cell formatting (using wrapper)
  const getCurrentCellFormat = (row, col) => {
    if (!luckysheetApi.isReady) return {}

    try {
      const cellInfo = luckysheetApi.getCellValue(row, col, { type: 'object' })
      return cellInfo && cellInfo.s ? cellInfo.s : {}
    } catch (error) {
      logger.debug(LogComponent.UI_COMPONENT, 'get_format_error', 'Error getting cell format', { error: error.message })
      return {}
    }
  }

  // Helper function to apply format to a single cell while preserving existing formatting (using wrapper)
  const applyCellFormat = (row, col, attr, value) => {
    if (!luckysheetApi.isReady) {
      logger.warn(LogComponent.UI_COMPONENT, 'format_not_ready', 'LuckysheetApi not ready');
      return false
    }

    try {
      // Apply the specific format attribute using the wrapper
      luckysheetApi.setCellFormat(row, col, attr, value)
      return true
    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'apply_cell_format_error', 'Error applying cell format', {
        error: error.message,
        row, col, attr, value
      });
      return false
    }
  }

  // Helper function to apply format to all selected cells while preserving existing formatting (using wrapper)
  const applyFormatToSelection = (attr, value) => {
    if (!luckysheetApi.isReady) {
      logger.warn(LogComponent.UI_COMPONENT, 'format_not_ready', 'LuckysheetApi not ready');
      return false
    }

    const selection = getSelectedCells()

    if (selection) {
      // Format selected range using normalized selection
      try {
        const { startRow, endRow, startCol, endCol } = selection

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
        const activeCell = luckysheetApi.getActiveCell()
        if (activeCell) {
          applyCellFormat(activeCell.row, activeCell.col, attr, value)

          logger.debug(LogComponent.UI_COMPONENT, 'format_applied_current', `Applied ${attr}=${value} to current cell`, {
            row: activeCell.row, col: activeCell.col
          });
        } else {
          logger.warn(LogComponent.UI_COMPONENT, 'no_active_cell', 'No active cell found for formatting');
          return false
        }
      } catch (error) {
        logger.error(LogComponent.UI_COMPONENT, 'format_current_error', 'Error applying format to current cell', {
          error: typeof error === 'string' ? error : (error && error.message) || 'Unknown error',
          attr, value
        });
        return false
      }
    }

    // Refresh the display using wrapper
    try {
      luckysheetApi.refresh()
    } catch (error) {
      logger.debug(LogComponent.UI_COMPONENT, 'refresh_error', 'Could not refresh display');
    }

    return true
  }

  const toggleBold = () => {
    if (!window.luckysheet) {
      logger.warn(LogComponent.UI_COMPONENT, 'format_unavailable', 'Format function not available', {
        formatType: 'bold'
      });
      return;
    }

    // Get actual cell format from active cell
    const activeCell = luckysheetApi.getActiveCell();
    let currentBold = false;

    if (activeCell) {
      const cellFormat = getCurrentCellFormat(activeCell.row, activeCell.col);
      currentBold = Boolean(cellFormat.bl);
    }

    const newBold = !currentBold;

    logger.logUserAction('format_bold_toggle', {
      currentBold,
      newBold
    });

    const success = applyFormatToSelection('bl', newBold ? 1 : 0);

    if (success) {
      // Trigger immediate formatting state update to sync UI
      setTimeout(updateFormattingState, 50);

      logger.info(LogComponent.UI_COMPONENT, 'format_applied', 'Bold formatting applied', {
        formatType: 'bold',
        value: newBold
      });
    } else {
      logger.warn(LogComponent.UI_COMPONENT, 'format_failed', 'Failed to apply bold formatting - no cells selected');
    }
  }

  const toggleItalic = () => {
    if (!window.luckysheet) {
      logger.warn(LogComponent.UI_COMPONENT, 'format_unavailable', 'Format function not available', {
        formatType: 'italic'
      });
      return;
    }

    // Get actual cell format from active cell
    const activeCell = luckysheetApi.getActiveCell();
    let currentItalic = false;

    if (activeCell) {
      const cellFormat = getCurrentCellFormat(activeCell.row, activeCell.col);
      currentItalic = Boolean(cellFormat.it);
    }

    const newItalic = !currentItalic;

    logger.logUserAction('format_italic_toggle', {
      currentItalic,
      newItalic
    });

    const success = applyFormatToSelection('it', newItalic ? 1 : 0);

    if (success) {
      // Trigger immediate formatting state update to sync UI
      setTimeout(updateFormattingState, 50);

      logger.info(LogComponent.UI_COMPONENT, 'format_applied', 'Italic formatting applied', {
        formatType: 'italic',
        value: newItalic
      });
    } else {
      logger.warn(LogComponent.UI_COMPONENT, 'format_failed', 'Failed to apply italic formatting - no cells selected');
    }
  }

  const toggleUnderline = () => {
    if (!window.luckysheet) {
      logger.warn(LogComponent.UI_COMPONENT, 'format_unavailable', 'Format function not available', {
        formatType: 'underline'
      });
      return;
    }

    // Get actual cell format from active cell
    const activeCell = luckysheetApi.getActiveCell();
    let currentUnderline = false;

    if (activeCell) {
      const cellFormat = getCurrentCellFormat(activeCell.row, activeCell.col);
      currentUnderline = Boolean(cellFormat.un);
    }

    const newUnderline = !currentUnderline;

    logger.logUserAction('format_underline_toggle', {
      currentUnderline,
      newUnderline
    });

    const success = applyFormatToSelection('un', newUnderline ? 1 : 0);

    if (success) {
      // Trigger immediate formatting state update to sync UI
      setTimeout(updateFormattingState, 50);

      logger.info(LogComponent.UI_COMPONENT, 'format_applied', 'Underline formatting applied', {
        formatType: 'underline',
        value: newUnderline
      });
    } else {
      logger.warn(LogComponent.UI_COMPONENT, 'format_failed', 'Failed to apply underline formatting - no cells selected');
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
        // Trigger immediate formatting state update to sync UI
        setTimeout(updateFormattingState, 50);

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
        // Trigger immediate formatting state update to sync UI
        setTimeout(updateFormattingState, 50);

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

        // Navigate to dashboard where user can create new spreadsheet
        navigate('/');
        break
      
      case 'download':
        if (luckysheetApi.isReady) {
          const exported = luckysheetApi.exportToExcel(documentName)
          if (!exported) {
            logger.warn(LogComponent.UI_COMPONENT, 'download_unavailable', 'Export function not available');
            alert('Export functionality is not available in this version of Luckysheet')
          }
        } else {
          logger.warn(LogComponent.UI_COMPONENT, 'download_not_ready', 'LuckysheetApi not ready for export');
          alert('Spreadsheet is not ready for export')
        }
        break

      // Edit Menu Actions
      case 'undo':
        if (luckysheetApi.isReady) {
          luckysheetApi.undo()
        } else {
          logger.warn(LogComponent.UI_COMPONENT, 'undo_not_ready', 'LuckysheetApi not ready')
        }
        break

      case 'redo':
        if (luckysheetApi.isReady) {
          luckysheetApi.redo()
        } else {
          logger.warn(LogComponent.UI_COMPONENT, 'redo_not_ready', 'LuckysheetApi not ready')
        }
        break

      case 'cut':
        if (luckysheetApi.isReady) {
          luckysheetApi.cut()
        } else {
          logger.warn(LogComponent.UI_COMPONENT, 'cut_not_ready', 'LuckysheetApi not ready')
        }
        break

      case 'copy':
        if (luckysheetApi.isReady) {
          luckysheetApi.copy()
        } else {
          logger.warn(LogComponent.UI_COMPONENT, 'copy_not_ready', 'LuckysheetApi not ready')
        }
        break
      
      case 'paste':
        if (luckysheetApi.isReady) {
          luckysheetApi.paste()
        } else {
          logger.warn(LogComponent.UI_COMPONENT, 'paste_not_ready', 'LuckysheetApi not ready')
        }
        break

      // Insert Menu Actions
      case 'insertRow':
        if (luckysheetApi.isReady && selection) {
          const row = selection.startRow || 0
          luckysheetApi.insertRow(row)
        } else {
          logger.warn(LogComponent.UI_COMPONENT, 'insertRow_unavailable', 'Insert row function not available or no selection');
        }
        break

      case 'insertColumn':
        if (luckysheetApi.isReady && selection) {
          const col = selection.startCol || 0
          luckysheetApi.insertColumn(col)
        } else {
          logger.warn(LogComponent.UI_COMPONENT, 'insertColumn_unavailable', 'Insert column function not available or no selection');
        }
        break

      case 'deleteRow':
        if (luckysheetApi.isReady && selection) {
          const row = selection.startRow || 0
          luckysheetApi.deleteRow(row)
        } else {
          logger.warn(LogComponent.UI_COMPONENT, 'deleteRow_unavailable', 'Delete row function not available or no selection');
        }
        break
      
      case 'deleteColumn':
        if (luckysheetApi.isReady && selection) {
          const col = selection.startCol || 0
          luckysheetApi.deleteColumn(col)
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
          const { startRow, endRow, startCol, endCol } = selection;
          for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
              // Clear common formatting using wrapper
              applyCellFormat(r, c, 'bl', 0); // Bold
              applyCellFormat(r, c, 'it', 0); // Italic
              applyCellFormat(r, c, 'un', 0); // Underline
              applyCellFormat(r, c, 'bg', null); // Background
              applyCellFormat(r, c, 'fc', '#000000'); // Font color
            }
          }
          // Trigger immediate formatting state update to sync UI
          setTimeout(updateFormattingState, 50);
        }
        break

      // Data Menu Actions
      case 'sort':
        if (luckysheetApi.isReady) {
          luckysheetApi.sortSelection(true) // Ascending
        } else {
          logger.warn(LogComponent.UI_COMPONENT, 'sort_unavailable', 'Sort function not available');
        }
        break

      // View Menu Actions
      case 'zoomIn':
        if (luckysheetApi.isReady) {
          luckysheetApi.zoom(1.2) // Zoom in 20%
        } else {
          logger.warn(LogComponent.UI_COMPONENT, 'zoom_unavailable', 'Zoom function not available');
        }
        break

      case 'zoomOut':
        if (luckysheetApi.isReady) {
          luckysheetApi.zoom(0.8) // Zoom out 20%
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
  } // handleMenuAction ends here

  // Handle import Excel file - show preview first
  const handleImport = async (file) => {
    try {
      setImportError(null)
      setImportProgress({ processed: 0, total: 0 })
      logger.startTimer('import_action')

      logger.logUserAction('import_file_start', {
        fileName: file.name,
        fileSize: file.size
      })

      // Read and convert file
      // For large CSV files, this will provide progress feedback
      const importedData = await importExportService.importFromExcel(file, {
        title: documentName,
        onProgress: (processed, total) => {
          // Only update state for significant progress changes to avoid excessive re-renders
          if (total > 0 && processed % Math.max(1, Math.floor(total / 100)) === 0) {
            setImportProgress({ processed, total })
          }
        }
      })

      // Store for later use and show preview
      setPendingImportFile(file)
      setPreviewData(importedData)
      setPreviewFileName(file.name)
      setPreviewModalOpen(true)
      setImportProgress({ processed: 0, total: 0 })

      logger.info(LogComponent.UI_COMPONENT, 'import_preview_shown', 'Import preview displayed', {
        fileName: file.name,
        sheetsCount: importedData.sheets?.length || 0
      })
    } catch (error) {
      const errorMsg = error?.message || 'Failed to import file'
      setImportError(errorMsg)
      setImportProgress({ processed: 0, total: 0 })

      logger.error(LogComponent.UI_COMPONENT, 'import_failed', 'File import failed', {
        error: errorMsg
      })

      alert(`❌ Import failed: ${errorMsg}`)
    }
  }

  // Handle confirmed import from preview modal
  const handleConfirmImport = async (selectedSheetIndex) => {
    if (!previewData) return

    try {
      setIsImporting(true)
      logger.startTimer('import_confirm_action')

      // Load imported data into Luckysheet
      if (window.luckysheet && previewData.sheets) {
        // Get the sheet to load
        const sheetToLoad = previewData.sheets;
        const selectedSheet = sheetToLoad[selectedSheetIndex] || sheetToLoad[0];

        // Pre-allocate grid capacity before loading data
        if (selectedSheet.row && selectedSheet.column) {
          logger.info(LogComponent.UI_COMPONENT, 'import_prealloc_start', 'Pre-allocating grid capacity for import', {
            rows: selectedSheet.row,
            cols: selectedSheet.column
          });

          const expansionResult = gridSizeManager.preallocateForImport({
            rows: selectedSheet.row,
            cols: selectedSheet.column
          });

          logger.info(LogComponent.UI_COMPONENT, 'import_prealloc_complete', 'Grid pre-allocation completed', {
            expanded: expansionResult.expanded,
            newDimensions: expansionResult.newDimensions
          });
        }

        // Destroy existing instance before loading new data
        // This ensures all DOM elements and canvas contexts are properly cleaned up
        // especially important for large datasets (>50K rows) to avoid canvas errors
        logger.debug(LogComponent.UI_COMPONENT, 'import_destroy_start', 'Starting Luckysheet destruction for reimport');
        await luckysheetApi.destroy()

        // Add extra safeguard: wait a bit for container to be fully cleared
        // This prevents "Cannot read properties of undefined (reading 'getContext')" errors
        // when Luckysheet tries to reinitialize too quickly
        await new Promise(resolve => setTimeout(resolve, 100))

        logger.debug(LogComponent.UI_COMPONENT, 'import_destroy_complete', 'Luckysheet destruction and cleanup complete');

        // Verify the container exists and is empty before creating new instance
        const container = document.getElementById('luckysheet') || document.getElementById('luckysheet-container')
        if (!container) {
          throw new Error('Luckysheet container not found in DOM');
        }

        // Load the data with pre-allocated capacity
        window.luckysheet.create({
          container: 'luckysheet-container',
          data: sheetToLoad,
          title: previewData.info?.name || documentName
        })

        // Update document name
        setDocumentName(previewData.info?.name || documentName)
      }

      const duration = logger.endTimer('import_confirm_action')

      logger.info(LogComponent.UI_COMPONENT, 'import_confirmed', 'File imported successfully', {
        fileName: previewFileName,
        sheetsCount: previewData.sheets?.length || 0,
        duration
      })

      // Close modal and show success
      setPreviewModalOpen(false)
      setPreviewData(null)
      setPendingImportFile(null)
      alert('✅ File imported successfully! Your data has been loaded into the spreadsheet.')
    } catch (error) {
      const errorMsg = error?.message || 'Failed to import file'
      setImportError(errorMsg)

      logger.error(LogComponent.UI_COMPONENT, 'import_confirm_failed', 'File import confirmation failed', {
        error: errorMsg,
        stackTrace: error?.stack
      })

      alert(`❌ Import failed: ${errorMsg}`)
    } finally {
      setIsImporting(false)
    }
  }

  // Handle export spreadsheet
  const handleExport = async (format) => {
    try {
      setExportError(null)
      logger.startTimer('export_action')

      logger.logUserAction('export_start', {
        format,
        documentName
      })

      // Get current Luckysheet data with proper fallback chain
      // Phase 2 lifecycle: window.luckysheet.getluckysheetfile() is the canonical source
      let sheets = []

      // Try primary source: Luckysheet's getter (most current in new lifecycle)
      if (window.luckysheet && typeof window.luckysheet.getluckysheetfile === 'function') {
        try {
          const luckysheetFile = window.luckysheet.getluckysheetfile()
          if (Array.isArray(luckysheetFile) && luckysheetFile.length > 0) {
            sheets = luckysheetFile
            logger.debug(LogComponent.UI_COMPONENT, 'export_data_source', 'Using luckysheet.getluckysheetfile()', {
              sheetsCount: sheets.length
            })
          }
        } catch (e) {
          logger.warn(LogComponent.UI_COMPONENT, 'export_getter_error', 'Error calling getluckysheetfile()', {
            error: e.message
          })
        }
      }

      // Fallback to global variable (works in legacy lifecycle)
      if (sheets.length === 0 && window.luckysheetfile && Array.isArray(window.luckysheetfile)) {
        sheets = window.luckysheetfile
        logger.debug(LogComponent.UI_COMPONENT, 'export_data_source', 'Using window.luckysheetfile fallback', {
          sheetsCount: sheets.length
        })
      }

      // Last resort: try getAllSheets
      if (sheets.length === 0 && window.luckysheet && typeof window.luckysheet.getAllSheets === 'function') {
        try {
          sheets = window.luckysheet.getAllSheets(true) || []
          logger.debug(LogComponent.UI_COMPONENT, 'export_data_source', 'Using luckysheet.getAllSheets()', {
            sheetsCount: sheets.length
          })
        } catch (e) {
          logger.warn(LogComponent.UI_COMPONENT, 'export_allsheets_error', 'Error calling getAllSheets()', {
            error: e.message
          })
        }
      }

      // Clone sheets to avoid mutating Luckysheet's internal state
      const sheetsToExport = sheets.map(sheet => ({
        ...sheet,
        celldata: sheet.celldata ? [...sheet.celldata] : undefined,
        data: sheet.data ? JSON.parse(JSON.stringify(sheet.data)) : undefined
      }))

      let luckysheetData = {
        sheets: sheetsToExport,
        info: {
          name: documentName
        }
      }

      // Export based on format
      if (format === 'xlsx') {
        await importExportService.exportToExcel(luckysheetData, {
          title: documentName,
          filename: `${documentName}_${new Date().toISOString().split('T')[0]}.xlsx`
        })
      } else if (format === 'csv') {
        await importExportService.exportToCSV(luckysheetData, {
          filename: `${documentName}_${new Date().toISOString().split('T')[0]}.csv`
        })
      }

      const duration = logger.endTimer('export_action')

      logger.info(LogComponent.UI_COMPONENT, 'export_success', 'Spreadsheet exported successfully', {
        format,
        documentName,
        duration
      })

    } catch (error) {
      const errorMsg = error?.message || 'Failed to export spreadsheet'
      setExportError(errorMsg)

      logger.error(LogComponent.UI_COMPONENT, 'export_failed', 'Spreadsheet export failed', {
        error: errorMsg,
        format
      })

      alert(`❌ Export failed: ${errorMsg}`)
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
  } // End of menuItems object

  return (
    <header className="header frost-overlay">
      {/* Save Reminder Banner */}
      {saveReminder.visible && (
        <div className="save-reminder-banner">
          <div className="save-reminder-content">
            <span className="save-reminder-text">
              💾 You have unsaved changes. Consider saving your work.
            </span>
            <div className="save-reminder-actions">
              <button
                onClick={handleSave}
                className="save-reminder-save-btn"
                disabled={!walletConnected}
              >
                Save Now
              </button>
              <button
                onClick={dismissSaveReminder}
                className="save-reminder-dismiss-btn"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Error Banner */}
      {importError && (
        <div className="error-banner import-error-banner">
          <div className="error-banner-content">
            <span className="error-banner-text">
              ❌ Import Error: {importError}
            </span>
            <button
              onClick={() => setImportError(null)}
              className="error-banner-dismiss-btn"
              title="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Export Error Banner */}
      {exportError && (
        <div className="error-banner export-error-banner">
          <div className="error-banner-content">
            <span className="error-banner-text">
              ❌ Export Error: {exportError}
            </span>
            <button
              onClick={() => setExportError(null)}
              className="error-banner-dismiss-btn"
              title="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

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

          {/* Network Selector */}
          <NetworkSelector inline={true} />

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
          {/* Save Button and Smart Save Status */}
          <div className="save-section">
            <button
              onClick={handleSave}
              className="save-button"
              disabled={!walletConnected || !walletSyncReady}
              title={
                !walletConnected
                  ? "Connect wallet to save"
                  : !walletSyncReady
                    ? "Wallet syncing..."
                    : "Save to blockchain"
              }
              style={{
                opacity: (!walletConnected || !walletSyncReady) ? 0.5 : 1,
                cursor: (!walletConnected || !walletSyncReady) ? 'not-allowed' : 'pointer'
              }}
            >
              💾 Save
            </button>

            {/* Smart Save Status Indicator */}
            {smartSaveStatus && (
              <SaveStatusIndicator
                saveStatus={smartSaveStatus.saveStatus}
                lastWalrusSave={smartSaveStatus.lastWalrusSaveTimestamp}
                lastSuiCommit={smartSaveStatus.lastSuiCommitTimestamp}
                pendingWalrusSaves={smartSaveStatus.pendingWalrusSaves}
                onSyncNow={syncToBlockchain}
                walletConnected={walletConnected}
                chunkMetadata={smartSaveStatus.chunkMetadata}
                renewalWarningDays={smartSaveStatus.chunkMetadata?.renewalWarningDays || 7}
                onRemindLater={snoozeCommitPrompt}
                onSuppressPrompts={suppressCommitPrompts}
                blobId={lastSaveInfo?.blobId}
                onViewDetails={() => setShowSaveDetails(true)}
              />
            )}

            <div className="auto-save-controls">
              <label className="auto-save-toggle">
                <input
                  type="checkbox"
                  checked={autoSaveEnabled}
                  onChange={(e) => toggleAutoSave(e.target.checked)}
                  disabled={!walletConnected}
                />
                <span className="auto-save-label">Smart Auto-save</span>
              </label>
            </div>
          </div>

          {/* Dashboard Navigation */}
          <button
            onClick={() => {
              logger.logUserAction('header_navigate_to_dashboard');
              navigate('/');
            }}
            className="dashboard-button"
            title="Go to Dashboard"
          >
            📊 Dashboard
          </button>

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
          <ImportButton
            onImport={handleImport}
            onError={(error) => setImportError(error?.message || 'Import failed')}
            title="Import Excel file (.xlsx or .xls)"
          />
          <ExportButton
            onExport={handleExport}
            onError={(error) => setExportError(error?.message || 'Export failed')}
            title="Export spreadsheet as Excel or CSV"
          />
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

      {/* Import Preview Modal */}
      <ImportPreviewModal
        isOpen={previewModalOpen}
        onClose={() => {
          setPreviewModalOpen(false)
          setPreviewData(null)
          setPendingImportFile(null)
        }}
        onConfirm={handleConfirmImport}
        importData={previewData}
        fileName={previewFileName}
        isLoading={isImporting}
      />

      {/* Wallet Modal */}
      <WalletModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
      />

      {/* Save Details Modal */}
      <SaveDetailsModal
        isOpen={showSaveDetails}
        onClose={() => setShowSaveDetails(false)}
        saveInfo={lastSaveInfo}
        network={configLoader.config?.currentNetwork || 'testnet'}
        storageAdapter={storageAdapter}
        onExpiryUpdate={(updates) => {
          // Update parent state via exposed hook method
          updateLastSaveInfo(updates);
        }}
      />
    </header>
  )
}
