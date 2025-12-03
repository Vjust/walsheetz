import React, { createContext, useContext, useEffect, useRef } from 'react'
import { useSpreadsheet } from '../../business/useSpreadsheet.js'
import { setupGlobalDevTools } from '../../utils/devTools.js'

const SpreadsheetContext = createContext(null)

export function SpreadsheetProvider({ children }) {
  const spreadsheetState = useSpreadsheet()
  const devToolsInitializedRef = useRef(false)
  
  // Setup dev tools only once when component mounts
  useEffect(() => {
    if (!devToolsInitializedRef.current) {
      devToolsInitializedRef.current = true
      setupGlobalDevTools(spreadsheetState)
    }
  }, []) // Empty dependency array - only run once
  
  // Update dev tools reference when spreadsheet state changes
  useEffect(() => {
    if (devToolsInitializedRef.current && typeof window !== 'undefined' && import.meta.env?.DEV) {
      window.devTools = {
        forceSave: () => spreadsheetState.saveToBlockchain(),
        getStatus: () => spreadsheetState.getStatus(),
        reset: () => confirm('Clear all data?') ? spreadsheetState.clearData() : null,
        connectWallet: () => spreadsheetState.connectWallet()
      }
    }
  }, [spreadsheetState])
  
  return (
    <SpreadsheetContext.Provider value={spreadsheetState}>
      {children}
    </SpreadsheetContext.Provider>
  )
}

export function useSpreadsheetContext() {
  const context = useContext(SpreadsheetContext)
  if (!context) {
    throw new Error('useSpreadsheetContext must be used within a SpreadsheetProvider')
  }
  return context
}