import React, { useEffect, useRef } from 'react'
import { useSpreadsheetContext } from './SpreadsheetProvider.jsx'
import { useSpreadsheetLifecycle } from '../../hooks/useSpreadsheetLifecycle.js'
import { useLuckysheetShortcuts } from '../../hooks/useLuckysheetShortcuts.js'

/**
 * Spreadsheet Component
 *
 * Main spreadsheet component using LuckysheetAdapter and lifecycle hooks.
 * Refactored in Phase 2 to use clean, composable hooks instead of monolithic initialization.
 */
export function Spreadsheet() {
  const containerRef = useRef(null)

  const {
    handleCellEdit,
    setCurrentCell,
    handleFormulaChange,
    clearFormulaPreview,
    saveToBlockchain,
    spreadsheetData,
    setLuckysheetReady
  } = useSpreadsheetContext()

  // Use lifecycle hook for Luckysheet initialization
  const lifecycle = useSpreadsheetLifecycle({
    spreadsheetData,
    handleCellEdit,
    setCurrentCell,
    handleFormulaChange,
    clearFormulaPreview,
    saveToBlockchain,
    setLuckysheetReady
  })

  // Initialize Luckysheet on mount and when data changes
  useEffect(() => {
    lifecycle.initLuckysheet()
    return lifecycle.cleanup
  }, [spreadsheetData])

  // Handle keyboard shortcuts (Ctrl+S, Ctrl+B, Ctrl+I, etc.)
  useLuckysheetShortcuts({
    luckysheetRef: lifecycle.luckysheetRef,
    saveToBlockchain
  })

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
