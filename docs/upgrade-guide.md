# WalSheetz Upgrade-Safe Walrus ↔︎ Sui Integration Guide

## Overview

This guide explains the upgrade-safe infrastructure implemented in WalSheetz to ensure seamless Move package upgrades while maintaining Walrus blob integrity and version compatibility.

## Table of Contents

1. [Architecture](#architecture)
2. [Module Versioning](#module-versioning)
3. [Migration Process](#migration-process)
4. [Client-Side Enforcement](#client-side-enforcement)
5. [Operational Procedures](#operational-procedures)
6. [Troubleshooting](#troubleshooting)

---

## Architecture

### Version Control Components

The upgrade-safe system consists of three layers:

1. **Move Contract Layer** (`move/sources/spreadsheet.move`)
   - Module version constant (`MODULE_VERSION`)
   - Version fields in `Spreadsheet` and `SpreadsheetRegistry` structs
   - Admin capability for migration control
   - Version guards on all mutating functions

2. **Service Layer** (`blockchain/sui-service.js`, `frontend/services/BrowserSuiService.js`)
   - Version detection and validation
   - Migration transaction builders
   - Compatibility checks before mutations

3. **Adapter Layer** (`frontend/adapters/BlockchainAdapter.js`)
   - Automatic version checking on load
   - User-facing compatibility warnings
   - Migration flow coordination

---

## Module Versioning

### Move Contract Constants

```move
const MODULE_VERSION: u64 = 1;
const E_WRONG_VERSION: u64 = 12;
const VERSION_FIELD_KEY: vector<u8> = b"module_version";
```

**Increment `MODULE_VERSION` whenever:**
- Adding new struct fields
- Changing function signatures (even optional parameters)
- Modifying validation logic that affects state

### Dynamic Field Versioning ⚡️ NEW

**IMPORTANT**: To maintain Sui's upgrade compatibility rules, version metadata is now stored using **dynamic fields** instead of struct fields. This allows adding version tracking without breaking the struct layout.

```move
use sui::dynamic_field;

/// Get spreadsheet version from dynamic field (0 if legacy)
fun get_spreadsheet_version(spreadsheet: &Spreadsheet): u64 {
    if (dynamic_field::exists_(&spreadsheet.id, VERSION_FIELD_KEY)) {
        *dynamic_field::borrow(&spreadsheet.id, VERSION_FIELD_KEY)
    } else {
        0 // Legacy object without version
    }
}

/// Set spreadsheet version in dynamic field
fun set_spreadsheet_version(spreadsheet: &mut Spreadsheet, version: u64) {
    if (dynamic_field::exists_(&spreadsheet.id, VERSION_FIELD_KEY)) {
        *dynamic_field::borrow_mut(&mut spreadsheet.id, VERSION_FIELD_KEY) = version;
    } else {
        dynamic_field::add(&mut spreadsheet.id, VERSION_FIELD_KEY, version);
    }
}
```

**Why Dynamic Fields?**
- ✅ Preserves struct layout compatibility (no breaking changes)
- ✅ Allows upgrades without requiring struct field additions
- ✅ Sui's upgrade verifier approves these changes
- ✅ Legacy objects (version 0) are automatically detected (missing dynamic field)

**Legacy Object Detection:**
- Objects created before versioning have NO `module_version` dynamic field
- These are treated as **version 0** by default
- Migration is required before any mutations can occur

### Admin Capability

```move
public struct SpreadsheetAdminCap has key {
    id: UID,
}
```

- Minted during `init()` and transferred to package publisher
- Required for calling `migrate_spreadsheet` and `migrate_registry`
- Store securely (recommend multi-sig wallet for production)

---

## Migration Process

### Automatic Version Guards

All mutating entry points automatically enforce version compatibility:

```move
public fun save_version(...) {
    assert_latest_version(spreadsheet);  // ← Blocks legacy objects
    // ... rest of logic
}
```

**Functions with version guards:**
- `save_version`
- `save_version_enhanced`
- `lock_cell`
- `unlock_cell`
- `add_collaborator`
- `remove_collaborator`
- (All mutating entry points)

### Migration Entry Points

#### Spreadsheet Migration

```move
public entry fun migrate_spreadsheet(
    spreadsheet: &mut Spreadsheet,
    _cap: &SpreadsheetAdminCap,
    ctx: &mut TxContext
)
```

**What it does:**
1. Reads version from dynamic field: `get_spreadsheet_version(spreadsheet)` and verifies it's `< MODULE_VERSION`
2. Updates version via dynamic field: `set_spreadsheet_version(spreadsheet, MODULE_VERSION)`
3. Backfills any new optional fields (e.g., compression metadata)
4. Emits `SpreadsheetMigrated` event with:
   - Old/new version numbers
   - Outstanding Walrus blob references
   - Timestamp

#### Registry Migration

```move
public entry fun migrate_registry(
    registry: &mut SpreadsheetRegistry,
    _cap: &SpreadsheetAdminCap,
    ctx: &mut TxContext
)
```

**What it does:**
1. Reads version from dynamic field: `get_registry_version(registry)` and verifies it's `< MODULE_VERSION`
2. Updates version via dynamic field: `set_registry_version(registry, MODULE_VERSION)`
3. Emits `RegistryMigrated` event

### Client-Side Migration

#### Backend Service (`blockchain/sui-service.js`)

```javascript
// Check version before mutations
await suiService.ensureSpreadsheetVersion(spreadsheetId);

// Migrate if admin
const result = await suiService.migrateSpreadsheet(
  spreadsheetId,
  adminCapId
);
```

#### Frontend Service (`frontend/services/BrowserSuiService.js`)

```javascript
// Validate compatibility
const compat = await browserSuiService.validateSpreadsheetVersion(spreadsheetId);

if (!compat.canWrite) {
  // Show migration prompt for admin
  // Or "view-only" mode for others
}

// Request migration (admin only)
const result = await browserSuiService.requestSpreadsheetMigration(
  spreadsheetId,
  adminCapId
);
```

---

## Client-Side Enforcement

### Configuration (`blockchain/config.js`)

```javascript
sui: {
  testnet: {
    // ... other config
    moduleVersion: 1,  // ← Update after each Move upgrade
  }
}
```

### ABI Detection (`frontend/utils/AbiHelpers.js`)

```javascript
// Automatically detects module version from on-chain ABI
const { moduleVersion } = await detectModuleVersion();

// Checks compatibility with current module version
const compat = await checkSpreadsheetVersionCompatibility(spreadsheetData);
```

### Reading Dynamic Field Versions

**Backend Service (`blockchain/sui-service.js`):**

```javascript
async getSpreadsheetVersion(spreadsheetId) {
  // Fetch dynamic fields from blockchain
  const dynamicFields = await this.client.getDynamicFields({
    parentId: spreadsheetId
  });

  // Find version field (key is b"module_version")
  const versionField = dynamicFields.data?.find(f => {
    const nameValue = f.name?.value;
    if (typeof nameValue === 'string') {
      return nameValue === 'module_version';
    }
    // Handle bytes format
    if (Array.isArray(nameValue)) {
      const str = String.fromCharCode(...nameValue);
      return str === 'module_version';
    }
    return false;
  });

  let moduleVersion = 0; // Default for legacy objects

  if (versionField) {
    const fieldObj = await this.client.getDynamicFieldObject({
      parentId: spreadsheetId,
      name: versionField.name
    });
    moduleVersion = fieldObj.data?.content?.fields?.value || 0;
  }

  return { success: true, spreadsheetId, moduleVersion, isLegacy: moduleVersion === 0 };
}
```

**Frontend Service (`frontend/services/BrowserSuiService.js`):**

The frontend service uses the exact same dynamic field reading approach as the backend. See `getSpreadsheetVersion()` method.

**Performance Note:** Reading dynamic fields requires 2 RPC calls:
1. `getDynamicFields()` to list all dynamic fields
2. `getDynamicFieldObject()` to fetch the value

For batch operations, use `getSpreadsheetVersionsBatch()` to parallelize version checks.

### Adapter Integration (`frontend/adapters/BlockchainAdapter.js`)

When loading a spreadsheet:

```javascript
const result = await blockchainAdapter.loadSpreadsheet(spreadsheetId);

if (result.metadata.versionCompatibility?.needsMigration) {
  // Display banner: "This spreadsheet needs migration"
  // If user is admin: Show "Migrate Now" button
  // Otherwise: Show "Contact admin to migrate" message
}
```

---

## Operational Procedures

### Pre-Upgrade Checklist

**Before deploying a Move package upgrade:**

1. **Update Module Version**
   ```move
   // In move/sources/spreadsheet.move
   const MODULE_VERSION: u64 = 2;  // Increment
   ```

2. **Run Compatibility Tests**
   ```bash
   # Verify no breaking changes
   sui client publish --verify-compatibility

   # Run Move unit tests
   sui move test

   # Run Walrus integrity checks
   bun run scripts/check-walrus-integrity.js
   ```

3. **Update Client Config**
   ```javascript
   // In blockchain/config.js
   moduleVersion: 2,  // Must match Move MODULE_VERSION
   ```

4. **Test in Staging**
   ```bash
   # Deploy to testnet
   sui client publish --gas-budget 100000000

   # Run migration script in dry-run
   bun run scripts/run-migration.js --dry-run

   # Verify no errors
   ```

5. **Deploy to Production**
   ```bash
   # Deploy package
   sui client publish --gas-budget 100000000

   # Update .env with new packageId
   VITE_SUI_PACKAGE_ID=0xNEW_PACKAGE_ID

   # Run migrations
   bun run scripts/run-migration.js --network mainnet

   # Redeploy frontend/backend
   bun run build && bun run deploy
   ```

### Migration Workflow

#### For Admins

1. **Identify Outdated Objects**
   ```javascript
   const objects = await suiService.querySpreadsheetEvents({
     filter: { module_version: { $lt: MODULE_VERSION } }
   });
   ```

2. **Batch Migration**
   ```bash
   # Use migration script
   bun run scripts/run-migration.js \
     --network testnet \
     --admin-cap 0xADMIN_CAP_ID \
     --batch-size 50
   ```

3. **Verify Success**
   ```javascript
   // Check all objects migrated
   const check = await suiService.getSpreadsheetVersion(spreadsheetId);
   console.log('Version:', check.moduleVersion);  // Should equal MODULE_VERSION
   ```

#### For Users (Non-Admins)

When a version mismatch is detected:

1. **Read-Only Access**
   - UI automatically disables editing
   - Banner displays: "This spreadsheet requires migration"

2. **Contact Admin**
   - Display admin contact information
   - Provide spreadsheet ID for migration request

3. **Await Migration**
   - Once admin migrates, reload spreadsheet
   - Full editing access restored

---

## Troubleshooting

### Common Issues

#### 1. `E_WRONG_VERSION` Error on Save

**Symptoms:**
- Save operations fail with error code 12
- Transaction aborts during execution

**Cause:**
- Spreadsheet `module_version` is outdated

**Solution:**
```javascript
// Check version
const version = await suiService.getSpreadsheetVersion(spreadsheetId);

if (version.moduleVersion < MODULE_VERSION) {
  // Migrate (admin only)
  await suiService.migrateSpreadsheet(spreadsheetId, adminCapId);
}
```

#### 2. ABI Detection Fails

**Symptoms:**
- Version checks return default values
- Console warnings about ABI detection

**Cause:**
- Package ABI not published or network mismatch

**Solution:**
```javascript
// Manually set in config as fallback
sui: {
  testnet: {
    moduleVersion: 1,  // Explicit version
    features: {
      contentHashInSave: true
    }
  }
}
```

#### 3. Walrus Hash Mismatch After Upgrade

**Symptoms:**
- Integrity checks fail after migration
- Content hash doesn't match blob

**Cause:**
- Compression metadata changed during migration

**Solution:**
```bash
# Run integrity check script
bun run scripts/check-walrus-integrity.js --fix

# Re-verify
bun run scripts/check-walrus-integrity.js
```

#### 4. AdminCap Lost/Inaccessible

**Symptoms:**
- Cannot migrate objects
- Migration transactions fail with permission error

**Cause:**
- AdminCap transferred to wrong address or deleted

**Solution:**
```move
// In upgraded module, add emergency migration with time-lock
public entry fun emergency_migrate_after_timelock(
    spreadsheet: &mut Spreadsheet,
    clock: &Clock,
    ctx: &mut TxContext
) {
    // Only allow after 30 days from last migration
    assert!(clock::timestamp_ms(clock) > spreadsheet.last_modified + 2_592_000_000, E_NOT_AUTHORIZED);
    // Update version via dynamic field (not struct field!)
    set_spreadsheet_version(spreadsheet, MODULE_VERSION);
}
```

### Debug Commands

```bash
# Check object and list dynamic fields
sui client object <SPREADSHEET_ID> --json

# Check dynamic field version (use GraphQL for easier querying)
# Query via RPC:
sui client dynamic-field <SPREADSHEET_ID> --json

# Or via GraphQL:
curl -X POST https://sui-testnet.mystenlabs.com/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { object(address: \"<SPREADSHEET_ID>\") { dynamicFields { name { ... on MoveValue { json } } value { ... on MoveValue { json } } } } }"
  }'

# List all AdminCaps owned by address
sui client objects <ADMIN_ADDRESS> --json | jq '.[] | select(.type | contains("AdminCap"))'

# Query migration events
sui client events --package <PACKAGE_ID> --event-type SpreadsheetMigrated

# Verify Walrus blob integrity
curl https://aggregator.walrus.xyz/v1/blobs/<BLOB_ID> | shasum -a 256
```

---

## Automation Scripts

### 1. Compatibility Verifier (`scripts/verify-upgrade.js`)

```bash
# Run before publishing
bun run scripts/verify-upgrade.js

# Or add to package.json
bun run test:compat
```

**What it does:**
- Runs `sui client publish --verify-compatibility` against localnet
- Checks for breaking changes in struct layouts
- Aborts CI if incompatibilities found

### 2. Walrus Integrity Check (`scripts/check-walrus-integrity.js`)

```bash
# Check all blobs
bun run scripts/check-walrus-integrity.js

# Auto-fix mismatches
bun run scripts/check-walrus-integrity.js --fix
```

**What it does:**
- Lists all `Version` objects via GraphQL
- Fetches each Walrus blob
- Recomputes SHA-256 hash
- Compares to on-chain `content_hash`
- Reports mismatches (exits non-zero for CI)

### 3. Migration Playbook (`scripts/run-migration.js`)

```bash
# Dry run (no transactions)
bun run scripts/run-migration.js --dry-run

# Migrate testnet
bun run scripts/run-migration.js --network testnet --admin-cap 0xCAP_ID

# Migrate specific objects
bun run scripts/run-migration.js --objects 0xID1,0xID2,0xID3
```

**What it does:**
- Batch-calls `migrate_spreadsheet` for outdated objects
- Uses `AdminCap` for authorization
- Shows progress via `transactionExperienceManager`
- Supports dry-run mode for visibility

---

## Best Practices

### 1. AdminCap Storage

**Production:**
- Store in **multi-sig wallet** (3-of-5 or 5-of-7)
- Document recovery procedures
- Keep backup of private keys in secure vault

**Testnet:**
- OK to use single wallet for testing
- Document wallet address in `.env.example`

### 2. Version Increment Strategy

**Semantic Versioning:**
- **Patch (1 → 2):** Bug fixes, no schema changes
- **Minor (1 → 10):** New optional fields, backward-compatible
- **Major (1 → 100):** Breaking changes, required migration

### 3. Migration Timing

**Recommended:**
- Schedule during low-traffic hours
- Notify users 24 hours in advance
- Migrate in batches (50 objects at a time)
- Monitor transaction success rate

**Emergency:**
- If critical bug found, migrate immediately
- Use `emergency_migrate_after_timelock` if AdminCap unavailable

### 4. CI/CD Integration

Add to `.github/workflows/test.yml`:

```yaml
- name: Verify Move Compatibility
  run: bun run test:compat

- name: Check Walrus Integrity
  run: bun run scripts/check-walrus-integrity.js

- name: Run Move Tests
  run: sui move test
```

---

## References

- **Sui Move Upgrade Guide:** https://blog.sui.io/move-cli-error-flag-upgrade/
- **Walrus Blob Verification:** https://www.walrus.xyz/blog/how-walrus-blob-storage-works/
- **WalSheetz Architecture:** [docs/README.md](README.md)
- **Testing Guide:** [docs/TESTING.md](TESTING.md)

---

## Changelog

### v1.0 (2025-10-12)

**Implemented:**
- Module versioning with `MODULE_VERSION` constant
- **Dynamic field versioning** for upgrade compatibility ⚡️ NEW
- `SpreadsheetAdminCap` for migration control
- Version guards on all mutating functions (all 12+ mutators now guarded)
- Migration entry points (`migrate_spreadsheet`, `migrate_registry`)
- Client-side version detection via ABI and dynamic field reading
- Automatic compatibility checks on load
- Migration workflows for admins and users
- Batch version checking for performance (`getSpreadsheetVersionsBatch`)

**Architecture Changes:**
- ✅ Version metadata stored as **dynamic fields** instead of struct fields
- ✅ Preserves Sui upgrade compatibility (no struct layout changes)
- ✅ Legacy objects (version 0) automatically detected via missing dynamic field
- ✅ All backend and frontend mutation methods now call `ensureSpreadsheetVersion` guards
- ✅ ABI helper fallback defaults to version 0 for legacy objects (was incorrectly 1)

**Breaking Changes:**
- None! Dynamic fields preserve upgrade compatibility
- Legacy objects without version field are treated as version 0
- Legacy objects will be read-only until migrated

**Migration Required:**
- All existing spreadsheets must be migrated using `migrate_spreadsheet`
- Registry must be migrated using `migrate_registry`
- Update `config.moduleVersion` to match deployed package
- Migration sets version via dynamic field (not struct field)

---

For questions or support, see the main [README.md](../README.md) or open an issue on GitHub.
