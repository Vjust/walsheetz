import React, { useState, useEffect } from 'react'
import { useNetwork } from '../../providers/NetworkProvider.jsx'
import { getCurrentConfig } from '@blockchain/config.js'
import './styles/NetworkMismatchWarning.css'

export function NetworkMismatchWarning({ walletChain }) {
  const { network, isMainnet, isTestnet } = useNetwork()
  const [showWarning, setShowWarning] = useState(false)
  const [configuredNetwork, setConfiguredNetwork] = useState(null)

  useEffect(() => {
    // Check if configured network matches what we think it should be
    const config = getCurrentConfig()
    const configNet = config.environment
    setConfiguredNetwork(configNet)

    // Log for debugging
    console.log('[NetworkMismatchWarning] Network check:', {
      selectedNetwork: network,
      configuredNetwork: configNet,
      walletChain,
      match: network === configNet
    })

    // Show warning if there's a mismatch
    if (network !== configNet) {
      setShowWarning(true)
    } else {
      setShowWarning(false)
    }
  }, [network, walletChain])

  if (!showWarning) return null

  return (
    <div className="network-mismatch-warning">
      <div className="network-mismatch-content">
        <span className="warning-icon">⚠️</span>
        <div className="warning-message">
          <strong>Network Configuration Mismatch</strong>
          <p>
            You selected <strong>{network}</strong> but wallet is on{' '}
            <strong>{configuredNetwork}</strong>.
          </p>
          <p>Please reload the page to apply network changes.</p>
        </div>
        <button
          className="reload-button"
          onClick={() => window.location.reload()}
        >
          Reload Now
        </button>
      </div>
    </div>
  )
}


