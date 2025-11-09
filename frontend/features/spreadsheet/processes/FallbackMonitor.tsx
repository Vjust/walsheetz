/**
 * Fallback Monitor Process
 *
 * Manages the blockchain fallback retry system and stale fallback detection
 * Extracted from App.jsx to isolate global side effects
 *
 * This is a "process" component - it handles side effects but renders children unchanged
 */

import React, { useState, useEffect, ReactNode } from 'react'
import { logger, LogComponent } from '@utils/logging/Logger.js'
import { StaleFallbackCleanupModal } from '@shared/ui/modals/StaleFallbackCleanupModal.jsx'

interface FallbackMonitorProps {
  children: ReactNode
}

interface StaleFallback {
  key: string
  timestamp: number
  data: any
}

/**
 * FallbackMonitor Component
 *
 * Initializes and monitors the blockchain adapter's fallback retry system
 * Displays cleanup modal when stale fallbacks are detected
 */
export function FallbackMonitor({ children }: FallbackMonitorProps) {
  const [staleFallbacks, setStaleFallbacks] = useState<StaleFallback[]>([])
  const [showCleanupModal, setShowCleanupModal] = useState(false)

  // Initialize fallback retry system on mount
  useEffect(() => {
    console.log('🔄 [FallbackMonitor] Initializing fallback retry system')
    logger.info(LogComponent.UI_COMPONENT, 'fallback_monitor_mount', 'FallbackMonitor mounted')

    const initializeFallbackRetry = async () => {
      try {
        // Wait for BlockchainAdapter to be available
        let attempts = 0
        while (!window.walSheetzBlockchainAdapter && attempts < 100) {
          await new Promise(resolve => setTimeout(resolve, 100))
          attempts++
        }

        if (window.walSheetzBlockchainAdapter) {
          // Setup event listeners for manual retries
          if (typeof window.walSheetzBlockchainAdapter.setupRetryEventListeners === 'function') {
            window.walSheetzBlockchainAdapter.setupRetryEventListeners()
            logger.info(LogComponent.UI_COMPONENT, 'retry_listeners_setup', 'Fallback retry listeners initialized')
          }

          // Start auto-retry on startup (after 2 second delay for wallet connection)
          setTimeout(async () => {
            if (typeof window.walSheetzBlockchainAdapter.autoRetryFallbacksOnStartup === 'function') {
              try {
                await window.walSheetzBlockchainAdapter.autoRetryFallbacksOnStartup()
              } catch (e) {
                logger.warn(LogComponent.UI_COMPONENT, 'startup_retry_error', 'Error in startup retry', {
                  error: (e as Error).message
                })
              }
            }

            // Check for stale fallback saves after retry completes
            if (typeof window.walSheetzBlockchainAdapter.checkStaleFallbacks === 'function') {
              const staleFallbacks = window.walSheetzBlockchainAdapter.checkStaleFallbacks(7)
              if (staleFallbacks.length > 0) {
                logger.info(LogComponent.UI_COMPONENT, 'stale_fallbacks_found', 'Stale fallback saves found', {
                  count: staleFallbacks.length
                })

                // Emit event so UI can show cleanup modal
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('stale:fallbacks-found', {
                    detail: {
                      staleFallbacks,
                      timestamp: Date.now()
                    }
                  }))
                }
              }
            }
          }, 2000)
        }
      } catch (error) {
        logger.warn(LogComponent.UI_COMPONENT, 'fallback_init_error', 'Error initializing fallback retry', {
          error: (error as Error).message
        })
      }
    }

    initializeFallbackRetry()

    return () => {
      console.log('🔄 [FallbackMonitor] Cleanup')
      logger.info(LogComponent.UI_COMPONENT, 'fallback_monitor_unmount', 'FallbackMonitor unmounted')
    }
  }, [])

  // Listen for stale fallback detection event
  useEffect(() => {
    const handleStaleFallbacks = (event: CustomEvent) => {
      const { staleFallbacks: stale } = event.detail || {}
      if (stale && stale.length > 0) {
        setStaleFallbacks(stale)
        setShowCleanupModal(true)

        logger.info(LogComponent.UI_COMPONENT, 'stale_modal_triggered', 'Stale fallback cleanup modal triggered', {
          count: stale.length
        })
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('stale:fallbacks-found', handleStaleFallbacks as EventListener)
      return () => window.removeEventListener('stale:fallbacks-found', handleStaleFallbacks as EventListener)
    }
  }, [])

  // Handler to export fallback as JSON
  const handleExportFallback = async (key: string) => {
    try {
      if (window.walSheetzBlockchainAdapter?.exportFallbackAsJSON) {
        const json = window.walSheetzBlockchainAdapter.exportFallbackAsJSON(key)
        if (json) {
          // Download as file
          const blob = new Blob([json], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `fallback-backup-${Date.now()}.json`
          a.click()
          URL.revokeObjectURL(url)

          logger.info(LogComponent.UI_COMPONENT, 'fallback_exported', 'Fallback exported as JSON', { key })
        }
      }
    } catch (e) {
      logger.error(LogComponent.UI_COMPONENT, 'export_error', 'Error exporting fallback', {
        key,
        error: (e as Error).message
      })
    }
  }

  // Handler to delete stale fallbacks
  const handleDeleteFallbacks = (keys: string[]) => {
    try {
      if (window.walSheetzBlockchainAdapter?.deleteStaleFallbacks) {
        const result = window.walSheetzBlockchainAdapter.deleteStaleFallbacks(keys)
        if (result.success) {
          logger.info(LogComponent.UI_COMPONENT, 'stale_deleted', 'Stale fallbacks deleted', {
            count: keys.length
          })
        }
      }
      setShowCleanupModal(false)
      setStaleFallbacks([])
    } catch (e) {
      logger.error(LogComponent.UI_COMPONENT, 'delete_error', 'Error deleting fallbacks', {
        error: (e as Error).message
      })
    }
  }

  // Handler to keep fallbacks (dismiss modal)
  const handleKeepFallbacks = () => {
    logger.debug(LogComponent.UI_COMPONENT, 'stale_keep', 'User chose to keep stale fallbacks')
    setShowCleanupModal(false)
    setStaleFallbacks([])
  }

  return (
    <>
      {children}
      {showCleanupModal && (
        <StaleFallbackCleanupModal
          staleFallbacks={staleFallbacks}
          onConfirmDelete={handleDeleteFallbacks}
          onExport={handleExportFallback}
          onKeep={handleKeepFallbacks}
        />
      )}
    </>
  )
}

export default FallbackMonitor
