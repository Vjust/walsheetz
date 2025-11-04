// Pure gRPC transaction builder for Sui blockchain
// Removes dependency on Sui SDK, uses only gRPC

import { getCurrentConfig } from './config.js';

export class GrpcTransactionBuilder {
  constructor() {
    this.config = getCurrentConfig();
    this.CLOCK_OBJECT_ID = '0x6';
  }

  // Build a transaction for creating a spreadsheet
  buildCreateSpreadsheetTransaction(title = 'Untitled Spreadsheet', sender) {
    const packageId = this.config.sui.packageId;
    const registryId = this.config.sui.registryObjectId;
    
    if (!packageId || !registryId) {
      throw new Error('Package ID or Registry ID not configured');
    }

    // Build Move call in BCS format for gRPC
    return {
      kind: 'ProgrammableTransaction',
      inputs: [
        {
          type: 'object',
          objectType: 'sharedObject',
          objectId: registryId,
          initialSharedVersion: 349180203, // From deployment
          mutable: true
        },
        {
          type: 'pure',
          valueType: 'string',
          value: this.encodeBCS(title, 'string')
        }
      ],
      transactions: [
        {
          MoveCall: {
            package: packageId,
            module: 'spreadsheet',
            function: 'create_spreadsheet',
            type_arguments: [],
            arguments: [
              { Input: 0 }, // registry
              { Input: 1 }  // title
            ]
          }
        }
      ]
    };
  }

  // Build a transaction for saving a version with ABI-driven compatibility
  // Adapts to whether content_hash parameter is expected based on ABI detection
  buildSaveVersionTransaction(spreadsheetId, blobId, contentHash, cellCount, description, sender, includeHash = true) {
    const packageId = this.config.sui.packageId;
    
    if (!packageId) {
      throw new Error('Package ID not configured');
    }

    // Build inputs based on whether content_hash is included
    const inputs = [
      {
        type: 'object',
        objectType: 'sharedObject',
        objectId: spreadsheetId,
        initialSharedVersion: null, // Will be fetched
        mutable: true
      },
      {
        type: 'pure',
        valueType: 'string',
        value: this.encodeBCS(blobId, 'string')
      }
    ];

    // Add content_hash input only if includeHash is true
    if (includeHash) {
      inputs.push({
        type: 'pure',
        valueType: 'string',
        value: this.encodeBCS(contentHash, 'string')
      });
    }

    // Continue with remaining inputs
    inputs.push(
      {
        type: 'pure',
        valueType: 'u64',
        value: this.encodeBCS(cellCount, 'u64')
      },
      {
        type: 'pure',
        valueType: 'string',
        value: this.encodeBCS(description, 'string')
      },
      {
        type: 'object',
        objectType: 'sharedObject',
        objectId: this.CLOCK_OBJECT_ID,
        initialSharedVersion: null,
        mutable: false
      }
    );

    // Build arguments array based on whether content_hash is included
    const baseArguments = [
      { Input: 0 }, // &mut Spreadsheet
      { Input: 1 }  // walrus_blob_id: String
    ];

    let callArguments = baseArguments;
    if (includeHash) {
      callArguments = [
        ...baseArguments,
        { Input: 2 }, // content_hash: String
        { Input: 3 }, // cell_count: u64
        { Input: 4 }, // description: String
        { Input: 5 }  // clock: &Clock
      ];
    } else {
      callArguments = [
        ...baseArguments,
        { Input: 2 }, // cell_count: u64
        { Input: 3 }, // description: String
        { Input: 4 }  // clock: &Clock
      ];
    }

    return {
      kind: 'ProgrammableTransaction',
      inputs,
      transactions: [
        {
          MoveCall: {
            package: packageId,
            module: 'spreadsheet',
            function: 'save_version',
            type_arguments: [],
            arguments: callArguments
          }
        }
      ]
    };
  }

  // Build a transaction for locking a cell
  // Move signature:
  // lock_cell(spreadsheet: &mut Spreadsheet, cell_ref: String, clock: &Clock, ctx: &mut TxContext): bool
  buildLockCellTransaction(spreadsheetId, cellRef, sender) {
    const packageId = this.config.sui.packageId;
    
    if (!packageId) {
      throw new Error('Package ID not configured');
    }

    return {
      kind: 'ProgrammableTransaction',
      inputs: [
        {
          type: 'object',
          objectType: 'sharedObject',
          objectId: spreadsheetId,
          initialSharedVersion: null, // Will be fetched
          mutable: true
        },
        {
          type: 'pure',
          valueType: 'string',
          value: this.encodeBCS(cellRef, 'string')
        },
        {
          type: 'object',
          objectType: 'sharedObject',
          objectId: this.CLOCK_OBJECT_ID,
          initialSharedVersion: null,
          mutable: false
        }
      ],
      transactions: [
        {
          MoveCall: {
            package: packageId,
            module: 'spreadsheet',
            function: 'lock_cell',
            type_arguments: [],
            arguments: [
              { Input: 0 }, // &mut Spreadsheet
              { Input: 1 }, // cell_ref: String
              { Input: 2 }  // &Clock
            ]
          }
        }
      ]
    };
  }

  // Build a transaction for unlocking a cell
  // Move signature:
  // unlock_cell(spreadsheet: &mut Spreadsheet, cell_ref: String, clock: &Clock, ctx: &mut TxContext)
  buildUnlockCellTransaction(spreadsheetId, cellRef, sender) {
    const packageId = this.config.sui.packageId;
    
    if (!packageId) {
      throw new Error('Package ID not configured');
    }

    return {
      kind: 'ProgrammableTransaction',
      inputs: [
        {
          type: 'object',
          objectType: 'sharedObject',
          objectId: spreadsheetId,
          initialSharedVersion: null, // Will be fetched
          mutable: true
        },
        {
          type: 'pure',
          valueType: 'string',
          value: this.encodeBCS(cellRef, 'string')
        },
        {
          type: 'object',
          objectType: 'sharedObject',
          objectId: this.CLOCK_OBJECT_ID,
          initialSharedVersion: null,
          mutable: false
        }
      ],
      transactions: [
        {
          MoveCall: {
            package: packageId,
            module: 'spreadsheet',
            function: 'unlock_cell',
            type_arguments: [],
            arguments: [
              { Input: 0 }, // &mut Spreadsheet
              { Input: 1 }, // cell_ref: String
              { Input: 2 }  // &Clock
            ]
          }
        }
      ]
    };
  }

  // Encode value to BCS format for gRPC
  encodeBCS(value, type) {
    switch (type) {
      case 'string':
        // Encode string as UTF-8 bytes with length prefix
        const bytes = new TextEncoder().encode(value);
        const lengthBytes = this.encodeULEB128(bytes.length);
        return Buffer.concat([lengthBytes, bytes]);
      
      case 'u64':
        // Encode as little-endian 64-bit unsigned integer
        const buffer = Buffer.alloc(8);
        buffer.writeBigUInt64LE(BigInt(value));
        return buffer;
      
      case 'address':
        // Encode as 32-byte address (remove 0x prefix if present)
        const cleanAddress = value.startsWith('0x') ? value.slice(2) : value;
        return Buffer.from(cleanAddress.padStart(64, '0'), 'hex');
      
      default:
        throw new Error(`Unsupported BCS type: ${type}`);
    }
  }

  // Encode unsigned LEB128 (for string lengths)
  encodeULEB128(value) {
    const bytes = [];
    while (value >= 0x80) {
      bytes.push((value & 0x7f) | 0x80);
      value >>= 7;
    }
    bytes.push(value & 0x7f);
    return Buffer.from(bytes);
  }

  // Create a complete transaction message for gRPC
  createTransactionMessage(transactionData, gasData) {
    return {
      data: {
        messageVersion: 'v1',
        transaction: transactionData,
        sender: gasData.sender,
        gasData: {
          payment: gasData.payment || [],
          owner: gasData.owner || gasData.sender,
          price: gasData.price || '1000',
          budget: gasData.budget || '10000000'
        }
      },
      txSignatures: [] // Will be added after signing
    };
  }

  // Serialize transaction for signing
  serializeForSigning(transaction) {
    // This would serialize the transaction data to bytes for signing
    // Implementation depends on Sui's BCS serialization format
    return Buffer.from(JSON.stringify(transaction));
  }
}

export const grpcTransactionBuilder = new GrpcTransactionBuilder();
