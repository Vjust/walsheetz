import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { WalletProviders } from '../providers/WalletProviders.jsx'
import { SpreadsheetProvider } from './components/SpreadsheetProvider.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { LogViewer } from './components/LogViewer.jsx'
import { WalrusStatus } from './components/WalrusStatus.jsx'
import RateLimiterStatus from '../components/RateLimiterStatus.jsx'
import { TestModeBanner } from './components/TestModeBanner.jsx'
import { Dashboard } from '../pages/Dashboard.jsx'
import { SpreadsheetEditor } from '../pages/SpreadsheetEditor.jsx'
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
        <Router>
          <WalletProviders defaultNetwork="testnet">
            <ErrorBoundary>
              <SpreadsheetProvider>
                <ErrorBoundary>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/index.html" element={<Navigate to="/" replace />} />
                    <Route path="/spreadsheet/:id" element={<SpreadsheetEditor />} />
                  </Routes>

                  {/* Global components */}
                  <TestModeBanner />
                  <LogViewer />
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
      </ErrorBoundary>
    </div>
  )
}

export default App