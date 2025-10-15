# Phase 2 Testing Guide: LuckysheetAdapter Migration

## Current Status

✅ **Implementation Complete:**
- Feature flag added to `Spreadsheet.jsx` (line 19)
- New path uses `useSpreadsheetLifecycle` hook
- Old path preserved as fallback
- Playwright tests updated for new adapter
- Code compiled successfully

🎯 **Default State:** Flag is `false` (using legacy path)

## How to Test the New System

### Step 1: Enable the Feature Flag

Edit `frontend/presentation/components/Spreadsheet.jsx`:

```javascript
// Line 19: Change from false to true
const USE_NEW_LIFECYCLE_HOOK = true
```

**Save the file** → Vite will hot-reload automatically

### Step 2: Check Browser Console

Open http://localhost:3005 and check console logs:

#### **Expected Logs (Success)**:
```
🔧 [main.jsx] Initializing Luckysheet adapter...
🔧 [main.jsx] ✅ Luckysheet adapter initialized
🔧 [main.jsx] ✅ Autocomplete DOM injection active
🎯 [Spreadsheet] Using NEW lifecycle hook (Phase 2)
[Lifecycle] Initializing Luckysheet...
[Lifecycle] Workbook created
```

#### **Red Flags (Problems)**:
```
❌ Error: ... (any error messages)
⚠️  [Spreadsheet] Using LEGACY manual initialization  (flag not working)
```

### Step 3: Test Adapter Diagnostics

In browser console, run:

```javascript
// Check adapter state
window.__luckysheetAdapter.getState()
// Should return: "READY"

// Get full diagnostics
const diag = window.__luckysheetAdapter.getDiagnostics()
console.table(diag.sheets)
```

**Expected Results:**
- `state`: "READY"
- `hookInstalled`: true
- `wzFunctionsInjected`: true
- `sheetsFound`: 1 or more
- Each sheet should have `wzInObject` > 0

### Step 4: Manual Autocomplete Test

1. **Click any cell** in the spreadsheet
2. **Type:** `=WZ.CONTRACT.LIST(`
3. **Wait 100-500ms**
4. **Check:** Autocomplete dropdown should appear
5. **Verify:** "WZ.CONTRACT.LIST" is in the dropdown
6. **Arrow keys** should navigate options
7. **Enter/Tab** should select and close dropdown

**Expected**: Dropdown appears quickly, no flicker, no duplicate canvases

### Step 5: Run Diagnostic Script

In browser console:

```javascript
fetch('/scripts/diagnose-wz-autocomplete.js').then(r => r.text()).then(eval)
```

**Expected Output:**
```
✅ New adapter available
   State: READY
   Hook Installed: true
✅ WZ namespace exists
✅ WZ.CONTRACT.LIST exists (nested)
✅ All checks passed!
```

### Step 6: Run E2E Tests

From terminal:

```bash
npm run test:e2e:playwright
```

**Expected Results:**
- All 7 tests pass
- No timeout errors
- Screenshots in `tests/e2e/screenshots/` show autocomplete working

## Instant Rollback

If **anything** breaks:

### Quick Rollback (10 seconds):
1. Edit `frontend/presentation/components/Spreadsheet.jsx`
2. Set `USE_NEW_LIFECYCLE_HOOK = false`
3. Save → Vite hot-reloads
4. App instantly back to working state

### Git Rollback (if needed):
```bash
git checkout frontend/presentation/components/Spreadsheet.jsx
```

## Success Checklist

- [ ] Console shows "Using NEW lifecycle hook"
- [ ] Adapter state is "READY"
- [ ] No console errors
- [ ] Autocomplete appears when typing `=WZ`
- [ ] No canvas duplication
- [ ] No flicker during init
- [ ] Diagnostic script shows all ✅
- [ ] E2E tests pass
- [ ] Keyboard shortcuts work (Cmd+S to save)

## Troubleshooting

### Problem: Console shows "Using LEGACY"
**Cause:** Flag not set to true
**Fix:** Check line 19 in Spreadsheet.jsx, ensure `= true`

### Problem: "Cannot find module useSpreadsheetLifecycle"
**Cause:** Import path wrong or file not created
**Fix:** Verify `frontend/presentation/hooks/useSpreadsheetLifecycle.js` exists

### Problem: Autocomplete doesn't appear
**Cause:** Adapter may not have injected properly
**Fix:**
1. Run `window.__luckysheetAdapter.getDiagnostics()`
2. Check `wzFunctionsInjected: true`
3. Check `sheetsFound > 0`
4. If false, may need to debug adapter

### Problem: Canvas duplication
**Cause:** Lifecycle cleanup not working
**Fix:** Check `lifecycle.cleanup()` is being called in useEffect return

### Problem: E2E tests fail
**Cause:** Various - check screenshots
**Fix:**
1. Look at `tests/e2e/screenshots/*.png`
2. Check test output for specific failure
3. May need to adjust test timeouts
4. Rollback flag if critical

## Performance Comparison

### Old System (Legacy):
- 5 injection layers
- Multiple polling loops
- ~70 lines of setup code in main.jsx
- ~900 lines of init logic in Spreadsheet.jsx
- Timing-dependent, race conditions

### New System (Phase 2):
- Single adapter initialization
- Deterministic state machine
- ~20 lines in main.jsx
- ~50 lines for new path in Spreadsheet.jsx
- No timing issues, clean lifecycle

## Next Steps After Testing

Once all tests pass and manual testing looks good:

1. **Leave flag enabled** for 24-48 hours
2. **Monitor for issues** in production/development
3. **Team testing** - get other developers to test
4. **Document migration** - update team docs
5. **Remove old code** - delete legacy path after confidence
6. **Remove flag** - clean up feature flag code

## Questions?

If you encounter issues not covered here:
1. Check browser console for errors
2. Run diagnostic script
3. Check `window.__luckysheetAdapter.getDiagnostics()`
4. Look at E2E test screenshots
5. Instant rollback if stuck
