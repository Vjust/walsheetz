import React, { useState, useEffect } from 'react'
import { Header } from './Header.jsx'
import { Spreadsheet } from './Spreadsheet.jsx'
import { StatusBar } from './StatusBar.jsx'
import { NotificationContainer } from './NotificationContainer.jsx'
import { Collaboration } from './Collaboration.jsx'
import { LoadingOverlay } from './LoadingOverlay.jsx'
import { useSpreadsheetContext } from './SpreadsheetProvider.jsx'
import { configLoader } from '../../utils/ConfigLoader.js'

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
    connectWallet,
    getCurrentSpreadsheetId
  } = useSpreadsheetContext()

  const [config, setConfig] = useState(null)

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const cfg = await configLoader.getConfig()
        setConfig(cfg)
      } catch (error) {
        console.error('[MainLayout] Failed to load config:', error)
      }
    }
    loadConfig()
  }, [])

  return (
    <div className="main-layout">
      <div className="ice-background-particles"></div>

      <Header />

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
        spreadsheetId={getCurrentSpreadsheetId?.() || null}
      />
      
      <NotificationContainer />
      
      <LoadingOverlay
        isVisible={loadingState?.isLoading || false}
        message={loadingState?.message || 'Loading...'}
        details={loadingState?.details || ''}
        error={loadingState?.error}
        errorType={loadingState?.errorType}
        type={loadingState?.type}
        steps={loadingState?.steps}
        currentStep={loadingState?.currentStep}
        showProgress={loadingState?.showProgress}
      />

    </div>
  )
}