import React, { createContext, useContext, useState, useEffect } from 'react'

const NetworkContext = createContext(null)

export function NetworkProvider({ children }) {
  // EXCEPTION: localStorage used for network preference
  // WHY: User shouldn't need to re-select testnet/mainnet on every page load.
  //      Network selection is a user preference, not session-critical data.
  // SCOPE: Single key only: 'walsheetz_network'
  // DOCUMENTED: See docs/STORAGE_ARCHITECTURE.md
  const [network, setNetwork] = useState(() => {
    const saved = localStorage.getItem('walsheetz_network')
    return saved || 'testnet'
  })

  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false)
  const [pendingNetwork, setPendingNetwork] = useState(null)

  useEffect(() => {
    // Persist network preference (documented exception)
    localStorage.setItem('walsheetz_network', network)
    
    // Dispatch event so services can react to network changes
    window.dispatchEvent(new CustomEvent('network-changed', { 
      detail: { network } 
    }))
  }, [network])

  const requestNetworkSwitch = (newNetwork, skipConfirmation = false) => {
    if (newNetwork === network) return

    // If switching to mainnet and not skipping confirmation, show dialog
    if (newNetwork === 'mainnet' && !skipConfirmation) {
      setPendingNetwork(newNetwork)
      setIsConfirmDialogOpen(true)
    } else {
      // Either testnet switch (safe) or confirmation skipped (programmatic)
      setNetwork(newNetwork)
      window.location.reload() // Reload to reinitialize services
    }
  }

  const confirmNetworkSwitch = () => {
    if (pendingNetwork) {
      setNetwork(pendingNetwork)
      setIsConfirmDialogOpen(false)
      setPendingNetwork(null)
      window.location.reload() // Reload to reinitialize services
    }
  }

  const cancelNetworkSwitch = () => {
    setPendingNetwork(null)
    setIsConfirmDialogOpen(false)
  }

  const value = {
    network,
    isTestnet: network === 'testnet',
    isMainnet: network === 'mainnet',
    switchNetwork: requestNetworkSwitch,
    confirmSwitch: confirmNetworkSwitch,
    cancelSwitch: cancelNetworkSwitch,
    isConfirmDialogOpen,
    pendingNetwork
  }

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  )
}

export function useNetwork() {
  const context = useContext(NetworkContext)
  if (!context) {
    throw new Error('useNetwork must be used within NetworkProvider')
  }
  return context
}

