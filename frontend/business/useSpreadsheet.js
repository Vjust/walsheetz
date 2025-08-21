import { useState, useEffect, useRef, useCallback } from 'react';
import { SpreadsheetEngine } from '../core/SpreadsheetEngine.js';
import { BlockchainAdapter } from '../adapters/BlockchainAdapter.js';
import { StorageAdapter } from '../adapters/StorageAdapter.js';

/**
 * React hook for spreadsheet business logic
 */
export function useSpreadsheet() {
  const [currentCell, setCurrentCell] = useState('A1');
  const [formulaValue, setFormulaValue] = useState('');
  const [editCount, setEditCount] = useState(0);
  const [saveStatus, setSaveStatus] = useState('ready'); // ready, saving, saved, error
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  
  const engineRef = useRef(null);
  const blockchainRef = useRef(null);
  const storageRef = useRef(null);

  // Initialize services
  useEffect(() => {
    const initializeServices = async () => {
      try {
        // Create service instances
        storageRef.current = new StorageAdapter();
        blockchainRef.current = new BlockchainAdapter();
        engineRef.current = new SpreadsheetEngine(
          storageRef.current,
          blockchainRef.current
        );

        // Initialize engine
        const result = await engineRef.current.initialize();
        
        if (result.success) {
          console.log('Spreadsheet engine initialized successfully');
        } else {
          console.error('Failed to initialize spreadsheet engine:', result.error);
        }

        // Try to auto-reconnect wallet
        const reconnected = await blockchainRef.current.autoReconnect();
        if (reconnected) {
          updateWalletStatus();
        }

        // Update initial sync status
        updateSyncStatus();
      } catch (error) {
        console.error('Failed to initialize services:', error);
      }
    };

    initializeServices();

    // Cleanup on unmount
    return () => {
      if (engineRef.current) {
        engineRef.current.cleanup();
      }
    };
  }, []);

  // Update wallet status
  const updateWalletStatus = useCallback(() => {
    if (blockchainRef.current) {
      const connected = blockchainRef.current.isWalletConnected();
      const address = blockchainRef.current.getWalletAddress();
      
      setWalletConnected(connected);
      setWalletAddress(address);
    }
  }, []);

  // Update sync status
  const updateSyncStatus = useCallback(() => {
    if (blockchainRef.current) {
      const status = blockchainRef.current.getSyncStatus();
      setSyncStatus(status);
    }
  }, []);

  // Handle cell edit
  const handleCellEdit = useCallback((row, col, oldValue, newValue) => {
    if (!engineRef.current) return;

    const result = engineRef.current.handleCellEdit(row, col, oldValue, newValue);
    
    setCurrentCell(result.cellRef);
    setEditCount(result.editCount);
    updateSyncStatus();
    
    return result;
  }, [updateSyncStatus]);

  // Handle formula change
  const handleFormulaChange = useCallback((value) => {
    setFormulaValue(value);
  }, []);

  // Connect wallet
  const connectWallet = useCallback(async () => {
    if (!blockchainRef.current) {
      return { success: false, error: 'Blockchain service not initialized' };
    }

    try {
      const result = await blockchainRef.current.connectWallet();
      
      if (result.success) {
        updateWalletStatus();
        updateSyncStatus();
      }
      
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, [updateWalletStatus, updateSyncStatus]);

  // Disconnect wallet
  const disconnectWallet = useCallback(async () => {
    if (!blockchainRef.current) return;

    try {
      await blockchainRef.current.disconnectWallet();
      updateWalletStatus();
      updateSyncStatus();
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  }, [updateWalletStatus, updateSyncStatus]);

  // Save to blockchain
  const saveToBlockchain = useCallback(async () => {
    if (!engineRef.current) {
      return { success: false, error: 'Engine not initialized' };
    }

    try {
      setSaveStatus('saving');
      
      const result = await engineRef.current.save();
      
      if (result.success) {
        setSaveStatus('saved');
        setEditCount(0);
        updateSyncStatus();
        
        // Reset status after a delay
        setTimeout(() => setSaveStatus('ready'), 2000);
      } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('ready'), 3000);
      }
      
      return result;
    } catch (error) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('ready'), 3000);
      
      return { success: false, error: error.message };
    }
  }, [updateSyncStatus]);

  // Force save
  const forceSave = useCallback(async () => {
    return await saveToBlockchain();
  }, [saveToBlockchain]);

  // Get current status
  const getStatus = useCallback(() => {
    if (!engineRef.current) return null;
    
    return {
      ...engineRef.current.getStatus(),
      saveStatus,
      currentCell,
      formulaValue,
      walletConnected,
      walletAddress,
      syncStatus
    };
  }, [saveStatus, currentCell, formulaValue, walletConnected, walletAddress, syncStatus]);

  // Get storage info
  const getStorageInfo = useCallback(() => {
    if (!storageRef.current) return null;
    return storageRef.current.getStorageInfo();
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
      return { success: false, error: error.message };
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

  return {
    // State
    currentCell,
    formulaValue,
    editCount,
    saveStatus,
    walletConnected,
    walletAddress,
    syncStatus,
    
    // Actions
    handleCellEdit,
    handleFormulaChange,
    connectWallet,
    disconnectWallet,
    saveToBlockchain,
    forceSave,
    clearData,
    
    // Utilities
    getStatus,
    getStorageInfo,
    exportData,
    
    // Manual setters (for direct UI control)
    setCurrentCell,
    setFormulaValue
  };
}