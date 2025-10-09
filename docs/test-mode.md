# WalSheetz Test Mode Documentation

## Overview

WalSheetz includes a **walletless test mode** that allows the application to run without requiring wallet connection or blockchain interaction. This is ideal for:

- **Automated testing** (Playwright, Vitest)
- **Development** without wallet setup
- **CI/CD pipelines** that can't access wallets
- **Feature testing** in isolation

## ⚠️ Important Warnings

**NEVER enable test mode in production!**

- Test mode bypasses all wallet security
- Data is stored in localStorage only (not persistent)
- Blockchain and Walrus features are disabled
- Production builds will fail if test mode is enabled

## Enabling Test Mode

### For Development

```bash
# Run development server in test mode
VITE_TEST_AUTH_BYPASS=true bun run dev
```

### For Playwright Tests

Test mode is automatically enabled in Playwright configuration:

```bash
# Run Playwright tests (test mode is auto-enabled)
npm run test:e2e:playwright
```

### For Vitest Tests

```bash
# Run unit tests
npm run test:unit

# Run specific test mode tests
npm run test -- testMode
```

## What's Different in Test Mode?

### ✅ Enabled Features
- ✅ Create spreadsheets
- ✅ Edit cells
- ✅ Save data (to localStorage)
- ✅ Load data (from localStorage)
- ✅ Delete spreadsheets
- ✅ Rename spreadsheets
- ✅ All UI functionality

### ❌ Disabled Features
- ❌ Real wallet connection (uses mock)
- ❌ Blockchain transactions (simulated)
- ❌ Walrus storage (simulated)
- ❌ Collaboration features
- ❌ Real-time sync
- ❌ Gas fees and SUI balance checks

## Visual Indicators

When test mode is active, you'll see:

1. **Orange banner** at the top of the page:
   ```
   🧪 Test Mode Active - Wallet & Blockchain Bypassed
   ```

2. **Info button** - Click to see details about test mode limitations

3. **Clear Test Data button** - Removes all test spreadsheets from localStorage

## Data Storage

### Location
Test mode data is stored in browser localStorage with the key:
```javascript
'walsheetz_test_spreadsheets'
```

### Structure
```json
[
  {
    "objectId": "test-obj-123...",
    "title": "My Test Spreadsheet",
    "owner": "0x1234...",
    "created": 1234567890,
    "last_modified": 1234567890,
    "is_public": false,
    "versions": [
      {
        "walrus_blob_id": "test-blob-123...",
        "content_hash": "test-hash-123",
        "timestamp": 1234567890,
        "description": "Version description",
        "data": {
          "data": {
            "cells": { "A1": "value" },
            "metadata": { "title": "Sheet Title" }
          }
        }
      }
    ]
  }
]
```

### Clearing Data

**From UI:**
1. Click "Clear Test Data" button in the test mode banner
2. Confirm the dialog
3. Page will reload with clean slate

**Programmatically:**
```javascript
localStorage.removeItem('walsheetz_test_spreadsheets');
```

**From Tests:**
```javascript
await page.evaluate(() => {
  localStorage.removeItem('walsheetz_test_spreadsheets');
});
```

## Architecture

### Components Created

1. **`frontend/utils/testMode.js`**
   - Utility functions for test mode detection
   - `isAuthBypassed()` - Check if test mode is active
   - `getTestModeConfig()` - Get test mode configuration

2. **`frontend/services/testing/mockWalletConnection.js`**
   - Mock wallet that satisfies `UseWalletConnection` interface
   - Fake wallet address, balances, and transaction results
   - No actual blockchain interaction

3. **`frontend/hooks/useWalletConnectionFactory.ts`**
   - Factory hook that returns real or mock wallet
   - Always calls real hook (React rules compliance)
   - Returns mock when `isAuthBypassed()` is true

4. **`frontend/services/testing/TestModeAdapter.js`**
   - Mock blockchain adapter implementing `IBlockchainService`
   - Uses localStorage for data persistence
   - Simulates blockchain operations (create, save, load, delete)

5. **`frontend/presentation/components/TestModeBanner.jsx`**
   - Visual indicator for test mode
   - Data management UI (clear data, show info)

### How It Works

```
┌─────────────────────────────────────────┐
│   User runs: VITE_TEST_AUTH_BYPASS=true │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│   isAuthBypassed() returns true         │
└─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│ Factory returns  │    │ Service init     │
│ mock wallet      │    │ uses TestMode-   │
│ connection       │    │ Adapter          │
└──────────────────┘    └──────────────────┘
        │                       │
        └───────────┬───────────┘
                    ▼
┌─────────────────────────────────────────┐
│   App runs without blockchain/wallet    │
│   Data stored in localStorage           │
└─────────────────────────────────────────┘
```

## Testing Examples

### Vitest Unit Test
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { TestModeAdapter } from '../../frontend/services/testing/TestModeAdapter.js';

describe('TestModeAdapter', () => {
  let adapter;

  beforeEach(() => {
    const mockStorage = {
      getCurrentSpreadsheetId: () => null,
      setCurrentSpreadsheetId: () => {},
      // ... other methods
    };
    adapter = new TestModeAdapter(mockStorage);
  });

  it('should create a spreadsheet', async () => {
    const result = await adapter.createNewSpreadsheetOptimized('Test');
    expect(result.success).toBe(true);
    expect(result.spreadsheetId).toBeTruthy();
  });
});
```

### Playwright E2E Test
```javascript
import { test, expect } from '@playwright/test';

test('should work in test mode', async ({ page }) => {
  await page.goto('/');

  // Verify test mode banner
  await expect(page.locator('text=Test Mode Active')).toBeVisible();

  // Create spreadsheet without wallet
  await page.click('button:has-text("Create")');

  // Verify in localStorage
  const data = await page.evaluate(() =>
    localStorage.getItem('walsheetz_test_spreadsheets')
  );
  expect(data).toBeTruthy();
});
```

## Troubleshooting

### Test mode not activating

**Check environment variable:**
```bash
# Must be exactly 'true' (string)
VITE_TEST_AUTH_BYPASS=true

# These won't work:
VITE_TEST_AUTH_BYPASS=1        # ❌
VITE_TEST_AUTH_BYPASS=True     # ❌
VITE_TEST_AUTH_BYPASS="true"   # ❌ (quotes may cause issues)
```

**Verify in browser console:**
```javascript
import.meta.env.VITE_TEST_AUTH_BYPASS === 'true'  // Should be true
```

### Production build fails

**Error message:**
```
❌ VITE_TEST_AUTH_BYPASS cannot be enabled in production builds!
```

**Solution:**
```bash
# Remove the environment variable for production
unset VITE_TEST_AUTH_BYPASS

# Or explicitly set to false
VITE_TEST_AUTH_BYPASS=false npm run build
```

### Data not persisting

Test mode data is stored in **localStorage** and is:
- ✅ Persistent across page reloads
- ✅ Isolated per browser/domain
- ❌ NOT persistent across browsers
- ❌ NOT persistent if localStorage is cleared
- ❌ NOT synced across devices

### Wallet provider errors

If you see Mysten/wallet errors in test mode:
1. Verify test mode banner is visible
2. Check `isAuthBypassed()` returns true
3. Ensure factory is properly wired in `useSpreadsheet.js`
4. Check browser console for factory logs: `🧪 Test Mode: Using mock wallet connection`

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Run E2E tests in test mode
  run: |
    VITE_TEST_AUTH_BYPASS=true npm run test:e2e:playwright
  env:
    VITE_TEST_AUTH_BYPASS: 'true'
```

### Docker Example
```dockerfile
# Test stage
FROM node:18 AS test
ENV VITE_TEST_AUTH_BYPASS=true
RUN npm run test

# Production stage (test mode disabled)
FROM node:18 AS production
RUN npm run build
```

## Best Practices

1. **Always clear test data** between test runs
   ```javascript
   beforeEach(async ({ page }) => {
     await page.evaluate(() => localStorage.clear());
   });
   ```

2. **Never commit test mode enabled** in configs
   - ✅ `VITE_TEST_AUTH_BYPASS=true` in `.env.test` (gitignored)
   - ❌ `VITE_TEST_AUTH_BYPASS=true` in `.env` (tracked)

3. **Use test mode for isolation**, not integration
   - ✅ Test UI flows without wallet
   - ✅ Test data persistence logic
   - ❌ Don't test actual blockchain integration

4. **Document test mode limitations** in test descriptions
   ```javascript
   test('create spreadsheet (test mode - no blockchain)', async () => {
     // ...
   });
   ```

## FAQ

**Q: Can I use test mode for production demos?**
A: No. Test mode is for development/testing only. Data is not persistent and features are simulated.

**Q: Will test mode data sync to blockchain?**
A: No. All operations are simulated and stored in localStorage only.

**Q: Can I export test mode data?**
A: Yes, but it's in test format. You can manually copy from localStorage.

**Q: Does test mode work offline?**
A: Yes, since there's no blockchain dependency.

**Q: How do I switch from test mode to real mode?**
A: Remove `VITE_TEST_AUTH_BYPASS=true` and restart dev server. Connect real wallet to use blockchain features.

## Related Files

- `/frontend/utils/testMode.js` - Test mode utilities
- `/frontend/services/testing/mockWalletConnection.js` - Mock wallet
- `/frontend/services/testing/TestModeAdapter.js` - Mock blockchain
- `/frontend/hooks/useWalletConnectionFactory.ts` - Wallet factory
- `/tests/unit/testMode.test.js` - Unit tests
- `/tests/e2e/walletless.e2e.test.js` - E2E tests
- `/playwright.config.js` - Playwright test mode config
- `/vite.config.js` - Production build guard

## Support

For issues or questions about test mode:
1. Check this documentation
2. Review test files for examples
3. Open an issue on GitHub
4. Check browser console for `🧪 Test Mode` logs
