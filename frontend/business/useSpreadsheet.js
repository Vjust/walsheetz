import { useState, useEffect, useRef, useCallback } from 'react';
import { SpreadsheetEngine } from '../core/SpreadsheetEngine.js';
import { BlockchainAdapter } from '../adapters/BlockchainAdapter.js';
import { StorageAdapter } from '../adapters/StorageAdapter.js';
import { GridSizeManager } from '../services/GridSizeManager.js';
// WebSocket service disabled for single-user MVP
// import { webSocketService } from '../services/WebSocketService.js';
import { useWalletConnectionFactory } from '../hooks/useWalletConnectionFactory.ts';
import { browserWalletManager } from '../services/BrowserWalletManager.js';
import { parseCellRef } from '../utils/cellUtils.js';
import luckysheetApi from '../services/luckysheetApi.js';
import { TestModeAdapter } from '../services/testing/TestModeAdapter.js';
import { isAuthBypassed } from '../utils/testMode.js';
import { logger, LogComponent } from '../utils/Logger.js';
import { detectSaveVersionSignature } from '../utils/AbiHelpers.js';
// Phase 3: Extracted hooks for better separation of concerns
import { useSpreadsheetAutosave } from './hooks/useSpreadsheetAutosave.js';
import { useSpreadsheetImport } from './hooks/useSpreadsheetImport.js';

/**
 * React hook for spreadsheet business logic
 */
export function useSpreadsheet() {
  const [currentCell, setCurrentCell] = useState('A1');
  const [formulaValue, setFormulaValue] = useState('');
  const [editCount, setEditCount] = useState(0);
  const [saveStatus, setSaveStatus] = useState('ready'); // ready, saving, saved, error
  const [loadingState, setLoadingState] = useState({
    isLoading: false,
    message: '',
    details: ''
  });
  const [syncStatus, setSyncStatus] = useState(null);
  const [collaborationStatus, setCollaborationStatus] = useState({
    connected: false,
    users: [],
    lockedCells: []
  });
  const [spreadsheetCount, setSpreadsheetCount] = useState(0);
  const [spreadsheetData, setSpreadsheetData] = useState(null);
  const [walletSyncReady, setWalletSyncReady] = useState(false);
  const [lastSaveInfo, setLastSaveInfo] = useState(null); // Track metadata from last save (for UI confirmation)

  // Use the wallet connection factory (returns mock in test mode)
  const walletConnection = useWalletConnectionFactory();

  const engineRef = useRef(null);
  const blockchainRef = useRef(null);
  const storageRef = useRef(null);
  const gridSizeManagerRef = useRef(null);
  // WebSocket disabled for single-user MVP
  const webSocketRef = useRef(null);
  const servicesInitializedRef = useRef(false);
  const sessionRestorationAttemptedRef = useRef(false);
  const autoDiscoveryAttemptedRef = useRef(false);
  const saveToBlockchainRef = useRef(null);
  const loadingOperationRef = useRef(null); // Track ongoing load operations

  // Phase 3: Use extracted hooks for autosave and import functionality
  const autosave = useSpreadsheetAutosave({
    engineRef,
    storageRef,
    saveToBlockchainRef,
    walletConnected: walletConnection.isConnected
  });

  const importExport = useSpreadsheetImport({
    engineRef,
    storageRef,
    gridSizeManagerRef,
    setSpreadsheetData,
    setEditCount,
    setSaveStatus
  });
  
  // Auto-discover user's spreadsheets when wallet connects
  const autoDiscoverSpreadsheets = useCallback(async () => {
    // Skip auto-discovery in test mode
    if (isAuthBypassed()) return;

    if (!walletConnection.isConnected || !blockchainRef.current) return;

    try {
      const result = await blockchainRef.current.getUserSpreadsheets();
      
      if (result.success && result.spreadsheets.length > 0) {
        console.log(`🦭 WalSheetz: Found ${result.spreadsheets.length} spreadsheet(s) in your wallet!`);
        
        // Store spreadsheet count for UI notification
        setSpreadsheetCount(result.spreadsheets.length);
        
        // Optionally auto-load the most recent spreadsheet
        const mostRecent = result.spreadsheets[0];
        if (mostRecent) {
          console.log(`📊 Most recent spreadsheet: "${mostRecent.title}" (${new Date(mostRecent.last_modified).toLocaleDateString()})`);
        }
      }
    } catch (error) {
      console.warn('Failed to auto-discover spreadsheets:', typeof error === 'string' ? error : error.message || 'Unknown error');
    }
  }, [walletConnection.isConnected]);

  // Check for session restoration after wallet connects
  const checkSessionRestoration = useCallback(async () => {
    if (!storageRef.current || !walletConnection.isConnected) return;

    // Prevent concurrent session restoration
    if (loadingOperationRef.current) {
      console.log('⚠️ Load operation in progress, skipping session restoration');
      return;
    }

    // Validate and clean session data first
    const sessionValid = storageRef.current.validateAndCleanSession();
    if (!sessionValid) {
      console.log('🧹 Session validation failed, skipping restoration');
      return;
    }

    const sessionInfo = storageRef.current.getSessionInfo();
    
    // Check if we have a valid session to restore
    if (sessionInfo.hasSpreadsheet && sessionInfo.hasWalletAddress) {
      const storedWallet = storageRef.current.getWalletAddress();
      
      // Only restore if the connected wallet matches the session
      if (storedWallet === walletConnection.address) {
        console.log('🔄 WalSheetz: Attempting to restore previous session...', {
          spreadsheetId: storageRef.current.getCurrentSpreadsheetId(),
          title: sessionInfo.spreadsheetTitle,
          lastSave: sessionInfo.lastSaveTimestamp ? new Date(sessionInfo.lastSaveTimestamp).toLocaleString() : 'Unknown'
        });
        
        setLoadingState({
          isLoading: true,
          message: 'Restoring your spreadsheet...',
          details: 'Loading from blockchain storage...'
        });
        setSaveStatus('loading');

        // Mark session restoration as ongoing operation
        const spreadsheetId = storageRef.current.getCurrentSpreadsheetId();
        loadingOperationRef.current = `session-${spreadsheetId}`;

        try {
          if (spreadsheetId && blockchainRef.current && engineRef.current) {
            // Set up session restoration timeout
            const restorationTimeout = setTimeout(() => {
              console.warn('⚠️ Session restoration taking too long, clearing state');
              setLoadingState({ isLoading: false, message: '', details: '' });
              setSaveStatus('error');
              storageRef.current.clearSession();
              loadingOperationRef.current = null; // Clear operation on timeout
            }, 15000); // 15 second timeout for restoration

            try {
              // Enhanced session restoration guards
              const sessionGuards = {
                maxRetries: 2,
                retryDelay: 2000,
                currentAttempt: 0
              };

              // Check wallet connection stability before restoration
              if (!walletConnection.isConnected || !walletConnection.address) {
                throw new Error('Wallet connection unstable during restoration');
              }

              // Check blockchain service health
              if (!blockchainRef.current || typeof blockchainRef.current.loadSpreadsheet !== 'function') {
                throw new Error('Blockchain service not ready for restoration');
              }

              // Inline implementation instead of calling loadSpreadsheet to avoid dependency issues
              const onProgress = (message, details) => {
                setLoadingState(prev => ({ ...prev, message, details }));
              };

              let result = null;
              let lastError = null;

              // Retry logic with exponential backoff for session restoration
              for (let attempt = 0; attempt <= sessionGuards.maxRetries; attempt++) {
                try {
                  if (attempt > 0) {
                    console.log(`🔄 Session restoration retry ${attempt}/${sessionGuards.maxRetries} after ${sessionGuards.retryDelay}ms`);
                    await new Promise(resolve => setTimeout(resolve, sessionGuards.retryDelay * attempt));

                    // Re-verify wallet connection before retry
                    if (!walletConnection.isConnected) {
                      throw new Error('Wallet disconnected during restoration retry');
                    }
                  }

                  // Add progress indicator for restoration attempt
                  onProgress(`Loading spreadsheet (attempt ${attempt + 1}/${sessionGuards.maxRetries + 1})...`, 'Restoring from blockchain');

                  result = await blockchainRef.current.loadSpreadsheet(spreadsheetId, onProgress);

                  if (result && result.success) {
                    console.log(`✅ Session restoration successful on attempt ${attempt + 1}`);
                    break;
                  } else if (result && result.error) {
                    lastError = new Error(`Load failed: ${result.error}`);
                    if (attempt === sessionGuards.maxRetries) {
                      throw lastError;
                    }
                    console.warn(`⚠️ Session restoration attempt ${attempt + 1} failed:`, result.error);
                  }
                } catch (attemptError) {
                  lastError = attemptError;
                  console.warn(`⚠️ Session restoration attempt ${attempt + 1} error:`, attemptError.message);

                  // Don't retry on certain critical errors
                  if (attemptError.message.includes('Wallet disconnected') ||
                      attemptError.message.includes('not ready') ||
                      attemptError.message.includes('not found') ||
                      attemptError.message.includes('channel closed')) {
                    console.warn('💥 Non-retryable error detected, aborting retries:', {
                      error: attemptError.message,
                      isWalletIssue: attemptError.message.includes('Wallet'),
                      isNotFoundIssue: attemptError.message.includes('not found')
                    });
                    break;
                  }

                  if (attempt === sessionGuards.maxRetries) {
                    throw lastError;
                  }
                }
              }

              if (!result || !result.success) {
                throw lastError || new Error('Session restoration failed after all attempts');
              }

              clearTimeout(restorationTimeout);

              // Session restoration was successful, process the result
              let uiTitle =
                result.data?.data?.metadata?.title ||
                result.data?.title || null;

              if (result.metadata?.isEmpty) {
                console.warn('⚠️ Session restoration: chain empty; keeping restored/local data');
                try {
                  const list = await blockchainRef.current.getUserSpreadsheets();
                  if (list.success) {
                    const found = list.spreadsheets.find(s => s.objectId === spreadsheetId);
                    if (found?.title) uiTitle = found.title;
                  }
                } catch {}

                // do NOT call engine.loadData; keep the grid as-is
              } else {
                // Additional error boundary for engine data loading
                try {
                  await engineRef.current.loadData(result.data);
                  setSpreadsheetData(result.data);
                } catch (engineError) {
                  console.warn('⚠️ Engine data loading failed during session restoration:', engineError.message);
                  // Continue with session restoration even if engine loading fails
                  // The user can manually refresh or reload if needed
                }
              }

              // session/meta with additional error boundaries
              try {
                const titleForSession = uiTitle || 'Restored Spreadsheet';
                storageRef.current.setSpreadsheetTitle(titleForSession);
                if (result.metadata?.version?.walrus_blob_id) {
                  storageRef.current.setLastWalrusBlobId(result.metadata.version.walrus_blob_id);
                }
              } catch (metaError) {
                console.warn('⚠️ Session metadata update failed:', metaError.message);
                // Continue restoration without metadata
              }

              // Update sync status inline with error boundary
              try {
                if (blockchainRef.current) {
                  setSyncStatus({
                    lastSync: Date.now(),
                    pendingChanges: 0,
                    isConnected: blockchainRef.current.isWalletConnected(),
                    grpcConnected: blockchainRef.current.syncStatus?.grpcConnected || false,
                    collaborationEnabled: blockchainRef.current.syncStatus?.collaborationEnabled || false
                  });
                }
              } catch (syncError) {
                console.warn('⚠️ Sync status update failed during restoration:', syncError.message);
                // Continue without sync status update
              }

              console.log('✅ WalSheetz: Session restored successfully with enhanced error boundaries!');
              setLoadingState({ isLoading: false, message: '', details: '' });
              setSaveStatus('saved');
              loadingOperationRef.current = null; // Clear operation on success
            } catch (restorationError) {
              clearTimeout(restorationTimeout);
              console.warn('⚠️ WalSheetz: Error during session restoration:', restorationError.message);
              storageRef.current.clearSession();
              setLoadingState({ isLoading: false, message: '', details: '' });
              setSaveStatus('ready');
              loadingOperationRef.current = null; // Clear operation on error
            }
          }
        } catch (error) {
          console.warn('⚠️ WalSheetz: Failed to restore session:', typeof error === 'string' ? error : error.message || 'Unknown error');
          storageRef.current.clearSession();
          setLoadingState({ isLoading: false, message: '', details: '' });
          setSaveStatus('ready');
          loadingOperationRef.current = null; // Clear operation on failure
        }
      } else {
        // Different wallet connected, clear old session
        console.log('🔄 WalSheetz: Different wallet detected, clearing old session');
        storageRef.current.clearSession();
      }
    }
  }, [walletConnection.isConnected, walletConnection.address]);

  // Update sync status
  const updateSyncStatus = useCallback(() => {
    if (blockchainRef.current) {
      const status = blockchainRef.current.getSyncStatus();
      setSyncStatus(status);
    }
  }, []);

  // Start save reminder monitoring
  // Phase 3: Autosave functions now handled by useSpreadsheetAutosave hook
  // Expose them directly from the hook for backward compatibility
  const {
    startSaveReminderMonitoring,
    dismissSaveReminder,
    toggleAutoSave,
    startAutoSaveLoop,
    stopAutoSaveLoop
  } = autosave;

  // Sync wallet connection with browserWalletManager and handle session restoration
  useEffect(() => {
    browserWalletManager.setWalletConnection(walletConnection);

    // Mark wallet sync as ready now that browserWalletManager has been updated
    // This ensures BlockchainAdapter can access the wallet connection
    if (walletConnection.isConnected && walletConnection.address) {
      setWalletSyncReady(true);
    } else {
      setWalletSyncReady(false);
    }

    // Skip operations during auto-connect phase to prevent race conditions
    if (walletConnection.isAutoConnecting) {
      console.log('[useSpreadsheet] Wallet auto-connecting, skipping initialization...');
      return;
    }

    if (walletConnection.isConnected && walletConnection.address) {
      // Update session with current wallet address
      if (storageRef.current) {
        storageRef.current.setWalletAddress(walletConnection.address);
      }

      // Start auto-save if enabled
      if (autosave.autoSaveEnabled) { // Phase 3: Get from hook
        startAutoSaveLoop();
      }

      // Auto-discover spreadsheets only once per session
      if (!autoDiscoveryAttemptedRef.current) {
        autoDiscoveryAttemptedRef.current = true;
        autoDiscoverSpreadsheets();
      }

      // Check for session restoration only once after initialization
      if (engineRef.current && blockchainRef.current && !sessionRestorationAttemptedRef.current) {
        sessionRestorationAttemptedRef.current = true;
        checkSessionRestoration();
      }
    } else if (!walletConnection.isConnected) {
      // Stop auto-save when wallet disconnects
      stopAutoSaveLoop();

      // Clear session if wallet disconnected
      if (storageRef.current) {
        storageRef.current.clearSession();
      }
      // Reset flags when wallet disconnects
      sessionRestorationAttemptedRef.current = false;
      autoDiscoveryAttemptedRef.current = false;
    }
  }, [walletConnection.isConnected, walletConnection.isAutoConnecting, walletConnection.address, autosave.autoSaveEnabled, autoDiscoverSpreadsheets, checkSessionRestoration, startAutoSaveLoop, stopAutoSaveLoop]);

  // Initialize services
  useEffect(() => {
    const initializeServices = async () => {
      // Prevent multiple initialization attempts
      if (servicesInitializedRef.current) {
        console.log('🔄 Services already initialized, skipping...');
        return;
      }

      console.log('🚀 Starting service initialization process...');

      // Set up initialization timeout to prevent infinite loading
      const initializationTimeout = setTimeout(() => {
        console.warn('⚠️ Initialization taking too long (>10s), clearing loading state');
        setLoadingState({ isLoading: false, message: '', details: '' });
        setSaveStatus('error');
      }, 10000); // 10 second timeout

      try {
        console.log('📊 Initializing core services...');
        servicesInitializedRef.current = true;

        // Create service instances
        console.log('📦 Creating StorageAdapter...');
        storageRef.current = new StorageAdapter();

        console.log('⛓️ Creating BlockchainAdapter...');
        // Use TestModeAdapter in test mode, otherwise use real BlockchainAdapter
        if (isAuthBypassed()) {
          console.log('🧪 Test Mode: Using TestModeAdapter');
          blockchainRef.current = new TestModeAdapter(storageRef.current);
        } else {
          blockchainRef.current = new BlockchainAdapter(storageRef.current);
        }

        console.log('📐 Creating GridSizeManager...');
        gridSizeManagerRef.current = new GridSizeManager();

        console.log('🧮 Creating SpreadsheetEngine...');
        engineRef.current = new SpreadsheetEngine(
          storageRef.current,
          blockchainRef.current,
          autosave.autoSaveEnabled, // Phase 3: Get from hook
          gridSizeManagerRef.current
        );

        // Initialize engine
        console.log('🔧 Initializing SpreadsheetEngine...');
        const result = await engineRef.current.initialize();

        if (result.success) {
          console.log('✅ Spreadsheet engine initialized successfully');
          // NEW: propagate restored data to UI immediately
          if (result.data) {
            // Attempt immediate load (may run before Luckysheet is ready)
            try { await engineRef.current.loadData(result.data) } catch {}
            setSpreadsheetData(result.data);
            // Ensure refresh after Luckysheet finishes init
            setTimeout(() => {
              try { engineRef.current?.loadData?.(result.data) } catch {}
            }, 300)
            try {
              const restoredTitle = result.data?.data?.metadata?.title || result.data?.title || null;
              if (restoredTitle && storageRef.current?.setSpreadsheetTitle) {
                storageRef.current.setSpreadsheetTitle(restoredTitle);
              }
            } catch {}
          }
        } else {
          console.error('❌ Failed to initialize spreadsheet engine:', result.error);
        }

        // Wallet auto-reconnect is handled by dapp-kit's autoConnect

        // Update initial sync status
        console.log('📡 Updating sync status...');
        updateSyncStatus();

        // Load auto-save preference from storage
        if (storageRef.current) {
          const autoSavePref = storageRef.current.getAutoSaveEnabled();
          autosave.toggleAutoSave(autoSavePref); // Phase 3: Use hook function
        }

        // Start save reminder checking
        startSaveReminderMonitoring();

        // Proactive ABI detection to catch config mismatches early
        try {
          console.log('🔍 Running proactive ABI detection for save_version...');
          const sig = await detectSaveVersionSignature();

          if (sig.debug?.reason === 'abi_missing_function' || sig.debug?.reason === 'detection_error') {
            console.warn('[useSpreadsheet] ⚠️ ABI detection used fallback - ensure config flags match deployed contract');
            console.warn('[useSpreadsheet] Detected signature:', {
              expectsContentHash: sig.expectsContentHash,
              expectsClock: sig.expectsClock,
              reason: sig.debug?.reason,
              error: sig.debug?.error
            });
          } else {
            console.log('[useSpreadsheet] ✅ ABI detection successful:', {
              expectsContentHash: sig.expectsContentHash,
              expectsClock: sig.expectsClock,
              paramCount: sig.params.length
            });
          }
        } catch (error) {
          console.error('[useSpreadsheet] ❌ Proactive ABI detection failed:', error.message);
          console.warn('[useSpreadsheet] This may indicate RPC connectivity issues - transactions may fail if config is incorrect');
        }

        // Clear timeout on successful initialization
        clearTimeout(initializationTimeout);
        console.log('🎉 Service initialization completed successfully!');
      } catch (error) {
        console.error('❌ Failed to initialize services:', {
          error: typeof error === 'string' ? error : error.message || 'Unknown error',
          stack: error.stack
        });
        servicesInitializedRef.current = false; // Reset on failure
        clearTimeout(initializationTimeout);
        setLoadingState({ isLoading: false, message: '', details: '' });
        setSaveStatus('error');
      }
    };

    initializeServices();

    // Cleanup on unmount
    return () => {
      if (engineRef.current) {
        engineRef.current.cleanup();
      }
      // Phase 3: Cleanup autosave intervals via hook
      autosave.cleanup();
      // Don't reset servicesInitializedRef here as we want to keep services alive
    };
  }, [updateSyncStatus]);

  // Update wallet status (no longer needed - using hook directly)
  const updateWalletStatus = useCallback(() => {
    // Status is now managed by the wallet connection hook
  }, []);

  // Handle cell edit
  const handleCellEdit = useCallback((row, col, oldValue, newValue) => {
    console.debug('🔧 useSpreadsheet.handleCellEdit called with:', {
      row,
      col,
      rowType: typeof row,
      colType: typeof col,
      oldValue,
      newValue,
      hasEngine: !!engineRef.current,
      callStack: new Error().stack?.split('\n').slice(1, 4).join('\n')
    });

    if (!engineRef.current) {
      console.error('🚨 useSpreadsheet.handleCellEdit: Engine not initialized');
      return { success: false, error: 'Engine not initialized' };
    }

    // Validate arguments - row and col cannot be null or undefined
    if (row === null || row === undefined) {
      console.error('🚨 useSpreadsheet.handleCellEdit: row is null or undefined', { row, col, oldValue, newValue });
      return { success: false, error: 'Arguments row cannot be null or undefined' };
    }

    if (col === null || col === undefined) {
      console.error('🚨 useSpreadsheet.handleCellEdit: col is null or undefined', { row, col, oldValue, newValue });
      return { success: false, error: 'Arguments column cannot be null or undefined' };
    }

    // Additional validation for numeric values
    if (typeof row !== 'number' || row < 0) {
      console.error('🚨 useSpreadsheet.handleCellEdit: invalid row value', { row, col, oldValue, newValue });
      return { success: false, error: 'Row must be a non-negative number' };
    }

    if (typeof col !== 'number' || col < 0) {
      console.error('🚨 useSpreadsheet.handleCellEdit: invalid col value', { row, col, oldValue, newValue });
      return { success: false, error: 'Column must be a non-negative number' };
    }

    const result = engineRef.current.handleCellEdit(row, col, oldValue, newValue);
    
    console.debug('🔧 useSpreadsheet.handleCellEdit result:', result);
    
    if (result.success) {
      setCurrentCell(result.cellRef);
      setEditCount(result.editCount);
      updateSyncStatus();
    } else {
      // Handle cell lock conflict
      console.warn('Cell edit blocked:', result.error);
    }
    
    return result;
  }, [updateSyncStatus]);

  // Handle cell selection
  const handleCellSelect = useCallback((row, col) => {
    if (!engineRef.current) return;

    const result = engineRef.current.handleCellSelect(row, col);
    setCurrentCell(result.cellRef);
    
    return result;
  }, []);

  // Handle cell blur (stop editing)
  const handleCellBlur = useCallback(() => {
    if (!engineRef.current) return;

    engineRef.current.handleCellBlur();
  }, []);

  // Handle formula change - called by Luckysheet events
  const handleFormulaChange = useCallback((value) => {
    setFormulaValue(value);
  }, []);

  // Clear formula preview when selection changes
  const clearFormulaPreview = useCallback(() => {
    // Reset formula value when changing cells
    // Luckysheet manages its own editor state, we just track it
    setFormulaValue('');
  }, []);

  // Connect Slush wallet (simplified for single wallet support)
  const connectWallet = useCallback(async () => {
    try {
      console.log('[useSpreadsheet] Initiating Slush wallet connection...');
      
      // Get available Slush wallets
      const { installed } = walletConnection.availableWallets;
      
      if (installed.length === 0) {
        return { 
          success: false, 
          error: 'Slush wallet not installed. Please install Slush wallet from the Chrome Web Store.' 
        };
      }
      
      // Use the first (and only supported) Slush wallet
      const slushWallet = installed[0];
      
      console.log('[useSpreadsheet] Connecting to Slush wallet:', slushWallet.name);
      
      console.log('[useSpreadsheet] Slush wallet connection initiated, waiting for approval...');

      // FIXED: Use the Promise returned by walletConnection.connectWallet directly
      // instead of polling in a closure that captures stale values
      return walletConnection.connectWallet(slushWallet)
        .then(() => {
          console.log('[useSpreadsheet] ✅ Slush wallet connected successfully!');
          updateSyncStatus();
          return {
            success: true,
            wallet: {
              address: walletConnection.currentAccount?.address,
              balance: walletConnection.balance,
              name: 'Slush'
            }
          };
        })
        .catch((error) => {
          console.error('[useSpreadsheet] ❌ Slush wallet connection failed:', error);
          return {
            success: false,
            error: error.message || 'Failed to connect wallet'
          };
        });
    } catch (error) {
      console.error('[useSpreadsheet] Failed to connect Slush wallet:', error);
      return { success: false, error: typeof error === 'string' ? error : error.message || 'Unknown error' };
    }
  }, [walletConnection, updateSyncStatus]);

  // Disconnect wallet
  const disconnectWallet = useCallback(async () => {
    try {
      walletConnection.disconnectWallet();
      updateSyncStatus();
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  }, [walletConnection, updateSyncStatus]);

  // Get Walrus epoch preference for current spreadsheet
  const getWalrusEpochPreference = useCallback(() => {
    if (!storageRef.current) return null;
    const spreadsheetId = storageRef.current.getCurrentSpreadsheetId();
    if (!spreadsheetId) return null;

    const preference = storageRef.current.getWalrusEpochPreference(spreadsheetId);
    if (preference) return preference;

    // Fallback to config default if no preference set
    // Just return 50 as default - config is already loaded globally
    return 50;
  }, []);

  // Set Walrus epoch preference for current spreadsheet
  const setWalrusEpochPreference = useCallback(async (epochs) => {
    if (!storageRef.current) {
      return { success: false, error: 'Storage not initialized' };
    }

    const spreadsheetId = storageRef.current.getCurrentSpreadsheetId();
    if (!spreadsheetId) {
      return { success: false, error: 'No spreadsheet loaded' };
    }

    try {
      const success = storageRef.current.setWalrusEpochPreference(spreadsheetId, epochs);

      if (success) {
        console.log(`[useSpreadsheet] Walrus epoch preference saved for spreadsheet: ${epochs} epochs`);
        return { success: true };
      } else {
        return { success: false, error: 'Failed to save preference' };
      }
    } catch (error) {
      console.error('[useSpreadsheet] Error saving epoch preference:', error);
      return { success: false, error: typeof error === 'string' ? error : error.message || 'Unknown error' };
    }
  }, []);

  // Save to blockchain
  const saveToBlockchain = useCallback(async (title = null, epochs = null) => {
    if (!engineRef.current || !blockchainRef.current) {
      return { success: false, error: 'Engine not initialized' };
    }

    // Check for fallback config and warn user
    const config = await blockchainRef.current.configLoader?.getConfig?.();
    if (config?.isFallback) {
      logger.warn(LogComponent.BUSINESS_LOGIC, 'fallback_config_in_use', 'Using fallback config - endpoints may be stale');

      // Block save if critical fields are missing from fallback config
      const requiredFields = ['packageId', 'registryObjectId'];
      const networkConfig = config.getCurrentNetwork?.();
      const missingFields = requiredFields.filter(field => !networkConfig?.[field]);

      if (missingFields.length > 0) {
        const errorMsg = `Cannot save: fallback configuration is missing critical fields (${missingFields.join(', ')}). Please check your network configuration.`;
        setLoadingState({
          isLoading: false,
          message: 'Configuration Error',
          details: errorMsg,
          type: 'error',
          errorType: 'config_failed'
        });

        logger.error(LogComponent.BUSINESS_LOGIC, 'config_missing_fields', 'Fallback config missing critical fields', {
          missingFields,
          availableFields: Object.keys(networkConfig || {})
        });

        return { success: false, error: errorMsg, stage: 'config' };
      }
    }

    // Detect first save (local spreadsheet with no blockchain ID)
    const currentId = storageRef.current?.getCurrentSpreadsheetId();
    const isFirstSave = !currentId;

    if (isFirstSave) {
      // First save: publish to blockchain
      setLoadingState({
        isLoading: true,
        message: 'Publishing spreadsheet to blockchain...',
        details: 'Creating your first save...',
        type: 'blockchain',
        steps: ['Preparing data', 'Storing to Walrus', 'Creating blockchain record', 'Confirming'],
        currentStep: 0,
        showProgress: true
      });

      try {
        setSaveStatus('saving');

        // NEW: Preflight - Check Walrus health before expensive operations
        logger.info(LogComponent.BUSINESS_LOGIC, 'first_save_preflight', 'Checking Walrus health before first save');
        logger.info(LogComponent.BUSINESS_LOGIC, 'telemetry:stage', 'Starting walrus_store stage for first save');

        const walrusHealth = await blockchainRef.current.checkWalrusHealth?.();
        if (walrusHealth && !walrusHealth.ok) {
          const errorMsg = walrusHealth.error || 'Walrus storage unavailable';

          // Log degraded mode but continue with single attempt instead of aborting
          logger.warn(LogComponent.BUSINESS_LOGIC, 'walrus_degraded_mode',
            'Walrus health check failed - attempting save in degraded mode', {
            health: walrusHealth,
            publisherAvailable: walrusHealth.publisherAvailable,
            aggregatorAvailable: walrusHealth.aggregatorAvailable,
            willRetry: false
          });

          // Show warning banner instead of error - let save attempt continue
          setLoadingState({
            isLoading: true,
            message: 'Storage Health Warning',
            details: 'Decentralized storage may be temporarily unavailable. Attempting save...',
            type: 'warning'
          });

          // Continue to createNewSpreadsheetOptimized - let it fail gracefully if Walrus is truly unavailable
          // Don't return early - fall through to the save attempt below
        }

        logger.info(LogComponent.BUSINESS_LOGIC, 'walrus_health_check_complete', 'Walrus health check complete, proceeding with first save');

        // Get spreadsheet title first
        const spreadsheetTitle = title || storageRef.current.getSpreadsheetTitle() || 'Untitled';

        // Get current data from engine
        console.log('🔍 [First Save] Collecting data from engine...');
        let currentData;
        try {
          // collectSpreadsheetData is a synchronous method that gathers current spreadsheet state
          currentData = engineRef.current.collectSpreadsheetData(spreadsheetTitle);
          console.log('🔍 [First Save] Data collected successfully, size:', JSON.stringify(currentData).length);
        } catch (dataCollectionError) {
          console.error('❌ [First Save] collectSpreadsheetData failed:', dataCollectionError);
          throw new Error(`Failed to collect spreadsheet data: ${dataCollectionError?.message || String(dataCollectionError)}`);
        }

        logger.info(LogComponent.BUSINESS_LOGIC, 'first_save_start', 'Publishing local spreadsheet', {
          title: spreadsheetTitle,
          dataSize: JSON.stringify(currentData).length,
          hasBlockchainAdapter: !!blockchainRef.current
        });

        console.log('🔍 [First Save] Starting with:', {
          title: spreadsheetTitle,
          dataSize: JSON.stringify(currentData).length,
          hasEngine: !!engineRef.current,
          hasBlockchainAdapter: !!blockchainRef.current
        });

        // Progress updates
        setLoadingState(prev => ({ ...prev, currentStep: 1 }));

        // Log before blockchain operation
        console.log('🔍 [First Save] About to call createNewSpreadsheetOptimized with:', {
          spreadsheetTitle,
          currentDataSize: JSON.stringify(currentData).length,
          hasBlockchainAdapter: !!blockchainRef.current,
          adapterType: blockchainRef.current?.constructor?.name
        });

        // Create spreadsheet with current data
        const result = await blockchainRef.current.createNewSpreadsheetOptimized(
          spreadsheetTitle,
          currentData
        );

        console.log('🔍 [First Save] createNewSpreadsheetOptimized returned:', {
          success: result?.success,
          hasSpreadsheetId: !!result?.spreadsheetId,
          hasBlobId: !!result?.walrusBlobId,
          resultKeys: result ? Object.keys(result) : []
        });

        if (result.success) {
          // Telemetry for successful save stages
          logger.info(LogComponent.BUSINESS_LOGIC, 'telemetry:stage', 'walrus_store completed', {
            blobId: result.walrusBlobId,
            size: result.data ? JSON.stringify(result.data).length : 0
          });

          logger.info(LogComponent.BUSINESS_LOGIC, 'telemetry:stage', 'create_tx and save_tx completed', {
            spreadsheetId: result.spreadsheetId,
            transactionDigest: result.transactionDigest
          });

          // Capture save metadata for UI confirmation (matching normal save flow)
          if (result.saveInfo) {
            setLastSaveInfo(result.saveInfo);
          }

          // Update session with real blockchain ID
          storageRef.current.setCurrentSpreadsheetId(result.spreadsheetId);
          if (result.walrusBlobId) {
            storageRef.current.setLastWalrusBlobId(result.walrusBlobId);
          }

          // Try to get and persist latest version metadata
          try {
            if (blockchainRef.current?.suiService?.getLatestVersionMetadata) {
              const versionMetadata = await blockchainRef.current.suiService.getLatestVersionMetadata(result.spreadsheetId);
              if (versionMetadata && storageRef.current?.setVersionMetadata) {
                storageRef.current.setVersionMetadata(versionMetadata);
                logger.info(LogComponent.BUSINESS_LOGIC, 'version_metadata_persisted', 'Version metadata saved for Save Details modal', {
                  version: versionMetadata.version,
                  digest: versionMetadata.transactionDigest
                });
              }
            }
          } catch (e) {
            logger.warn(LogComponent.BUSINESS_LOGIC, 'version_metadata_failed', 'Could not fetch version metadata', {
              error: typeof e === 'string' ? e : e?.message
            });
          }

          // Replace URL if currently showing local ID
          const currentPath = window.location.pathname;
          if (currentPath.includes('/spreadsheet/local-')) {
            const newPath = `/spreadsheet/${result.spreadsheetId}`;
            window.history.replaceState({}, '', newPath);
            logger.info(LogComponent.BUSINESS_LOGIC, 'url_replaced', 'Updated URL', {
              from: currentPath,
              to: newPath
            });
          }

          setLoadingState(prev => ({ ...prev, currentStep: 3, message: 'Published successfully!' }));
          setSaveStatus('saved');
          setEditCount(0);

          setTimeout(() => {
            setLoadingState({ isLoading: false, message: '', details: '' });
          }, 1000);

          setTimeout(() => setSaveStatus('ready'), 2000);

          logger.info(LogComponent.BUSINESS_LOGIC, 'first_save_success', 'Spreadsheet published', {
            spreadsheetId: result.spreadsheetId,
            blobId: result.walrusBlobId,
            transactionDigest: result.transactionDigest
          });

          return { success: true, ...result, isFirstSave: true };
        } else {
          // Keep editor open on error with detailed message
          const errorMessage = result.error || result.message || 'Unknown error occurred';
          const errorDetails = result.technical || result.details || '';
          const errorStage = result.stage || 'unknown';

          // Map error stage to descriptive error type
          let errorType = 'first_save_failed';
          if (errorStage === 'walrus') {
            errorType = 'walrus_unavailable';
          } else if (errorStage === 'createTx') {
            errorType = 'wallet_required';
          } else if (errorStage === 'config') {
            errorType = 'config_failed';
          }

          logger.error(LogComponent.BUSINESS_LOGIC, 'first_save_failed', 'First save failed', {
            error: errorMessage,
            details: errorDetails,
            stage: errorStage,
            errorType: errorType,
            fullResult: result,
            resultKeys: result ? Object.keys(result) : [],
            technical: result?.technical,
            preflight: result?.preflight,
            hasBlockchainAdapter: !!blockchainRef.current,
            hasEngine: !!engineRef.current,
            blobId: result?.blobId
          });

          console.error('❌ [First Save] Failed:', {
            error: errorMessage,
            details: errorDetails,
            stage: errorStage,
            errorType: errorType,
            fullResult: result,
            resultKeys: result ? Object.keys(result) : [],
            resultValues: result,
            hasBlockchainAdapter: !!blockchainRef.current,
            hasEngine: !!engineRef.current,
            spreadsheetTitle: spreadsheetTitle,
            blobId: result?.blobId
          });

          setSaveStatus('error');
          setLoadingState({
            isLoading: false,
            message: 'Save failed',
            details: errorMessage + (errorDetails ? ` (${errorDetails})` : ''),
            error: errorMessage,
            errorType: errorType,
            blobId: result?.blobId
          });

          // Keep error visible longer (8s) for user to read
          setTimeout(() => {
            setLoadingState({ isLoading: false, message: '', details: '' });
            setSaveStatus('ready');
          }, 8000);

          return { success: false, error: errorMessage, details: errorDetails };
        }
      } catch (error) {
        // Enhanced error logging to capture actual error details
        console.error('❌ [First Save] Raw error object:', error);
        console.error('❌ [First Save] Error stringified:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        console.error('❌ [First Save] Error type:', typeof error);
        console.error('❌ [First Save] Error constructor:', error?.constructor?.name);
        console.error('❌ [First Save] Error keys:', Object.keys(error || {}));
        console.error('❌ [First Save] Error entries:', Object.entries(error || {}));

        // Extract message from various possible error formats
        const errorMessage =
          error?.message ||
          error?.error ||
          error?.details ||
          (typeof error === 'string' ? error : null) ||
          'Unknown error occurred';

        logger.error(LogComponent.BUSINESS_LOGIC, 'first_save_exception', 'Exception during first save', {
          error: errorMessage,
          stack: error?.stack,
          errorType: error?.constructor?.name,
          errorKeys: error ? Object.keys(error) : [],
          fullError: JSON.stringify(error),
          hasBlockchainAdapter: !!blockchainRef.current,
          hasEngine: !!engineRef.current
        });

        console.error('❌ [First Save] Exception:', {
          message: errorMessage,
          stack: error?.stack,
          errorType: error?.constructor?.name,
          completeError: error,
          hasBlockchainAdapter: !!blockchainRef.current,
          hasEngine: !!engineRef.current
        });

        setSaveStatus('error');
        setLoadingState({
          isLoading: false,
          message: 'Save failed',
          details: errorMessage,
          error: errorMessage,
          errorType: 'first_save_failed'
        });

        // Keep error visible longer (8s) for user to read
        setTimeout(() => {
          setLoadingState({ isLoading: false, message: '', details: '' });
          setSaveStatus('ready');
        }, 8000);

        return { success: false, error: errorMessage };
      }
    }

    // Normal save path for existing spreadsheets
    let epochsToUse = epochs;
    if (!epochsToUse) {
      epochsToUse = getWalrusEpochPreference();
    }

    // Set loading state for save operation
    setLoadingState({
      isLoading: true,
      message: 'Saving spreadsheet...',
      details: 'Preparing data for storage...',
      type: 'storage',
      steps: [
        'Preparing spreadsheet data',
        'Storing to decentralized storage',
        'Updating blockchain record',
        'Confirming transaction'
      ],
      currentStep: 0,
      showProgress: true
    });

    try {
      // Pre-save verification: if we have a stored spreadsheetId, ensure it exists
      try {
        const spreadsheetId = storageRef.current?.getCurrentSpreadsheetId?.();
        if (spreadsheetId && blockchainRef.current?.suiService?.validateSpreadsheetObjectExists) {
          const existsCheck = await blockchainRef.current.suiService.validateSpreadsheetObjectExists(spreadsheetId);
          if (!existsCheck.exists) {
            console.warn('⚠️ Pre-save: stale spreadsheetId detected, clearing session and forcing create path', existsCheck);

            // Clear the stale ID so adapter will create a new spreadsheet
            try {
              storageRef.current?.setCurrentSpreadsheetId?.(null);
            } catch (clearIdError) {
              console.error('Failed to clear stale spreadsheetId:', clearIdError);
            }

            // Also clear adapter cache if exposed
            try {
              blockchainRef.current.spreadsheetObjectId = null;
            } catch (clearAdapterError) {
              console.error('Failed to clear adapter cache:', clearAdapterError);
            }

            // Show user-friendly error message
            setLoadingState({
              isLoading: false,
              message: 'Spreadsheet not found on blockchain',
              details: 'This may have been deleted or moved. Creating a new save...',
              type: 'warning'
            });

            // Log the issue for debugging
            console.log('📋 Stale ID recovery details:', {
              spreadsheetId: spreadsheetId.substring(0, 10) + '...',
              wasCleared: true,
              timestamp: new Date().toISOString()
            });

            // Clear the warning message after a short delay
            setTimeout(() => {
              setLoadingState({ isLoading: false, message: '', details: '' });
            }, 2000);
          }
        }
      } catch (precheckError) {
        console.warn('⚠️ Pre-save verification skipped due to error:', precheckError?.message);
      }

      setSaveStatus('saving');

      // Update loading state for data preparation
      setLoadingState(prev => ({
        ...prev,
        currentStep: 0,
        details: 'Preparing spreadsheet data...'
      }));

      // Simulate step progression
      setTimeout(() => {
        setLoadingState(prev => ({
          ...prev,
          currentStep: 1,
          details: 'Storing to decentralized storage...',
          type: 'storage'
        }));
      }, 300);

      const result = await engineRef.current.save(title, epochsToUse);

      if (result.success) {
        // Check if wallet was disconnected (localStorage-only save)
        if (result.walletDisconnected) {
          // Show warning for localStorage-only save
          setLoadingState(prev => ({
            ...prev,
            currentStep: 2,
            message: 'Wallet not connected',
            details: 'Data saved locally only - connect wallet for blockchain storage',
            type: 'warning'
          }));

          setSaveStatus('saved');
          setEditCount(0);
          updateSyncStatus();

          // Show warning message longer than success
          setTimeout(() => {
            setLoadingState({ isLoading: false, message: '', details: '' });
          }, 2500);

          // Reset status after a delay
          setTimeout(() => setSaveStatus('ready'), 3000);
        } else {
          // Normal blockchain save path
          // Capture save metadata for UI confirmation
          if (result.saveInfo) {
            setLastSaveInfo(result.saveInfo);
          }

          // Update loading state for blockchain update
          setLoadingState(prev => ({
            ...prev,
            currentStep: 2,
            message: 'Updating blockchain...',
            details: 'Updating blockchain record...',
            type: 'blockchain'
          }));

          // Simulate blockchain confirmation step
          setTimeout(() => {
            setLoadingState(prev => ({
              ...prev,
              currentStep: 3,
              details: 'Confirming transaction...'
            }));
          }, 500);

          setSaveStatus('saved');
          setEditCount(0);
          updateSyncStatus();

          // Dismiss save reminder on successful save
          autosave.dismissSaveReminder(); // Phase 3: Use hook function

          // Complete final step and clear loading state
          setLoadingState(prev => ({
            ...prev,
            currentStep: 4,
            message: 'Save complete!',
            details: 'Spreadsheet saved successfully'
          }));

          // Clear loading state after brief success message
          setTimeout(() => {
            setLoadingState({ isLoading: false, message: '', details: '' });
          }, 1000);

          // Reset status after a delay
          setTimeout(() => setSaveStatus('ready'), 2000);
        }
      } else {
        setSaveStatus('error');
        setLoadingState({ isLoading: false, message: '', details: '' });
        setTimeout(() => setSaveStatus('ready'), 3000);
      }
      
      return result;
    } catch (error) {
      console.error('[useSpreadsheet] ❌ saveToBlockchain failed:', {
        error: error.message,
        isRetryable: error.isRetryable,
        attempt: error.attempt,
        originalError: error.originalError?.message
      });

      setSaveStatus('error');
      setLoadingState({ isLoading: false, message: '', details: '' });

      // Provide user-friendly error messages based on error type
      let userMessage = error.message;
      if (error.message?.includes('Wallet communication failed')) {
        userMessage = 'Wallet connection issue detected. Please refresh the page and reconnect your wallet.';
      } else if (error.message?.includes('not connected')) {
        userMessage = 'Wallet not connected. Please connect your Slush wallet first.';
      } else if (error.message?.includes('Low wallet balance')) {
        userMessage = 'Insufficient SUI balance. Please add funds to your wallet or use the faucet.';
      }

      setTimeout(() => setSaveStatus('ready'), 5000); // Longer timeout for wallet errors

      return {
        success: false,
        error: userMessage,
        technical: error.message,
        isRetryable: error.isRetryable || false
      };
    }
  }, [updateSyncStatus]);

  /**
   * Update lastSaveInfo metadata (e.g., after blob renewal)
   * Allows external components to refresh save metadata without full save
   * @param {Object} updates - Partial updates to merge into lastSaveInfo
   */
  const updateLastSaveInfo = useCallback((updates) => {
    setLastSaveInfo(prev => {
      if (!prev) return null;
      return {
        ...prev,
        ...updates,
        timestamp: Date.now() // Always update timestamp when metadata changes
      };
    });
  }, []);

  // Store saveToBlockchain function in ref for use in auto-save
  useEffect(() => {
    saveToBlockchainRef.current = saveToBlockchain;
  }, [saveToBlockchain]);

  // Force save
  const forceSave = useCallback(async () => {
    return await saveToBlockchain();
  }, [saveToBlockchain]);

  // Save to Walrus only (no wallet prompts)
  const saveToWalrusOnly = useCallback(async (title = null) => {
    if (!engineRef.current) {
      return { success: false, error: 'Engine not initialized' };
    }

    return await engineRef.current.saveToWalrusOnly(title);
  }, []);

  // Force blockchain sync
  const syncToBlockchain = useCallback(async () => {
    if (!engineRef.current) {
      return { success: false, error: 'Engine not initialized' };
    }

    setLoadingState({
      isLoading: true,
      message: 'Syncing to blockchain...',
      details: 'Creating blockchain transaction for pending saves...',
      type: 'blockchain'
    });

    try {
      const result = await engineRef.current.forceSyncToBlockchain();

      setLoadingState({ isLoading: false, message: '', details: '' });

      if (result && result.success !== false) {
        setSaveStatus('synced');
        setTimeout(() => setSaveStatus('ready'), 3000);
      } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('ready'), 3000);
      }

      return result;
    } catch (error) {
      setLoadingState({ isLoading: false, message: '', details: '' });
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('ready'), 3000);

      return { success: false, error: typeof error === 'string' ? error : error.message || 'Unknown error' };
    }
  }, []);

  // Get current status
  const getStatus = useCallback(() => {
    if (!engineRef.current) return null;
    
    return {
      ...engineRef.current.getStatus(),
      saveStatus,
      currentCell,
      formulaValue,
      walletConnected: walletConnection.isConnected,
      walletAddress: walletConnection.address,
      syncStatus
    };
  }, [saveStatus, currentCell, formulaValue, walletConnection, syncStatus]);

  // Get storage info
  const getStorageInfo = useCallback(() => {
    if (!storageRef.current) return null;
    return storageRef.current.getStorageInfo();
  }, []);

  // Get current spreadsheet object ID (from session)
  const getCurrentSpreadsheetId = useCallback(() => {
    try {
      return storageRef.current?.getCurrentSpreadsheetId() || null;
    } catch {
      return null;
    }
  }, []);

  // Clear all data
  const clearData = useCallback(async () => {
    if (!storageRef.current || !blockchainRef.current) return;

    try {
      await storageRef.current.clearData();
      blockchainRef.current.clearPendingEdits();
      
      setEditCount(0);
      setCurrentCell('A1');
      setFormulaValue('');
      setSaveStatus('ready');
      updateSyncStatus();
      
      return { success: true };
    } catch (error) {
      return { success: false, error: typeof error === 'string' ? error : error.message || 'Unknown error' };
    }
  }, [updateSyncStatus]);

  // Export data
  const exportData = useCallback(async () => {
    if (!storageRef.current) return null;
    
    try {
      return await storageRef.current.exportData();
    } catch (error) {
      console.error('Failed to export data:', error);
      return null;
    }
  }, []);

  // Get user's spreadsheets from wallet
  const getUserSpreadsheets = useCallback(async () => {
    if (!blockchainRef.current) return { success: false, error: 'Blockchain adapter not initialized' };
    
    setSaveStatus('loading');
    const result = await blockchainRef.current.getUserSpreadsheets();
    setSaveStatus('ready');
    
    return result;
  }, []);

  // Load a specific spreadsheet
  const loadSpreadsheet = useCallback(async (spreadsheetId) => {
    if (!blockchainRef.current || !engineRef.current) {
      return { success: false, error: 'Services not initialized' };
    }

    // Check if already loading this spreadsheet
    if (loadingOperationRef.current === spreadsheetId) {
      console.log(`⚠️ Already loading spreadsheet ${spreadsheetId}, skipping duplicate request`);
      return { success: false, error: 'Already loading this spreadsheet' };
    }

    // Check if any load is in progress
    if (loadingOperationRef.current) {
      console.log(`⚠️ Another spreadsheet (${loadingOperationRef.current}) is loading, queuing current load of ${spreadsheetId}`);
      // If a session restoration or another load is ongoing, wait briefly for it to finish
      const timeoutMs = 12000;
      const start = Date.now();
      while (loadingOperationRef.current && Date.now() - start < timeoutMs) {
        // If the current operation is a session restoration for the same spreadsheet, just wait
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      // If still loading after timeout, fail fast
      if (loadingOperationRef.current) {
        return { success: false, error: 'Another load operation is in progress' };
      }
      // Otherwise proceed to load normally
    }

    // Mark this operation as in progress
    loadingOperationRef.current = spreadsheetId;

    // Set initial loading state
    setLoadingState({
      isLoading: true,
      message: 'Loading spreadsheet...',
      details: 'Connecting to blockchain...'
    });
    setSaveStatus('loading');
    
    try {
      // Update loading state for blockchain query
      setLoadingState(prev => ({ ...prev, details: 'Fetching spreadsheet metadata...' }));

      // Create progress callback
      const onProgress = (message, details) => {
        setLoadingState(prev => ({ ...prev, message, details }));
      };

      // Load spreadsheet data from blockchain and Walrus with retry logic
      // Retry specifically for Walrus/network errors with exponential backoff
      const WALRUS_MAX_RETRIES = 2;
      const WALRUS_RETRY_DELAY_MS = 1000; // 1 second base delay
      let lastError = null;
      let result = null;

      for (let attempt = 0; attempt <= WALRUS_MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            // Calculate exponential backoff delay: 1s, 2s, 4s, etc.
            const delayMs = WALRUS_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            console.log(`🔄 Walrus fetch retry ${attempt}/${WALRUS_MAX_RETRIES} after ${delayMs}ms delay`);

            // Update progress with retry info
            onProgress(
              `Retrying Walrus fetch (attempt ${attempt + 1}/${WALRUS_MAX_RETRIES + 1})...`,
              'Network issue detected, retrying with exponential backoff...'
            );

            // Wait with backoff
            await new Promise(resolve => setTimeout(resolve, delayMs));

            // Verify wallet still connected before retry
            if (!walletConnection.isConnected) {
              throw new Error('Wallet disconnected during retry');
            }
          }

          // Attempt load
          result = await blockchainRef.current.loadSpreadsheet(spreadsheetId, onProgress);

          if (result && result.success) {
            console.log(`✅ Load successful on attempt ${attempt + 1}`);
            break; // Success, exit retry loop
          } else if (result && result.error) {
            lastError = new Error(result.error);
            // Check if error is retryable (Walrus/network related)
            if ((result.error.includes('Walrus') || result.error.includes('fetch') || result.error.includes('network'))
                && attempt < WALRUS_MAX_RETRIES) {
              console.warn(`⚠️ Walrus-related error on attempt ${attempt + 1}, will retry: ${result.error}`);
              continue; // Retry
            } else {
              // Non-retryable error or max retries reached
              throw lastError;
            }
          }
        } catch (attemptError) {
          lastError = attemptError;

          // Only retry on Walrus/network/fetch related errors
          const isRetryableError = attemptError.message && (
            attemptError.message.includes('Walrus') ||
            attemptError.message.includes('fetch') ||
            attemptError.message.includes('network') ||
            attemptError.message.includes('timeout') ||
            attemptError.message.includes('ECONNREFUSED')
          );

          if (isRetryableError && attempt < WALRUS_MAX_RETRIES) {
            console.warn(`⚠️ Walrus fetch failed (attempt ${attempt + 1}), will retry: ${attemptError.message}`);
            continue; // Retry
          } else if (!isRetryableError) {
            console.warn(`💥 Non-retryable error detected, skipping retries: ${attemptError.message}`);
            throw attemptError; // Don't retry non-retryable errors
          } else {
            console.warn(`⚠️ Max retries reached (${WALRUS_MAX_RETRIES}), giving up`);
            throw lastError; // Max retries reached
          }
        }
      }

      if (!result) {
        throw lastError || new Error('Load failed after all retry attempts');
      }
      
      if (result.success) {
        // Update loading state for data loading
        setLoadingState(prev => ({ ...prev, details: 'Preparing spreadsheet data...' }));

        // Default title from walrus payload if present
        let uiTitle = result.data?.data?.metadata?.title || result.data?.title || null;

        // Always load data to replace current grid, even for empty spreadsheets
        if (result.metadata?.isEmpty) {
          console.warn('[useSpreadsheet] Chain returned empty spreadsheet (no versions); clearing grid and loading empty data');

          try {
            const list = await blockchainRef.current.getUserSpreadsheets();
            if (list.success) {
              const found = list.spreadsheets.find(s => s.objectId === spreadsheetId);
              if (found?.title) uiTitle = found.title;
            }
          } catch {}

          // Clear the grid and load empty data to replace stale content
          await engineRef.current.clearGrid();

          // Create empty data structure for consistency
          const emptyData = {
            data: {
              cells: {},
              metadata: { title: uiTitle || 'Sheet1' }
            }
          };
          setSpreadsheetData(emptyData);
        } else {
          // Normal path with versioned data
          await engineRef.current.loadData(result.data);
          setSpreadsheetData(result.data);
        }

        // Update session with loaded spreadsheet info
        if (storageRef.current) {
          storageRef.current.setCurrentSpreadsheetId(spreadsheetId);
          if (uiTitle) storageRef.current.setSpreadsheetTitle(uiTitle);

          // If we have version metadata with walrus blob ID, store it
          if (result.metadata?.version?.walrus_blob_id) {
            storageRef.current.setLastWalrusBlobId(result.metadata.version.walrus_blob_id);
          }
        }

        // Update sync status
        updateSyncStatus();

        // Clear loading state
        setLoadingState({ isLoading: false, message: '', details: '' });
        setSaveStatus('saved');

        // Clear loading operation
        loadingOperationRef.current = null;

        return {
          success: true,
          title: uiTitle || 'Loaded Spreadsheet',
          metadata: result.metadata
        };
      } else {
        // Handle specific error types for better user feedback
        let errorMessage = result.error || 'Failed to load spreadsheet';
        let errorType = 'error';

        if (result.error === 'Wallet not connected') {
          errorMessage = 'Please connect your wallet to load spreadsheets from the blockchain';
          errorType = 'wallet_required';
        } else if (result.error && result.error.includes('Walrus')) {
          errorMessage = 'Failed to retrieve data from Walrus storage. The blob may have expired.';
          errorType = 'storage_error';
        } else if (result.error && result.error.includes('Sui')) {
          errorMessage = 'Failed to query blockchain data. Check your network connection.';
          errorType = 'blockchain_error';
        } else if (result.error && result.error.includes('not found')) {
          errorMessage = 'Spreadsheet not found. It may have been deleted.';
          errorType = 'not_found';
        }

        setLoadingState({
          isLoading: false,
          message: '',
          details: '',
          error: errorMessage,
          errorType,
          technicalError: result.error // Store technical error for debugging
        });
        setSaveStatus('error');

        // Clear loading operation
        loadingOperationRef.current = null;

        console.error('[useSpreadsheet] Load failed:', {
          error: result.error,
          errorType,
          spreadsheetId
        });

        return result;
      }
    } catch (error) {
      const errorMessage = typeof error === 'string' ? error : error.message || 'Unknown error';
      let errorType = 'error';

      if (errorMessage.includes('Wallet not connected') || errorMessage.includes('wallet')) {
        errorType = 'wallet_required';
      }

      setLoadingState({
        isLoading: false,
        message: '',
        details: '',
        error: errorMessage,
        errorType
      });
      setSaveStatus('error');

      // Clear loading operation
      loadingOperationRef.current = null;

      console.error('[useSpreadsheet] Load exception:', {
        error: errorMessage,
        errorType,
        spreadsheetId
      });

      return { success: false, error: errorMessage, errorType };
    }
  }, [updateSyncStatus]);

  // Rename spreadsheet
  const renameSpreadsheet = useCallback(async (spreadsheetId, newTitle) => {
    if (!blockchainRef.current) return { success: false, error: 'Blockchain adapter not initialized' };
    
    setSaveStatus('saving');
    const result = await blockchainRef.current.renameSpreadsheet(spreadsheetId, newTitle);
    setSaveStatus('ready');
    
    return result;
  }, []);

  // Make spreadsheet public
  const makeSpreadsheetPublic = useCallback(async (spreadsheetId) => {
    if (!blockchainRef.current) return { success: false, error: 'Blockchain adapter not initialized' };
    
    setSaveStatus('saving');
    const result = await blockchainRef.current.makeSpreadsheetPublic(spreadsheetId);
    setSaveStatus('ready');
    
    return result;
  }, []);

  // Make spreadsheet private
  const makeSpreadsheetPrivate = useCallback(async (spreadsheetId) => {
    if (!blockchainRef.current) return { success: false, error: 'Blockchain adapter not initialized' };
    
    setSaveStatus('saving');
    const result = await blockchainRef.current.makeSpreadsheetPrivate(spreadsheetId);
    setSaveStatus('ready');
    
    return result;
  }, []);

  // Transfer ownership
  const transferOwnership = useCallback(async (spreadsheetId, newOwnerAddress) => {
    if (!blockchainRef.current) return { success: false, error: 'Blockchain adapter not initialized' };
    
    setSaveStatus('saving');
    const result = await blockchainRef.current.transferSpreadsheetOwnership(spreadsheetId, newOwnerAddress);
    setSaveStatus('ready');
    
    return result;
  }, []);

  // Prune old versions
  const pruneOldVersions = useCallback(async (spreadsheetId, keepCount = 10) => {
    if (!blockchainRef.current) return { success: false, error: 'Blockchain adapter not initialized' };
    
    setSaveStatus('saving');
    const result = await blockchainRef.current.pruneSpreadsheetVersions(spreadsheetId, keepCount);
    setSaveStatus('ready');
    
    return result;
  }, []);

  // Create a new empty spreadsheet with enhanced loading states
  const createNewSpreadsheet = useCallback(async (title = 'Untitled Spreadsheet') => {
    if (!blockchainRef.current || !engineRef.current || !storageRef.current) {
      return { success: false, error: 'Services not initialized' };
    }

    setSaveStatus('saving');
    setLoadingState({
      isLoading: true,
      message: 'Creating spreadsheet...',
      details: 'Setting up blockchain integration...',
      type: 'blockchain',
      steps: [
        'Preparing data',
        'Storing to decentralized storage',
        'Creating blockchain record',
        'Confirming transaction',
        'Finalizing setup'
      ],
      currentStep: 0,
      showProgress: true
    });

    try {
      // Clear current data first
      await storageRef.current.clearData();

      // Update loading state for data preparation
      setLoadingState(prev => ({
        ...prev,
        currentStep: 0,
        details: 'Preparing spreadsheet data...'
      }));

      // Simulate step 1 completion
      setTimeout(() => {
        setLoadingState(prev => ({
          ...prev,
          currentStep: 1,
          details: 'Storing to decentralized storage...'
        }));
      }, 500);

      // Update loading state for blockchain creation
      setLoadingState(prev => ({
        ...prev,
        currentStep: 2,
        message: 'Creating spreadsheet...',
        details: 'Creating on blockchain (wallet approval needed)...',
        type: 'wallet'
      }));

      // Create new spreadsheet with optimized method
      const result = await blockchainRef.current.createNewSpreadsheetOptimized(title);

      if (result.success) {
        // Update loading state for transaction confirmation
        setLoadingState(prev => ({
          ...prev,
          currentStep: 3,
          message: 'Confirming transaction...',
          details: 'Waiting for blockchain confirmation...',
          type: 'blockchain'
        }));

        // Update loading state for data loading
        setLoadingState(prev => ({
          ...prev,
          currentStep: 4,
          message: 'Loading spreadsheet...',
          details: 'Preparing spreadsheet data...',
          type: 'default'
        }));

        // Load the data into the spreadsheet engine
        await engineRef.current.loadData(result.data);

        // Update session with new spreadsheet info
        if (storageRef.current) {
          storageRef.current.setCurrentSpreadsheetId(result.spreadsheetId);
          storageRef.current.setSpreadsheetTitle(result.title);
          if (result.walrusBlobId) {
            storageRef.current.setLastWalrusBlobId(result.walrusBlobId);
          }
        }

        // Update state
        setEditCount(0);
        setCurrentCell('A1');
        setFormulaValue('');
        setSpreadsheetData(result.data);
        updateSyncStatus();

        // Complete final step and clear loading state
        setLoadingState(prev => ({
          ...prev,
          currentStep: 5,
          message: 'Complete!',
          details: 'Spreadsheet ready to use'
        }));

        // Clear loading state after a brief success message
        setTimeout(() => {
          setLoadingState({ isLoading: false, message: '', details: '' });
        }, 1500);

        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('ready'), 2000);

        console.log('✅ WalSheetz: Spreadsheet created successfully!', {
          spreadsheetId: result.spreadsheetId,
          title: result.title,
          optimized: result.optimized,
          gasUsed: result.gasUsed
        });

        return {
          success: true,
          spreadsheetId: result.spreadsheetId,
          title: result.title,
          data: result.data,
          optimized: result.optimized,
          gasUsed: result.gasUsed
        };
      } else {
        setLoadingState({ isLoading: false, message: '', details: '' });
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('ready'), 3000);
        return result;
      }
    } catch (error) {
      console.error('[useSpreadsheet] ❌ createNewSpreadsheet failed:', {
        error: error.message,
        isRetryable: error.isRetryable,
        attempt: error.attempt,
        originalError: error.originalError?.message
      });

      setLoadingState({ isLoading: false, message: '', details: '' });
      setSaveStatus('error');

      // Provide user-friendly error messages based on error type
      let userMessage = error.message;
      if (error.message?.includes('Wallet communication failed')) {
        userMessage = 'Wallet connection issue detected. Please refresh the page and reconnect your wallet before creating a new spreadsheet.';
      } else if (error.message?.includes('not connected')) {
        userMessage = 'Wallet not connected. Please connect your Slush wallet before creating a spreadsheet.';
      } else if (error.message?.includes('Low wallet balance')) {
        userMessage = 'Insufficient SUI balance. Please add funds to your wallet or use the faucet before creating a spreadsheet.';
      }

      setTimeout(() => setSaveStatus('ready'), 5000); // Longer timeout for wallet errors

      return {
        success: false,
        error: userMessage,
        technical: error.message,
        isRetryable: error.isRetryable || false
      };
    }
  }, [updateSyncStatus]);

  // Phase 3: Import/export functions now handled by useSpreadsheetImport hook
  // Expose them directly from the hook for backward compatibility
  const { initializeLocalSpreadsheet, loadImportedData } = importExport;

  // Delete a spreadsheet permanently
  const deleteSpreadsheet = useCallback(async (spreadsheetId, title) => {
    if (!blockchainRef.current) return { success: false, error: 'Blockchain adapter not initialized' };
    
    // Validation
    if (!spreadsheetId || typeof spreadsheetId !== 'string') {
      return { success: false, error: 'Invalid spreadsheet ID' };
    }

    if (!title || typeof title !== 'string') {
      return { success: false, error: 'Spreadsheet title required for confirmation' };
    }

    setSaveStatus('saving');
    
    try {
      console.log('[useSpreadsheet] 🗑️ Starting spreadsheet deletion:', { spreadsheetId, title });
      
      const result = await blockchainRef.current.deleteSpreadsheet(spreadsheetId);
      
      if (result.success) {
        console.log('[useSpreadsheet] ✅ Spreadsheet deleted successfully:', {
          spreadsheetId,
          transactionDigest: result.transactionDigest,
          versionsDeleted: result.deletedVersionCount
        });
        
        setSaveStatus('saved');
        
        // Clear local state if this was the current spreadsheet
        setEditCount(0);
        setCurrentCell('A1');
        setFormulaValue('');
        updateSyncStatus();
        
        // Reset status after success message
        setTimeout(() => setSaveStatus('ready'), 2000);
      } else {
        console.error('[useSpreadsheet] ❌ Failed to delete spreadsheet:', result.error);
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('ready'), 3000);
      }
      
      return result;
    } catch (error) {
      console.error('[useSpreadsheet] ❌ Error during spreadsheet deletion:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('ready'), 3000);
      
      return { success: false, error: typeof error === 'string' ? error : error.message || 'Unknown error' };
    }
  }, [updateSyncStatus]);

  const queryDatasets = useCallback(async (filter = {}) => {
    if (!engineRef.current) return { success: false, error: 'Engine not initialized' };
    return await engineRef.current.getDatasets(filter);
  }, []);

  const snoozeCommitPrompt = useCallback(() => {
    if (engineRef.current?.commitPromptState) {
      engineRef.current.commitPromptState.visible = false;
      engineRef.current.commitPromptState.since = Date.now();
    }
    autosave.dismissSaveReminder(); // Phase 3: Use hook function
  }, [autosave]);

  const suppressCommitPrompts = useCallback(() => {
    if (engineRef.current?.commitPromptState) {
      engineRef.current.commitPromptState.visible = false;
      engineRef.current.commitPromptState.suppressed = true;
    }
    autosave.dismissSaveReminder(); // Phase 3: Use hook function
  }, [autosave]);

  return {
    // State
    currentCell,
    formulaValue,
    editCount,
    saveStatus,
    loadingState,
    walletConnected: walletConnection.isConnected,
    walletSyncReady,
    walletAutoConnecting: walletConnection.isAutoConnecting,
    walletAddress: walletConnection.address,
    walletBalance: walletConnection.balance,
    walletNetwork: 'testnet', // Currently hardcoded to testnet
    syncStatus,
    collaborationStatus,
    spreadsheetData,
    saveReminder: autosave.saveReminder, // Phase 3: From useSpreadsheetAutosave
    autoSaveEnabled: autosave.autoSaveEnabled, // Phase 3: From useSpreadsheetAutosave
    lastSaveInfo,
    smartSaveStatus: getStatus?.(),

    // Actions
    handleCellEdit,
    handleCellSelect,
    handleCellBlur,
    handleFormulaChange,
    clearFormulaPreview,
    connectWallet,
    disconnectWallet,
    saveToBlockchain,
    forceSave,
    saveToWalrusOnly,
    syncToBlockchain,
    updateLastSaveInfo,
    clearData,
    dismissSaveReminder,
    toggleAutoSave,

    // Utilities
    getStatus,
    getStorageInfo,
    exportData,
    
    // Collaboration disabled for single-user MVP
    // webSocketService: webSocketRef.current,
    
    // Manual setters (for direct UI control)
    setCurrentCell,
    setFormulaValue,

    // Luckysheet ready flag
    setLuckysheetReady: useCallback((ready) => {
      if (engineRef.current) {
        engineRef.current.setLuckysheetReady(ready);
      }
    }, []),
    
    // Spreadsheet management
    getUserSpreadsheets,
    loadSpreadsheet,
    createNewSpreadsheet,
    initializeLocalSpreadsheet,
    loadImportedData,
    renameSpreadsheet,
    makeSpreadsheetPublic,
    makeSpreadsheetPrivate,
    transferOwnership,
    pruneOldVersions,
    deleteSpreadsheet,
    queryDatasets,
    snoozeCommitPrompt,
    suppressCommitPrompts,
    // IDs and titles
    getCurrentSpreadsheetId,
    // Walrus epoch management
    getWalrusEpochPreference,
    setWalrusEpochPreference,
    blockchainAdapter: blockchainRef.current,
    storageAdapter: storageRef.current,
    spreadsheetEngine: engineRef.current
  };
}
