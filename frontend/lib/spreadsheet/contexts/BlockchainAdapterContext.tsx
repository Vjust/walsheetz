import React, { createContext, useContext, useState, useRef, useEffect } from 'react'
import { BlockchainAdapter } from '../adapters/BlockchainAdapter'
import { StaleFallback } from '../types'

export interface BlockchainAdapterContextValue {
  adapter: BlockchainAdapter | null
  isReady: boolean
  setupRetryEventListeners: () => void
  autoRetryFallbacksOnStartup: () => Promise<void>
  checkStaleFallbacks: (days: number) => StaleFallback[]
  staleFallbacks: StaleFallback[]
  setStaleFallbacks: (f: StaleFallback[]) => void
}

const BlockchainAdapterContext = createContext<BlockchainAdapterContextValue | null>(null)

export function BlockchainAdapterProvider({ children }: { children: React.ReactNode }) {
  const [adapter, setAdapter] = useState<BlockchainAdapter | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [staleFallbacks, setStaleFallbacks] = useState<StaleFallback[]>([])
  const initializationAttemptedRef = useRef(false)

  useEffect(() => {
    if (initializationAttemptedRef.current) return

    initializationAttemptedRef.current = true

    const waitForAdapter = async () => {
      let attempts = 0
      const maxAttempts = 100

      while (!window.spreadsheetEngine?.blockchainService && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100))
        attempts++
      }

      if (window.spreadsheetEngine?.blockchainService) {
        const blockchainAdapter = window.spreadsheetEngine.blockchainService
        setAdapter(blockchainAdapter)
        setIsReady(true)
      }
    }

    waitForAdapter()
  }, [])

  const setupRetryEventListeners = () => {
    if (adapter && typeof adapter.setupRetryEventListeners === 'function') {
      adapter.setupRetryEventListeners()
    }
  }

  const autoRetryFallbacksOnStartup = async () => {
    if (adapter && typeof adapter.autoRetryFallbacksOnStartup === 'function') {
      return await adapter.autoRetryFallbacksOnStartup()
    }
  }

  const checkStaleFallbacks = (days: number) => {
    if (adapter && typeof adapter.checkStaleFallbacks === 'function') {
      return adapter.checkStaleFallbacks(days)
    }
    return []
  }

  const value: BlockchainAdapterContextValue = {
    adapter,
    isReady,
    setupRetryEventListeners,
    autoRetryFallbacksOnStartup,
    checkStaleFallbacks,
    staleFallbacks,
    setStaleFallbacks
  }

  return (
    <BlockchainAdapterContext.Provider value={value}>
      {children}
    </BlockchainAdapterContext.Provider>
  )
}

export function useBlockchainAdapter(): BlockchainAdapterContextValue {
  const context = useContext(BlockchainAdapterContext)
  if (!context) {
    throw new Error('useBlockchainAdapter must be used within a BlockchainAdapterProvider')
  }
  return context
}
