import React from 'react';
import './SaveStatusIndicator.css';

export function SaveStatusIndicator({
  saveStatus,
  lastWalrusSave,
  lastSuiCommit,
  pendingWalrusSaves,
  onSyncNow,
  walletConnected,
  chunkMetadata,
  renewalWarningDays,
  onRemindLater,
  onSuppressPrompts,
  poaStatus = null, // PoA certificate status: 'certified', 'uncertified', 'pending', 'expired', 'unknown'
  blobId = null, // Current blob ID
  onSaveToBlockchain = null, // Callback to open save to blockchain modal
  onViewDetails = null // Callback to open save details modal
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
      case 'awaiting_commit':
        return {
          icon: '⏳',
          text: 'Commit ready for blockchain',
          className: 'awaiting-commit',
          showSync: true
        };
      case 'committing':
        return {
          icon: '⛓️',
          text: 'Confirm in wallet to publish',
          className: 'syncing',
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
  const suiCommitTime = formatTimeAgo(lastSuiCommit);
  const expiryTimestamp = chunkMetadata?.expiryTimestamp || null;
  const expiresInMs = expiryTimestamp ? expiryTimestamp - Date.now() : null;
  const expiryWarningMs = (renewalWarningDays || 7) * 86400000;
  const isExpiryCritical = expiresInMs !== null && expiresInMs <= 0;
  const isExpirySoon = expiresInMs !== null && expiresInMs > 0 && expiresInMs < expiryWarningMs;

  return (
    <div className={`save-status-indicator ${statusInfo.className}`}>
      <div className="status-main">
        <span className="status-icon">{statusInfo.icon}</span>
        <span className="status-text">{statusInfo.text}</span>
        {blobId && onViewDetails && (
          <button
            className="view-details-button"
            onClick={onViewDetails}
            title="View save details and explorer links"
          >
            View Details
          </button>
        )}
        {statusInfo.showSync && onSyncNow && (
          <button
            className="sync-now-button"
            onClick={onSyncNow}
            title="Sync pending saves to blockchain"
          >
            Sync Now
          </button>
        )}
        {statusInfo.showSync && !walletConnected && (
          <span className="status-hint">Connect wallet to publish changes</span>
        )}
      </div>

      {(onRemindLater || onSuppressPrompts) && statusInfo.showSync && (
        <div className="status-actions">
          {onRemindLater && (
            <button className="remind-later-button" onClick={onRemindLater}>Remind me later</button>
          )}
          {onSuppressPrompts && (
            <button className="suppress-button" onClick={onSuppressPrompts}>Don't show again</button>
          )}
        </div>
      )}

      {/* Save to Blockchain prompt */}
      {blobId && onSaveToBlockchain && poaStatus === 'uncertified' && walletConnected && (
        <div className="poa-prompt">
          <span className="poa-prompt-icon">⚠️</span>
          <span className="poa-prompt-text">
            Your data may be deleted without blockchain protection
          </span>
          <button
            className="save-blockchain-button"
            onClick={onSaveToBlockchain}
            title="Guarantee data availability"
          >
            Save to Blockchain
          </button>
        </div>
      )}

      <div className="status-tooltip">
        <div className="tooltip-section">
          <div className="tooltip-title">Save Status</div>
          {walrusTime && (
            <div className="tooltip-item">
              <span className="tooltip-label">Storage:</span>
              <span className="tooltip-value">{walrusTime}</span>
            </div>
          )}
          {suiCommitTime && walletConnected && (
            <div className="tooltip-item">
              <span className="tooltip-label">Blockchain:</span>
              <span className="tooltip-value">{suiCommitTime}</span>
            </div>
          )}
          {expiryTimestamp && (
            <div className={`tooltip-item ${isExpiryCritical ? 'expiry-critical' : isExpirySoon ? 'expiry-warning' : ''}`}>
              <span className="tooltip-label">Walrus expiry:</span>
              <span className="tooltip-value">
                {new Date(expiryTimestamp).toLocaleString()}
                {isExpiryCritical && ' ⚠️ Expired — renew immediately'}
                {(!isExpiryCritical && isExpirySoon) && ' ⚠️ Renewal required soon'}
              </span>
            </div>
          )}
          {poaStatus && (
            <div className={`tooltip-item poa-status-${poaStatus}`}>
              <span className="tooltip-label">Blockchain Storage:</span>
              <span className="tooltip-value poa-badge">
                {poaStatus === 'certified' && '✅ Protected'}
                {poaStatus === 'uncertified' && '❌ Not Protected'}
                {poaStatus === 'pending' && '⏳ Saving...'}
                {poaStatus === 'expired' && '⚠️ Expired'}
                {poaStatus === 'unknown' && '❓ Unknown'}
              </span>
            </div>
          )}
          {blobId && (
            <div className="tooltip-item">
              <span className="tooltip-label">Blob ID:</span>
              <span className="tooltip-value blob-id">{blobId.substring(0, 16)}...</span>
            </div>
          )}
          {pendingWalrusSaves > 0 && (
            <div className="tooltip-item">
              <span className="tooltip-label">Pending commits:</span>
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
              • Changes save to storage every 30 seconds (no prompts)<br />
              • Blockchain commit requires approval (after edits or on demand)<br />
              • Walrus chunk expiry triggers renewal prompts and warnings
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}