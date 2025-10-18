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

## Error Scenarios & Recovery

### Scenario 1: Network Outage During Save
```
User edits → Auto-save triggered → Network unavailable
↓
Fallback to localStorage (walsheetz_fallback_*)
↓
Show banner: "Network disconnected - saved locally"
↓
User clicks "Retry Save" when online
↓
Blockchain save succeeds → Clear fallback
```

### Scenario 2: Page Refresh Before Blockchain Save
```
User edits → Auto-save triggered
↓
Page refresh (⚠️ unsaved edits lost, unless fallback exists)
↓
If fallback exists: auto-retry on next load
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

## Technical Implementation

### RAM-Only Services
These services operate entirely in memory (session-scoped):
- `StorageAdapter.js` - Spreadsheet data cache
- `IndexedDBCache.js` - In-memory blob cache
- `ImportHistoryService.js` - Import history (transient)
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
- **Fallback retry success** - Most should eventually sync
- **Network preference changes** - Normal usage pattern
- **Migration resumptions** - Indicates crashes during migrations

### Logging
All storage operations are logged with `LogComponent.SPREADSHEET_ENGINE`:
```javascript
logger.info('save_completed', 'Spreadsheet save completed', {
  method: 'blockchain' | 'local_fallback',
  duration: ms,
  dataSize: bytes
});
```

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

**Q: How do migrations work with this model?**
A: Migration state is stored in localStorage as exception. If interrupted, migration resumes on next page load (with mainnet wallet connected).

**Q: Why is network preference in localStorage?**
A: Convenience. User shouldn't need to re-select testnet/mainnet every page load. Network is user preference, not critical data.

---

## See Also
- `frontend/adapters/StorageAdapter.js` - RAM-only storage implementation
- `frontend/presentation/components/SaveStatusBanner.jsx` - User notification UI
- `frontend/core/SpreadsheetEngine.js` - Save flow implementation
- Commit: `2b16165` - Initial RAM-first architecture implementation
