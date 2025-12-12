import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { NetworkProvider } from '@shared/providers/NetworkProvider.jsx'
import { WalletProviders } from '@shared/providers/WalletProviders.jsx'
import { SpreadsheetProvider, SaveStatusBanner } from '@features/spreadsheet/components'
import { ErrorBoundary } from '@shared/components/ErrorBoundary.jsx'
import { WalrusStatus } from '@shared/components/WalrusStatus.jsx'
import { NetworkConfirmDialog } from '@features/network/components/NetworkSelector.jsx'
import { NetworkMismatchWarning } from '@features/network/components/NetworkMismatchWarning.jsx'
import { NetworkRedirectHandler } from '@features/network/components/NetworkRedirectHandler.jsx'
import RateLimiterStatus from '@shared/ui/RateLimiterStatus.jsx'
import { TestModeBanner } from '@shared/components/TestModeBanner.jsx'
import { StaleFallbackCleanupModal } from '@shared/ui/modals/StaleFallbackCleanupModal.jsx'
import { Dashboard } from '@features/dashboard/pages/Dashboard.jsx'
import { SpreadsheetEditor } from '@features/spreadsheet/pages/SpreadsheetEditor.jsx'
import { BlobCatalog } from '@features/explore/pages/BlobCatalog.jsx'
import { SpreadsheetWorkspace } from '@features/spreadsheet/pages/SpreadsheetWorkspace.jsx'
import { ExploreTundra } from '@features/explore/pages/ExploreTundra.jsx'
import { useBlockchainAdapter } from '@lib/spreadsheet/contexts/BlockchainAdapterContext'
import { logger, LogComponent } from '../../packages/shared/src/utils/Logger.js'
import '../lib/spreadsheet/services/luckysheetApi.ts' // Phase 0: Expose wrapper to window for console testing
import './styles/collaboration.css'

function App() {
  const showWalrusStatus = import.meta.env?.VITE_SHOW_WALRUS_STATUS === 'true'
  const showRateLimiterStatus =
    import.meta.env?.DEV || import.meta.env?.VITE_SHOW_RATE_LIMITER_STATUS === 'true'

  const { adapter, isReady, setupRetryEventListeners, autoRetryFallbacksOnStartup, checkStaleFallbacks, staleFallbacks, setStaleFallbacks } = useBlockchainAdapter()

  useEffect(() => {
    logger.info(LogComponent.UI_COMPONENT, 'app_mount', 'WalSheetz application started')
    return () => {
      logger.info(LogComponent.UI_COMPONENT, 'app_unmount', 'WalSheetz application unmounted')
    }
  }, [])

  useEffect(() => {
    if (!isReady) return

    setupRetryEventListeners()
    const timeoutId = setTimeout(async () => {
      try {
        await autoRetryFallbacksOnStartup()
        const stale = checkStaleFallbacks(7)
        if (stale.length > 0) {
          setStaleFallbacks(stale)
        }
      } catch (error) {
        logger.warn(LogComponent.UI_COMPONENT, 'startup_retry_error', 'Error in startup retry', {
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }, 2000)

    return () => clearTimeout(timeoutId)
  }, [isReady, setupRetryEventListeners, autoRetryFallbacksOnStartup, checkStaleFallbacks, setStaleFallbacks])

  // State for stale fallback cleanup modal
  const [showCleanupModal, setShowCleanupModal] = useState(false);

  // Show cleanup modal when stale fallbacks are detected
  useEffect(() => {
    if (staleFallbacks && staleFallbacks.length > 0) {
      setShowCleanupModal(true);
      logger.info(LogComponent.UI_COMPONENT, 'stale_modal_triggered', 'Stale fallback cleanup modal triggered', {
        count: staleFallbacks.length
      });
    }
  }, [staleFallbacks]);

  // Handler to export fallback as JSON
  const handleExportFallback = async (key) => {
    try {
      if (adapter?.exportFallbackAsJSON) {
        const json = adapter.exportFallbackAsJSON(key)
        if (json) {
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
        error: e instanceof Error ? e.message : String(e)
      })
    }
  }

  // Handler to delete stale fallbacks
  const handleDeleteFallbacks = (keys) => {
    try {
      if (adapter?.deleteStaleFallbacks) {
        const result = adapter.deleteStaleFallbacks(keys)
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
        error: e instanceof Error ? e.message : String(e)
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
    <div data-testid="walsheetz-app">
      <ErrorBoundary>
        <NetworkProvider>
          <Router>
            <NetworkRedirectHandler />
            <WalletProviders>
              <ErrorBoundary>
                <SpreadsheetProvider>
                  <ErrorBoundary>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/index.html" element={<Navigate to="/" replace />} />
                      <Route path="/explore" element={<ExploreTundra />} />
                      <Route path="/spreadsheet/:id" element={<SpreadsheetEditor />} />
                      <Route path="/blobs" element={<BlobCatalog />} />
                      <Route path="/workspace" element={<SpreadsheetWorkspace />} />
                    </Routes>

                    {/* Global components */}
                    <NetworkMismatchWarning />
                    <NetworkConfirmDialog />
                    <TestModeBanner />
                    <SaveStatusBanner />
                    {showWalrusStatus && (
                      <WalrusStatus position="bottom-right" minimized={true} />
                    )}
                    {showRateLimiterStatus && (
                      <RateLimiterStatus show={true} position="bottom-right" />
                    )}
                    {showCleanupModal && (
                      <StaleFallbackCleanupModal
                        staleFallbacks={staleFallbacks}
                        onConfirmDelete={handleDeleteFallbacks}
                        onExport={handleExportFallback}
                        onKeep={handleKeepFallbacks}
                      />
                    )}
                  </ErrorBoundary>
                </SpreadsheetProvider>
              </ErrorBoundary>
            </WalletProviders>
          </Router>
        </NetworkProvider>
      </ErrorBoundary>
    </div>
  )
}

export default App