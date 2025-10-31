/**
 * useSpreadsheetAutosave Hook
 *
 * Manages auto-save functionality and save reminders for spreadsheets.
 * Extracted from useSpreadsheet.js (Phase 3 refactoring).
 *
 * Responsibilities:
 * - Monitor for unsaved changes and show reminders
 * - Auto-save spreadsheet at regular intervals when enabled
 * - Toggle auto-save preference and persist to storage
 */

import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Hook for managing spreadsheet auto-save and save reminders
 *
 * @param {Object} options - Configuration options
 * @param {React.RefObject} options.engineRef - Reference to SpreadsheetEngine
 * @param {React.RefObject} options.storageRef - Reference to StorageAdapter
 * @param {React.RefObject} options.saveToBlockchainRef - Reference to save function
 * @param {boolean} options.walletConnected - Whether wallet is connected
 * @returns {Object} Auto-save state and controls
 */
export function useSpreadsheetAutosave({
  engineRef,
  storageRef,
  saveToBlockchainRef,
  walletConnected
}) {
  const [saveReminder, setSaveReminder] = useState({
    visible: false,
    lastChecked: Date.now()
  });
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);

  const saveReminderIntervalRef = useRef(null);
  const autoSaveIntervalRef = useRef(null);
  const autoSaveEnabledRef = useRef(false); // Ref to avoid stale closure in interval

  // Keep ref in sync with state to avoid stale closures
  useEffect(() => {
    autoSaveEnabledRef.current = autoSaveEnabled;
  }, [autoSaveEnabled]);

  /**
   * Start monitoring for unsaved changes and show reminders
   * Checks every 5 seconds if user has unsaved work >60s old
   */
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
  }, [engineRef]);

  /**
   * Dismiss the save reminder notification
   */
  const dismissSaveReminder = useCallback(() => {
    setSaveReminder(prev => ({ ...prev, visible: false }));
  }, []);

  /**
   * Start auto-save loop
   * Automatically saves spreadsheet every 10 seconds if there are recent edits
   * Uses ref to avoid stale closure bug
   */
  const startAutoSaveLoop = useCallback(() => {
    if (autoSaveIntervalRef.current) {
      clearInterval(autoSaveIntervalRef.current);
    }

    autoSaveIntervalRef.current = setInterval(async () => {
      // Use ref instead of captured state to avoid stale closure
      if (!engineRef.current || !walletConnected || !autoSaveEnabledRef.current) {
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
          console.warn('[useSpreadsheetAutosave] Auto-save failed:', error.message);
        }
      }
    }, 10000); // Auto-save check every 10 seconds
  }, [engineRef, walletConnected, saveToBlockchainRef]);

  /**
   * Stop auto-save loop
   */
  const stopAutoSaveLoop = useCallback(() => {
    if (autoSaveIntervalRef.current) {
      clearInterval(autoSaveIntervalRef.current);
      autoSaveIntervalRef.current = null;
    }
  }, []);

  /**
   * Toggle auto-save preference
   * Updates storage, engine, and starts/stops auto-save loop accordingly
   *
   * @param {boolean} enabled - Whether to enable auto-save
   */
  const toggleAutoSave = useCallback((enabled) => {
    setAutoSaveEnabled(enabled);

    // Persist preference to storage
    if (storageRef.current) {
      storageRef.current.setAutoSaveEnabled(enabled);
    }

    // Update the engine's auto-save state
    if (engineRef.current && engineRef.current.setAutoSaveEnabled) {
      engineRef.current.setAutoSaveEnabled(enabled);
    }

    // Start/stop auto-save interval based on preference
    if (enabled && walletConnected) {
      startAutoSaveLoop();
    } else {
      stopAutoSaveLoop();
    }
  }, [engineRef, storageRef, walletConnected, startAutoSaveLoop, stopAutoSaveLoop]);

  /**
   * Cleanup intervals on unmount
   */
  const cleanup = useCallback(() => {
    if (saveReminderIntervalRef.current) {
      clearInterval(saveReminderIntervalRef.current);
      saveReminderIntervalRef.current = null;
    }
    if (autoSaveIntervalRef.current) {
      clearInterval(autoSaveIntervalRef.current);
      autoSaveIntervalRef.current = null;
    }
  }, []);

  return {
    // State
    saveReminder,
    autoSaveEnabled,

    // Actions
    startSaveReminderMonitoring,
    dismissSaveReminder,
    toggleAutoSave,
    startAutoSaveLoop,
    stopAutoSaveLoop,
    cleanup
  };
}
