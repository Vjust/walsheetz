/**
 * Development tools utility functions
 */

import { detectSaveVersionSignature } from "@/sdk/utils/AbiHelpers.js";

export const createDevTools = (spreadsheetHook) => {
  return {
    forceSave: () => spreadsheetHook.saveToBlockchain(),
    manualSave: async (title = null) => {
      console.log('🔧 Manual save triggered from devTools', { title });
      try {
        const result = await spreadsheetHook.saveToBlockchain(title);
        console.log('🔧 Manual save result:', result);
        return result;
      } catch (error) {
        console.error('🔧 Manual save failed:', error);
        return { success: false, error: error.message };
      }
    },
    forceAutoSave: async () => {
      console.log('🔧 Forcing auto-save trigger from devTools');
      try {
        // Get current title from Luckysheet
        let title = 'Untitled Spreadsheet';
        try {
          if (window.luckysheetfile && window.luckysheetfile[0] && window.luckysheetfile[0].name) {
            title = window.luckysheetfile[0].name;
          }
        } catch (error) {
          console.warn('🔧 Could not get title from Luckysheet:', error.message);
        }

        // Directly call the engine's triggerSave method if available
        if (spreadsheetHook.triggerSave) {
          const result = await spreadsheetHook.triggerSave(title);
          console.log('🔧 Force auto-save result:', result);
          return result;
        } else {
          // Fallback to saveToBlockchain
          const result = await spreadsheetHook.saveToBlockchain(title);
          console.log('🔧 Force auto-save fallback result:', result);
          return result;
        }
      } catch (error) {
        console.error('🔧 Force auto-save failed:', error);
        return { success: false, error: error.message };
      }
    },
    simulateEdit: () => {
      console.log('🔧 Simulating edit to trigger auto-save');
      try {
        // Simulate a tiny edit that will increment edit count
        if (window.luckysheet && window.luckysheet.setCellValue && spreadsheetHook.handleCellEdit) {
          // Get a safe cell to edit (A1)
          const oldValue = window.luckysheet.getCellValue(0, 0) || '';
          const tempValue = oldValue + ' ';

          // Set temporary value
          window.luckysheet.setCellValue(0, 0, tempValue);

          // Immediately restore original value
          setTimeout(() => {
            window.luckysheet.setCellValue(0, 0, oldValue);
          }, 10);

          console.log('🔧 Edit simulation completed - auto-save should trigger in next interval');
          return { success: true, message: 'Edit simulated successfully' };
        } else {
          console.error('🔧 Cannot simulate edit - required dependencies not available');
          return { success: false, error: 'Luckysheet or handleCellEdit not available' };
        }
      } catch (error) {
        console.error('🔧 Error simulating edit:', error);
        return { success: false, error: error.message };
      }
    },
    getStatus: () => spreadsheetHook.getStatus(),
    reset: () => confirm('Clear all data?') ? spreadsheetHook.clearData() : null,
    connectWallet: () => spreadsheetHook.connectWallet(),
    testCellEdit: () => {
      console.log('🧪 Testing cell edit...');
      if (spreadsheetHook.handleCellEdit) {
        const result = spreadsheetHook.handleCellEdit(0, 0, '', 'Test Data');
        console.log('🧪 Test cell edit result:', result);
        return result;
      } else {
        console.error('🧪 handleCellEdit not available');
        return null;
      }
    },
    writeCellData: () => {
      console.log('🧪 Writing test data to cells...');
      if (window.luckysheet && window.luckysheet.setCellValue) {
        window.luckysheet.setCellValue(0, 0, "Test Product");
        window.luckysheet.setCellValue(0, 1, "$100");
        window.luckysheet.setCellValue(1, 0, "Another Item");
        window.luckysheet.setCellValue(1, 1, "$200");
        console.log('🧪 Test data written to spreadsheet');
        return true;
      } else {
        console.error('🧪 Luckysheet not available');
        return false;
      }
    },
    inspectSaveArgs: async () => {
      try {
        const sig = await detectSaveVersionSignature();
        const expectsHash = !!sig.expectsContentHash;
        const cfg = window.browserSuiService?.config || null;
        const featureFlag = cfg?.getFeature ? cfg.getFeature('contentHashInSave', true) : 'unknown';
        console.log('🔧 save_version inspection:', {
          expectsContentHash_detected: expectsHash,
          featureFlag_contentHashInSave: featureFlag,
          expectedArgCount: expectsHash ? 6 : 5,
          signatureDebug: sig.debug || null
        });
        return { expectsHash, featureFlag, argCount: expectsHash ? 6 : 5 };
      } catch (e) {
        console.error('🔧 inspectSaveArgs failed:', e);
        return { success: false, error: e.message };
      }
    },
    setupCellEditTracking: () => {
      console.log('🔧 Setting up alternative cell edit tracking...');

      if (!window.luckysheet || !spreadsheetHook.handleCellEdit) {
        console.error('🔧 Required dependencies not available');
        return false;
      }

      // Store the original setCellValue function
      const originalSetCellValue = window.luckysheet.setCellValue;

      // Override setCellValue to trigger our tracking
      window.luckysheet.setCellValue = function (row, col, value, options) {
        console.log('🔧 Intercepted setCellValue:', { row, col, value });

        // Get the old value first
        const oldValue = window.luckysheet.getCellValue ? window.luckysheet.getCellValue(row, col) : '';

        // Call the original function
        const result = originalSetCellValue.call(this, row, col, value, options);

        // Trigger our cell edit handler
        try {
          if (spreadsheetHook.handleCellEdit) {
            console.log('🔧 Triggering handleCellEdit for tracked change');
            spreadsheetHook.handleCellEdit(row, col, oldValue, value);
          }
        } catch (error) {
          console.error('🔧 Error in handleCellEdit:', error);
        }

        return result;
      };

      console.log('🔧 Cell edit tracking override installed successfully');
      return true;
    },
    logError: (component, details) => {
      console.error(`[${component}]`, details);
    },
    // Repair helpers
    clearSessionSpreadsheetId: () => {
      try {
        if (spreadsheetHook?.getCurrentSpreadsheetId) {
          const current = spreadsheetHook.getCurrentSpreadsheetId();
          console.log('🔧 Clearing session spreadsheetId', { current });
        }
        if (spreadsheetHook?.storageRef?.current?.setCurrentSpreadsheetId) {
          spreadsheetHook.storageRef.current.setCurrentSpreadsheetId(null);
        }
        // Also clear adapter cached id if present
        if (spreadsheetHook?.blockchainRef?.current) {
          spreadsheetHook.blockchainRef.current.spreadsheetObjectId = null;
        }
        return true;
      } catch (e) {
        console.error('🔧 Failed to clear session spreadsheetId:', e);
        return false;
      }
    },

    // Transaction Inspector Methods
    inspectTransaction: (spreadsheetId = null) => {
      try {
        const adapter = spreadsheetHook?.blockchainRef?.current;
        if (!adapter?.transactionManager) {
          console.error('🔍 TransactionManager not available');
          return null;
        }

        const id = spreadsheetId || adapter.spreadsheetObjectId || 'new-spreadsheet';
        const state = adapter.transactionManager.getTransactionState(id);
        const isProcessing = adapter.transactionManager.isProcessing(id);

        console.log('🔍 Transaction State Inspection:', {
          spreadsheetId: id,
          state: state.state,
          isProcessing,
          failureCount: state.failureCount,
          lastTransaction: state.lastTransaction,
          lastFailureTime: state.lastFailureTime ? new Date(state.lastFailureTime).toISOString() : null,
          processingStartTime: state.processingStartTime ? new Date(state.processingStartTime).toISOString() : null
        });

        return state;
      } catch (error) {
        console.error('🔍 Transaction inspection failed:', error);
        return null;
      }
    },

    getIdempotencyStats: () => {
      try {
        const adapter = spreadsheetHook?.blockchainRef?.current;
        if (!adapter?.transactionManager) {
          console.error('🔍 TransactionManager not available');
          return null;
        }

        const stats = adapter.transactionManager.getIdempotencyStats();
        console.log('🔍 Idempotency Cache Stats:', stats);
        return stats;
      } catch (error) {
        console.error('🔍 Idempotency stats retrieval failed:', error);
        return null;
      }
    },

    testIdempotency: async (operationType = 'save_operation', operationData = null) => {
      try {
        const adapter = spreadsheetHook?.blockchainRef?.current;
        if (!adapter?.transactionManager) {
          console.error('🔍 TransactionManager not available');
          return null;
        }

        const id = adapter.spreadsheetObjectId || 'test-spreadsheet';
        const testData = operationData || {
          title: 'Idempotency Test',
          cellCount: 5,
          timestamp: Date.now()
        };

        console.log('🔍 Testing idempotency for operation:', { operationType, id, testData });

        // Generate first nonce
        const nonce1 = adapter.transactionManager.generateIdempotencyNonce(
          operationType,
          id,
          testData
        );

        console.log('🔍 Generated nonce 1:', {
          nonce: nonce1.nonce,
          operationHash: nonce1.operationHash.substring(0, 16) + '...',
          timestamp: new Date(nonce1.timestamp).toISOString()
        });

        // Check if it's considered duplicate (should be false)
        const check1 = adapter.transactionManager.checkIdempotency(
          nonce1.operationHash,
          nonce1.nonce
        );

        console.log('🔍 First duplicate check:', check1);

        // Store a result
        const testResult = { success: true, tested: true, timestamp: Date.now() };
        adapter.transactionManager.storeIdempotencyResult(
          nonce1.operationHash,
          nonce1.nonce,
          testResult
        );

        console.log('🔍 Stored test result for nonce 1');

        // Generate second nonce for same operation
        const nonce2 = adapter.transactionManager.generateIdempotencyNonce(
          operationType,
          id,
          testData
        );

        // Check if it's considered duplicate (should be true)
        const check2 = adapter.transactionManager.checkIdempotency(
          nonce2.operationHash,
          nonce2.nonce
        );

        console.log('🔍 Second duplicate check:', check2);

        return {
          nonce1,
          nonce2,
          firstCheck: check1,
          secondCheck: check2,
          testResult
        };
      } catch (error) {
        console.error('🔍 Idempotency test failed:', error);
        return null;
      }
    },

    getEventHistory: async () => {
      try {
        const { transactionEventBus } = await import("@/sdk/utils/EventBus.js");
        const history = transactionEventBus.getHistory();
        const debugInfo = transactionEventBus.getDebugInfo();

        console.log('🔍 Event Bus History:', history);
        console.log('🔍 Event Bus Debug Info:', debugInfo);

        return { history, debugInfo };
      } catch (error) {
        console.error('🔍 Event history retrieval failed:', error);
        return null;
      }
    },

    simulateTransactionFlow: async (testData = null) => {
      try {
        const adapter = spreadsheetHook?.blockchainRef?.current;
        if (!adapter?.transactionManager) {
          console.error('🔍 TransactionManager not available');
          return null;
        }

        const data = testData || {
          title: 'Simulation Test',
          cells: { 'A1': { value: 'Test' } },
          timestamp: Date.now()
        };

        console.log('🔍 Simulating transaction flow with data:', data);

        // Import event tracking
        const { transactionEventBus } = await import("@/sdk/utils/EventBus.js");
        const events = [];

        // Set up event listener
        const listener = (eventData) => {
          events.push({
            timestamp: Date.now(),
            ...eventData
          });
        };

        const eventTypes = [
        'transaction:start',
        'transaction:state_change',
        'transaction:complete',
        'transaction:failed',
        'save:start'];


        eventTypes.forEach((event) => {
          transactionEventBus.on(event, listener);
        });

        // Perform save operation
        const result = await spreadsheetHook.saveToBlockchain(data);

        // Clean up listeners
        eventTypes.forEach((event) => {
          transactionEventBus.off(event, listener);
        });

        console.log('🔍 Transaction simulation complete. Result:', result);
        console.log('🔍 Events captured during simulation:', events);

        return { result, events };
      } catch (error) {
        console.error('🔍 Transaction flow simulation failed:', error);
        return null;
      }
    },

    resetTransactionState: (spreadsheetId = null) => {
      try {
        const adapter = spreadsheetHook?.blockchainRef?.current;
        if (!adapter?.transactionManager) {
          console.error('🔍 TransactionManager not available');
          return false;
        }

        const id = spreadsheetId || adapter.spreadsheetObjectId || 'current-spreadsheet';

        // Force reset by completing any active transaction
        if (adapter.transactionManager.isProcessing(id)) {
          console.log('🔍 Force completing active transaction for reset');
          adapter.transactionManager.completeTransaction(id, {
            success: false,
            forced: true,
            reason: 'Debug reset'
          });
        }

        // Get state after reset
        const state = adapter.transactionManager.getTransactionState(id);
        console.log('🔍 Transaction state reset complete:', state);

        return true;
      } catch (error) {
        console.error('🔍 Transaction state reset failed:', error);
        return false;
      }
    },

    clearIdempotencyCache: () => {
      try {
        const adapter = spreadsheetHook?.blockchainRef?.current;
        if (!adapter?.transactionManager) {
          console.error('🔍 TransactionManager not available');
          return false;
        }

        // Force cleanup of idempotency cache
        adapter.transactionManager.idempotencyCache?.clear();
        const stats = adapter.transactionManager.getIdempotencyStats();

        console.log('🔍 Idempotency cache cleared. New stats:', stats);
        return true;
      } catch (error) {
        console.error('🔍 Idempotency cache clear failed:', error);
        return false;
      }
    },

    transactionHelp: () => {
      console.log(`
🔍 WalSheetz Transaction Inspector Commands:

📊 Transaction State:
  - inspectTransaction(spreadsheetId?)    - View current transaction state
  - resetTransactionState(spreadsheetId?) - Force reset transaction state

🔄 Idempotency System:
  - getIdempotencyStats()                 - View cache statistics
  - testIdempotency(type?, data?)         - Test duplicate detection
  - clearIdempotencyCache()               - Clear idempotency cache

📡 Event System:
  - getEventHistory()                     - View event bus history
  - simulateTransactionFlow(data?)        - Simulate full transaction with event tracking

🧪 Testing:
  - simulateTransactionFlow(testData?)    - Full flow simulation with event capture

Example usage:
  devTools.inspectTransaction()
  devTools.testIdempotency('save_operation', { title: 'Test' })
  devTools.simulateTransactionFlow()
      `);
      return 'Help displayed above';
    }
  };
};

// Global dev tools setup
export const setupGlobalDevTools = (spreadsheetHook) => {
  if (typeof window !== 'undefined' && import.meta.env?.DEV) {
    window.devTools = createDevTools(spreadsheetHook);
    console.log('🦭 WalSheetz Dev Tools available via window.devTools');
    console.log('Available commands:', Object.keys(window.devTools));
  }
};