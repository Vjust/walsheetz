import React, { useState, useEffect } from 'react'
import { faucetService } from '@services/blockchain/transactions/FaucetService.js'
import { browserWalletManager } from '@services/blockchain/wallet/BrowserWalletManager.js'

export function StatusBar({ saveStatus, editCount, walletConnected, walletAddress, walletBalance, walletNetwork, onBalanceRefresh }) {
  const [faucetLoading, setFaucetLoading] = useState(false)
  const [faucetMessage, setFaucetMessage] = useState('')
  const [healthStatus, setHealthStatus] = useState(null)

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

  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatBalance = (balance) => {
    if (!balance || !balance.sui) return '0 SUI';
    const suiAmount = parseFloat(balance.sui);
    if (suiAmount < 0.001) {
      return `${(suiAmount * 1000).toFixed(2)}m SUI`;
    }
    return `${suiAmount.toFixed(3)} SUI`;
  };

  // Listen for health updates from wallet manager
  useEffect(() => {
    const handleHealthUpdate = (healthData) => {
      setHealthStatus(healthData);
    };

    browserWalletManager.on('healthUpdate', handleHealthUpdate);

    // Get initial health status
    const initialHealth = browserWalletManager.getHealthStatus();
    setHealthStatus(initialHealth);

    return () => {
      browserWalletManager.off('healthUpdate', handleHealthUpdate);
    };
  }, []);

  const getWalletHealthStatus = () => {
    if (!walletConnected) return { status: 'disconnected', color: '#dc2626', text: 'Disconnected' };
    if (!walletAddress) return { status: 'connecting', color: '#f59e0b', text: 'Connecting...' };

    const balance = walletBalance?.sui ? parseFloat(walletBalance.sui) : 0;
    if (balance < 0.01) return { status: 'low-balance', color: '#f59e0b', text: 'Low Balance' };

    // Incorporate health monitoring status
    if (healthStatus && healthStatus.isEnabled) {
      switch (healthStatus.status) {
        case 'critical':
          return {
            status: 'critical',
            color: '#dc2626',
            text: `Critical (${healthStatus.consecutiveFailures} failures)`,
            tooltip: `Health monitoring detected ${healthStatus.consecutiveFailures} consecutive failures. Last heartbeat: ${healthStatus.lastHeartbeat ? new Date(healthStatus.lastHeartbeat).toLocaleTimeString() : 'Never'}`
          };
        case 'warning':
          return {
            status: 'warning',
            color: '#f59e0b',
            text: `Warning (${healthStatus.recentFailures || 0} recent failures)`,
            tooltip: `Health monitoring detected recent transaction failures. Recent failures: ${healthStatus.recentFailures || 0}`
          };
        case 'healthy':
          return {
            status: 'healthy',
            color: '#059669',
            text: 'Healthy',
            tooltip: `Wallet connection is healthy. Last heartbeat: ${healthStatus.lastHeartbeat ? new Date(healthStatus.lastHeartbeat).toLocaleTimeString() : 'Never'}`
          };
        default:
          return { status: 'connected', color: '#059669', text: 'Connected' };
      }
    }

    return { status: 'connected', color: '#059669', text: 'Connected' };
  };

  const handleRequestTestSui = async () => {
    if (!walletAddress || faucetLoading) return

    setFaucetLoading(true)
    setFaucetMessage('')

    try {
      const result = await faucetService.requestTestSui(walletAddress)

      if (result.success) {
        setFaucetMessage(`✅ ${result.message}`)

        // Refresh wallet balance after successful faucet request
        if (onBalanceRefresh) {
          setTimeout(() => {
            onBalanceRefresh()
          }, 2000) // Wait 2 seconds for transaction to propagate
        }

        // Clear success message after 5 seconds
        setTimeout(() => setFaucetMessage(''), 5000)
      } else {
        setFaucetMessage(`❌ ${result.error}`)

        // Clear error message after 8 seconds
        setTimeout(() => setFaucetMessage(''), 8000)
      }
    } catch (error) {
      setFaucetMessage(`❌ Network error: ${error.message}`)
      setTimeout(() => setFaucetMessage(''), 8000)
    } finally {
      setFaucetLoading(false)
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
        <div className="wallet-status" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            className="status-indicator"
            style={{
              backgroundColor: getWalletHealthStatus().color,
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              animation: walletConnected && walletAddress ? 'none' : 'pulse 2s infinite'
            }}
          ></div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span
              style={{ fontSize: '12px', fontWeight: '500' }}
              title={getWalletHealthStatus().tooltip || getWalletHealthStatus().text}
            >
              {getWalletHealthStatus().text}
            </span>
            {walletConnected && (
              <div style={{ fontSize: '10px', color: '#6b7280', display: 'flex', gap: '8px' }}>
                {walletAddress && (
                  <span title={walletAddress}>{formatAddress(walletAddress)}</span>
                )}
                {walletBalance && (
                  <span>{formatBalance(walletBalance)}</span>
                )}
                {walletNetwork && walletNetwork !== 'testnet' && (
                  <span style={{ color: '#f59e0b' }}>({walletNetwork})</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {walletConnected && walletAddress && (
        <div className="status-section">
          <button
            onClick={handleRequestTestSui}
            disabled={faucetLoading}
            className="faucet-button"
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              backgroundColor: faucetLoading ? '#9ca3af' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: faucetLoading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s'
            }}
          >
            {faucetLoading ? 'Requesting...' : 'Request Test SUI'}
          </button>
        </div>
      )}

      {faucetMessage && (
        <div className="status-section">
          <span
            className="faucet-message"
            style={{
              fontSize: '11px',
              color: faucetMessage.startsWith('✅') ? '#059669' : '#dc2626',
              fontWeight: '500'
            }}
          >
            {faucetMessage}
          </span>
        </div>
      )}
    </div>
  )
}