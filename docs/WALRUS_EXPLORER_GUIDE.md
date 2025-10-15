# Walrus Explorer Guide

> **Comprehensive guide to using the Walrus Sheet Browser for exploring and manipulating Walrus blobs**

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Getting Started](#getting-started)
4. [Spreadsheet Formulas](#spreadsheet-formulas)
5. [UI Components](#ui-components)
6. [Data Workflows](#data-workflows)
7. [Troubleshooting](#troubleshooting)

---

## Overview

The Walrus Explorer is a spreadsheet-driven interface for browsing, querying, and manipulating Walrus blobs through Sui blockchain's GraphQL API. It combines the power of blockchain queries with the familiar spreadsheet interface.

### Key Features

- **GraphQL Queries**: Execute Sui GraphQL queries directly from spreadsheet formulas
- **PoA Certificates**: Check Proof of Availability status for any blob
- **Blob Browsing**: Infinite-scroll catalog with filters and sorting
- **Data Transform**: Map blob data to/from spreadsheet ranges
- **Auto-Refresh**: Schedule cells to refresh at configurable intervals
- **Blockchain Sync**: Publish spreadsheet ranges back to Walrus

---

## Architecture

### Service Layer

#### `SuiGraphQLService` (`blockchain/sui-graphql-service.js`)

Core service for querying Sui blockchain data via GraphQL.

**Key Methods:**
- `executeQuery(query, variables, options)` - Execute raw GraphQL queries
- `getBlobsByOwner(address, options)` - Query blobs owned by address
- `getWalletHistory(address, options)` - Get transaction history
- `getWalrusSiteAssets(siteId, options)` - Query Walrus Site assets
- `getPoACertificateStatus(blobId)` - Get PoA certificate status
- `getBlobMetadata(blobId)` - Get detailed blob metadata

**Response Format:**
All methods return `IGraphQLResponse` objects with:
```javascript
{
  items: [],           // Array of result items
  pageInfo: {          // Pagination info
    hasNextPage: false,
    endCursor: null
  },
  totalCount: 0,       // Total items in response
  error: null,         // Error object if failed
  metadata: {}         // Additional metadata
}
```

**Caching:**
- Default TTL: 5 minutes
- Blob lists: 2 minutes
- Transaction history: 1 minute
- PoA certificates: 10 minutes

#### `BrowserWalrusService` (`frontend/services/BrowserWalrusService.js`)

Service for interacting with Walrus storage from the browser.

**New Methods:**
- `getPoACertificate(blobId)` - Fetch PoA certificate for blob
- `getBlobMetadata(blobId)` - Get blob metadata including expiry
- `streamBlobToGrid(blobId, startRow, startCol, options)` - Stream blob to spreadsheet
- `readBlobRange(blobId, offset, length)` - Read partial blob content

#### `BlobParser` (`frontend/utils/BlobParser.js`)

Utility for parsing and serializing blob data in various formats.

**Supported Formats:**
- **JSON**: Auto-detects arrays and objects
- **CSV**: Comma-separated values with headers
- **Text**: Plain text split by lines

**Key Functions:**
- `parseBlob(data, options)` - Auto-detect format and parse to grid
- `serializeRange(gridData, options)` - Serialize grid data to format
- `parseJSON(data)` - Parse JSON to 2D grid array
- `parseCSV(data, options)` - Parse CSV to 2D grid array
- `serializeToJSON(data)` - Serialize grid to JSON string
- `serializeToCSV(data, options)` - Serialize grid to CSV string

---

## Getting Started

### 1. Launch the Application

```bash
npm run dev
```

### 2. Connect Your Wallet

Click "Connect Wallet" in the header to connect your Sui wallet. This is required for:
- Publishing spreadsheet data to Walrus
- Viewing your owned blobs
- Committing changes to blockchain

### 3. Browse Blobs

Navigate to the **Blob Catalog** (`/blobs`) to browse available Walrus blobs:

- Filter by owner address
- Filter by PoA status (certified, uncertified, pending, expired)
- Sort by creation date, size, or blob ID
- Click any blob to open in Spreadsheet Workspace

### 4. Use the Spreadsheet Workspace

Navigate to **Spreadsheet Workspace** (`/workspace`) to:

- Use Walrus-specific formulas
- Load blob data into the grid
- Transform and manipulate data
- Publish results back to Walrus

---

## Spreadsheet Formulas

### `SUI_GQL(queryOrPreset, ...args)`

Execute Sui GraphQL queries directly from spreadsheet cells.

**Preset Queries:**

```javascript
// Get blobs by owner
=SUI_GQL("blobs_by_owner", "0x1234...")

// Get wallet transaction history
=SUI_GQL("wallet_history", "0x1234...")

// Get Walrus Site assets
=SUI_GQL("site_assets", "0xabcd...")

// Get blob metadata
=SUI_GQL("blob_metadata", "blob_id_here")
```

**Custom Queries:**

```javascript
// Execute custom GraphQL query
=SUI_GQL("query GetObjects($address: SuiAddress!) {
  objects(filter: { owner: $address }) {
    nodes { objectId }
  }
}", "0x1234...")
```

**Returns:** JSON string (use with `WALRUS_MAP_BLOB_TO_OBJECT` to expand)

### `WALRUS_CERT(blobId)`

Check Proof of Availability certificate status for a blob.

**Example:**
```javascript
=WALRUS_CERT("blob_id_here")
```

**Returns:** JSON with certificate status:
```json
{
  "status": "certified",
  "validators": [...],
  "timestamp": 1234567890,
  "expiry": 1234999999
}
```

**Statuses:**
- `certified` - Valid PoA certificate exists
- `uncertified` - No PoA certificate found
- `pending` - Certificate request in progress
- `expired` - Certificate has expired
- `unknown` - Unable to determine status

### `WALRUS_READ(blobId, offset?, length?)`

Read blob content from Walrus storage.

**Examples:**
```javascript
// Read entire blob
=WALRUS_READ("blob_id_here")

// Read first 1000 bytes
=WALRUS_READ("blob_id_here", 0, 1000)

// Read from offset 500
=WALRUS_READ("blob_id_here", 500, 1000)
```

**Returns:** Parsed blob content (auto-detects JSON, CSV, or text)

### `WALRUS_MAP_BLOB_TO_OBJECT(blobId, targetRange)`

Load blob data into a spreadsheet range with auto-format detection.

**Example:**
```javascript
// Load blob into cells A1:Z100
=WALRUS_MAP_BLOB_TO_OBJECT("blob_id_here", "A1:Z100")
```

**Features:**
- Auto-detects JSON, CSV, or text format
- Expands arrays into rows
- Expands objects into columns
- Preserves data types (numbers, strings, booleans)

**Progress Stages:**
1. `downloading` (25%)
2. `parsing` (50%)
3. `injecting` (75%)
4. `complete` (100%)

### `WALRUS_MAP_OBJECT_TO_BLOB(sourceRange, format?)`

Upload a spreadsheet range to Walrus as a blob.

**Examples:**
```javascript
// Upload range A1:Z100 as JSON (default)
=WALRUS_MAP_OBJECT_TO_BLOB("A1:Z100")

// Upload as CSV
=WALRUS_MAP_OBJECT_TO_BLOB("A1:Z100", "csv")

// Upload as text
=WALRUS_MAP_OBJECT_TO_BLOB("A1:Z100", "text")
```

**Returns:** Blob ID of uploaded content

**Formats:**
- `json` (default) - Serializes as JSON array
- `csv` - Comma-separated values with headers
- `text` - Tab-separated plain text

### `WALRUS_PUT(sourceRange, metadata?)`

Publish spreadsheet range to Walrus with metadata.

**Example:**
```javascript
=WALRUS_PUT("A1:Z100", {
  "title": "Q4 Sales Data",
  "department": "Sales",
  "version": "1.0"
})
```

**Returns:** Transaction result with blob ID

**Metadata Fields:**
- `title` - Human-readable title
- `description` - Description of data
- `version` - Version string
- `tags` - Array of tags
- Custom fields as needed

### `SUI_TX(txType, ...args)`

Execute Sui blockchain transactions (requires wallet connection).

**Examples:**
```javascript
// Certify a blob with PoA
=SUI_TX("certify_poa", "blob_id_here")

// Renew Walrus chunk expiry
=SUI_TX("renew_chunk", "blob_id_here", "30d")

// Transfer blob ownership
=SUI_TX("transfer_blob", "blob_id_here", "0x_new_owner_address")
```

**Note:** All transactions require wallet approval via Sui wallet extension.

---

## UI Components

### Blob Catalog (`/blobs`)

**Purpose:** Browse and filter Walrus blobs with infinite scroll.

**Features:**
- **Infinite Scroll**: Automatically loads more blobs as you scroll
- **Owner Filter**: Filter blobs by owner address
- **PoA Filter**: Filter by certificate status
- **Sorting**: Sort by creation date, size, or blob ID
- **Click to Open**: Click any blob card to open in workspace

**Usage:**
1. Navigate to `/blobs`
2. Enter owner address (optional)
3. Select PoA status filter
4. Choose sort order
5. Scroll to load more results
6. Click blob to open in workspace

### Spreadsheet Workspace (`/workspace`)

**Purpose:** Interactive spreadsheet with Walrus-specific formulas.

**Features:**
- **Formula Sidebar**: Browse and search formulas
- **Category Filters**: Filter formulas by category (Query, Transform, Blockchain)
- **Clipboard Copy**: Copy formula templates
- **Live Insertion**: Insert formulas at current cell
- **Auto-Refresh**: Schedule cells to refresh automatically

**Usage:**
1. Navigate to `/workspace`
2. Click cell to select
3. Browse formulas in sidebar
4. Click "Insert" or "Copy" to use formula
5. Edit formula arguments as needed
6. Press Enter to execute

### Wallet Asset Table

**Purpose:** Display wallet assets aggregated by coin type.

**Features:**
- **Asset Aggregation**: Groups transactions by coin type
- **Balance Display**: Shows total balance per coin
- **Transaction Count**: Shows number of transactions
- **Sortable Columns**: Click headers to sort
- **Click Handlers**: Click row to trigger custom action

**Usage:**
```jsx
<WalletAssetTable
  walletAddress="0x1234..."
  onAssetClick={(asset) => console.log(asset)}
/>
```

**Note:** Currently shows "No assets found" due to empty `coins` array in transaction responses. Full implementation requires extracting coins from `balanceChanges` in GraphQL service.

### Walrus Site Viewer

**Purpose:** Display Walrus Site information and assets.

**Features:**
- **Site Header**: Shows site ID and URL
- **Site Stats**: Total assets, size, certified count
- **Asset Grid**: Grid of asset cards with PoA badges
- **Blob Navigation**: Click asset to view blob details
- **PoA Status**: Real-time PoA certificate status

**Usage:**
```jsx
<WalrusSiteViewer
  siteId="0xabcd..."
  onBlobClick={(asset) => window.open(`/workspace?blobId=${asset.blobId}`)}
/>
```

### Save Status Indicator

**Purpose:** Display document save and sync status.

**Features:**
- **Save States**: Tracks Walrus save and blockchain commit
- **PoA Status**: Shows PoA certificate status badge
- **Expiry Warnings**: Warns when Walrus chunk nearing expiry
- **Sync Button**: Manual sync to blockchain
- **Tooltips**: Detailed status information on hover

**Props:**
```javascript
{
  saveStatus: 'synced',           // saving_walrus, saving_blockchain, saved_walrus, synced, awaiting_commit, committing, error
  lastWalrusSave: 1234567890,     // Timestamp of last Walrus save
  lastSuiCommit: 1234567890,      // Timestamp of last blockchain commit
  pendingWalrusSaves: 3,          // Number of pending commits
  onSyncNow: () => {},            // Callback for manual sync
  walletConnected: true,          // Wallet connection status
  chunkMetadata: {                // Walrus chunk metadata
    expiryTimestamp: 1234999999
  },
  renewalWarningDays: 7,          // Days before expiry to warn
  poaStatus: 'certified',         // PoA certificate status
  blobId: 'blob_id_here'          // Current blob ID
}
```

---

## Data Workflows

### Workflow 1: Browse and Load Blob Data

**Goal:** Find a blob and load its data into the spreadsheet.

**Steps:**

1. **Navigate to Blob Catalog**
   ```
   /blobs
   ```

2. **Filter Blobs** (optional)
   - Enter owner address: `0x1234...`
   - Select PoA status: "Certified"
   - Sort by: "Created Date"

3. **Click Blob Card**
   - Automatically navigates to `/workspace?blobId=...`

4. **Load Blob into Grid**
   - Select target cell (e.g., A1)
   - Use formula:
     ```javascript
     =WALRUS_MAP_BLOB_TO_OBJECT("blob_id", "A1:Z100")
     ```

5. **Verify Data Loaded**
   - Check that cells populated with blob data
   - Verify format detection (JSON, CSV, or text)

### Workflow 2: Query GraphQL and Transform Results

**Goal:** Execute custom GraphQL query and display results.

**Steps:**

1. **Navigate to Workspace**
   ```
   /workspace
   ```

2. **Execute GraphQL Query**
   - Select cell A1
   - Insert formula:
     ```javascript
     =SUI_GQL("blobs_by_owner", "0x1234...")
     ```

3. **Parse JSON Response**
   - Result is JSON string in A1
   - Select cell A3
   - Use formula to extract blob ID from result:
     ```javascript
     =WALRUS_READ(/* extract blob_id from A1 result */)
     ```

4. **Map Blob to Range**
   - Select cell A5
   - Insert formula:
     ```javascript
     =WALRUS_MAP_BLOB_TO_OBJECT(/* blob_id from previous step */, "A5:Z50")
     ```

### Workflow 3: Transform and Publish Data

**Goal:** Manipulate spreadsheet data and publish to Walrus.

**Steps:**

1. **Load Existing Data** (optional)
   ```javascript
   =WALRUS_MAP_BLOB_TO_OBJECT("existing_blob_id", "A1:Z50")
   ```

2. **Edit Data**
   - Modify cells as needed
   - Add/remove rows
   - Apply formulas for calculations

3. **Upload Modified Data**
   - Select cell B1
   - Insert formula:
     ```javascript
     =WALRUS_PUT("A1:Z50", {
       "title": "Modified Sales Data",
       "version": "2.0",
       "modified_by": "user@example.com"
     })
     ```

4. **Verify Upload**
   - Formula returns blob ID in B1
   - Check PoA status:
     ```javascript
     =WALRUS_CERT(B1)
     ```

5. **Commit to Blockchain** (optional)
   - Click "Sync Now" in Save Status Indicator
   - Approve transaction in wallet
   - Wait for blockchain confirmation

### Workflow 4: Auto-Refresh Dashboard

**Goal:** Create a dashboard that auto-refreshes data.

**Steps:**

1. **Set Up Data Sources**
   ```javascript
   // Cell A1: Refresh every 30 seconds
   =SUI_GQL("wallet_history", "0x1234...")

   // Cell A20: Refresh every 60 seconds
   =SUI_GQL("blobs_by_owner", "0x1234...")
   ```

2. **Configure Refresh Schedules**
   - Use `SpreadsheetEngine.registerCellForRefresh()` API:
     ```javascript
     window.spreadsheetEngine.registerCellForRefresh(
       "A1",           // Cell reference
       30000,          // Interval in ms (30 seconds)
       "=SUI_GQL(...)" // Formula to execute
     );
     ```

3. **Enable Auto-Refresh**
   ```javascript
   window.spreadsheetEngine.startRefreshScheduler();
   ```

4. **Monitor Updates**
   - Cells will update automatically
   - Check logs for refresh events
   - Disable with `stopRefreshScheduler()` when done

---

## Troubleshooting

### Issue: Blob Catalog Shows "No blobs found"

**Possible Causes:**
- No blobs match current filters
- GraphQL service not returning data
- Owner address filter too restrictive

**Solutions:**
1. Clear all filters and try again
2. Check browser console for GraphQL errors
3. Verify Sui GraphQL endpoint is accessible:
   ```javascript
   console.log(window.suiGraphQLService.graphqlUrl);
   ```
4. Try executing raw query in console:
   ```javascript
   const result = await window.suiGraphQLService.getBlobsByOwner("0x...");
   console.log(result);
   ```

### Issue: Formula Returns Error

**Possible Causes:**
- Invalid blob ID
- Network connection issue
- Wallet not connected (for write operations)
- Rate limit exceeded

**Solutions:**
1. Verify blob ID is valid hexadecimal string
2. Check network connection
3. Connect wallet for write operations (`WALRUS_PUT`, `SUI_TX`)
4. Wait 60 seconds if rate limited (60 calls/minute max)
5. Check browser console for detailed error:
   ```javascript
   // Enable debug logging
   window.logger.setLevel('debug');
   ```

### Issue: PoA Status Shows "Unknown"

**Possible Causes:**
- Blob has no PoA certificate
- GraphQL query failed
- Network timeout

**Solutions:**
1. Verify blob exists:
   ```javascript
   =WALRUS_READ("blob_id")
   ```
2. Check if blob is certified:
   ```javascript
   =SUI_GQL("blob_metadata", "blob_id")
   ```
3. Retry PoA check after 30 seconds (cache TTL)
4. Check browser console for PoA fetch errors

### Issue: Auto-Refresh Not Working

**Possible Causes:**
- Refresh scheduler not started
- Invalid refresh interval (min 5s, max 1 hour)
- Cell formula invalid

**Solutions:**
1. Start refresh scheduler:
   ```javascript
   window.spreadsheetEngine.startRefreshScheduler();
   ```
2. Verify cell is registered:
   ```javascript
   console.log(window.spreadsheetEngine.refreshSchedules);
   ```
3. Check interval is within bounds (5000ms - 3600000ms)
4. Verify formula executes without errors manually first

### Issue: Wallet Asset Table Shows "No assets found"

**Current Limitation:**
The `coins` array in transaction responses is currently empty and needs to be populated from `effects.balanceChanges` in the GraphQL service.

**Workaround:**
Use custom GraphQL query to fetch owned coins directly:

```javascript
=SUI_GQL("query GetCoins($address: SuiAddress!) {
  objects(filter: { owner: $address, type: \"0x2::coin::Coin\" }) {
    nodes {
      contents {
        type { repr }
        json
      }
    }
  }
}", "0x1234...")
```

### Issue: Site Viewer Shows "No assets found"

**Possible Causes:**
- Site has no assets
- Assets missing `blobId` field
- GraphQL query structure changed

**Solutions:**
1. Verify site ID is correct
2. Check GraphQL response structure:
   ```javascript
   const result = await window.suiGraphQLService.getWalrusSiteAssets("site_id");
   console.log(result.items);
   ```
3. Verify each asset has `blobId` field
4. Check browser console for warnings about missing blob IDs

### Debug Logging

Enable detailed logging for troubleshooting:

```javascript
// Enable debug logging for all components
window.logger.setLevel('debug');

// Enable logging for specific component
window.logger.enableComponent('UI');
window.logger.enableComponent('SpreadsheetEngine');
window.logger.enableComponent('BlockchainAdapter');

// View current log configuration
console.log(window.logger.getConfig());
```

### GraphQL Service Cache

Clear GraphQL cache if getting stale data:

```javascript
// Clear all cache
window.suiGraphQLService.clearCache();

// Clear cache matching pattern
window.suiGraphQLService.clearCache('blobs');
```

---

## Advanced Topics

### Custom IGraphQLResponse Handling

All GraphQL methods return `IGraphQLResponse` objects. Use helper methods:

```javascript
const result = await window.suiGraphQLService.getBlobsByOwner("0x...");

// Check if response has data
if (result.hasData()) {
  // Get items array
  const blobs = result.getItems();

  // Get metadata
  const metadata = result.getMetadata();

  // Check pagination
  if (result.hasNextPage()) {
    const cursor = result.getEndCursor();
    // Load next page...
  }
}

// Handle errors
if (result.hasError()) {
  const error = result.getError();
  console.error(error.message, error.code);
}
```

### Extending Formula Library

Add custom formulas in `frontend/services/formulas/WalSheetzFunctions.js`:

```javascript
export async function MY_CUSTOM_FORMULA(arg1, arg2) {
  // Validate arguments
  if (!arg1) {
    throw new Error('arg1 is required');
  }

  // Execute logic
  const result = await someAsyncOperation(arg1, arg2);

  // Return result
  return result;
}

// Register in WalSheetzFormulas.registerFormulas():
formulas.MY_CUSTOM_FORMULA = {
  func: MY_CUSTOM_FORMULA,
  description: 'My custom formula description',
  category: 'Custom',
  params: [
    { name: 'arg1', type: 'string', description: 'First argument' },
    { name: 'arg2', type: 'number', description: 'Second argument', optional: true }
  ]
};
```

---

## Resources

- [Sui GraphQL Documentation](https://docs.sui.io/graphql)
- [Walrus Documentation](https://docs.walrus.site/)
- [Luckysheet API](https://mengshukeji.github.io/LuckysheetDocs/)
- [Project Architecture](./architecture/README.md)
- [Configuration Guide](./CONFIGURATION.md)

---

**Last Updated:** 2025-10-14
**Version:** 1.0.0
