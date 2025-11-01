# WalSheetz Storage Architecture

## Overview

WalSheetz uses a **RAM-first, blockchain-primary** storage architecture with carefully justified localStorage exceptions. This document explains the storage model, data flow, and exception justifications.

### Core Principle
> **Primary Storage**: Sui Blockchain + Walrus (mandatory for persistence)
> **Session Cache**: RAM only (lost on page reload)
> **Exceptions**: Minimal localStorage usage for UX/performance (documented below)

---

## Storage Layers

### Layer 1: Primary Storage (Sui Blockchain + Walrus)
**Responsibility**: Permanent data persistence
**Mandatory For**: All spreadsheet data, version history, metadata
**Lifecycle**: Persists indefinitely unless user deletes
**Accessibility**: Accessible across sessions, devices, and browsers

**Implementation**:
```javascript
// All saves must go through blockchain first
await this.blockchainService.saveToBlockchain(data, { epochs })
```

---

### Layer 2: RAM Cache (In-Memory, Session-Scoped)
**Responsibility**: Performance optimization, user editing state
**Contains**:
- Active spreadsheet edits
- Cell history (current session only)
- Import/export history
- Transaction tracking
- Renewal monitoring

**Lifecycle**: Lives exactly as long as the page load
**Data Loss**: **Expected and intentional** on page refresh

**Implementation**:
```javascript
// StorageAdapter.js - RAM-only
this._data = saveData;        // In-memory only
this._history = editHistory;   // In-memory only
this._session = sessionObj;    // In-memory only
```

---

### Layer 3: localStorage Exceptions (Documented & Minimal)
The following use browser localStorage **with explicit justification**:

#### Exception 1: Network Preference (`walsheetz_network`)
**Key**: `walsheetz_network`
**Values**: `"testnet"` or `"mainnet"`
**Justification**:
- User shouldn't need to re-select network environment on every page reload
- Network selection is a user preference, not session-critical data
- Reduces friction for frequent page reloads during development/debugging

**Scope**: Single key, single value (8 bytes)
**Cleared**: Never (user preference persists)
**Risk**: Low - wrong network selected, but easily corrected

**Code Location**: `frontend/providers/NetworkProvider.jsx:8-21`

---

#### Exception 2: Migration Resume State (`walsheetz_pending_migration`)
**Key**: `walsheetz_pending_migration`
**Content**: `{spreadsheetId, progress, timestamp, newTitle}`
**Justification**:
- Migrations can be long-running operations (minutes to hours)
- User's browser might crash or refresh during migration
- Losing migration state would force restart from beginning
- Better UX to resume from checkpoint

**Scope**: Single JSON object (~500 bytes), cleared after migration completes
**Cleared**: Automatically after migration succeeds/fails
**Risk**: Low - affects only active migrations

**Code Locations**:
- `frontend/presentation/components/MigrationDialog.jsx:32`
- `frontend/pages/Dashboard.jsx:336`

---

#### Exception 3: Progressive Save Fallback (`walsheetz_fallback_*`)
**Key Pattern**: `walsheetz_fallback_${timestamp}`
**Content**: Full spreadsheet data JSON
**Justification**:
- Network outages can occur at any time
- Blockchain saves might temporarily fail
- User shouldn't lose unsaved work due to network hiccup
- Data should retry sync when connection is restored

**Scope**: Temporary, automatically cleaned up after successful blockchain sync
**Cleared**: After successful blockchain save, or manually by user
**Risk**: Medium - stores data in localStorage as fallback

**User Visibility**: Displayed in SaveStatusBanner:
```
⚠️ Network disconnected - 1 change saved locally only
[Retry Save to Blockchain]
```

**Code Location**: `frontend/adapters/BlockchainAdapter.js:1769-1787`

---

#### Exception 4: Debug Flags (Optional)
**Key Pattern**: `walsheetz_debug_*`
**Justification**:
- Enables developer debugging across page reloads
- Reduces friction for troubleshooting

**Scope**: Optional, developer-only
**Cleared**: Manual, or on version update
**Risk**: Low - doesn't affect production

---

## Data Flow

### Typical Edit & Save Sequence
```
1. User edits cell
   → Stored in RAM (SpreadsheetEngine.pendingEdits)

2. Auto-save triggered (30 seconds)
   → Try blockchain save first

3. Blockchain save succeeds
   → Cache to RAM (StorageAdapter._data)
   → Network = "connected" (in header)
   → Return success

4. Blockchain save fails (network error)
   → Emit save:fallback event
   → Write to localStorage (walsheetz_fallback_*)
   → Show SaveStatusBanner: "Network disconnected - saved locally"
   → Return fallback result

5. User clicks "Retry Save"
   → Blockchain save succeeds
   → Clear fallback localStorage key
   → Dismiss SaveStatusBanner
   → RAM cache updated

6. Page reload without blockchain save
   → All RAM data lost (⚠️ unsaved edits gone)
   → Fallback data in localStorage recovered
   → Auto-retry on next page load
   → If blockchain was never reached, data lost entirely
```

---

## User Guidance

### What Persists Across Page Reload
✅ **Network preference** (testnet/mainnet)
✅ **Migration resume state** (if migration in progress)
✅ **Unsaved fallback data** (will retry sync on next load)

### What Is Lost on Page Reload
❌ **Active spreadsheet edits** (unless blockchain saved)
❌ **Undo/redo history**
❌ **Import history**
❌ **In-memory caches**
❌ **Transaction tracking**
❌ **Renewal monitoring**

---

## Fallback Retry System

The system automatically retries fallback saves on app startup and allows manual retries via UI:

### Auto-Retry on Startup
1. App initializes (App.jsx useEffect)
2. BlockchainAdapter.setupRetryEventListeners() - Sets up listeners for manual retries
3. After 2-second delay: BlockchainAdapter.autoRetryFallbacksOnStartup()
   - Waits for wallet connection (max 5 seconds)
   - Retries each fallback sequentially with 500ms delays
   - Emits `save:startup-retry-complete` event with summary
   - Checks for stale fallbacks (>7 days old)

### Manual Retry via Button
1. User clicks "Retry Save" in SaveStatusBanner
2. SaveStatusBanner emits `save:retry-fallbacks` event
3. BlockchainAdapter.setupRetryEventListeners() listens for this event
4. Calls BlockchainAdapter.retryFallbackSave() for each key
5. Emits `save:retry-success` or `save:retry-failed` event
6. SaveStatusBanner listens and updates UI accordingly

### Retry Success Flow
```
Fallback exists in localStorage
↓
Parse JSON data
↓
BlockchainAdapter.save() called
↓
Success: Delete localStorage key
↓
Emit save:retry-success
↓
SaveStatusBanner removes from UI
```

### Stale Fallback Cleanup
After auto-retry completes, the system checks for stale fallbacks (>7 days old):

1. BlockchainAdapter.checkStaleFallbacks(maxAgeDays=7)
   - Scans all `walsheetz_fallback_*` keys
   - Extracts timestamp from key
   - Returns array of stale items with: key, age, size, ageInDays

2. If stale fallbacks found:
   - App.jsx emits `stale:fallbacks-found` event
   - UI shows StaleFallbackCleanupModal
   - User options:
     - **Export as JSON**: Downloads backup of fallback data
     - **Keep Trying**: Keeps fallback for next auto-retry
     - **Delete Selected**: Removes stale keys from localStorage

3. User Actions:
   - BlockchainAdapter.exportFallbackAsJSON(key) - Downloads JSON
   - BlockchainAdapter.deleteStaleFallbacks(keys) - Removes from storage

---

## Network Preference Synchronization

The system uses NetworkLock to prevent race conditions between NetworkProvider and ConfigLoader:

### NetworkLock Utility
- **File**: `frontend/utils/NetworkLock.js`
- Simple async lock with queue system
- Methods:
  - `acquireLock()`: Blocks if lock held, queues if contention
  - `releaseLock()`: Wakes next queued callback
  - `withLock(callback)`: Atomic read-modify-write
  - `isLocked()`: Check current state
  - `getQueueSize()`: Debugging info

### NetworkProvider Usage
```javascript
// Wraps localStorage write with lock
networkLock.withLock(async () => {
  localStorage.setItem('walsheetz_network', network);
});
```

### ConfigLoader Usage
```javascript
// In config.switchNetwork()
await networkLock.withLock(async () => {
  localStorage.setItem('walsheetz_network', networkName);
});
```

**Key Point**: Initialization read in `_detectCurrentNetwork()` does NOT use lock because it runs before NetworkProvider starts.

---

## Error Scenarios & Recovery

### Scenario 1: Network Outage During Save
```
User edits → Auto-save triggered → Network unavailable
↓
Fallback to localStorage (walsheetz_fallback_*)
↓
Show SaveStatusBanner: "Network disconnected - saved locally"
↓
User clicks "Retry Save" button (or app auto-retries on reload)
↓
Blockchain save succeeds → Clear fallback
↓
SaveStatusBanner shows "✅ Save synced to blockchain"
```

### Scenario 2: Page Refresh Before Blockchain Save
```
User edits → Auto-save triggered
↓
Page refresh (warning shown if pendingEdits exist via useUnloadWarning)
↓
If fallback exists: auto-retry on startup via autoRetryFallbacksOnStartup()
↓
If retry succeeds: fallback cleared, data synced
↓
If no fallback: data is gone
```

### Scenario 3: Wallet Disconnected
```
User edits → Auto-save triggered
↓
Wallet not connected
↓
Save fails immediately (no fallback)
↓
Show error: "Connect wallet to save"
↓
User connects wallet → retry
```

---

## Unload Warning System

Prevents accidental data loss by warning users before leaving with unsaved edits:

### Implementation
- **Hook**: `frontend/presentation/hooks/useUnloadWarning.js`
- **Usage**: `frontend/pages/SpreadsheetEditor.jsx`
- Shows browser's native "Are you sure?" dialog when:
  - `window.spreadsheetEngine.pendingEdits.size > 0`
  - User tries to navigate away or close tab/window

### Flow
1. SpreadsheetEditor checks pendingEdits every 500ms
2. If `pendingEdits.size > 0`, calls `useUnloadWarning(true)`
3. useUnloadWarning adds `beforeunload` event listener
4. Browser shows native confirmation dialog
5. User can choose to stay or leave

### Message
```
"You have unsaved changes in your spreadsheet.
Your edits will sync to blockchain when saved."
```

---

## Technical Implementation

### Walrus Storage Architecture (Modular)
The Walrus storage client is implemented as a modular, layered architecture:

**Client Layer** (`frontend/services/walrus/client/`)
- `WalrusBlobClient.js` - Core blob storage orchestration, compression, integrity validation
- `WalrusConnectionManager.js` - Connection lifecycle management and pooling

**Transport Layer** (`frontend/services/walrus/transports/`)
- `Transport.js` - Base transport interface
- `ProxyTransport.js` - Vite dev proxy transport (routes through /api/walrus-*)
- `DirectTransport.js` - Direct endpoint transport for production

**Configuration** (`frontend/services/walrus/config/`)
- `WalrusConfigResolver.js` - Environment-aware configuration management
- `endpointHelper.js` - Endpoint resolution, fallback logic, health-based routing

**Data Processing** (`frontend/services/walrus/utils/`)
- `DataEncoder.js` - Spreadsheet data encoding, compression (gzip), base64 handling
- `DataValidator.js` - Data validation before Walrus storage (size limits, format checks)
- `GridStreamer.js` - Grid-to-blob streaming for large datasets
- `BlobRangeReader.js` - Partial blob reading support
- `PoACertificateReader.js` - Proof-of-Availability certificate parsing

**Supporting Infrastructure** (`frontend/services/walrus/`)
- `health/HealthMonitor.js` - Endpoint health checking and connectivity monitoring
- `retry/RetryQueue.js` - Queue-based retry mechanism with exponential backoff
- `utils/WalrusEventEmitter.js` - Event emission system for storage operations

**Facade** (`frontend/services/`)
- `BrowserWalrusService.js` - Main facade that orchestrates the modular components

### RAM-Only Services
These services operate entirely in memory (session-scoped):
- `StorageAdapter.js` - Spreadsheet data cache
- `IndexedDBCache.js` - In-memory blob cache
- `PoACertificationService.js` - PoA certificates (transient)
- `BlobLineageTracker.js` - Version lineage (transient)
- `TransactionTracker.js` - Transaction history (transient)
- `OfflineModeService.js` - Offline queue (transient)
- `PoARenewalManager.js` - Renewal tracking (transient)

### localStorage Exception Handlers
These services use localStorage for specific, documented exceptions:
- `NetworkProvider.jsx` - Network preference (single key)
- `MigrationDialog.jsx` - Migration resume (single key)
- `BlockchainAdapter.js` - Progressive save fallback (temporary keys)

---

## Migration Path

### From Previous Architecture
Previously, WalSheetz stored data in:
- localStorage (spreadsheet data)
- sessionStorage (session state)
- IndexedDB (blob cache)

### Current Architecture (Hybrid)
- localStorage exceptions ← **Minimized & documented**
- RAM-only cache ← **Transient, session-scoped**
- Blockchain ← **Primary, mandatory**

### Future Direction
Goal: Eventually eliminate all localStorage usage except network preference (Exception #1)
- Migrate migration state to on-chain pointer (Not yet implemented)
- Auto-retry fallback saves in background without localStorage (Planned for Phase 2)

---

## Developer Guidelines

### Rule 1: Default to RAM Storage
When adding transient state, use in-memory structures:
```javascript
// ✅ Good - RAM-only
this.myState = new Map();

// ❌ Avoid - localStorage persistence
localStorage.setItem('myState', JSON.stringify(...));
```

### Rule 2: Justify Any localStorage Usage
Every localStorage write must have a comment:
```javascript
// EXCEPTION: Using localStorage for migration resume state
// WHY: Migrations can take hours; user shouldn't lose progress
// SCOPE: Single key 'walsheetz_pending_migration'
// CLEARED: After migration completes
localStorage.setItem('walsheetz_pending_migration', data);
```

### Rule 3: Notify Users of Fallback Saves
When saving to fallback, emit event for UI notification:
```javascript
if (blockchainFailed) {
  // Save to fallback
  localStorage.setItem(`walsheetz_fallback_${timestamp}`, data);

  // Notify user
  EventBus.emit('save:fallback', {
    message: 'Network disconnected - saved locally',
    action: 'retry_when_online'
  });
}
```

---

## Monitoring & Observability

### Metrics to Track
- **Blockchain save success rate** - Should be >99%
- **Fallback save frequency** - Should be <1% (rare network issues)
- **Fallback retry success rate** - Most should eventually sync to blockchain
- **Auto-retry on startup results** - Successful/failed/pending counts
- **Stale fallback detection rate** - How often >7 day old fallbacks found
- **Stale cleanup actions** - Export/Keep/Delete counts by users
- **Network preference changes** - Normal usage pattern
- **Migration resumptions** - Indicates crashes during migrations
- **Unload warnings shown** - User behavior with pending edits

### Logging Events
All storage operations logged with `LogComponent.BLOCKCHAIN_ADAPTER`:

**Fallback Retry Events:**
```javascript
logger.info('retry_start', 'Starting fallback retry', { localKey, dataSize });
logger.info('retry_success', 'Fallback retry succeeded', { localKey });
logger.warn('retry_failed', 'Fallback retry failed', { localKey, error });
logger.info('startup_retry_complete', 'Auto-retry complete', { successCount, failureCount, total });
```

**Stale Cleanup Events:**
```javascript
logger.info('stale_check_complete', 'Stale fallback check complete', { staleCount, totalFallbacks });
logger.debug('stale_deleted', 'Deleted stale fallback', { key });
logger.info('stale_cleanup_complete', 'Stale cleanup complete', { deletedCount, errorCount });
```

**Network Lock Events:**
- Both NetworkProvider and ConfigLoader log lock operations for debugging

---

## FAQ

**Q: Why not use localStorage for everything?**
A: localStorage is limited (~5-10MB), unreliable, and provides no cross-device access. Blockchain provides global, immutable, permanent storage.

**Q: What if user's internet is slow?**
A: Auto-save retries. If network is disconnected, fallback to localStorage. User sees notification banner.

**Q: Can data be lost?**
A: Yes, in these cases:
1. Page refresh before blockchain save completes (and no fallback)
2. Wallet disconnected (cannot save to blockchain)
3. Browser crashes/closes without fallback created

Best practice: **Save frequently** to blockchain by ensuring wallet stays connected.

**Q: What happens to fallback saves?**
A: Fallback saves are automatically retried in three ways:
1. **Manual retry**: User clicks "Retry Save" in SaveStatusBanner
2. **Auto-retry on startup**: App automatically retries all fallbacks when it loads
3. **Manual delete**: User can export as JSON or delete from cleanup modal

**Q: How are stale fallbacks handled?**
A: After app startup, the system checks for fallbacks older than 7 days:
- If found, shows StaleFallbackCleanupModal to user
- User can: Export as JSON (backup), Keep Trying (retry later), or Delete
- Prevents localStorage from filling up with old data

**Q: Does the app warn me if I leave with unsaved edits?**
A: Yes. The useUnloadWarning hook shows a browser confirmation dialog if:
- You have pending edits (pendingEdits.size > 0)
- You try to navigate away or close the tab/window
- Message: "You have unsaved changes in your spreadsheet..."

**Q: What if network preference gets corrupted?**
A: NetworkLock prevents race conditions between NetworkProvider and ConfigLoader:
- Both components use `networkLock.withLock()` for safe read-modify-write
- If corruption detected, app defaults to 'testnet'
- Users can manually switch networks without conflicts

**Q: How do I monitor fallback/retry behavior in production?**
A: Use the logging events:
- `startup_retry_complete` event shows success/failure counts
- `stale_check_complete` event shows stale fallback detection
- Browser console logs all retry operations (check logger calls)
- Metrics dashboard can track from LogComponent.BLOCKCHAIN_ADAPTER logs

**Q: How do migrations work with this model?**
A: Migration state is stored in localStorage as exception. If interrupted, migration resumes on next page load (with mainnet wallet connected).

**Q: Why is network preference in localStorage?**
A: Convenience. User shouldn't need to re-select testnet/mainnet every page load. Network is user preference, not critical data.

---

## See Also
- `frontend/adapters/StorageAdapter.js` - RAM-only storage implementation
- `frontend/presentation/components/spreadsheet/SaveStatusBanner.jsx` - User notification UI
- `frontend/core/SpreadsheetEngine.js` - Save flow implementation
- Commit: `2b16165` - Initial RAM-first architecture implementation
