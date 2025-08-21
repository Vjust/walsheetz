import React from 'react'

export function StatusBar({ saveStatus, editCount, walletConnected }) {
  const getStatusText = () => {
    switch (saveStatus) {
      case 'saving': return 'Saving...'
      case 'saved': return 'Saved'
      case 'error': return 'Save failed'
      default: return 'Ready'
    }
  }

  const getStatusColor = () => {
    switch (saveStatus) {
      case 'saving': return '#f59e0b'
      case 'saved': return '#059669'
      case 'error': return '#dc2626'
      default: return '#6b7280'
    }
  }

  return (
    <div className="status-bar">
      <div className="status-section">
        <span className="status-text" style={{ color: getStatusColor() }}>
          {getStatusText()}
        </span>
      </div>
      
      <div className="status-section">
        <span className="edit-count">Edits: {editCount}</span>
      </div>
      
      <div className="status-section">
        <div className="wallet-status">
          <div 
            className="status-indicator"
            style={{ backgroundColor: walletConnected ? '#059669' : '#dc2626' }}
          ></div>
          <span>{walletConnected ? 'Wallet Connected' : 'Wallet Disconnected'}</span>
        </div>
      </div>
    </div>
  )
}