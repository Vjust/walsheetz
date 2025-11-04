/**
 * Transaction Preparation Operation Factory
 *
 * Creates an operation that prepares blockchain transaction metadata.
 * This operation runs in parallel with Walrus storage.
 */

/**
 * Creates a transaction preparation operation
 * @param {BlockchainAdapter} adapter - The BlockchainAdapter instance (provides services & logging)
 * @param {Object} data - Spreadsheet data including metadata
 * @returns {Object} Operation object with name, execute, and getCleanupHandler
 */
export function createTxPrepOp(adapter, data) {
  const helpers = adapter.operationHelpers;

  return {
    name: 'transaction_preparation',
    execute: async (context, operationId) => {
      helpers.logOperationStep('tx_prep', 'start', `Preparing blockchain transaction metadata [${operationId}]`);

      // This runs in parallel with Walrus storage
      // We prepare the transaction metadata but don't create the actual transaction yet
      const versionData = {
        spreadsheetObjectId: context.spreadsheetObjectId || adapter.spreadsheetObjectId,
        version: data.version || adapter.generateVersion(),
        cellCount: Object.keys(data.cells || {}).length,
        description: data.metadata?.title || data.title || 'Untitled Spreadsheet'
      };

      // Just prepare metadata - don't create transaction without blob ID
      helpers.logOperationStep('tx_prep', 'success', `Transaction metadata prepared [${operationId}]`, {
        cellCount: versionData.cellCount,
        description: versionData.description
      });

      return {
        versionData,
        prepared: true
      };
    },
    getCleanupHandler: helpers.createNoOpCleanupHandler('tx_prep')
  };
}
