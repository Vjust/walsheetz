import React from 'react'
import { WalletProviders } from '../providers/WalletProviders.jsx'
import { SpreadsheetProvider } from './components/SpreadsheetProvider.jsx'
import { MainLayout } from './components/MainLayout.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { LogViewer } from './components/LogViewer.jsx'
import { WalrusStatus } from './components/WalrusStatus.jsx'
import RateLimiterStatus from '../components/RateLimiterStatus.jsx'
import { logger, LogComponent } from '../utils/Logger.js'
import './styles/collaboration.css'

function App() {
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
        <WalletProviders defaultNetwork="testnet">
          <ErrorBoundary>
            <SpreadsheetProvider>
              <ErrorBoundary>
                <MainLayout />
                <LogViewer />
                <WalrusStatus position="bottom-right" minimized={true} />
                {(import.meta.env?.DEV || import.meta.env?.VITE_SHOW_RATE_LIMITER_STATUS === 'true') && (
                  <RateLimiterStatus show={true} position="bottom-right" />
                )}
              </ErrorBoundary>
            </SpreadsheetProvider>
          </ErrorBoundary>
        </WalletProviders>
      </ErrorBoundary>
    </div>
  )
}

export default App