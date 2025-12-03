# Providers Module

React context providers for spreadsheet SDK state management.

## Overview

This module contains React context providers for managing global state including network configuration, wallet connections, and spreadsheet data.

## Exports

### NetworkProvider

Provider for network configuration (testnet/mainnet).

```javascript
import { NetworkProvider, useNetwork } from '@dreamlit/spreadsheet-sdk/providers';

function App() {
  return (
    <NetworkProvider initialNetwork="testnet">
      <MyApp />
    </NetworkProvider>
  );
}

function MyApp() {
  const { network, switchNetwork } = useNetwork();

  return (
    <div>
      Current network: {network}
      <button onClick={() => switchNetwork('mainnet')}>
        Switch to Mainnet
      </button>
    </div>
  );
}
```

**Features:**
- Network switching (testnet ↔ mainnet)
- Network mismatch detection
- Network-specific configuration

---

### WalletProviders

Provider wrapper for Sui wallet integration using @mysten/dapp-kit.

```javascript
import { WalletProviders } from '@dreamlit/spreadsheet-sdk/providers';

function App() {
  return (
    <WalletProviders network="testnet">
      <MyApp />
    </WalletProviders>
  );
}
```

**Provides:**
- Wallet connection state
- Connected account info
- Transaction signing
- Multi-wallet support (Sui Wallet, Ethos, Suiet)

## Usage

### Complete Provider Stack

```javascript
import {
  NetworkProvider,
  WalletProviders
} from '@dreamlit/spreadsheet-sdk/providers';

function App() {
  return (
    <NetworkProvider initialNetwork="testnet">
      <WalletProviders>
        <SpreadsheetApp />
      </WalletProviders>
    </NetworkProvider>
  );
}
```

### Using Network Context

```javascript
import { useNetwork } from '@dreamlit/spreadsheet-sdk/providers';

function NetworkSwitch() {
  const {
    network,
    switchNetwork,
    isTestnet,
    isMainnet
  } = useNetwork();

  return (
    <select value={network} onChange={(e) => switchNetwork(e.target.value)}>
      <option value="testnet">Testnet</option>
      <option value="mainnet">Mainnet</option>
    </select>
  );
}
```

### Using Wallet Context

```javascript
import { useWallet } from '@mysten/dapp-kit';

function WalletInfo() {
  const wallet = useWallet();

  if (!wallet.connected) {
    return <button onClick={wallet.connect}>Connect</button>;
  }

  return <div>Address: {wallet.account.address}</div>;
}
```

## Context Values

### NetworkContext

```typescript
{
  network: 'testnet' | 'mainnet';
  switchNetwork: (network: string) => void;
  isTestnet: boolean;
  isMainnet: boolean;
  config: NetworkConfig;
}
```

### WalletContext (via @mysten/dapp-kit)

```typescript
{
  connected: boolean;
  connecting: boolean;
  account: { address: string } | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTransaction: (tx: TransactionBlock) => Promise<SignedTransaction>;
  signAndExecuteTransaction: (tx: TransactionBlock) => Promise<Result>;
}
```

## Related Modules

- [../components/](../components/) - Components consume context
- [../business/](../business/) - Business logic uses context
- [../hooks/](../hooks/) - Hooks access context

## Notes

- Providers should wrap the entire app
- NetworkProvider should be outermost
- WalletProviders integrates with @mysten/dapp-kit
- Context values are reactive and trigger re-renders
