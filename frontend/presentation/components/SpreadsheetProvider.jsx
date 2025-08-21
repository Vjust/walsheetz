import React, { createContext, useContext, useEffect } from 'react'
import { useSpreadsheet } from '../../business/useSpreadsheet.js'
import { setupGlobalDevTools } from '../../utils/devTools.js'

const SpreadsheetContext = createContext(null)

export function SpreadsheetProvider({ children }) {
  const spreadsheetState = useSpreadsheet()
  
  // Setup dev tools when component mounts
  useEffect(() => {
    setupGlobalDevTools(spreadsheetState)
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