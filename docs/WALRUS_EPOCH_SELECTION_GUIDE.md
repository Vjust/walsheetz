# Walrus Epoch Selection Feature - Implementation Guide

## Overview
This guide completes the implementation of user-selectable Walrus storage duration (epochs) for WalSheetz. The UI components and storage layer are ready; this document details the remaining threading work.

## Completed Components ✅

### 1. Configuration (blockchain/config.js)
Added epoch configuration constants:
- `epochMax: 200` - Upper bound for user selection
- `epochsDefault: 50` - Fallback default
- `epochRenewalWarningDays: 7` - Warning threshold

### 2. Storage Adapter (frontend/adapters/StorageAdapter.js)
Added methods to persist user preferences:
```javascript
setWalrusEpochPreference(spreadsheetId, epochs)
getWalrusEpochPreference(spreadsheetId)
```
Preferences stored in localStorage with key: `walsheetz_epoch_pref_{spreadsheetId}`

### 3. UI Components
- **StoragePurchaseModal** (`frontend/presentation/components/StoragePurchaseModal.jsx`)
  - Epoch slider/input (1-200)
  - Expiry preview calculation
  - Current storage info display
  - Walrus connection status check

- **SaveStatusIndicator Update** (`frontend/presentation/components/SaveStatusIndicator.jsx`)
  - Added `onManageStorage` prop
  - "Manage Storage" button appears on expiry warnings

## Remaining Work - Threading Epochs Through Save Chain

### Phase 1: Add Epoch Preference Hooks

**File:** `frontend/business/useSpreadsheet.js`

Add after the `disconnectWallet` function (around line 698):

```javascript
// Get Walrus epoch preference for current spreadsheet
const getWalrusEpochPreference = useCallback(() => {
  if (!storageRef.current) return null
  const spreadsheetId = storageRef.current.getCurrentSpreadsheetId()
  if (!spreadsheetId) return null

  const preference = storageRef.current.getWalrusEpochPreference(spreadsheetId)
  if (preference) return preference

  // Fallback to config default if no preference set
  const { getCurrentConfig } = require('@blockchain/config.js')
  const config = getCurrentConfig()
  return config.walrus?.features?.epochsDefault || 50
}, [])

// Set Walrus epoch preference for current spreadsheet
const setWalrusEpochPreference = useCallback(async (epochs) => {
  if (!storageRef.current) {
    return { success: false, error: 'Storage not initialized' }
  }

  const spreadsheetId = storageRef.current.getCurrentSpreadsheetId()
  if (!spreadsheetId) {
    return { success: false, error: 'No spreadsheet loaded' }
  }

  const success = storageRef.current.setWalrusEpochPreference(spreadsheetId, epochs)

  if (success) {
    console.log(`Walrus epoch preference saved for spreadsheet: ${epochs} epochs`)
    return { success: true }
  } else {
    return { success: false, error: 'Failed to save preference' }
  }
}, [])
```

Add to the return object at the end of useSpreadsheet (around line 822):
```javascript
    getWalrusEpochPreference,
    setWalrusEpochPreference,
```

### Phase 2: Update saveToBlockchain Method

**File:** `frontend/business/useSpreadsheet.js`

Modify the `saveToBlockchain` function signature and implementation (around line 700):

**Before:**
```javascript
const saveToBlockchain = useCallback(async (title = null) => {
  // ...
  const result = await engineRef.current.save(title)
```

**After:**
```javascript
const saveToBlockchain = useCallback(async (title = null, epochs = null) => {
  // ...

  // Get epoch preference if not explicitly provided
  let epochsToUse = epochs
  if (!epochsToUse) {
    epochsToUse = getWalrusEpochPreference()
  }

  // ...
  const result = await engineRef.current.save(title, epochsToUse)
```

### Phase 3: Update SpreadsheetEngine

**File:** `frontend/core/SpreadsheetEngine.js`

Find and update the `save` method signature:

**Before:**
```javascript
async save(title = null) {
  // ... implementation
}
```

**After:**
```javascript
async save(title = null, epochs = null) {
  // At the start of the method, capture the epochs parameter
  const epochsToUse = epochs || 50

  // ... rest of implementation

  // Pass epochs to saveSpreadsheet call:
  const result = await this.blockchainAdapter.saveSpreadsheet(
    spreadsheetData,
    {
      title,
      epochs: epochsToUse
    }
  )
```

### Phase 4: Update BlockchainAdapter

**File:** `frontend/adapters/BlockchainAdapter.js`

Update the `saveSpreadsheet` method to handle epochs:

Find the method where it calls `walrusService.storeBlob`:

**Before:**
```javascript
const walrusResult = await this.walrusService.storeBlob(spreadsheetData, {
  epochs: 50,
  contentType: 'application/json'
})
```

**After:**
```javascript
const epochs = options?.epochs || 50
const walrusResult = await this.walrusService.storeBlob(spreadsheetData, {
  epochs: epochs,
  contentType: 'application/json'
})
```

Also update `createNewSpreadsheetOptimized` method:

**Before:**
```javascript
const walrusResult = await this.walrusService.storeBlob(data, {
  epochs: 50,
  contentType: 'application/json'
})
```

**After:**
```javascript
// Get default epochs from config if not provided
const { getCurrentConfig } = require('../blockchain/config.js')
const config = getCurrentConfig()
const epochs = config.walrus?.features?.epochsDefault || 50

const walrusResult = await this.walrusService.storeBlob(data, {
  epochs: epochs,
  contentType: 'application/json'
})
```

### Phase 5: Wire Up Modal in Main App

**File:** The main App component (likely `frontend/presentation/App.jsx` or `frontend/pages/SpreadsheetWorkspace.jsx`)

Add state for modal:
```javascript
const [storageModalOpen, setStorageModalOpen] = useState(false)
```

Add handler:
```javascript
const handleManageStorage = () => {
  setStorageModalOpen(true)
}

const handleSaveStoragePreference = async (epochs) => {
  if (useSpreadsheet && useSpreadsheet.setWalrusEpochPreference) {
    const result = await useSpreadsheet.setWalrusEpochPreference(epochs)
    if (result.success) {
      console.log('Storage preference saved:', epochs)
    }
  }
}
```

Import the modal component:
```javascript
import { StoragePurchaseModal } from './components/StoragePurchaseModal'
```

Add modal to JSX:
```javascript
<StoragePurchaseModal
  isOpen={storageModalOpen}
  onClose={() => setStorageModalOpen(false)}
  onSave={handleSaveStoragePreference}
  chunkMetadata={currentChunkMetadata}
  walrusConnected={walletConnected && walrusServiceReady}
/>
```

Pass handler to SaveStatusIndicator:
```javascript
<SaveStatusIndicator
  // ... existing props
  onManageStorage={handleManageStorage}
/>
```

## Testing Checklist

- [ ] Open StoragePurchaseModal and adjust epoch slider
- [ ] Verify preference is saved to localStorage (`walsheetz_epoch_pref_*`)
- [ ] Create new spreadsheet with custom epochs
- [ ] Check Walrus response includes `epochsPurchased` field matching selected value
- [ ] Reload page, create new save, verify preference persists
- [ ] Test with different spreadsheets, verify separate preferences
- [ ] Verify default fallback when no preference set
- [ ] Test expiry warning button opens modal
- [ ] Validate min (1) and max (200) epoch bounds

## Configuration Reference

Access via:
```javascript
import { getCurrentConfig } from '@blockchain/config.js'
const config = getCurrentConfig()
const epochMax = config.walrus.features.epochMax // 200
const epochDefault = config.walrus.features.epochsDefault // 50
const warningDays = config.walrus.features.epochRenewalWarningDays // 7
```

## Key Files Summary

| File | Change | Status |
|------|--------|--------|
| blockchain/config.js | Added epochMax, epochRenewalWarningDays | ✅ Done |
| frontend/adapters/StorageAdapter.js | Added get/set preference methods | ✅ Done |
| frontend/presentation/components/StoragePurchaseModal.jsx | New modal component | ✅ Done |
| frontend/presentation/styles/StoragePurchaseModal.css | Modal styles | ✅ Done |
| frontend/presentation/components/SaveStatusIndicator.jsx | Added onManageStorage prop | ✅ Done |
| frontend/business/useSpreadsheet.js | Add epoch pref hooks, thread epochs | ⏳ TODO |
| frontend/core/SpreadsheetEngine.js | Accept epochs parameter | ⏳ TODO |
| frontend/adapters/BlockchainAdapter.js | Pass epochs to Walrus | ⏳ TODO |
| App component | Wire up modal handlers | ⏳ TODO |

## Notes

1. **Error Handling**: All methods include graceful fallbacks to default epoch count if preference retrieval fails
2. **Per-Spreadsheet Preferences**: Preferences are stored and retrieved by spreadsheet ID, allowing different durations per sheet
3. **Config-Driven**: Uses getCurrentConfig() for centralized configuration management
4. **UI Flow**:
   - User clicks "Manage Storage" button on expiry warning
   - Modal opens showing current blob expiry info
   - User selects epochs via slider or input
   - Preference saved to localStorage
   - Next save uses new preference

## Future Enhancements

- Batch renewal modal for multiple expired blobs
- Cost estimation for different epoch selections
- Renewal recommendation based on usage patterns
- Historical epoch selection analytics

---

Generated as part of the Walrus Epoch Selection UI Implementation Phase
