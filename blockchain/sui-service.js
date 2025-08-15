// Sui blockchain service for WalSheetz
import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { getCurrentConfig, isTestnet } from './config.js';
import { walletManager } from './wallet-manager.js';

class SuiService {
  constructor() {
    const config = getCurrentConfig();
    this.client = new SuiClient({
      url: config.sui.rpcUrl
    });
    this.isTestnet = isTestnet();
  }

  // Get current network info
  async getNetworkInfo() {
    try {
      const chainId = await this.client.getChainIdentifier();
      const latestCheckpoint = await this.client.getLatestCheckpointSequenceNumber();
      const gasPrice = await this.client.getReferenceGasPrice();
      
      return {
        chainId,
        latestCheckpoint,
        gasPrice,
        isTestnet: this.isTestnet
      };
    } catch (error) {
      console.error('Failed to get network info:', error);
      throw error;
    }
  }

  // Get account balance
  async getBalance(address) {
    try {
      const balance = await this.client.getBalance({
        owner: address
      });
      
      return {
        totalBalance: balance.totalBalance,
        coinObjectCount: balance.coinObjectCount,
        lockedBalance: balance.lockedBalance || '0'
      };
    } catch (error) {
      console.error('Failed to get balance:', error);
      throw error;
    }
  }

  // Get owned objects
  async getOwnedObjects(address, options = {}) {
    try {
      const result = await this.client.getOwnedObjects({
        owner: address,
        filter: options.filter,
        options: {
          showContent: true,
          showOwner: true,
          showType: true,
          ...options
        }
      });
      
      return result;
    } catch (error) {
      console.error('Failed to get owned objects:', error);
      throw error;
    }
  }

  // Create a transaction for storing spreadsheet metadata
  createStorageTransaction(data) {
    const tx = new TransactionBlock();
    
    // Create a storage object to track our blob
    const storageData = {
      spreadsheetId: data.spreadsheetId,
      version: data.version,
      walrusBlobId: data.walrusBlobId,
      timestamp: Date.now(),
      cellChanges: data.cellChanges || [],
      metadata: data.metadata || {}
    };

    // Move call to create storage object (this would require a custom Move package)
    // For now, we'll store metadata as an event
    tx.moveCall({
      target: '0x2::event::emit',
      arguments: [
        tx.pure({
          type: 'WalSheetzStorageEvent',
          data: storageData
        })
      ],
      typeArguments: []
    });

    return tx;
  }

  // Execute transaction through wallet
  async executeTransaction(transaction) {
    try {
      if (!walletManager.isConnected) {
        throw new Error('Wallet not connected');
      }

      const result = await walletManager.signAndExecuteTransaction(transaction);
      
      return {
        success: true,
        digest: result.digest,
        effects: result.effects,
        objectChanges: result.objectChanges,
        balanceChanges: result.balanceChanges
      };
    } catch (error) {
      console.error('Transaction execution failed:', error);
      throw error;
    }
  }

  // Store spreadsheet version metadata on blockchain
  async storeSpreadsheetVersion(versionData) {
    try {
      const transaction = this.createStorageTransaction(versionData);
      const result = await this.executeTransaction(transaction);
      
      return {
        success: true,
        transactionDigest: result.digest,
        version: versionData.version,
        walrusBlobId: versionData.walrusBlobId
      };
    } catch (error) {
      console.error('Failed to store spreadsheet version:', error);
      throw error;
    }
  }

  // Query transaction history via GraphQL
  async queryTransactionHistory(address, limit = 10) {
    try {
      // GraphQL query for transaction history
      const query = `
        query GetTransactionHistory($address: SuiAddress!, $limit: Int) {
          transactionBlocks(
            filter: { sentAddress: $address }
            first: $limit
            orderBy: { sequenceNumber: DESC }
          ) {
            nodes {
              digest
              sender {
                address
              }
              gasInput {
                gasPrice
                gasBudget
              }
              effects {
                status
                timestamp
                checkpoint {
                  sequenceNumber
                }
              }
            }
          }
        }
      `;

      const config = getCurrentConfig();
      const response = await fetch(config.sui.graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: {
            address,
            limit
          }
        })
      });

      const result = await response.json();
      
      if (result.errors) {
        throw new Error(`GraphQL query failed: ${result.errors[0].message}`);
      }

      return result.data.transactionBlocks.nodes;
    } catch (error) {
      console.error('Failed to query transaction history:', error);
      throw error;
    }
  }

  // Query events for spreadsheet storage
  async querySpreadsheetEvents(spreadsheetId, limit = 50) {
    try {
      const events = await this.client.queryEvents({
        query: {
          MoveEventType: 'WalSheetzStorageEvent'
        },
        limit,
        order: 'descending'
      });

      // Filter events for specific spreadsheet
      const filteredEvents = events.data.filter(event => {
        try {
          const eventData = JSON.parse(event.parsedJson);
          return eventData.spreadsheetId === spreadsheetId;
        } catch {
          return false;
        }
      });

      return filteredEvents.map(event => ({
        id: event.id,
        timestamp: event.timestampMs,
        sender: event.sender,
        data: JSON.parse(event.parsedJson),
        transactionDigest: event.transactionDigest
      }));
    } catch (error) {
      console.error('Failed to query spreadsheet events:', error);
      throw error;
    }
  }

  // Get transaction details
  async getTransactionDetails(digest) {
    try {
      const transaction = await this.client.getTransactionBlock({
        digest,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
          showBalanceChanges: true,
          showInput: true
        }
      });

      return transaction;
    } catch (error) {
      console.error('Failed to get transaction details:', error);
      throw error;
    }
  }

  // Estimate gas for transaction
  async estimateGas(transaction) {
    try {
      if (!walletManager.currentAccount) {
        throw new Error('No wallet account available');
      }

      const gasEstimate = await this.client.dryRunTransactionBlock({
        transactionBlock: await transaction.build({
          client: this.client,
          onlyTransactionKind: true
        })
      });

      return {
        computationCost: gasEstimate.effects.gasUsed.computationCost,
        storageCost: gasEstimate.effects.gasUsed.storageCost,
        storageRebate: gasEstimate.effects.gasUsed.storageRebate,
        totalGasUsed: gasEstimate.effects.gasUsed.computationCost + gasEstimate.effects.gasUsed.storageCost
      };
    } catch (error) {
      console.error('Failed to estimate gas:', error);
      throw error;
    }
  }

  // Helper to check if address is valid
  isValidAddress(address) {
    try {
      return address && address.startsWith('0x') && address.length === 66;
    } catch {
      return false;
    }
  }

  // Get current epoch info
  async getCurrentEpoch() {
    try {
      const epochInfo = await this.client.getLatestSuiSystemState();
      return {
        epoch: epochInfo.epoch,
        epochStartTimestampMs: epochInfo.epochStartTimestampMs,
        epochDurationMs: epochInfo.epochDurationMs,
        referenceGasPrice: epochInfo.referenceGasPrice
      };
    } catch (error) {
      console.error('Failed to get epoch info:', error);
      throw error;
    }
  }
}

// Create singleton instance
export const suiService = new SuiService();

// Convenience functions
export const getNetworkInfo = () => suiService.getNetworkInfo();
export const getBalance = (address) => suiService.getBalance(address);
export const storeSpreadsheetVersion = (data) => suiService.storeSpreadsheetVersion(data);
export const querySpreadsheetEvents = (id, limit) => suiService.querySpreadsheetEvents(id, limit);