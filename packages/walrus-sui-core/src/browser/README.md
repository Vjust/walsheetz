# Browser Module

Browser-specific entry point for @dreamlit/walrus-sui-core with wallet integration and CORS-compatible services.

## Overview

This module provides the browser-optimized entry point for walrus-sui-core, including browser wallet management, proxy-routed services, and browser-compatible blockchain operations.

## Exports

```javascript
import {
  BrowserSuiService,
  BrowserWalletManager,
  BrowserGrpcService
} from '@dreamlit/walrus-sui-core/browser';
```

### BrowserSuiService
Browser-compatible Sui RPC client with proxy routing.

### BrowserWalletManager
Browser wallet connection (Sui Wallet, Ethos, etc.).

### BrowserGrpcService
gRPC service for browser environments.

## Usage

### Basic Browser Integration

```javascript
import { BrowserSuiService, BrowserWalletManager } from '@dreamlit/walrus-sui-core/browser';

// Connect wallet
const walletManager = new BrowserWalletManager();
await walletManager.connect();

// Use Sui service
const suiService = new BrowserSuiService();
const balance = await suiService.getBalance(walletManager.getAddress());
```

### With Wallet Connection

```javascript
import { BrowserWalletManager } from '@dreamlit/walrus-sui-core/browser';

const wallet = new BrowserWalletManager();

// Connect
await wallet.connect();
console.log('Connected:', wallet.getAddress());

// Sign transaction
const signed = await wallet.signTransaction(txBlock);

// Execute transaction
const result = await wallet.signAndExecuteTransaction(txBlock);
```

## Features

- Browser wallet integration (Sui Wallet, Ethos, Suiet)
- CORS-compatible proxy routing
- Real-time transaction status
- Event emission for UI updates

## Dependencies

**Internal:**
- `../blockchain-integration/` - Browser services

**External:**
- `@mysten/dapp-kit` - Wallet integration
- `@mysten/sui` - Sui SDK

## Related Modules

- [../node/](../node/) - Node.js entry point
- [../blockchain-integration/](../blockchain-integration/) - Core services
- [../blockchain/](../blockchain/) - Blockchain services

## Notes

- Uses ProxyTransport for CORS compatibility
- Supports multiple wallet providers
- Emits events for UI state updates
- Recommended for browser/dApp integration
