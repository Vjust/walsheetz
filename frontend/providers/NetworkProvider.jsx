import React, { createContext, useContext, useState, useEffect } from 'react'
import { networkLock } from '../utils/NetworkLock.js'

const NetworkContext = createContext(null)

export function NetworkProvider({ children }) {
  // EXCEPTION: localStorage used for network preference
  // WHY: User shouldn't need to re-select testnet/mainnet on every page load.
  //      Network selection is a user preference, not session-critical data.
  // SCOPE: Single key only: 'walsheetz_network'
  // DOCUMENTED: See docs/STORAGE_ARCHITECTURE.md
  // SYNC: Uses NetworkLock to prevent race conditions with ConfigLoader
  const [network, setNetwork] = useState(() => {
    try {
      // Check URL parameter first (for network switches from window.location.replace)
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search)
        const urlNetwork = urlParams.get('network')
        if (urlNetwork && ['testnet', 'mainnet', 'devnet'].includes(urlNetwork)) {
          console.log(`[NetworkProvider] 🌐 Network from URL param: ${urlNetwork}`)
          return urlNetwork
        }
      }

      // Fall back to localStorage preference
      const saved = localStorage.getItem('walsheetz_network')
      return saved || 'testnet'
    } catch (e) {
      console.warn('[NetworkProvider] Failed to read network preference:', e)
      return 'testnet'
    }
  })

  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false)
  const [pendingNetwork, setPendingNetwork] = useState(null)

  useEffect(() => {
    // Persist network preference (documented exception)
    // Use lock to prevent race conditions with ConfigLoader
    networkLock.withLock(async () => {
      try {
        localStorage.setItem('walsheetz_network', network)
      } catch (e) {
        console.warn('[NetworkProvider] Failed to write network preference:', e)
      }
    }).catch(e => {
      console.warn('[NetworkProvider] Lock operation failed:', e)
    })

    // Dispatch event so services can react to network changes
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('network-changed', {
        detail: { network }
      }))
    }
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
      // Navigate to root with network param to avoid 404 on transient Vercel routes
      // ConfigLoader will prioritize the URL param over localStorage
      window.location.replace(`/?network=${newNetwork}`)
    }
  }

  const confirmNetworkSwitch = () => {
    if (pendingNetwork) {
      setNetwork(pendingNetwork)
      setIsConfirmDialogOpen(false)
      setPendingNetwork(null)
      // Navigate to root with network param to avoid 404 on transient Vercel routes
      // ConfigLoader will prioritize the URL param over localStorage
      window.location.replace(`/?network=${pendingNetwork}`)
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

