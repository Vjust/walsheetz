import React from 'react'
import '../styles/NetworkBadge.css'

export function NetworkBadge({ network, small = false }) {
  if (!network) return null

  const isTestnet = network === 'testnet'
  const isMainnet = network === 'mainnet'

  return (
    <span className={`network-badge ${network} ${small ? 'small' : ''}`}>
      <span className="badge-dot" />
      <span className="badge-text">
        {isTestnet && '🧪 Testnet'}
        {isMainnet && '💎 Mainnet'}
        {!isTestnet && !isMainnet && network}
      </span>
    </span>
  )
}


