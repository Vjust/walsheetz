# Hooks Module

React hooks for spreadsheet functionality and integration.

## Overview

Custom React hooks providing spreadsheet lifecycle management, wallet integration, keyboard shortcuts, and unload warnings.

## Exports

### useSpreadsheetLifecycle

Hook for managing spreadsheet lifecycle (mount/unmount).

```javascript
import { useSpreadsheetLifecycle } from '@dreamlit/spreadsheet-sdk/hooks';

function MySpreadsheet() {
  useSpreadsheetLifecycle({
    onMount: () => console.log('Mounted'),
    onUnmount: () => console.log('Unmounted'),
    autoSave: true
  });

  return <div>...</div>;
}
```

---

### useWalletConnection

Hook for Sui wallet connection management.

```javascript
import { useWalletConnection } from '@dreamlit/spreadsheet-sdk/hooks';

function WalletButton() {
  const {
    address,
    isConnected,
    connect,
    disconnect
  } = useWalletConnection();

  return (
    <button onClick={isConnected ? disconnect : connect}>
      {isConnected ? address : 'Connect Wallet'}
    </button>
  );
}
```

---

### useLuckysheetShortcuts

Hook for Luckysheet keyboard shortcuts.

```javascript
import { useLuckysheetShortcuts } from '@dreamlit/spreadsheet-sdk/hooks';

function Spreadsheet() {
  useLuckysheetShortcuts({
    onSave: () => console.log('Ctrl+S pressed'),
    onExport: () => console.log('Ctrl+E pressed')
  });

  return <div id="luckysheet"></div>;
}
```

---

### useUnloadWarning

Hook to warn users before leaving with unsaved changes.

```javascript
import { useUnloadWarning } from '@dreamlit/spreadsheet-sdk/hooks';

function App() {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useUnloadWarning(hasUnsavedChanges, 'You have unsaved changes!');

  return <div>...</div>;
}
```

---

### useWalletConnectionFactory

Factory hook for creating wallet connections.

```javascript
import { useWalletConnectionFactory } from '@dreamlit/spreadsheet-sdk/hooks';

function WalletProvider() {
  const walletConnection = useWalletConnectionFactory({
    network: 'testnet',
    autoConnect: true
  });

  return <div>...</div>;
}
```

## Usage Examples

### Complete Integration

```javascript
import {
  useSpreadsheetLifecycle,
  useWalletConnection,
  useLuckysheetShortcuts,
  useUnloadWarning
} from '@dreamlit/spreadsheet-sdk/hooks';

function SpreadsheetApp() {
  const [hasChanges, setHasChanges] = useState(false);
  const wallet = useWalletConnection();

  useSpreadsheetLifecycle({
    onMount: () => console.log('Ready'),
    onUnmount: save
  });

  useLuckysheetShortcuts({
    onSave: handleSave,
    onExport: handleExport
  });

  useUnloadWarning(hasChanges, 'Unsaved changes will be lost!');

  return <div>...</div>;
}
```

## Related Modules

- [../business/](../business/) - Business hooks
- [../components/](../components/) - Components use hooks

## Notes

- Follow React hooks rules
- Provide focused functionality
- Handle cleanup automatically
- Integrate with Sui wallet providers
