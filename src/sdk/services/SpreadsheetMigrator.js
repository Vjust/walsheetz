import { getCurrentConfig } from '@blockchain/config.js';
import { logger, LogComponent } from "@/sdk/utils/Logger.js";

/**
 * SpreadsheetMigrator - Handles migration of spreadsheets from testnet to mainnet
 */
export class SpreadsheetMigrator {
  constructor(blockchainAdapter, storageAdapter, spreadsheetEngine) {
    this.blockchainAdapter = blockchainAdapter;
    this.storageAdapter = storageAdapter;
    this.spreadsheetEngine = spreadsheetEngine;
  }

  /**
   * Estimate the cost of migrating a spreadsheet
   */
  async estimateMigrationCost(spreadsheetData) {
    try {
      const dataSize = JSON.stringify(spreadsheetData).length;
      const cellCount = Object.keys(spreadsheetData.cells || {}).length;

      // Query actual blockchain gas costs
      let suiGasCost = '~0.01 SUI'; // Fallback
      let walrusStorageCost = 'Variable based on size'; // Fallback

      try {
        // Estimate gas for the blockchain transaction
        const gasEstimate = await this.blockchainAdapter.suiService.estimateGas({
          operation: 'create_spreadsheet',
          dataSize,
          cellCount
        });

        if (gasEstimate && gasEstimate.totalGas) {
          // Convert MIST to SUI (1 SUI = 1,000,000,000 MIST)
          const suiAmount = (gasEstimate.totalGas / 1_000_000_000).toFixed(4);
          suiGasCost = `~${suiAmount} SUI`;
        }
      } catch (gasError) {
        logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'gas_estimation_failed', 'Could not estimate gas', {
          error: gasError.message
        });
        // Use fallback
      }

      try {
        // Estimate Walrus storage cost
        // Query current WAL token price per byte (this would need actual implementation)
        const bytesRequired = Math.ceil(dataSize * 1.1); // Add 10% overhead
        const epochs = 50;

        // Rough estimate: ~0.0001 WAL per KB per epoch
        const kbSize = bytesRequired / 1024;
        const estimatedWal = (kbSize * 0.0001 * epochs).toFixed(4);

        walrusStorageCost = `~${estimatedWal} WAL (${epochs} epochs)`;
      } catch (walrusError) {
        logger.warn(LogComponent.BLOCKCHAIN_ADAPTER, 'walrus_estimation_failed', 'Could not estimate storage', {
          error: walrusError.message
        });
        // Use fallback
      }

      return {
        success: true,
        walrus: {
          storage: walrusStorageCost,
          size: dataSize,
          sizeFormatted: dataSize > 1024 ? `${(dataSize / 1024).toFixed(2)} KB` : `${dataSize} bytes`,
          epochs: 50
        },
        sui: {
          gasFee: suiGasCost,
          computationUnits: cellCount * 100,
          cellCount
        },
        totalEstimate: `${suiGasCost} + ${walrusStorageCost}`,
        warnings: [
        'You will need real SUI tokens for gas fees',
        'You will need real WAL tokens for storage',
        'The original testnet spreadsheet will remain unchanged',
        'This creates a new spreadsheet on mainnet']

      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to estimate migration cost'
      };
    }
  }

  /**
   * Migrate a spreadsheet from testnet to mainnet
   */
  async migrateToMainnet(spreadsheetId, options = {}) {
    const migrationId = `migrate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'migration_start', 'Starting spreadsheet migration to mainnet', {
        spreadsheetId,
        migrationId
      });

      // Step 1: Load the testnet spreadsheet data
      if (options.onProgress) {
        options.onProgress({
          step: 1,
          totalSteps: 4,
          message: 'Loading testnet spreadsheet...',
          status: 'loading'
        });
      }

      const loadResult = await this.blockchainAdapter.loadSpreadsheet(spreadsheetId);
      if (!loadResult.success) {
        throw new Error(`Failed to load testnet spreadsheet: ${loadResult.error}`);
      }

      const spreadsheetData = loadResult.data;

      // Verify it's from testnet
      if (spreadsheetData.network !== 'testnet' && spreadsheetData.metadata?.network !== 'testnet') {
        throw new Error('This spreadsheet is not from testnet');
      }

      // Step 2: Verify user is on mainnet
      if (options.onProgress) {
        options.onProgress({
          step: 2,
          totalSteps: 4,
          message: 'Verifying mainnet connection...',
          status: 'loading'
        });
      }

      const config = getCurrentConfig();
      if (config.environment !== 'mainnet') {
        throw new Error('Please switch to mainnet before migrating');
      }

      // Step 3: Create a copy with mainnet metadata
      if (options.onProgress) {
        options.onProgress({
          step: 3,
          totalSteps: 4,
          message: 'Preparing mainnet version...',
          status: 'loading'
        });
      }

      const mainnetData = {
        ...spreadsheetData,
        network: 'mainnet',
        metadata: {
          ...spreadsheetData.metadata,
          network: 'mainnet',
          createdOnNetwork: spreadsheetData.metadata?.createdOnNetwork || 'testnet',
          migratedFrom: 'testnet',
          migratedAt: Date.now(),
          originalSpreadsheetId: spreadsheetId
        },
        title: options.newTitle || `${spreadsheetData.title} (Mainnet)`,
        version: `v${Date.now()}-mainnet-${Math.random().toString(36).substr(2, 9)}`,
        createdAt: Date.now(),
        savedAt: Date.now()
      };

      // Step 4: Save to mainnet
      if (options.onProgress) {
        options.onProgress({
          step: 4,
          totalSteps: 4,
          message: 'Saving to mainnet blockchain...',
          status: 'loading'
        });
      }

      const saveResult = await this.blockchainAdapter.saveToBlockchain(
        mainnetData,
        mainnetData.title,
        {
          epochs: options.epochs || 50,
          description: `Migrated from testnet spreadsheet ${spreadsheetId}`
        }
      );

      if (!saveResult.success) {
        throw new Error(`Failed to save to mainnet: ${saveResult.error}`);
      }

      logger.info(LogComponent.BLOCKCHAIN_ADAPTER, 'migration_success', 'Successfully migrated spreadsheet to mainnet', {
        spreadsheetId,
        newSpreadsheetId: saveResult.spreadsheetId,
        migrationId
      });

      if (options.onProgress) {
        options.onProgress({
          step: 4,
          totalSteps: 4,
          message: 'Migration complete!',
          status: 'success'
        });
      }

      return {
        success: true,
        mainnetSpreadsheetId: saveResult.spreadsheetId,
        transactionHash: saveResult.transactionHash,
        blobId: saveResult.walrusBlobId,
        originalSpreadsheetId: spreadsheetId,
        message: 'Spreadsheet successfully migrated to mainnet'
      };
    } catch (error) {
      logger.error(LogComponent.BLOCKCHAIN_ADAPTER, 'migration_failed', 'Spreadsheet migration failed', {
        spreadsheetId,
        migrationId,
        error: error.message
      });

      if (options.onProgress) {
        options.onProgress({
          step: 0,
          totalSteps: 4,
          message: `Migration failed: ${error.message}`,
          status: 'error'
        });
      }

      return {
        success: false,
        error: error.message || 'Migration failed'
      };
    }
  }
}