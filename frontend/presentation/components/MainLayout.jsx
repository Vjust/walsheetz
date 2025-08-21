import React from 'react'
import { Header } from './Header.jsx'
import { Toolbar } from './Toolbar.jsx'
import { FormulaBar } from './FormulaBar.jsx'
import { Spreadsheet } from './Spreadsheet.jsx'
import { StatusBar } from './StatusBar.jsx'
import { NotificationContainer } from './NotificationContainer.jsx'
import { useSpreadsheetContext } from './SpreadsheetProvider.jsx'

export function MainLayout() {
  const { saveStatus, editCount, walletConnected } = useSpreadsheetContext()

  return (
    <div className="main-layout">
      <Header />
      <Toolbar />
      <FormulaBar />
      
      <div className="spreadsheet-container">
        <Spreadsheet />
      </div>
      
      <StatusBar 
        saveStatus={saveStatus}
        editCount={editCount}
        walletConnected={walletConnected}
      />
      
      <NotificationContainer />
    </div>
  )
}