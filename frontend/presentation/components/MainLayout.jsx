import React from 'react'
import { Header } from './Header.jsx'
import { FormulaBar } from './FormulaBar.jsx'
import { Spreadsheet } from './Spreadsheet.jsx'
import { StatusBar } from './StatusBar.jsx'
import { NotificationContainer } from './NotificationContainer.jsx'
import { Collaboration } from './Collaboration.jsx'
import { LoadingOverlay } from './LoadingOverlay.jsx'
import { useSpreadsheetContext } from './SpreadsheetProvider.jsx'

export function MainLayout() {
  const {
    saveStatus,
    loadingState,
    editCount,
    walletConnected,
    walletAddress,
    walletBalance,
    walletNetwork,
    webSocketService,
    blockchainService,
    connectWallet
  } = useSpreadsheetContext()

  return (
    <div className="main-layout">
      <div className="ice-background-particles"></div>
      
      <Header />
      <FormulaBar />
      
      <div className="spreadsheet-container crystal-shine">
        <Spreadsheet />
      </div>
      
      <StatusBar
        saveStatus={saveStatus}
        editCount={editCount}
        walletConnected={walletConnected}
        walletAddress={walletAddress}
        walletBalance={walletBalance}
        walletNetwork={walletNetwork}
      />
      
      <Collaboration 
        blockchainAdapter={blockchainService}
        isWalletConnected={walletConnected}
        onConnectWallet={connectWallet}
      />
      
      <NotificationContainer />
      
      <LoadingOverlay
        isVisible={loadingState?.isLoading || false}
        message={loadingState?.message || 'Loading...'}
        details={loadingState?.details || ''}
      />
    </div>
  )
}