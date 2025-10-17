import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { NetworkProvider } from '../providers/NetworkProvider.jsx'
import { WalletProviders } from '../providers/WalletProviders.jsx'
import { SpreadsheetProvider } from './components/SpreadsheetProvider.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { WalrusStatus } from './components/WalrusStatus.jsx'
import { NetworkSelector, NetworkConfirmDialog } from './components/NetworkSelector.jsx'
import { NetworkBanner } from './components/NetworkBanner.jsx'
import { NetworkMismatchWarning } from './components/NetworkMismatchWarning.jsx'
import RateLimiterStatus from '../components/RateLimiterStatus.jsx'
import { TestModeBanner } from './components/TestModeBanner.jsx'
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

    return () => {
      console.log('👋 WalSheetz App component unmounted');
      logger.info(LogComponent.UI_COMPONENT, 'app_unmount', 'WalSheetz application unmounted');
    };
  }, []);

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
                    <NetworkBanner />
                    <NetworkMismatchWarning />
                    <NetworkConfirmDialog />
                    <TestModeBanner />
                    {showWalrusStatus && (
                      <WalrusStatus position="bottom-right" minimized={true} />
                    )}
                    {showRateLimiterStatus && (
                      <RateLimiterStatus show={true} position="bottom-right" />
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