import React from 'react';
import '../styles/save-status-indicator.css';

export function SaveStatusIndicator({
  saveStatus,
  lastWalrusSave,
  lastBlockchainSync,
  pendingWalrusSaves,
  onSyncNow,
  walletConnected
}) {
  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return null;

    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const getStatusInfo = () => {
    switch (saveStatus) {
      case 'saving_walrus':
        return {
          icon: '💾',
          text: 'Saving to storage...',
          className: 'saving',
          showSync: false
        };
      case 'saving_blockchain':
        return {
          icon: '⛓️',
          text: 'Syncing to blockchain...',
          className: 'syncing',
          showSync: false
        };
      case 'saved_walrus':
        return {
          icon: '☁️',
          text: 'Saved to storage',
          className: 'saved-walrus',
          showSync: walletConnected && pendingWalrusSaves > 0
        };
      case 'synced':
        return {
          icon: '✅',
          text: 'Fully synced',
          className: 'synced',
          showSync: false
        };
      case 'error':
        return {
          icon: '❌',
          text: 'Save error',
          className: 'error',
          showSync: false
        };
      default: // 'ready'
        if (pendingWalrusSaves > 0 && walletConnected) {
          return {
            icon: '⏳',
            text: 'Pending blockchain sync',
            className: 'pending-sync',
            showSync: true
          };
        }
        return {
          icon: '💾',
          text: 'Ready to save',
          className: 'ready',
          showSync: false
        };
    }
  };

  const statusInfo = getStatusInfo();
  const walrusTime = formatTimeAgo(lastWalrusSave);
  const blockchainTime = formatTimeAgo(lastBlockchainSync);

  return (
    <div className={`save-status-indicator ${statusInfo.className}`}>
      <div className="status-main">
        <span className="status-icon">{statusInfo.icon}</span>
        <span className="status-text">{statusInfo.text}</span>
        {statusInfo.showSync && onSyncNow && (
          <button
            className="sync-now-button"
            onClick={onSyncNow}
            title="Sync pending saves to blockchain"
          >
            Sync Now
          </button>
        )}
      </div>

      {/* Detailed status tooltip */}
      <div className="status-tooltip">
        <div className="tooltip-section">
          <div className="tooltip-title">Save Status</div>
          {walrusTime && (
            <div className="tooltip-item">
              <span className="tooltip-label">Storage:</span>
              <span className="tooltip-value">{walrusTime}</span>
            </div>
          )}
          {blockchainTime && walletConnected && (
            <div className="tooltip-item">
              <span className="tooltip-label">Blockchain:</span>
              <span className="tooltip-value">{blockchainTime}</span>
            </div>
          )}
          {pendingWalrusSaves > 0 && (
            <div className="tooltip-item">
              <span className="tooltip-label">Pending syncs:</span>
              <span className="tooltip-value">{pendingWalrusSaves}</span>
            </div>
          )}
          {!walletConnected && (
            <div className="tooltip-item">
              <span className="tooltip-label">Wallet:</span>
              <span className="tooltip-value">Not connected</span>
            </div>
          )}
        </div>

        <div className="tooltip-section">
          <div className="tooltip-title">How it works</div>
          <div className="tooltip-item">
            <div className="tooltip-explanation">
              • Changes save to storage every 30 seconds (no prompts)<br/>
              • Blockchain sync every 5 minutes (requires wallet approval)<br/>
              • Manual sync available anytime
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}