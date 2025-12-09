/**
 * Blockchain Execution Operation Factory
 *
 * Creates an operation that executes the blockchain transaction.
 * This operation depends on both Walrus storage and transaction preparation.
 */

import { logger, LogComponent } from "@dreamlit/walrus";

/**
 * Creates a blockchain execution operation
 * @param {BlockchainAdapter} adapter - The BlockchainAdapter instance (provides services & logging)
 * @returns {Object} Operation object with name, execute, dependencies, and getCleanupHandler
 */
export function createBlockchainExecutionOp(adapter) {
  const helpers = adapter.operationHelpers;

  return {
    name: 'blockchain_execution',
    dependencies: ['walrus_storage', 'transaction_preparation'],
    execute: async (context, operationId) => {
      helpers.logOperationStep('blockchain', 'start', `Executing blockchain transaction [${operationId}]`);

      const walrusResult = helpers.getOperationResult(context, 'walrus_storage');
      const txPrepResult = helpers.getOperationResult(context, 'transaction_preparation');

      if (!walrusResult || !txPrepResult) {
        const availableResults = context.results.map((r) => r.name).join(', ');
        throw new Error(`Missing required results from parallel operations. Available: ${availableResults}`);
      }

      // Debug log the results structure
      logger.debug(LogComponent.BLOCKCHAIN_ADAPTER, 'atomic_blockchain_debug', 'Results structure', {
        walrusResult: walrusResult ? Object.keys(walrusResult) : 'missing',
        txPrepResult: txPrepResult ? Object.keys(txPrepResult) : 'missing',
        operationId
      });

      // Safely access versionData with fallback
      helpers.validateOperationResult(txPrepResult, 'versionData', 'Transaction preparation');
      helpers.validateOperationResult(walrusResult, 'blobId', 'Walrus');

      // Create transaction with actual Walrus blob ID
      const finalVersionData = {
        ...txPrepResult.versionData,
        walrusBlobId: walrusResult.blobId,
        contentHash: walrusResult.contentHash?.hash || 'unknown'
      };

      // Create and execute the storage transaction with actual blob ID
      const storageTx = await adapter.suiService.createStorageTransaction(finalVersionData);

      // Estimate gas for the actual transaction
      const storageGasEstimate = await adapter.suiService.estimateGas(storageTx);
      const storageBalanceCheck = await adapter.suiService.checkSufficientBalance(storageGasEstimate);

      if (!storageBalanceCheck.sufficient) {
        throw new Error(`Insufficient balance: ${storageBalanceCheck.message}`);
      }

      // Execute the transaction
      const blockchainResult = await adapter.suiService.executeTransaction(storageTx);

      if (!blockchainResult.success) {
        throw new Error(`Blockchain transaction failed: ${blockchainResult.error}`);
      }

      helpers.logOperationStep('blockchain', 'success', `Blockchain transaction completed [${operationId}]`, {
        transactionDigest: blockchainResult.digest
      });

      return {
        success: true,
        walrusResult,
        blockchainResult,
        operationId
      };
    },
    getCleanupHandler: (result: any) => {
      return async () => {
        const metadata: Record<string, any> = {};
        if (result.blockchainResult?.digest) {
          metadata.transactionDigest = result.blockchainResult.digest;
        }
        helpers.logOperationStep('blockchain', 'cleanup', 'Cleaning up blockchain operations', metadata);
      };
    }
  };
}