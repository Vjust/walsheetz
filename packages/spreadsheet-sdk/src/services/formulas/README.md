# Formulas Module

Custom formula functions for spreadsheet calculations including Sui blockchain and Walrus-specific functions.

## Overview

This module provides custom formula functions that extend the standard spreadsheet formula library with Walrus and Sui blockchain-specific operations.

## Exports

### WalSheetzFunctions

Custom formula functions for WalSheetz spreadsheet operations.

```javascript
import { WalSheetzFunctions } from '@dreamlit/spreadsheet-sdk/services/formulas';

// Available formulas:
// =WALRUS_BLOB_ID() - Get current blob ID
// =WALRUS_SIZE() - Get blob size
// =WALRUS_EPOCHS() - Get storage epochs
// =WALRUS_COST(size, epochs) - Calculate storage cost
```

---

### SuiFunctions

Sui blockchain-specific formula functions.

```javascript
import { SuiFunctions } from '@dreamlit/spreadsheet-sdk/services/formulas';

// Available formulas:
// =SUI_BALANCE(address) - Get SUI balance
// =SUI_OBJECT(objectId) - Get object data
// =SUI_TX_STATUS(digest) - Get transaction status
// =SUI_GAS_PRICE() - Get current gas price
// =SUI_EPOCH() - Get current epoch
```

## Formula Reference

### Walrus Formulas

#### `=WALRUS_BLOB_ID()`
Returns the current blob ID of the spreadsheet.

```
=WALRUS_BLOB_ID()
// Returns: "abc123def456..."
```

#### `=WALRUS_SIZE(blobId?)`
Returns the size of a blob in bytes.

```
=WALRUS_SIZE()           // Current spreadsheet size
=WALRUS_SIZE("abc123")   // Specific blob size
```

#### `=WALRUS_EPOCHS(blobId?)`
Returns the storage duration in epochs.

```
=WALRUS_EPOCHS()         // Current spreadsheet epochs
=WALRUS_EPOCHS("abc123") // Specific blob epochs
```

#### `=WALRUS_COST(size, epochs)`
Calculates storage cost for given size and epochs.

```
=WALRUS_COST(1024, 5)    // Cost for 1KB, 5 epochs
=WALRUS_COST(A1, B1)     // Cost using cell values
```

### Sui Formulas

#### `=SUI_BALANCE(address)`
Get SUI balance for an address.

```
=SUI_BALANCE("0x123...") // Get balance
=SUI_BALANCE(A1)         // Use address from cell
```

#### `=SUI_OBJECT(objectId)`
Get object data from Sui blockchain.

```
=SUI_OBJECT("0xobj123")  // Returns object JSON
```

#### `=SUI_TX_STATUS(digest)`
Get transaction status.

```
=SUI_TX_STATUS("0xtx123")
// Returns: "success" | "pending" | "failed"
```

#### `=SUI_GAS_PRICE()`
Get current gas price.

```
=SUI_GAS_PRICE()
// Returns: current gas price in MIST
```

#### `=SUI_EPOCH()`
Get current Sui epoch number.

```
=SUI_EPOCH()
// Returns: 12345
```

## Usage

Formulas are registered with Luckysheet on spreadsheet initialization:

```javascript
import { WalSheetzFunctions, SuiFunctions } from '@dreamlit/spreadsheet-sdk/services/formulas';
import luckysheet from 'luckysheet';

// Register custom formulas
luckysheet.formula.register(WalSheetzFunctions);
luckysheet.formula.register(SuiFunctions);

// Now formulas are available in spreadsheet
// Users can type: =WALRUS_BLOB_ID()
```

## Formula Categories

### Storage & Cost
- `WALRUS_BLOB_ID`
- `WALRUS_SIZE`
- `WALRUS_EPOCHS`
- `WALRUS_COST`

### Blockchain Data
- `SUI_BALANCE`
- `SUI_OBJECT`
- `SUI_TX_STATUS`

### Network Info
- `SUI_GAS_PRICE`
- `SUI_EPOCH`

## Related Modules

- [../luckysheet/](../luckysheet/) - Luckysheet integration
- [../../core/](../../core/) - Spreadsheet engine
- [../../adapters/](../../adapters/) - Blockchain adapters

## Notes

- Formulas are automatically registered on initialization
- Async formulas return promises resolved by Luckysheet
- Blockchain formulas query live data
- Formulas update when dependencies change
- Custom error handling for network failures
