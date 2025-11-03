# Export Mismatches Fixed in @dreamlit/walrus-sui-core

## Summary
Fixed export mismatches in both `src/blockchain/index.js` and `src/transaction-management/index.js` by updating them to match the actual exports from their respective service files.

## Changes Made

### 1. src/blockchain/index.js

**Problem**: Index was using `export { default as ... }` syntax, but most services export singleton instances as named exports, not default exports.

**Fixed Exports**:

#### Core Services (changed from default to named exports):
- `suiService` - exports singleton `suiService`, not default
- `suiGraphQLService` - exports singleton `suiGraphQLService`, not default
- `suiGrpcService` - exports singleton `suiGrpcService`, not default
- `walrusService` - exports singleton `walrusService`, not default
- `walletManager` - exports singleton `walletManager`, not default

#### Support Services (changed from default to named exports):
- `sponsorService` - exports singleton `sponsorService`, not default
- `gasEstimator` - exports singleton `gasEstimator`, not default
- `depositManager` - exports singleton `depositManager`, not default
- `versionControl` - exports singleton `versionControl`, not default

#### Management Services:
- `eventStreamManager` - exports singleton `eventStreamManager`, not default
- `GraphQLEventSubscriber` - exports class `GraphQLEventSubscriber` (no singleton exists)
- `suiContractRegistry` - exports singleton `contractRegistry`, aliased to `suiContractRegistry`
- `suiTransactionRunner` - exports singleton `transactionRunner`, aliased to `suiTransactionRunner`

#### Builders & Bridges (changed from default to named exports):
- `grpcTransactionBuilder` - exports singleton `grpcTransactionBuilder`, not default
- `grpcService` - exports singleton `grpcService`, not default
- `websocketGrpcBridge` - exports singleton `wsGrpcBridge`, aliased to `websocketGrpcBridge`

**Before**:
```javascript
export { default as suiService } from './sui-service.js';
export { default as walletManager } from './wallet-manager.js';
// ... etc
```

**After**:
```javascript
export { suiService } from './sui-service.js';
export { walletManager } from './wallet-manager.js';
export { GraphQLEventSubscriber } from './graphql-event-subscriber.js';
export { contractRegistry as suiContractRegistry } from './sui-contract-registry.js';
// ... etc
```

### 2. src/transaction-management/index.js

**Problem**: Index was trying to export wrong names or classes when singletons existed.

**Fixed Exports**:

#### Services:
- `TransactionManager` - Added export of both class AND singleton `transactionManager`
- `transactionTracker` - Correct (singleton export)
- `offlineModeService` - Fixed from exporting class `OfflineModeService` to singleton `offlineModeService`

#### Queue:
- `OfflineQueueManager` - Fixed from exporting singleton `offlineQueueManager` (doesn't exist) to class `OfflineQueueManager`

#### Utils:
- `transactionExperienceManager` - Fixed from exporting function `getTransactionExperience` (doesn't exist) to singleton `transactionExperienceManager`

**Before**:
```javascript
export { TransactionManager } from './services/TransactionManager.js';
export { OfflineModeService } from './services/OfflineModeService.js';
export { offlineQueueManager } from './queue/OfflineQueueManager.js';
export { getTransactionExperience } from './utils/TransactionExperience.js';
```

**After**:
```javascript
export { TransactionManager, transactionManager } from './services/TransactionManager.js';
export { offlineModeService } from './services/OfflineModeService.js';
export { OfflineQueueManager } from './queue/OfflineQueueManager.js';
export { transactionExperienceManager } from './utils/TransactionExperience.js';
```

## Verification

All exports now match the actual exports in the source files:

### Blockchain Services Pattern:
Most services follow this pattern:
```javascript
export class ServiceName { ... }
export const serviceName = new ServiceName();
```

The index now correctly exports the singleton instance (`serviceName`) not the default.

### Transaction Management Pattern:
Mixed pattern:
- Some export both class and singleton (TransactionManager)
- Some export only singleton (offlineModeService, transactionTracker)
- Some export only class (OfflineQueueManager)
- Utils export singleton (transactionExperienceManager)

## Files Modified

1. `/Users/angel/Projects/test/walsheetz/dreamlit-sdks/packages/walrus-sui-core/src/blockchain/index.js`
2. `/Users/angel/Projects/test/walsheetz/dreamlit-sdks/packages/walrus-sui-core/src/transaction-management/index.js`

## Impact

These fixes ensure that:
1. Importing from the package indexes will work correctly
2. Named exports match what's actually exported from the source files
3. No more "export not found" errors when using these packages
4. Consistent API surface for package consumers
