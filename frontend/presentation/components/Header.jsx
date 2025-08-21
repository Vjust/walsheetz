import React, { useState } from 'react'
import { useSpreadsheetContext } from './SpreadsheetProvider.jsx'

export function Header() {
  const [documentName, setDocumentName] = useState('Untitled Spreadsheet')
  
  const { 
    walletConnected, 
    walletAddress, 
    connectWallet, 
    disconnectWallet, 
    saveToBlockchain 
  } = useSpreadsheetContext()

  const formatAddress = (address) => {
    if (!address) return ''
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const handleWalletConnect = async () => {
    try {
      const result = await connectWallet()
      if (!result.success) {
        console.error('Wallet connection failed:', result.error)
      }
    } catch (error) {
      console.error('Wallet connection error:', error)
    }
  }

  const handleSave = async () => {
    try {
      const result = await saveToBlockchain()
      if (!result.success) {
        console.error('Save failed:', result.error)
      }
    } catch (error) {
      console.error('Save error:', error)
    }
  }

  return (
    <header className="header">
      {/* Logo and Document Name */}
      <div className="header-left">
        <div className="logo-section">
          <div className="logo-icon">
            <span>🦭</span>
          </div>
          <span className="app-name">WalSheetz</span>
        </div>
        
        <input
          type="text"
          value={documentName}
          onChange={(e) => setDocumentName(e.target.value)}
          className="document-name"
          placeholder="Untitled Spreadsheet"
        />
      </div>

      {/* Menu Bar */}
      <nav className="menu-bar">
        {['File', 'Edit', 'View', 'Insert', 'Format', 'Data', 'Tools'].map((item) => (
          <button key={item} className="menu-item">
            {item}
          </button>
        ))}
      </nav>

      {/* Wallet and Actions */}
      <div className="header-right">
        {/* Save Button */}
        <button onClick={handleSave} className="save-button">
          💾 Save
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
            <button onClick={disconnectWallet} className="disconnect-button">
              Disconnect
            </button>
          </div>
        ) : (
          <button onClick={handleWalletConnect} className="connect-button">
            🔗 Connect Wallet
          </button>
        )}

        {/* Deposit Button */}
        {walletConnected && (
          <button className="deposit-button">
            💰 Deposit
          </button>
        )}
      </div>
    </header>
  )
}