# Save Verification & Walrus Renewal Guide

## Overview

WalSheetz now provides comprehensive save verification with detailed Walrus blob and Sui transaction information. Users can:
- View blob IDs and transaction digests with copy-to-clipboard
- Check storage status and expiry information
- Access explorer links for both Walrus and Sui blockchain
- Renew Walrus storage without re-uploading data

## Troubleshooting: Spreadsheet Not Found on Chain

### Issue
When attempting to save, users may see the error: **"Spreadsheet not found on-chain: Object does not exist on-chain. The spreadsheet object may not have been created on this network."**

### Root Cause
A spreadsheet object ID was stored in session storage but the actual spreadsheet was never created on the blockchain network (e.g., trying to load a testnet spreadsheet on mainnet, or a failed creation transaction).

### Solution

#### Automatic Recovery
The system now automatically:
1. **Validates** the spreadsheet exists before loading
2. **Detects** when a spreadsheet object is not the correct type (e.g., registry vs spreadsheet)
3. **Clears** invalid session data when an object isn't found
4. **Prompts** the user to create a new spreadsheet

#### Manual Fix
If you see this error:
1. **Create a new spreadsheet** using "New Spreadsheet" button
2. The new spreadsheet will be created on the current network (mainnet/testnet)
3. Enter your data and save - it will now sync to the blockchain

#### For Developers
The fix includes:
- **`BrowserSuiService.validateSpreadsheetExists()`** - Validates object type and existence
- **`StorageAdapter.clearInvalidSpreadsheetSession()`** - Clears corrupted session data
- Enhanced filtering in `getUserSpreadsheets()` to exclude registry objects

**Code locations**:
- Validation: `BrowserSuiService.js:1600` (new method)
- Session clearing: `StorageAdapter.js:314` (new method)
- Load validation: `BlockchainAdapter.js:2329` (before load)

## Architecture

### Save Metadata Flow

1. **BlockchainAdapter** captures metadata during save:
   - Walrus blob ID
   - Sui transaction digest
   - Content hash
   - Storage status (`newly_created` or `already_certified`)
   - Expiry timestamp
   - Storage strategy (standard, delta-compression, redundancy)

2. **SpreadsheetEngine** stores metadata in `_lastSaveInfo`:
   - Accessible via `getLastSaveInfo()` getter
   - Marks first save with `isFirstSave` flag
   - Emits `save:details-update` event

3. **useSpreadsheet** hook tracks in `lastSaveInfo` state:
   - Updated on successful blockchain save
   - Exposed in hook return value
   - Passed through SpreadsheetProvider context

4. **SaveDetailsModal** displays full metadata:
   - Two tabs: Walrus Storage | Blockchain
   - Copy buttons for IDs
   - Explorer links (Walrus, Sui Explorer, Suivision)
   - Renewal capability

## Components

### SaveDetailsModal

**Location**: `frontend/presentation/components/SaveDetailsModal.jsx`

**Props**:
```javascript
{
  isOpen: boolean,           // Modal visibility
  onClose: () => void,       // Close handler
  saveInfo: {                // Save metadata
    blobId: string,
    transactionDigest: string,
    contentHash: string,
    storageStatus: string,   // 'newly_created' | 'already_certified'
    expiryTimestamp: number,
    endEpoch: number,
    method: string,
    storageStrategy: string,
    timestamp: number,
    isFirstSave: boolean
  },
  network: string            // 'testnet' | 'mainnet'
}
```

**Features**:
- Tabbed interface (Walrus Storage | Blockchain)
- Copy-to-clipboard for blob ID and transaction digest
- Expiry countdown timer
- Warning when storage expires within 7 days
- "Extend Storage" button for renewal
- Multiple explorer links:
  - Walrus Explorer (testnet/mainnet)
  - Sui Explorer (with network param)
  - Suivision (alternative Sui explorer)

### ExplorerLinks Utility

**Location**: `frontend/utils/ExplorerLinks.js`

**Functions**:
```javascript
getSuiExplorerUrl(digest, network)           // Sui Explorer URL
getSuivisionUrl(digest, network)             // Suivision URL
getWalrusExplorerUrl(blobId, network)        // Walrus Explorer URL
getAllExplorerLinks(blobId, digest, network) // All explorer links
getExplorerDisplayName(type)                 // Display name
getExplorerIcon(type)                        // Icon emoji
```

**Example**:
```javascript
import { getSuiExplorerUrl, getWalrusExplorerUrl } from '../../utils/ExplorerLinks.js';

const suiUrl = getSuiExplorerUrl('0xabc...', 'testnet');
const walrusUrl = getWalrusExplorerUrl('blob123', 'testnet');
```

### StorageAdapter Extensions

**Location**: `frontend/adapters/StorageAdapter.js`

**New Methods**:
```javascript
setWalrusBlobExpiry(blobId, expiryInfo)      // Store expiry metadata
getWalrusBlobExpiry(blobId)                  // Retrieve expiry metadata
getAllBlobExpiry()                           // Get all tracked blobs
isBlobExpiryApproaching(blobId, warningDays) // Check renewal status
```

### BrowserWalrusService Extensions

**Location**: `frontend/services/BrowserWalrusService.js`

**New Method**:
```javascript
async extendBlobStorage(blobId, additionalEpochs = 10) {
  // Renews blob certification without re-uploading
  // Calls Walrus aggregator PUT /v1/blobs/{blobId}
  // Returns: { success, status, endEpoch, remainingEpochs, expiryTimestamp }
}
```

**Usage**:
```javascript
const result = await browserWalrusService.extendBlobStorage('blob123', 10);
if (result.success) {
  console.log(`Blob extended until epoch ${result.endEpoch}`);
}
```

## User Flow

### First Save
1. User saves spreadsheet → **Blockchain save completes**
2. SaveDetailsModal **auto-opens** automatically (first time only)
3. User sees:
   - Blob ID with copy button
   - Transaction digest with copy button
   - Walrus storage status
   - Links to explorers
   - Expiry date (if available)

### Subsequent Saves
1. User saves → **Metadata captured**
2. "View Details" button available in **SaveStatusIndicator**
3. Clicking opens SaveDetailsModal on-demand

### Storage Renewal
1. User sees warning when **< 7 days until expiry**
2. "Extend Storage" button appears in modal
3. Clicking calls `extendBlobStorage()` with 10 epochs
4. **No re-upload required** - existing blob is renewed
5. Expiry timestamp updates

## Integration Points

### In Header.jsx
```javascript
// Auto-open modal on first save
useEffect(() => {
  if (lastSaveInfo && lastSaveInfo.isFirstSave) {
    const hasShown = localStorage.getItem('walsheetz_first_save_shown');
    if (!hasShown) {
      setShowSaveDetails(true);
      localStorage.setItem('walsheetz_first_save_shown', 'true');
    }
  }
}, [lastSaveInfo])

// Render modal
<SaveDetailsModal
  isOpen={showSaveDetails}
  onClose={() => setShowSaveDetails(false)}
  saveInfo={lastSaveInfo}
  network={configLoader.config?.currentNetwork || 'testnet'}
/>
```

### In SaveStatusIndicator.jsx
```javascript
// Pass callback to open modal
<SaveStatusIndicator
  // ... other props
  blobId={lastSaveInfo?.blobId}
  onViewDetails={() => setShowSaveDetails(true)}
/>
```

### Event Listening
```javascript
// Listen for save details updates
window.addEventListener('save:details-update', (event) => {
  const saveInfo = event.detail;
  console.log('Save completed:', saveInfo);
});
```

## Storage Renewal Process

### Without Renewal
1. Blob stored with 50 epochs
2. After expiry → data deleted from Walrus network
3. Cannot recover data

### With Renewal
1. Blob stored with 50 epochs
2. **Before expiry**: Call `extendBlobStorage(blobId, 10)`
3. **No new upload**: Existing blob certified for 10 more epochs
4. **Cost effective**: Pay only for extended epochs, not re-upload

### Renewal UI
- Warning badge: "Storage expires in 5d 3h"
- Button: "Extend Storage"
- Success: "Storage extended successfully!"

## Testing

### Unit Tests
- `frontend/business/__tests__/useSpreadsheet.saveMetadata.test.js` - Hook metadata tracking
- `frontend/adapters/__tests__/BlockchainAdapter.metadata.test.js` - Adapter returns

### Manual Testing Checklist
- [ ] Save succeeds → Modal auto-opens (first time)
- [ ] Modal displays blob ID and transaction digest
- [ ] Copy buttons work for both IDs
- [ ] Explorer links open correct URLs
- [ ] Storage status displays correctly
- [ ] Expiry countdown shows accurate time
- [ ] Renewal button appears when < 7 days
- [ ] Clicking renewal extends blob successfully
- [ ] SaveStatusIndicator "View Details" works on subsequent saves
- [ ] Modal works on both testnet and mainnet

## Configuration

### Network Detection
Network is auto-detected from:
1. URL parameter: `?network=mainnet`
2. localStorage: `walsheetz_network`
3. Hostname matching (mainnet, devnet, etc.)
4. Default: `testnet`

### Explorer URLs
- **Testnet Walrus**: `https://walrus-explorer.testnet.walrus.space`
- **Mainnet Walrus**: `https://walrus-explorer.walrus.space`
- **Sui Explorer**: `https://suiexplorer.com` (with `?network=` param)
- **Suivision**: `https://suivision.xyz`

## Error Handling

### Missing Metadata
- Blob ID unavailable: Hide "View Details" button
- Transaction digest missing: Show "N/A" with explanation
- Expiry timestamp unknown: Don't show countdown

### Renewal Failures
- Network unavailable: Show error message
- Blob not found (404): Display warning, suggest re-saving
- Rate limited: Suggest retry in N seconds

## Performance

- **No impact on saves**: Metadata captured asynchronously
- **Modal lightweight**: ~15KB gzipped
- **Zero re-uploads**: Renewal uses existing blob only
- **Event-driven**: UI updates via custom events, no polling

## Future Enhancements

1. **Bulk renewal**: Extend multiple blobs at once
2. **Renewal scheduler**: Auto-extend before expiry
3. **Expiry dashboard**: View all blob expiries
4. **Multi-explorer**: Support additional explorers
5. **Metadata export**: Download save history as CSV/JSON
6. **Webhook notifications**: Alert on approaching expiry

## Troubleshooting

### Modal doesn't open on first save
- Check localStorage: `localStorage.getItem('walsheetz_first_save_shown')`
- Clear flag: `localStorage.removeItem('walsheetz_first_save_shown')`
- Refresh and try again

### Explorer links don't work
- Verify network selection is correct
- Check blob/digest values are not truncated
- Ensure blob exists on network (may take a moment)

### Renewal button inactive
- Verify expiry is within 7 days
- Check wallet is connected
- Ensure blob ID is available

## References

- [Walrus Documentation](https://docs.walrus.space)
- [Sui Documentation](https://docs.sui.io)
- [WalSheetz Architecture](./STORAGE_ARCHITECTURE.md)
