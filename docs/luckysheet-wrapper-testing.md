# Luckysheet Wrapper Testing Guide

## Phase 0: Browser Console Testing (READY NOW)

The wrapper is now available at `window.luckysheetApi` for console testing.

### 1. Open the Application
```bash
bun run dev
# Open http://localhost:3005 in your browser
```

### 2. Basic Wrapper Availability Test
```javascript
// Check if wrapper is available
console.log('Wrapper available:', !!window.luckysheetApi)

// Check current state
console.log('Wrapper ready:', window.luckysheetApi.isReady)
```

### 3. Test Luckysheet Loading
```javascript
// Ensure Luckysheet is loaded (should resolve quickly)
const api = window.luckysheetApi
await api.ensureLoaded(5000)
console.log('Luckysheet loaded successfully')
```

### 4. Wait for Readiness (after spreadsheet initializes)
```javascript
// Wait for Luckysheet to be ready
await api.whenReady()
console.log('Luckysheet is ready for use')
```

### 5. Test Selection Methods
```javascript
// Get current selection (after clicking on cells)
const selection = api.getSelection()
console.log('Current selection:', selection)

// Get active cell
const activeCell = api.getActiveCell()
console.log('Active cell:', activeCell)
```

### 6. Test Cell Operations
```javascript
// Get cell value (row 0, col 0 = A1)
const cellValue = api.getCellValue(0, 0, { type: 'object' })
console.log('Cell A1 value:', cellValue)

// Set cell format (make A1 bold)
api.setCellFormat(0, 0, 'bl', 1)
console.log('Made A1 bold')
```

### 7. Test Display Operations
```javascript
// Zoom the spreadsheet
api.zoom(1.2)
console.log('Zoomed to 120%')

// Refresh the display
api.refresh('auto')
console.log('Refreshed display')
```

### 8. Test Edit Operations
```javascript
// Test undo/redo (after making some changes)
api.undo()
console.log('Undid last action')

api.redo()
console.log('Redid last action')
```

### 9. Test Sheet Operations
```javascript
// Get all sheets
const sheets = api.getAllSheets()
console.log('All sheets:', sheets)

// Rename current sheet
api.renameSheet('My Test Sheet')
console.log('Renamed sheet')
```

## Phase 1-4: Component Integration Testing

### Phase 1: Migration Verification
After migrating components to use the wrapper:

1. **Toolbar Actions**: All formatting buttons should work via `luckysheetApi`
2. **Keyboard Shortcuts**: Ctrl+Z, Ctrl+Y should work through wrapper
3. **Cell Editing**: Click and type should work normally

### Phase 2: Lifecycle Testing
After migrating initialization:

1. **First Load**: Sheet renders with correct data
2. **Hot Reload**: HMR doesn't create duplicate grids
3. **Cleanup**: No memory leaks after destroy/init cycles

### Phase 3: Data Integration
After migrating SpreadsheetEngine:

1. **Save Operations**: Wrapper provides correct cell data
2. **Load Operations**: Wrapper properly displays loaded data
3. **Formula Handling**: Complex formulas work correctly

## Expected Results

### ✅ Success Indicators
- No console errors during any operations
- Selection returns normalized `{startRow, endRow, startCol, endCol}` objects
- All wrapper methods execute without throwing errors
- Visual changes (zoom, formatting, etc.) are immediately visible
- Multiple destroy/init cycles work cleanly

### ❌ Failure Indicators
- ReferenceError or TypeError in console
- Wrapper methods return undefined when they should return data
- Visual operations have no effect
- Memory leaks or duplicate event listeners after HMR
- TypeScript compilation errors

## Debug Commands

### Check Luckysheet Availability
```javascript
console.log('Native Luckysheet:', !!window.luckysheet)
console.log('Available methods:', Object.keys(window.luckysheet || {}))
```

### Check Wrapper State
```javascript
const api = window.luckysheetApi
console.log('Wrapper state:', {
  isReady: api.isReady,
  hasReadyPromise: !!api.readyPromise,
  hasLoadingPromise: !!api.loadingPromise
})
```

### Force Reload Test
```javascript
// Test destroy and reinit
const api = window.luckysheetApi
await api.destroy()
console.log('Destroyed')

await api.init({
  containerId: 'luckysheet-container',
  sheet: { name: 'Test Sheet', celldata: [] },
  onReady: () => console.log('Reinitialized!')
})
```

## Next Steps

1. **Phase 0 Complete**: Verify all console commands work
2. **Phase 1**: Migrate Header.jsx toolbar actions to use wrapper
3. **Phase 2**: Migrate Spreadsheet.jsx init/destroy to use wrapper
4. **Phase 3**: Migrate SpreadsheetEngine.js to read via wrapper
5. **Cleanup**: Remove `window.luckysheetApi` exposure

## Notes

- The wrapper includes comprehensive error handling and fallbacks
- TypeScript definitions provide full IntelliSense support
- All methods are designed to fail gracefully if Luckysheet APIs are missing
- The wrapper normalizes inconsistencies in Luckysheet's API surface