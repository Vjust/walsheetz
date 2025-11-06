# SDK Module Mapping

This document maps each module from the old `src/sdk/` and `src/walrus/` structure to its new home in the reorganized codebase.

**Last Updated**: 2025-11-06

---

## Mapping Rules

### Packages
- `packages/shared/` - Common utilities, validation, logging, telemetry
- `packages/walrus/` - Walrus storage client, configuration, health checks
- `packages/walrus-sui-core/` - Blockchain integration, wallet management, transaction handling
- `packages/spreadsheet-sdk/` - Spreadsheet core functionality, hooks, storage adapters
- `packages/subwallet/` - Wallet connection and management (if applicable)

### Frontend
- `frontend/services/infrastructure/` - App-specific infrastructure services
- `frontend/services/application/` - App-specific business logic
- `frontend/services/legacy/` - Temporary home for services being refactored

### Tests
- Collocate tests with their modules: `packages/*/src/__tests__/`
- Keep E2E and integration tests in `tests/`

---

## Module Mappings

### src/sdk/shared → packages/shared/src

| Old Path | New Path | Notes |
|----------|----------|-------|
| `src/sdk/shared/index.js` | `packages/shared/src/index.ts` | Main export |
| `src/sdk/shared/utils/ValidationGuards.js` | `packages/shared/src/utils/ValidationGuards.ts` | |
| `src/sdk/shared/utils/spreadsheetValidation.js` | `packages/shared/src/utils/spreadsheetValidation.ts` | |
| `src/sdk/shared/utils/Logger.js` | `packages/shared/src/utils/Logger.ts` | |
| `src/sdk/shared/utils/Telemetry.js` | `packages/shared/src/utils/Telemetry.ts` | |
| `src/sdk/shared/utils/CircuitBreaker.js` | `packages/shared/src/utils/CircuitBreaker.ts` | |
| `src/sdk/shared/utils/testMode.js` | `packages/shared/src/utils/testMode.ts` | |
| `src/sdk/shared/utils/NetworkLock.js` | `packages/shared/src/utils/NetworkLock.ts` | |
| `src/sdk/shared/utils/cellUtils.js` | `packages/shared/src/utils/cellUtils.ts` | |
| `src/sdk/shared/utils/BlobParser.js` | `packages/shared/src/utils/BlobParser.ts` | |
| `src/sdk/shared/utils/StandardizedErrorHandler.js` | `packages/shared/src/utils/StandardizedErrorHandler.ts` | |
| `src/sdk/shared/services/**` | `packages/shared/src/services/` | All shared services |
| `src/sdk/shared/testing/**` | `packages/shared/src/testing/` | Test utilities |
| `src/sdk/shared/__tests__/**` | `packages/shared/src/__tests__/` | Tests |

### src/walrus → packages/walrus/src

| Old Path | New Path | Notes |
|----------|----------|-------|
| `src/walrus/BrowserWalrusService.js` | `packages/walrus/src/BrowserWalrusService.ts` | Main service |
| `src/walrus/WalrusSdkClientLoader.js` | `packages/walrus/src/WalrusSdkClientLoader.ts` | SDK loader |
| `src/walrus/client/**` | `packages/walrus/src/client/` | HTTP/SDK clients |
| `src/walrus/config/**` | `packages/walrus/src/config/` | Configuration resolvers |
| `src/walrus/health/**` | `packages/walrus/src/health/` | Health monitoring |
| `src/walrus/retry/**` | `packages/walrus/src/retry/` | Retry logic |
| `src/walrus/transports/**` | `packages/walrus/src/transports/` | Transport adapters |
| `src/walrus/utils/**` | `packages/walrus/src/utils/` | Walrus utilities |

### src/sdk/blockchain-integration → packages/walrus-sui-core/src

| Old Path | New Path | Notes |
|----------|----------|-------|
| `src/sdk/blockchain-integration/index.js` | `packages/walrus-sui-core/src/index.ts` | Main export |
| `src/sdk/blockchain-integration/adapters/BlockchainAdapter.js` | `packages/walrus-sui-core/src/adapters/BlockchainAdapter.ts` | |
| `src/sdk/blockchain-integration/adapters/atomic/**` | `packages/walrus-sui-core/src/adapters/atomic/` | Atomic operations |
| `src/sdk/blockchain-integration/services/BrowserWalletManager.js` | `packages/walrus-sui-core/src/services/BrowserWalletManager.ts` | |
| `src/sdk/blockchain-integration/services/BrowserSuiService.js` | `packages/walrus-sui-core/src/services/BrowserSuiService.ts` | |
| `src/sdk/blockchain-integration/services/BrowserGrpcService.js` | `packages/walrus-sui-core/src/services/BrowserGrpcService.ts` | |
| `src/sdk/blockchain-integration/services/AtomicOperationManager.js` | `packages/walrus-sui-core/src/services/AtomicOperationManager.ts` | |
| `src/sdk/blockchain-integration/services/AtomicExecutionContext.js` | `packages/walrus-sui-core/src/services/AtomicExecutionContext.ts` | |
| `src/sdk/blockchain-integration/interfaces/**` | `packages/walrus-sui-core/src/interfaces/` | Interfaces |
| `src/sdk/blockchain-integration/types/**` | `packages/walrus-sui-core/src/types/` | Type definitions |
| `src/sdk/blockchain-integration/utils/**` | `packages/walrus-sui-core/src/utils/` | Utilities |
| `src/sdk/blockchain-integration/__tests__/**` | `packages/walrus-sui-core/src/__tests__/` | Tests |

### src/sdk/spreadsheet-core → packages/spreadsheet-sdk/src

| Old Path | New Path | Notes |
|----------|----------|-------|
| `src/sdk/spreadsheet-core/index.js` | `packages/spreadsheet-sdk/src/index.ts` | Main export |
| `src/sdk/spreadsheet-core/adapters/**` | `packages/spreadsheet-sdk/src/adapters/` | Storage adapters |
| `src/sdk/spreadsheet-core/core/**` | `packages/spreadsheet-sdk/src/core/` | Core logic |
| `src/sdk/spreadsheet-core/engine/**` | `packages/spreadsheet-sdk/src/engine/` | Spreadsheet engine |
| `src/sdk/spreadsheet-core/hooks/**` | `packages/spreadsheet-sdk/src/hooks/` | React hooks |
| `src/sdk/spreadsheet-core/scheduling/**` | `packages/spreadsheet-sdk/src/scheduling/` | Auto-save scheduling |
| `src/sdk/spreadsheet-core/services/**` | `packages/spreadsheet-sdk/src/services/` | Spreadsheet services |
| `src/sdk/spreadsheet-core/types/**` | `packages/spreadsheet-sdk/src/types/` | Type definitions |
| `src/sdk/spreadsheet-core/utils/**` | `packages/spreadsheet-sdk/src/utils/` | Utilities |
| `src/sdk/spreadsheet-core/__tests__/**` | `packages/spreadsheet-sdk/src/__tests__/` | Tests |

### src/sdk/services → frontend/services/legacy

**Note**: These are app-specific services that should eventually be refactored into proper domains.

| Old Path | New Path | Notes |
|----------|----------|-------|
| `src/sdk/services/SpreadsheetCRUD.js` | `frontend/services/legacy/SpreadsheetCRUD.ts` | May move to spreadsheet-sdk |
| `src/sdk/services/SpreadsheetExport.js` | `frontend/services/legacy/SpreadsheetExport.ts` | Export functionality |
| `src/sdk/services/luckysheetApi.js` | `frontend/services/legacy/luckysheetApi.ts` | Luckysheet integration |
| `src/sdk/services/blockchain/**` | `frontend/services/infrastructure/blockchain/` | App-level blockchain services |
| `src/sdk/services/formulas/**` | `frontend/services/application/formulas/` | App-level formula services |
| `src/sdk/services/storage/**` | `frontend/services/infrastructure/storage/` | App-level storage services |

### src/sdk/collaboration → frontend/services/application/collaboration

| Old Path | New Path | Notes |
|----------|----------|-------|
| `src/sdk/collaboration/index.js` | `frontend/services/application/collaboration/index.ts` | |
| `src/sdk/collaboration/services/CollaborationService.js` | `frontend/services/application/collaboration/CollaborationService.ts` | |
| `src/sdk/collaboration/services/WebSocketService.js` | `frontend/services/application/collaboration/WebSocketService.ts` | |

### src/sdk/transaction-management → frontend/services/application/transactions

| Old Path | New Path | Notes |
|----------|----------|-------|
| `src/sdk/transaction-management/index.js` | `frontend/services/application/transactions/index.ts` | |
| `src/sdk/transaction-management/services/TransactionManager.js` | `frontend/services/application/transactions/TransactionManager.ts` | |
| `src/sdk/transaction-management/services/TransactionTracker.js` | `frontend/services/application/transactions/TransactionTracker.ts` | |
| `src/sdk/transaction-management/services/OfflineModeService.js` | `frontend/services/application/transactions/OfflineModeService.ts` | |
| `src/sdk/transaction-management/queue/OfflineQueueManager.js` | `frontend/services/application/transactions/queue/OfflineQueueManager.ts` | |
| `src/sdk/transaction-management/utils/**` | `frontend/services/application/transactions/utils/` | |
| `src/sdk/transaction-management/__tests__/**` | `frontend/services/application/transactions/__tests__/` | |

### src/sdk/formula-engine → frontend/services/application/formulas

| Old Path | New Path | Notes |
|----------|----------|-------|
| `src/sdk/formula-engine/index.js` | `frontend/services/application/formulas/index.ts` | |
| `src/sdk/formula-engine/formulas/SuiFunctions.js` | `frontend/services/application/formulas/SuiFunctions.ts` | |
| `src/sdk/formula-engine/formulas/WalSheetzFunctions.js` | `frontend/services/application/formulas/WalSheetzFunctions.ts` | |
| `src/sdk/formula-engine/functions/**` | `frontend/services/application/formulas/functions/` | |
| `src/sdk/formula-engine/scheduling/**` | `frontend/services/application/formulas/scheduling/` | |
| `src/sdk/formula-engine/__tests__/**` | `frontend/services/application/formulas/__tests__/` | |

### src/sdk/data-integrity → packages/walrus-sui-core/src/data-integrity

| Old Path | New Path | Notes |
|----------|----------|-------|
| `src/sdk/data-integrity/index.js` | `packages/walrus-sui-core/src/data-integrity/index.ts` | Or separate package? |
| `src/sdk/data-integrity/services/PoACertificationService.js` | `packages/walrus-sui-core/src/data-integrity/services/PoACertificationService.ts` | |
| `src/sdk/data-integrity/services/PoARenewalManager.js` | `packages/walrus-sui-core/src/data-integrity/services/PoARenewalManager.ts` | |
| `src/sdk/data-integrity/services/BlobLineageTracker.js` | `packages/walrus-sui-core/src/data-integrity/services/BlobLineageTracker.ts` | |
| `src/sdk/data-integrity/interfaces/**` | `packages/walrus-sui-core/src/data-integrity/interfaces/` | |
| `src/sdk/data-integrity/__tests__/**` | `packages/walrus-sui-core/src/data-integrity/__tests__/` | |

### src/sdk/import-export → frontend/services/application/import-export

| Old Path | New Path | Notes |
|----------|----------|-------|
| `src/sdk/import-export/index.js` | `frontend/services/application/import-export/index.ts` | |
| `src/sdk/import-export/services/**` | `frontend/services/application/import-export/services/` | |
| `src/sdk/import-export/utils/**` | `frontend/services/application/import-export/utils/` | |
| `src/sdk/import-export/__tests__/**` | `frontend/services/application/import-export/__tests__/` | |

### src/sdk/adapters → Multiple Destinations

| Old Path | New Path | Notes |
|----------|----------|-------|
| `src/sdk/adapters/atomic/**` | `packages/walrus-sui-core/src/adapters/atomic/` | Blockchain atomic ops |
| `src/sdk/adapters/storage/**` | `packages/spreadsheet-sdk/src/adapters/storage/` | Storage adapters |

### src/sdk/interfaces → Multiple Destinations

| Old Path | New Path | Notes |
|----------|----------|-------|
| `src/sdk/interfaces/IBlockchainService.js` | `packages/walrus-sui-core/src/interfaces/IBlockchainService.ts` | |
| `src/sdk/interfaces/graphql/**` | `packages/walrus-sui-core/src/interfaces/graphql/` | GraphQL interfaces |

### src/sdk/types → Multiple Destinations

| Old Path | New Path | Notes |
|----------|----------|-------|
| `src/sdk/types/**` | Distribute to relevant packages | Split by domain |

### src/sdk/testing → packages/shared/src/testing

| Old Path | New Path | Notes |
|----------|----------|-------|
| `src/sdk/testing/adapters/**` | `packages/shared/src/testing/adapters/` | Test adapters |
| `src/sdk/testing/mocks/**` | `packages/shared/src/testing/mocks/` | Shared mocks |

---

## Package Ownership Summary

### packages/shared
**Purpose**: Common utilities, validation, logging, telemetry, test utilities

**Contents**:
- Validation guards
- Logger
- Telemetry
- Circuit breaker
- Network lock
- Cell utilities
- Blob parser
- Error handling
- Test utilities and mocks

### packages/walrus
**Purpose**: Walrus storage client and configuration

**Contents**:
- BrowserWalrusService
- WalrusSdkClientLoader
- HTTP/SDK clients
- Configuration resolvers
- Health monitoring
- Retry logic
- Transport adapters
- Walrus-specific utilities

### packages/walrus-sui-core
**Purpose**: Blockchain integration, wallet management, Sui interactions

**Contents**:
- BlockchainAdapter
- Wallet management (BrowserWalletManager)
- Sui service (BrowserSuiService)
- gRPC service
- Atomic operation management
- Transaction handling
- Data integrity (PoA)
- Blockchain utilities
- Explorer links

### packages/spreadsheet-sdk
**Purpose**: Core spreadsheet functionality and storage

**Contents**:
- Spreadsheet core logic
- Storage adapters
- React hooks (useSpreadsheet)
- Spreadsheet engine
- Auto-save scheduling
- Spreadsheet services
- Utilities

### frontend/services/application
**Purpose**: App-specific business logic

**Contents**:
- Collaboration (WebSocket, CollaborationService)
- Transaction management
- Formula engine
- Import/Export

### frontend/services/infrastructure
**Purpose**: App-specific infrastructure

**Contents**:
- Blockchain services (app-level)
- Storage services (app-level)

### frontend/services/legacy
**Purpose**: Temporary home for services being refactored

**Contents**:
- SpreadsheetCRUD
- SpreadsheetExport
- luckysheetApi

---

## Migration Checklist per Module

For each module being moved:

- [ ] Create destination directory in new location
- [ ] Copy file(s) to new location (keep .js extension for now)
- [ ] Update internal imports within the file
- [ ] Move associated tests to `__tests__/` in same location
- [ ] Update test imports
- [ ] Add to package's `src/index.js` exports (if public API)
- [ ] Update consuming code imports
- [ ] Remove old file from `src/sdk/` or `src/walrus/`
- [ ] Verify tests still pass
- [ ] Commit checkpoint

---

## Open Questions / Decisions Needed

1. **Data Integrity Package**: Should `src/sdk/data-integrity/` be a separate `packages/data-integrity` or stay within `walrus-sui-core`?
   - **Decision**: Keep in `walrus-sui-core` for now since it's tightly coupled to blockchain PoA

2. **Subwallet Package**: Is there existing subwallet functionality that needs its own package?
   - **Decision**: TBD based on codebase exploration

3. **Formula Engine**: Should formulas be part of the SDK or purely app-level?
   - **Decision**: Keep in `frontend/services/application` for now; may extract later

4. **CRUD Services**: SpreadsheetCRUD might belong in spreadsheet-sdk vs frontend
   - **Decision**: Start in `frontend/services/legacy`, refactor later

---

## Notes

- All paths will be converted from `.js`/`.jsx` to `.ts`/`.tsx` in Phase 2
- Tests should be collocated with their modules when possible
- Frontend-specific code stays in `frontend/`
- Reusable libraries go in `packages/`
- The `dreamlit-sdks/` submodule is not touched in this migration

---

**Last Updated**: 2025-11-06
