import React, { useState, useEffect } from 'react';
import { useWalletConnectionFactory } from '../../../hooks/useWalletConnectionFactory.ts';

export function WalletModal({ isOpen, onClose }) {
  const walletConnection = useWalletConnectionFactory();
  const { installed, notInstalled } = walletConnection.availableWallets;
  const [connecting, setConnecting] = useState(null);
  const [error, setError] = useState(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setConnecting(null);
      setError(null);
    }
  }, [isOpen]);

  // Close modal when wallet connects successfully
  useEffect(() => {
    if (walletConnection.isConnected && connecting) {
      setConnecting(null);
      onClose();
    }
  }, [walletConnection.isConnected, connecting, onClose]);

  if (!isOpen) return null;

  const handleWalletSelect = async (wallet) => {
    console.log('[WalletModal] Connecting to:', wallet.name);
    setConnecting(wallet.name);
    setError(null);
    
    try {
      await walletConnection.connectWallet(wallet);
      // Modal will close via useEffect when connection succeeds
    } catch (err) {
      console.error('[WalletModal] Connection failed:', err);
      setError(err.message || 'Failed to connect wallet');
      setConnecting(null);
    }
  };

  const handleInstallWallet = (walletInfo) => {
    console.log('[WalletModal] Opening install URL:', walletInfo.url);
    window.open(walletInfo.url, '_blank');
  };

  return (
    <div className="wallet-modal-overlay" onClick={onClose}>
      <div className="wallet-modal frost-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="wallet-modal-header">
          <h2>Connect Slush Wallet</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="wallet-modal-body">
          {/* Connection Status */}
          {connecting && (
            <div className="wallet-connecting">
              <div className="spinner"></div>
              <p>Connecting to {connecting}...</p>
              <p className="connection-note">Please approve the connection in your wallet</p>
            </div>
          )}

          {error && (
            <div className="wallet-error">
              <p>Connection failed: {error}</p>
              <button 
                className="retry-button"
                onClick={() => setError(null)}
              >
                Try Again
              </button>
            </div>
          )}
          
          {/* Slush Wallet Available */}
          {installed.length > 0 && (
            <div className="wallet-section">
              <h3>🦭 Slush Wallet Ready</h3>
              <p className="slush-description">
                Slush is the official Sui wallet by Mysten Labs, designed for secure and seamless blockchain interactions.
              </p>
              <div className="wallet-list">
                {installed.map((wallet) => {
                  const isConnecting = connecting === wallet.name;
                  return (
                    <button
                      key={wallet.name}
                      className={`wallet-item primary ${isConnecting ? 'connecting' : ''}`}
                      onClick={() => handleWalletSelect(wallet)}
                      disabled={!!connecting}
                    >
                      <div className="wallet-icon">
                        <div className="slush-logo">🦭</div>
                      </div>
                      <span className="wallet-name">Connect {wallet.name}</span>
                      {isConnecting && <span className="connecting-indicator">Connecting...</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Install Slush Wallet */}
          {notInstalled.length > 0 && (
            <div className="wallet-section">
              <h3>Install Slush Wallet</h3>
              <p className="install-description">
                You'll need Slush wallet to use WalSheetz. It's free and takes less than a minute to install.
              </p>
              <div className="wallet-list">
                {notInstalled.map((walletInfo) => (
                  <button
                    key={walletInfo.name}
                    className="wallet-item install"
                    onClick={() => handleInstallWallet(walletInfo)}
                  >
                    <div className="wallet-icon">
                      <img src={walletInfo.icon} alt={walletInfo.name} />
                    </div>
                    <span className="wallet-name">{walletInfo.name}</span>
                    <span className="install-label">Install</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* No Wallets Found */}
          {installed.length === 0 && notInstalled.length > 0 && (
            <div className="no-wallets-message">
              <p>🦭 Slush wallet not detected. Please install it to continue:</p>
            </div>
          )}
          
          {installed.length === 0 && notInstalled.length === 0 && (
            <div className="no-wallets-message">
              <p>Loading Slush wallet...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}