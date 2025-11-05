import React from 'react'
import { useNetwork } from '@shared/providers/NetworkProvider.jsx'
import '../styles/NetworkSelector.css'

export function NetworkSelector({ position = 'top-right', inline = false }) {
  const { network, switchNetwork, isMainnet } = useNetwork()

  const handleToggle = () => {
    const newNetwork = network === 'testnet' ? 'mainnet' : 'testnet'
    switchNetwork(newNetwork)
  }

  const positionStyles = {
    'top-left': { top: '20px', left: '20px' },
    'top-right': { top: '20px', right: '20px' },
    'bottom-left': { bottom: '20px', left: '20px' },
    'bottom-right': { bottom: '20px', right: '20px' }
  }

  return (
    <div
      className={`network-selector ${inline ? 'inline' : ''}`}
      style={inline ? {} : positionStyles[position]}
    >
      <div className="network-selector-content">
        <span className={`network-label ${network}`}>
          <span className="network-dot" />
          {network === 'testnet' ? 'Testnet' : 'Mainnet'}
        </span>
        <button
          className={`network-toggle ${network}`}
          onClick={handleToggle}
          title={`Switch to ${network === 'testnet' ? 'Mainnet' : 'Testnet'}`}
        >
          <span className="toggle-slider" />
        </button>
      </div>
      {isMainnet && (
        <div className="network-warning">
          ⚠️ Using real funds
        </div>
      )}
    </div>
  )
}

export function NetworkConfirmDialog() {
  const { isConfirmDialogOpen, confirmSwitch, cancelSwitch, pendingNetwork } = useNetwork()

  if (!isConfirmDialogOpen) return null

  return (
    <div className="network-confirm-overlay" onClick={cancelSwitch}>
      <div className="network-confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="network-confirm-header">
          <h3>⚠️ Switch to Mainnet?</h3>
          <button className="close-btn" onClick={cancelSwitch}>✕</button>
        </div>
        
        <div className="network-confirm-body">
          <p className="warning-text">
            You are about to switch to <strong>Mainnet</strong>.
          </p>
          
          <div className="warning-box">
            <div className="warning-item">
              <span className="warning-icon">💰</span>
              <span>Real SUI and WAL tokens will be used</span>
            </div>
            <div className="warning-item">
              <span className="warning-icon">🔒</span>
              <span>All transactions are permanent and cannot be undone</span>
            </div>
            <div className="warning-item">
              <span className="warning-icon">💸</span>
              <span>Gas fees and storage costs are real</span>
            </div>
          </div>

          <p className="confirm-text">
            Make sure your wallet is connected to <strong>Sui Mainnet</strong> before proceeding.
          </p>

          <p className="reload-notice">
            The app will reload after switching networks.
          </p>
        </div>

        <div className="network-confirm-actions">
          <button className="cancel-btn" onClick={cancelSwitch}>
            Cancel
          </button>
          <button className="confirm-btn mainnet" onClick={confirmSwitch}>
            Switch to Mainnet
          </button>
        </div>
      </div>
    </div>
  )
}


