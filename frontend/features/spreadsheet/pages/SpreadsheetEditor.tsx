import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  useSpreadsheetContext,
  MainLayout,
  LoadingOverlay,
} from '@features/spreadsheet/components';
import { BreadcrumbNavigation } from '@features/dashboard/components/BreadcrumbNavigation';
import { useUnloadWarning } from '@shared/hooks/useUnloadWarning.js';
import { logger, LogComponent } from '@dreamlit/walrus';
import '../styles/spreadsheet-editor.css';

export function SpreadsheetEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [spreadsheetTitle, setSpreadsheetTitle] = useState('');
  const [connectingWallet, setConnectingWallet] = useState(false);
  const [isLocalSpreadsheet, setIsLocalSpreadsheet] = useState(false);

  const {
    walletConnected,
    connectWallet,
    loadSpreadsheet,
    spreadsheetData,
    getCurrentSpreadsheetId,
    initializeLocalSpreadsheet,
  } = useSpreadsheetContext();

  const [lastWalletState, setLastWalletState] = useState(walletConnected);

  // Load spreadsheet when component mounts or ID changes
  useEffect(() => {
    if (id) {
      loadSpreadsheetById(id);
    } else {
      // No ID provided, redirect to dashboard
      navigate('/');
    }
  }, [id, navigate]);

  // Auto-retry loading when wallet connects (for auto-connect scenarios)
  useEffect(() => {
    // Retry if wallet just became connected and we have an ID and either:
    // 1. There's an error (likely "wallet not connected")
    // 2. We don't have spreadsheet data yet (initial load may have failed silently)
    if (walletConnected && !lastWalletState && id && (error || !spreadsheetData)) {
      console.log('[SpreadsheetEditor] Wallet connected, retrying spreadsheet load...');
      loadSpreadsheetById(id);
    }
    setLastWalletState(walletConnected);
  }, [walletConnected, lastWalletState, id, error, spreadsheetData]);

  // Update title when spreadsheet data changes
  useEffect(() => {
    if (spreadsheetData) {
      const title =
        spreadsheetData?.data?.metadata?.title || spreadsheetData?.title || 'Untitled Spreadsheet';
      setSpreadsheetTitle(title);
    }
  }, [spreadsheetData]);

  // Show unload warning if there are unsaved edits
  // Checks if pendingEdits exist in SpreadsheetEngine or if spreadsheet is local-only
  const [hasPendingEdits, setHasPendingEdits] = useState(false);

  useEffect(() => {
    const checkPendingEdits = () => {
      try {
        if (typeof window !== 'undefined' && window.spreadsheetEngine) {
          const pendingEditsSize = window.spreadsheetEngine.pendingEdits?.size || 0;
          const currentId = getCurrentSpreadsheetId?.();
          const isLocal = !currentId || currentId === null;

          setIsLocalSpreadsheet(isLocal);
          setHasPendingEdits(pendingEditsSize > 0 || isLocal);
        }
      } catch (e) {
        // Silently ignore errors when checking for pending edits
        console.debug('[SpreadsheetEditor] Error checking pending edits:', e.message);
      }
    };

    // Check on mount
    checkPendingEdits();

    // Check periodically (every 500ms) to catch all edits
    const interval = setInterval(checkPendingEdits, 500);

    return () => clearInterval(interval);
  }, [getCurrentSpreadsheetId]);

  // Show warning when user tries to leave with unsaved edits
  useUnloadWarning(
    hasPendingEdits,
    isLocalSpreadsheet
      ? 'This spreadsheet has not been saved to blockchain yet. Your work will be lost if you leave.'
      : 'You have unsaved changes in your spreadsheet. Your edits will sync to blockchain when saved.'
  );

  const loadSpreadsheetById = async (spreadsheetId) => {
    // Detect local creation
    if (spreadsheetId.startsWith('local-')) {
      const { title, template } = location.state || { title: 'Untitled', template: 'blank' };

      setLoading(true);
      setError(null);

      logger.info(
        LogComponent.UI_COMPONENT,
        'editor_local_init',
        'Initializing local spreadsheet',
        {
          title,
          template,
        }
      );

      const result = await initializeLocalSpreadsheet({ title, template });

      if (result.success) {
        setSpreadsheetTitle(title);
        logger.info(
          LogComponent.UI_COMPONENT,
          'editor_local_success',
          'Local spreadsheet initialized'
        );
      } else {
        setError(result.error);
        logger.error(LogComponent.UI_COMPONENT, 'editor_local_error', 'Local init failed', {
          error: result.error,
        });
      }

      setLoading(false);
      return;
    }

    // Normal blockchain load path
    if (!loadSpreadsheet) {
      setError('Spreadsheet loading not available');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      logger.info(LogComponent.UI_COMPONENT, 'editor_load_start', 'Loading spreadsheet in editor', {
        spreadsheetId,
      });

      const result = await loadSpreadsheet(spreadsheetId);

      if (result.success) {
        setSpreadsheetTitle(result.title || 'Untitled Spreadsheet');
        // Track last opened for post-auth navigation
        localStorage.setItem('walsheetz_last_spreadsheet', spreadsheetId);
        logger.info(
          LogComponent.UI_COMPONENT,
          'editor_load_success',
          'Spreadsheet loaded successfully in editor',
          {
            spreadsheetId,
            title: result.title,
          }
        );
      } else {
        setError(result.error || 'Failed to load spreadsheet');
        logger.error(
          LogComponent.UI_COMPONENT,
          'editor_load_error',
          'Failed to load spreadsheet in editor',
          {
            spreadsheetId,
            error: result.error,
          }
        );
      }
    } catch (err) {
      setError(err.message || 'Failed to load spreadsheet');
      logger.error(
        LogComponent.UI_COMPONENT,
        'editor_load_exception',
        'Exception loading spreadsheet in editor',
        {
          spreadsheetId,
          error: err.message,
        }
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    if (id) {
      loadSpreadsheetById(id);
    }
  };

  const handleBackToDashboard = () => {
    logger.logUserAction('editor_back_to_dashboard', {
      spreadsheetId: id,
      title: spreadsheetTitle,
    });
    navigate('/');
  };

  const handleConnectWallet = async () => {
    try {
      setConnectingWallet(true);
      setError(null);
      logger.logUserAction('spreadsheet_editor_wallet_connect_attempt', {
        spreadsheetId: id,
      });

      const result = await connectWallet();

      if (result.success) {
        logger.info(
          LogComponent.UI_COMPONENT,
          'spreadsheet_editor_wallet_connect_success',
          'Wallet connected from spreadsheet editor',
          {
            walletAddress: result.wallet?.address,
            spreadsheetId: id,
          }
        );
        // Once connected, attempt to load the spreadsheet
        if (id) {
          loadSpreadsheetById(id);
        }
      } else {
        setError(`Failed to connect wallet: ${result.error}`);
        logger.error(
          LogComponent.UI_COMPONENT,
          'spreadsheet_editor_wallet_connect_error',
          'Failed to connect wallet from spreadsheet editor',
          {
            error: result.error,
            spreadsheetId: id,
          }
        );
      }
    } catch (error) {
      setError(`Error connecting wallet: ${error.message}`);
      logger.error(
        LogComponent.UI_COMPONENT,
        'spreadsheet_editor_wallet_connect_exception',
        'Exception connecting wallet from spreadsheet editor',
        {
          error: error.message,
          spreadsheetId: id,
        }
      );
    } finally {
      setConnectingWallet(false);
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Ctrl/Cmd + Home to go back to dashboard
      if ((event.ctrlKey || event.metaKey) && event.key === 'Home') {
        event.preventDefault();
        handleBackToDashboard();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  if (!walletConnected) {
    return (
      <div className="spreadsheet-editor">
        <div className="editor-header">
          <BreadcrumbNavigation items={[{ label: 'Dashboard', onClick: handleBackToDashboard }]} />
        </div>
        <div className="editor-content">
          <div className="wallet-required-message">
            <div className="message-content">
              <h2>Wallet Connection Required</h2>
              <p>Please connect your Sui wallet to access this spreadsheet</p>

              <div className="wallet-actions">
                <button
                  onClick={handleConnectWallet}
                  disabled={connectingWallet}
                  className={`connect-wallet-button primary ${connectingWallet ? 'loading' : ''}`}
                >
                  {connectingWallet ? <>Connecting...</> : <>Connect Slush Wallet</>}
                </button>
                <button onClick={handleBackToDashboard} className="back-button secondary">
                  ← Back to Dashboard
                </button>
              </div>

              {error && <div className="error-message">{error}</div>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="spreadsheet-editor">
        <LoadingOverlay
          isVisible={true}
          message="Loading spreadsheet..."
          details="Fetching data from blockchain..."
          type="blockchain"
          showProgress={false}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="spreadsheet-editor">
        <div className="editor-header">
          <BreadcrumbNavigation items={[{ label: 'Dashboard', onClick: handleBackToDashboard }]} />
        </div>
        <div className="editor-content">
          <div className="error-message">
            <div className="error-content">
              <h2>Failed to Load Spreadsheet</h2>
              <p className="error-details">{error}</p>
              <div className="error-actions">
                <button onClick={handleRetry} className="retry-button">
                  Try Again
                </button>
                <button onClick={handleBackToDashboard} className="back-button">
                  ← Back to Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="spreadsheet-editor">
      <div className="editor-header">
        <BreadcrumbNavigation
          items={[
            { label: 'Dashboard', onClick: handleBackToDashboard },
            { label: spreadsheetTitle, current: true },
          ]}
        />
      </div>

      <div className="editor-content">
        {/* Main layout with all components */}
        <MainLayout />
      </div>
    </div>
  );
}
