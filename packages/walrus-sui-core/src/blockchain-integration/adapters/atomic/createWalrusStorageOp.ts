/**
 * Walrus Storage Operation Factory
 *
 * Creates an operation that uploads spreadsheet data to Walrus storage.
 * This operation runs in parallel with transaction preparation.
 */

/**
 * Creates a Walrus storage operation
 * @param {BlockchainAdapter} adapter - The BlockchainAdapter instance (provides services & logging)
 * @param {Object} data - Spreadsheet data to store
 * @param {Object} options - Configuration options
 * @param {number} options.epochs - Storage duration in epochs (default: 50)
 * @returns {Object} Operation object with name, execute, and getCleanupHandler
 */
export function createWalrusStorageOp(adapter: any, data: any, options: Record<string, any> = {}) {
  const epochs = options.epochs || 50;
  const helpers = adapter.operationHelpers;

  return {
    name: 'walrus_storage',
    execute: async (context, operationId) => {
      helpers.logOperationStep('walrus', 'start', `Executing Walrus storage with ${epochs} epochs [${operationId}]`);

      // Connect to Walrus if not already connected
      await adapter.walrusService.connect();

      const walrusResult = await adapter.walrusService.storeBlob(data, {
        epochs: epochs,
        contentType: 'application/json'
      });

      if (!walrusResult.success) {
        throw new Error(`Walrus storage failed: ${walrusResult.error}`);
      }

      helpers.logOperationStep('walrus', 'success', `Walrus storage completed [${operationId}]`, {
        blobId: walrusResult.blobId
      });

      return walrusResult;
    },
    getCleanupHandler: helpers.createNoOpCleanupHandler('walrus', 'blobId')
  };
}
