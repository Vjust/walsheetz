import { useState, useEffect, useRef, useCallback } from 'react';
import { SpreadsheetEngine } from '../core/SpreadsheetEngine.js';
import { BlockchainAdapter } from '../adapters/BlockchainAdapter.js';
import { StorageAdapter } from '../adapters/StorageAdapter.js';
import { webSocketService } from '../services/WebSocketService.js';
import { useWalletConnectionFactory } from '../hooks/useWalletConnectionFactory.ts';
import { browserWalletManager } from '../services/BrowserWalletManager.js';
import { parseCellRef } from '../utils/cellUtils.js';
import luckysheetApi from '../services/luckysheetApi.js';
import { TestModeAdapter } from '../services/testing/TestModeAdapter.js';
import { isAuthBypassed } from '../utils/testMode.js';

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
  const [saveReminder, setSaveReminder] = useState({
    visible: false,
    lastChecked: Date.now()
  });
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);

  // Use the wallet connection factory (returns mock in test mode)
  const walletConnection = useWalletConnectionFactory();
  
  const engineRef = useRef(null);
  const blockchainRef = useRef(null);
  const storageRef = useRef(null);
  const webSocketRef = useRef(webSocketService);
  const servicesInitializedRef = useRef(false);
  const sessionRestorationAttemptedRef = useRef(false);
  const autoDiscoveryAttemptedRef = useRef(false);
  const saveReminderIntervalRef = useRef(null);
  const autoSaveIntervalRef = useRef(null);
  const saveToBlockchainRef = useRef(null);
  const loadingOperationRef = useRef(null); // Track ongoing load operations
  
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
                      attemptError.message.includes('channel closed')) {
                    console.warn('💥 Critical error detected, skipping retries');
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
  const startSaveReminderMonitoring = useCallback(() => {
    if (saveReminderIntervalRef.current) {
      clearInterval(saveReminderIntervalRef.current);
    }

    saveReminderIntervalRef.current = setInterval(() => {
      if (!engineRef.current) return;

      const timeSinceLastEdit = engineRef.current.getTimeSinceLastEdit();
      const timeSinceLastSave = engineRef.current.getTimeSinceLastSave();

      // Show reminder if:
      // 1. User has made edits (timeSinceLastEdit exists)
      // 2. More than 60 seconds since last edit
      // 3. Either never saved or last save was before the edits
      if (timeSinceLastEdit !== null &&
          timeSinceLastEdit > 60000 && // 60 seconds
          (timeSinceLastSave === null || timeSinceLastSave > timeSinceLastEdit)) {
        setSaveReminder(prev => ({ ...prev, visible: true }));
      }
    }, 5000); // Check every 5 seconds
  }, []);

  // Dismiss save reminder
  const dismissSaveReminder = useCallback(() => {
    setSaveReminder(prev => ({ ...prev, visible: false }));
  }, []);

  // Toggle auto-save preference
  const toggleAutoSave = useCallback((enabled) => {
    setAutoSaveEnabled(enabled);
    if (storageRef.current) {
      storageRef.current.setAutoSaveEnabled(enabled);
    }

    // Update the engine's auto-save state
    if (engineRef.current && engineRef.current.setAutoSaveEnabled) {
      engineRef.current.setAutoSaveEnabled(enabled);
    }

    // Start/stop auto-save interval based on preference
    if (enabled && walletConnection.isConnected) {
      startAutoSaveLoop();
    } else {
      stopAutoSaveLoop();
    }
  }, [walletConnection.isConnected]);

  // Start auto-save loop when enabled
  const startAutoSaveLoop = useCallback(() => {
    if (autoSaveIntervalRef.current) {
      clearInterval(autoSaveIntervalRef.current);
    }

    autoSaveIntervalRef.current = setInterval(async () => {
      if (!engineRef.current || !walletConnection.isConnected || !autoSaveEnabled) {
        return;
      }

      // Check if there are changes worth saving
      const timeSinceLastEdit = engineRef.current.getTimeSinceLastEdit();
      const timeSinceLastSave = engineRef.current.getTimeSinceLastSave();

      // Auto-save if there are recent edits and we haven't saved since then
      if (timeSinceLastEdit !== null &&
          timeSinceLastEdit < 30000 && // Recent edits (within 30 seconds)
          (timeSinceLastSave === null || timeSinceLastSave > timeSinceLastEdit)) {
        try {
          if (saveToBlockchainRef.current) {
            await saveToBlockchainRef.current();
          }
        } catch (error) {
          console.warn('Auto-save failed:', error.message);
        }
      }
    }, 10000); // Auto-save check every 10 seconds
  }, [walletConnection.isConnected, autoSaveEnabled]);

  // Stop auto-save loop
  const stopAutoSaveLoop = useCallback(() => {
    if (autoSaveIntervalRef.current) {
      clearInterval(autoSaveIntervalRef.current);
      autoSaveIntervalRef.current = null;
    }
  }, []);

  // Sync wallet connection with browserWalletManager and handle session restoration
  useEffect(() => {
    browserWalletManager.setWalletConnection(walletConnection);

    if (walletConnection.isConnected && walletConnection.address) {
      // Update session with current wallet address
      if (storageRef.current) {
        storageRef.current.setWalletAddress(walletConnection.address);
      }

      // Start auto-save if enabled
      if (autoSaveEnabled) {
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
  }, [walletConnection.isConnected, walletConnection.address, autoSaveEnabled, autoDiscoverSpreadsheets, checkSessionRestoration, startAutoSaveLoop, stopAutoSaveLoop]);

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

        console.log('🧮 Creating SpreadsheetEngine...');
        engineRef.current = new SpreadsheetEngine(
          storageRef.current,
          blockchainRef.current,
          autoSaveEnabled
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
          setAutoSaveEnabled(autoSavePref);
        }

        // Start save reminder checking
        startSaveReminderMonitoring();

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
      if (saveReminderIntervalRef.current) {
        clearInterval(saveReminderIntervalRef.current);
      }
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
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

  // Save to blockchain
  const saveToBlockchain = useCallback(async (title = null) => {
    if (!engineRef.current) {
      return { success: false, error: 'Engine not initialized' };
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
            console.warn('Pre-save: stale spreadsheetId detected, clearing session and forcing create path', existsCheck);
            // Clear the stale ID so adapter will create a new spreadsheet
            try { storageRef.current?.setCurrentSpreadsheetId?.(null) } catch {}
            // Also clear adapter cache if exposed
            try { blockchainRef.current.spreadsheetObjectId = null } catch {}
          }
        }
      } catch (precheckError) {
        console.warn('Pre-save verification skipped due to error:', precheckError?.message);
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

      const result = await engineRef.current.save(title);

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
          setSaveReminder(prev => ({ ...prev, visible: false }));

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
      console.log(`⚠️ Another spreadsheet (${loadingOperationRef.current}) is loading, cancelling current load of ${spreadsheetId}`);
      return { success: false, error: 'Another load operation is in progress' };
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
      
      // Load spreadsheet data from blockchain and Walrus
      const result = await blockchainRef.current.loadSpreadsheet(spreadsheetId, onProgress);
      
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

  return {
    // State
    currentCell,
    formulaValue,
    editCount,
    saveStatus,
    loadingState,
    walletConnected: walletConnection.isConnected,
    walletAddress: walletConnection.address,
    walletBalance: walletConnection.balance,
    walletNetwork: 'testnet', // Currently hardcoded to testnet
    syncStatus,
    collaborationStatus,
    spreadsheetData,
    saveReminder,
    autoSaveEnabled,

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
    clearData,
    dismissSaveReminder,
    toggleAutoSave,

    // Utilities
    getStatus,
    getStorageInfo,
    exportData,
    
    // Collaboration
    webSocketService: webSocketRef.current,
    
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
    renameSpreadsheet,
    makeSpreadsheetPublic,
    makeSpreadsheetPrivate,
    transferOwnership,
    pruneOldVersions,
    deleteSpreadsheet
    ,
    // IDs and titles
    getCurrentSpreadsheetId
  };
}
