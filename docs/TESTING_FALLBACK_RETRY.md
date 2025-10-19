# Manual Testing Guide: Fallback Retry System

This guide covers manual testing procedures for the fallback retry system, which automatically saves spreadsheets to localStorage when the network is unavailable, then syncs to blockchain when connection is restored.

## Prerequisites

- WalSheetz app running locally or on test server
- Wallet connected (Testnet or Mainnet)
- Browser DevTools open (F12)
- Spreadsheet with some data open in editor

---

## Test 1: Basic Fallback Save on Network Disconnect

**Goal**: Verify that disconnecting the network triggers a fallback save and shows SaveStatusBanner.

### Steps

1. Open a spreadsheet in the editor
2. Edit a cell (e.g., type "Test Value" in cell A1)
3. Wait ~5 seconds for auto-save to trigger
4. Open Browser DevTools (F12)
5. Go to **Network** tab
6. Click the **Offline** button (or use throttling menu)
7. Edit another cell (e.g., cell B2)
8. Wait ~5 seconds for auto-save attempt

### Expected Results

✅ **SaveStatusBanner appears** at the top with message:
```
⚠️ Network disconnected - changes saved locally only
   Your data will sync to blockchain when connection is restored
```

✅ **Retry button visible** with text "🚀 Retry Save"

✅ **Dismiss button visible** with "✕"

### If Failed

- Check browser console for errors (F12 → Console tab)
- Verify SaveStatusBanner component is mounted in App.jsx
- Check that 'save:fallback' event was dispatched (look for logs)
- Verify localStorage contains key starting with 'walsheetz_fallback_'

---

## Test 2: Manual Retry Save Button

**Goal**: Verify clicking "Retry Save" attempts to sync fallback to blockchain.

### Prerequisites

- Complete Test 1 first (fallback save created)
- Network still offline (DevTools Network tab)

### Steps

1. With SaveStatusBanner visible and network offline
2. Click "🚀 Retry Save" button
3. Observe button state changes to "🔄 Retrying..."
4. Wait 3-5 seconds

### Expected Results

✅ **Button shows loading state**: "🔄 Retrying..."

✅ **Status message appears below banner**:
```
⏳ Retry attempt failed: Network is offline. Will retry next time.
```

(This is expected since we're still offline)

### Next: Restore Network and Retry

1. Click the **Offline** button again in DevTools to go back online
2. Click "🚀 Retry Save" button again
3. Wait 2-3 seconds

### Expected Results

✅ **Banner shows success**:
```
✅ Save synced to blockchain successfully!
```

✅ **Banner auto-dismisses** after ~2 seconds

✅ **localStorage fallback key is deleted**: Open DevTools → Application → Local Storage, verify 'walsheetz_fallback_*' key is gone

---

## Test 3: Auto-Retry on App Reload

**Goal**: Verify that fallback saves are automatically retried when app reloads.

### Prerequisites

- Have a fallback save in localStorage (from Test 1 or 2)
- Ensure fallback was not yet synced to blockchain

### Steps

1. Create a fallback save (follow Test 1, keep network offline)
2. With SaveStatusBanner visible, **reload the page** (Ctrl+R or Cmd+R)
3. Wait for app to load (3-5 seconds)
4. Monitor for auto-retry activity

### Expected Results

✅ **App initializes** and begins wallet connection

✅ **Auto-retry starts** after ~2 seconds (see logs in console)

✅ **If network is online**: SaveStatusBanner shows success message
```
✅ 1 of 1 saves synced during startup
```

✅ **If network still offline**: SaveStatusBanner appears again with same fallback save

---

## Test 4: Stale Fallback Cleanup

**Goal**: Verify that old fallback saves (>7 days) trigger cleanup modal.

### Steps (Manual Setup Required)

1. Open DevTools Console (F12 → Console tab)
2. Create a fake old fallback save:
```javascript
const oldTimestamp = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
const key = `walsheetz_fallback_${oldTimestamp}`;
localStorage.setItem(key, JSON.stringify({
  title: 'Old Sheet',
  cells: { 'A1': 'stale data' }
}));
```

3. Reload the page (Ctrl+R)
4. Wait for app to initialize (~3 seconds)

### Expected Results

✅ **After auto-retry completes**, StaleFallbackCleanupModal appears:
```
⏳ Old Unsaved Changes Found
   1 save older than 7 days
```

✅ **Modal shows cleanup options**:
- 📥 Export as JSON
- ⏳ Keep Trying
- 🗑️ Delete Selected

### Test 4a: Export Option

1. Click **📥 Export as JSON** button
2. Browser should download a JSON file
3. Open downloaded file and verify it contains your data

### Test 4b: Keep Option

1. Click **⏳ Keep Trying** button
2. Modal should close
3. Fallback should remain in localStorage for next retry

### Test 4c: Delete Option

1. Ensure fallback is selected (checkbox checked)
2. Click **🗑️ Delete Selected** button
3. Modal should close
4. Open DevTools → Application → Local Storage
5. Verify 'walsheetz_fallback_*' key is deleted

---

## Test 5: Multiple Simultaneous Fallback Saves

**Goal**: Verify the system handles multiple fallback saves correctly.

### Steps

1. Open spreadsheet editor
2. Go offline (DevTools → Network → Offline)
3. Edit cell A1, wait ~5 seconds for auto-save
4. Edit cell B1, wait ~5 seconds for auto-save
5. Edit cell C1, wait ~5 seconds for auto-save
6. Go back online
7. Click "Retry Save"

### Expected Results

✅ **SaveStatusBanner shows**:
```
⚠️ Network disconnected - changes saved locally only
   +2 more unsaved changes
```

✅ **All fallback keys in localStorage**: Multiple 'walsheetz_fallback_*' keys exist

✅ **Retry syncs all**: After clicking retry, all fallback keys are deleted

✅ **Success message shows**: "✅ 3 of 3 saves synced during startup" or similar

---

## Test 6: Network Switching (Testnet ↔ Mainnet)

**Goal**: Verify that the NetworkLock prevents race conditions.

### Prerequisites

- Wallet connected to Testnet
- Have a fallback save in localStorage

### Steps

1. Observe current network in top-left corner
2. Click network selector (should say "Testnet")
3. Select "Mainnet"
4. Browser reloads and reconnects wallet
5. Observe SaveStatusBanner and fallback retry behavior

### Expected Results

✅ **No console errors** about race conditions or duplicate writes

✅ **Network preference correctly saved** to localStorage

✅ **Fallback retry works** on new network

✅ **No stuck state**: Auto-retry completes successfully

---

## Test 7: Wallet Gating on Auto-Retry

**Goal**: Verify that auto-retry correctly waits for wallet connection.

### Prerequisites

- Create a fallback save (go offline, edit, go online)

### Steps

1. Create fallback save (Test 1)
2. Go online
3. Reload page **but disconnect wallet before reload**
   - DevTools → Application → Cookies/Storage → Disconnect wallet (or force logout)
4. Reload page (Ctrl+R)
5. Observe auto-retry behavior (check console logs)
6. Connect wallet manually
7. Observe retry continues or succeeds

### Expected Results

✅ **Auto-retry waits** for wallet connection (logs should show this)

✅ **Console shows**: "Wallet not connected - skipping auto-retry" (if timeout)
OR
**Console shows**: "Starting auto-retry of fallback saves" (if wallet connects)

✅ **No error messages** about trying to save with disconnected wallet

---

## Test 8: Unload Warning

**Goal**: Verify that unsaved edits trigger browser warning when leaving.

### Steps

1. Open spreadsheet
2. Edit a cell but **don't save** (edit without waiting for auto-save)
3. Try to close the browser tab (⌘W / Ctrl+W)
4. Or try to navigate away (click back button)

### Expected Results

✅ **Browser confirmation appears**:
```
You have unsaved changes in your spreadsheet.
Are you sure you want to leave?
[Leave] [Stay]
```

✅ **Can choose to stay** and continue editing

✅ **After auto-save completes**, warning no longer appears

---

## Troubleshooting

### SaveStatusBanner Not Appearing

1. Check DevTools Console for errors
2. Verify SaveStatusBanner is mounted in App.jsx
3. Check localStorage: `localStorage.getItem('walsheetz_fallback_*')`
4. Check network is actually offline: Try to fetch external resource

### Fallback Data Not Syncing

1. Check `retryFallbackSave()` logs in console
2. Verify wallet is connected
3. Check blockchain logs in BlockchainAdapter
4. Verify Sui/Walrus services are reachable

### Cleanup Modal Not Appearing

1. Verify fallback is actually >7 days old
2. Check console for 'stale:fallbacks-found' event
3. Verify StaleFallbackCleanupModal is mounted in App.jsx
4. Try manually creating old fallback (see Test 4)

### Multiple Fallbacks Not Handled

1. Check browser console for errors in auto-retry loop
2. Verify each fallback appears in SaveStatusBanner
3. Check localStorage has multiple 'walsheetz_fallback_*' keys
4. Look for "retrying each fallback sequentially" in console logs

---

## Performance Expectations

| Operation | Expected Time |
|-----------|---------------|
| Fallback save to localStorage | <100ms |
| Manual retry (online) | 2-5 seconds |
| Auto-retry on startup (1 save) | 2-3 seconds |
| Auto-retry (3+ saves) | 5-10 seconds |
| Stale cleanup modal detection | 1-2 seconds after auto-retry |
| Export JSON download | <500ms |

---

## Success Criteria

For the fallback retry system to be production-ready:

- ✅ All 8 tests pass without errors
- ✅ No console errors or warnings
- ✅ Network lock prevents race conditions (no duplicate writes)
- ✅ Wallet gating works correctly (waits for connection)
- ✅ Cached data is preserved (offline edits synced correctly)
- ✅ Stale cleanup works and frees up storage
- ✅ UI components appear and function properly
- ✅ All time expectations met

---

## Reporting Issues

When reporting test failures, include:

1. **Browser & OS**: Chrome/Firefox/Safari on macOS/Windows/Linux
2. **Network conditions**: Offline/Slow 3G/Online
3. **Wallet state**: Connected/Disconnected, Network (Testnet/Mainnet)
4. **Steps to reproduce**: Exact steps from tests above
5. **Expected vs actual**: What should happen vs what did happen
6. **Console errors**: Full error messages and stack traces
7. **localStorage state**: Keys/values from DevTools → Application
8. **Screenshots**: Of SaveStatusBanner, modals, any errors
