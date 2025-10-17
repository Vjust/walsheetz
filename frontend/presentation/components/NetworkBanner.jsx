import React from 'react'
import { useNetwork } from '../../providers/NetworkProvider.jsx'
import './styles/NetworkBanner.css'

export function NetworkBanner() {
  const { isMainnet, isTestnet } = useNetwork()

  if (isTestnet) {
    return (
      <div className="network-banner testnet">
        <div className="network-banner-content">
          <span className="network-icon">🧪</span>
          <span className="network-text">
            <strong>Testnet Mode</strong> - Using test tokens
          </span>
        </div>
      </div>
    )
  }

  if (isMainnet) {
    return (
      <div className="network-banner mainnet">
        <div className="network-banner-content">
          <span className="network-icon">⚠️</span>
          <span className="network-text">
            <strong>Mainnet Mode</strong> - Using real funds!
          </span>
        </div>
      </div>
    )
  }

  return null
}


