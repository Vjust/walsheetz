import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { NetworkProvider } from '../providers/NetworkProvider.jsx'
import { WalletProviders } from '../providers/WalletProviders.jsx'
import { SpreadsheetProvider } from './components/SpreadsheetProvider.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { WalrusStatus } from './components/WalrusStatus.jsx'
import { NetworkSelector, NetworkConfirmDialog } from './components/NetworkSelector.jsx'
import { NetworkMismatchWarning } from './components/NetworkMismatchWarning.jsx'
import RateLimiterStatus from '../components/RateLimiterStatus.jsx'
import { TestModeBanner } from './components/TestModeBanner.jsx'
import { SaveStatusBanner } from './components/SaveStatusBanner.jsx'
import { StaleFallbackCleanupModal } from './components/StaleFallbackCleanupModal.jsx'
import { Dashboard } from '../pages/Dashboard.jsx'
import { SpreadsheetEditor } from '../pages/SpreadsheetEditor.jsx'
import { BlobCatalog } from './pages/BlobCatalog.jsx'
import { SpreadsheetWorkspace } from './pages/SpreadsheetWorkspace.jsx'
import { ExploreTundra } from './pages/ExploreTundra.jsx'
import { logger, LogComponent } from '../utils/Logger.js'
import '../services/luckysheetApi.js' // Phase 0: Expose wrapper to window for console testing
import './styles/collaboration.css'

function App() {
  const showWalrusStatus = import.meta.env?.VITE_SHOW_WALRUS_STATUS === 'true'
  const showRateLimiterStatus =
    import.meta.env?.DEV || import.meta.env?.VITE_SHOW_RATE_LIMITER_STATUS === 'true'

  React.useEffect(() => {
    console.log('🚀 WalSheetz App component mounted');
    logger.info(LogComponent.UI_COMPONENT, 'app_mount', 'WalSheetz application started');

    // Initialize fallback retry system
    const initializeFallbackRetry = async () => {
      try {
        // Wait for BlockchainAdapter to be available
        let attempts = 0;
        while (!window.walSheetzBlockchainAdapter && attempts < 100) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }

        if (window.walSheetzBlockchainAdapter) {
          // Setup event listeners for manual retries
          if (typeof window.walSheetzBlockchainAdapter.setupRetryEventListeners === 'function') {
            window.walSheetzBlockchainAdapter.setupRetryEventListeners();
            logger.info(LogComponent.UI_COMPONENT, 'retry_listeners_setup', 'Fallback retry listeners initialized');
          }

          // Start auto-retry on startup (after 2 second delay for wallet connection)
          setTimeout(async () => {
            if (typeof window.walSheetzBlockchainAdapter.autoRetryFallbacksOnStartup === 'function') {
              try {
                await window.walSheetzBlockchainAdapter.autoRetryFallbacksOnStartup();
              } catch (e) {
                logger.warn(LogComponent.UI_COMPONENT, 'startup_retry_error', 'Error in startup retry', {
                  error: e.message
                });
              }
            }

            // Check for stale fallback saves after retry completes
            if (typeof window.walSheetzBlockchainAdapter.checkStaleFallbacks === 'function') {
              const staleFallbacks = window.walSheetzBlockchainAdapter.checkStaleFallbacks(7);
              if (staleFallbacks.length > 0) {
                logger.info(LogComponent.UI_COMPONENT, 'stale_fallbacks_found', 'Stale fallback saves found', {
                  count: staleFallbacks.length
                });

                // Emit event so UI can show cleanup modal
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('stale:fallbacks-found', {
                    detail: {
                      staleFallbacks,
                      timestamp: Date.now()
                    }
                  }));
                }
              }
            }
          }, 2000);
        }
      } catch (error) {
        logger.warn(LogComponent.UI_COMPONENT, 'fallback_init_error', 'Error initializing fallback retry', {
          error: error.message
        });
      }
    };

    initializeFallbackRetry();

    return () => {
      console.log('👋 WalSheetz App component unmounted');
      logger.info(LogComponent.UI_COMPONENT, 'app_unmount', 'WalSheetz application unmounted');
    };
  }, []);

  // State for stale fallback cleanup modal
  const [staleFallbacks, setStaleFallbacks] = useState([]);
  const [showCleanupModal, setShowCleanupModal] = useState(false);

  // Listen for stale fallback detection event
  useEffect(() => {
    const handleStaleFallbacks = (event) => {
      const { staleFallbacks: stale } = event.detail || {};
      if (stale && stale.length > 0) {
        setStaleFallbacks(stale);
        setShowCleanupModal(true);

        logger.info(LogComponent.UI_COMPONENT, 'stale_modal_triggered', 'Stale fallback cleanup modal triggered', {
          count: stale.length
        });
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('stale:fallbacks-found', handleStaleFallbacks);
      return () => window.removeEventListener('stale:fallbacks-found', handleStaleFallbacks);
    }
  }, []);

  // Handler to export fallback as JSON
  const handleExportFallback = async (key) => {
    try {
      if (window.walSheetzBlockchainAdapter?.exportFallbackAsJSON) {
        const json = window.walSheetzBlockchainAdapter.exportFallbackAsJSON(key);
        if (json) {
          // Download as file
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `fallback-backup-${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);

          logger.info(LogComponent.UI_COMPONENT, 'fallback_exported', 'Fallback exported as JSON', { key });
        }
      }
    } catch (e) {
      logger.error(LogComponent.UI_COMPONENT, 'export_error', 'Error exporting fallback', {
        key,
        error: e.message
      });
    }
  };

  // Handler to delete stale fallbacks
  const handleDeleteFallbacks = (keys) => {
    try {
      if (window.walSheetzBlockchainAdapter?.deleteStaleFallbacks) {
        const result = window.walSheetzBlockchainAdapter.deleteStaleFallbacks(keys);
        if (result.success) {
          logger.info(LogComponent.UI_COMPONENT, 'stale_deleted', 'Stale fallbacks deleted', {
            count: keys.length
          });
        }
      }
      setShowCleanupModal(false);
      setStaleFallbacks([]);
    } catch (e) {
      logger.error(LogComponent.UI_COMPONENT, 'delete_error', 'Error deleting fallbacks', {
        error: e.message
      });
    }
  };

  // Handler to keep fallbacks (dismiss modal)
  const handleKeepFallbacks = () => {
    logger.debug(LogComponent.UI_COMPONENT, 'stale_keep', 'User chose to keep stale fallbacks');
    setShowCleanupModal(false);
    setStaleFallbacks([]);
  };

  return (
    <div data-testid="walsheetz-app">
      <ErrorBoundary>
        <NetworkProvider>
          <Router>
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
                    <NetworkSelector position="top-left" />
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