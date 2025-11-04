# Part B: SDK Modularization Plan

**Goal**: Reorganize src/sdk by usage/purpose with independent, extractable modules

**Branch**: `phase-4-consumer-migration` (continue from Part A)

**Timeline**: 2-3 weeks

---

## Module Structure Design

### Philosophy
- **Usage-based organization** (not type-based)
- **Independent extraction** to SONAR, Tundra, other projects
- **Clear boundaries** with well-defined public APIs
- **Comprehensive READMEs** for each module
- **Minimal coupling** between modules

### Proposed Modules

```
src/
├── sdk/
│   ├── shared/                    # @walsheetz/shared - Common utilities
│   ├── blockchain-integration/    # @walsheetz/blockchain - Sui interaction
│   ├── transaction-management/    # @walsheetz/transactions - TX handling
│   ├── data-integrity/            # @walsheetz/data-integrity - PoA/lineage
│   ├── spreadsheet-core/          # @walsheetz/spreadsheet - Core engine
│   ├── formula-engine/            # @walsheetz/formulas - Custom functions
│   ├── import-export/             # @walsheetz/import-export - CSV/Excel
│   └── testing/                   # @walsheetz/testing - Test utilities
└── walrus/                        # @walsheetz/walrus - Already modular!
    └── (keep current structure)
```

---

## Module Breakdown

### 1. shared/ - Common Foundation
**Purpose**: Utilities used across all modules
**Extractability**: ⭐⭐⭐⭐⭐ (highly reusable)

**Files** (18 files):
```
shared/
├── utils/
│   ├── ConfigLoader.js           # Configuration management
│   ├── CircuitBreaker.js         # Resilient execution
│   ├── EventBus.js               # Event system
│   ├── Logger.js                 # Logging
│   ├── LogConfig.js              # Log configuration
│   ├── errors.js                 # Error definitions
│   ├── StandardizedErrorHandler.js
│   ├── Telemetry.js              # Analytics
│   ├── ValidationGuards.js       # Input validation
│   ├── RateLimiter.js            # Rate limiting
│   ├── NetworkLock.js            # Network coordination
│   ├── devTools.js               # Dev utilities
│   └── testMode.js               # Test mode detection
├── services/
│   ├── IndexedDBCache.js         # Browser caching
│   └── SentryStub.js             # Error tracking stub
├── __tests__/
│   ├── ConfigLoader.*.test.js
│   └── ValidationGuards.*.test.js
├── index.js                      # Barrel export
└── README.md
```

**Dependencies**: None (foundation layer)

**Public API**:
```javascript
export { configLoader } from './utils/ConfigLoader.js';
export { ResilientExecutor } from './utils/CircuitBreaker.js';
export { eventBus } from './utils/EventBus.js';
export { logger } from './utils/Logger.js';
export { StandardizedErrorHandler } from './utils/StandardizedErrorHandler.js';
// ... etc
```

---

### 2. blockchain-integration/ - Sui Blockchain
**Purpose**: Complete Sui blockchain interaction layer
**Extractability**: ⭐⭐⭐⭐⭐ (perfect for SONAR/Tundra)

**Files** (20 files):
```
blockchain-integration/
├── services/
│   ├── BrowserSuiService.js      # Sui RPC client
│   ├── BrowserWalletManager.js   # Wallet connection
│   ├── BrowserGrpcService.js     # gRPC client
│   ├── AtomicOperationManager.js # Atomic operations
│   └── AtomicExecutionContext.js # Execution context
├── adapters/
│   ├── BlockchainAdapter.js      # High-level adapter
│   └── atomic/
│       ├── createBlockchainExecutionOp.js
│       ├── createTxPrepOp.js
│       ├── createWalrusStorageOp.js
│       ├── OperationHelpers.js
│       └── index.js
├── interfaces/
│   └── IBlockchainService.js     # Service interface
├── utils/
│   ├── AbiHelpers.js             # ABI parsing
│   └── ExplorerLinks.js          # Explorer URL generation
├── types/
│   ├── blockchain.d.ts           # Blockchain types
│   ├── wallet.d.ts               # Wallet types
│   └── abi.d.ts                  # ABI types
├── __tests__/
│   ├── AtomicOperationManager.test.js
│   ├── BrowserSuiService.network.test.js
│   └── BrowserWalletManager.signAndExecute.test.js
├── index.js
└── README.md
```

**Dependencies**:
- @walsheetz/shared (ConfigLoader, CircuitBreaker, Logger, etc.)
- @mysten/sui.js
- @mysten/wallet-standard

**Public API**:
```javascript
export { browserSuiService } from './services/BrowserSuiService.js';
export { browserWalletManager } from './services/BrowserWalletManager.js';
export { BlockchainAdapter } from './adapters/BlockchainAdapter.js';
export { AtomicOperationManager } from './services/AtomicOperationManager.js';
```

---

### 3. transaction-management/ - Transaction Handling
**Purpose**: Transaction queuing, tracking, retry, offline support
**Extractability**: ⭐⭐⭐⭐ (useful for any blockchain app)

**Files** (6 files):
```
transaction-management/
├── services/
│   ├── TransactionManager.js     # TX queue management
│   ├── TransactionTracker.js     # TX status tracking
│   └── OfflineModeService.js     # Offline TX support
├── queue/
│   └── OfflineQueueManager.js    # Offline queue
├── utils/
│   └── TransactionExperience.js  # UX helpers
├── __tests__/
├── index.js
└── README.md
```

**Dependencies**:
- @walsheetz/shared (Logger, EventBus, IndexedDBCache)
- @walsheetz/blockchain-integration (BrowserSuiService)

**Public API**:
```javascript
export { TransactionManager } from './services/TransactionManager.js';
export { TransactionTracker } from './services/TransactionTracker.js';
export { OfflineQueueManager } from './queue/OfflineQueueManager.js';
```

---

### 4. data-integrity/ - PoA & Lineage
**Purpose**: Proof of Availability, blob lineage, certification
**Extractability**: ⭐⭐⭐⭐ (valuable for any Walrus app)

**Files** (8 files):
```
data-integrity/
├── services/
│   ├── PoACertificationService.js
│   ├── PoARenewalManager.js
│   └── BlobLineageTracker.js
├── interfaces/
│   ├── IBlobLineage.ts
│   └── graphql/
│       ├── IBlobRecord.js
│       ├── IGraphQLResponse.js
│       ├── IPoAStatus.js
│       └── index.js
├── __tests__/
├── index.js
└── README.md
```

**Dependencies**:
- @walsheetz/shared (Logger, EventBus)
- @walsheetz/blockchain-integration (BrowserSuiService)
- @walsheetz/walrus (BrowserWalrusService)

**Public API**:
```javascript
export { PoACertificationService } from './services/PoACertificationService.js';
export { PoARenewalManager } from './services/PoARenewalManager.js';
export { BlobLineageTracker } from './services/BlobLineageTracker.js';
```

---

### 5. spreadsheet-core/ - Spreadsheet Engine
**Purpose**: Core spreadsheet state, engine, React hooks
**Extractability**: ⭐⭐⭐ (WalSheetz-specific but reusable)

**Files** (12 files):
```
spreadsheet-core/
├── engine/
│   └── SpreadsheetEngine.js      # Core engine
├── hooks/
│   ├── useSpreadsheet.js         # Main spreadsheet hook
│   ├── useSpreadsheetAutosave.js
│   └── useSpreadsheetImport.js
├── services/
│   └── SpreadsheetMigrator.js    # Version migration
├── adapters/
│   └── storage/
│       └── StorageAdapter.js     # Storage abstraction
├── utils/
│   ├── cellUtils.js              # Cell operations
│   ├── spreadsheetValidation.js
│   └── templateData.js
├── types/
│   ├── spreadsheet.d.ts
│   └── luckysheet.d.ts
├── __tests__/
│   ├── useSpreadsheet.saveMetadata.test.js
│   ├── SpreadsheetCRUD.test.js
│   └── SpreadsheetExport.test.js
├── index.js
└── README.md
```

**Dependencies**:
- @walsheetz/shared (ConfigLoader, Logger, EventBus)
- @walsheetz/blockchain-integration (BlockchainAdapter)
- @walsheetz/walrus (BrowserWalrusService)
- @walsheetz/transaction-management (TransactionTracker)

**Public API**:
```javascript
export { SpreadsheetEngine } from './engine/SpreadsheetEngine.js';
export { useSpreadsheet } from './hooks/useSpreadsheet.js';
export { useSpreadsheetAutosave } from './hooks/useSpreadsheetAutosave.js';
```

---

### 6. formula-engine/ - Custom Formulas
**Purpose**: WalSheetz-specific spreadsheet functions
**Extractability**: ⭐⭐⭐ (Sui-specific but extractable)

**Files** (4 files):
```
formula-engine/
├── functions/
│   ├── WalSheetzFunctions.js     # Main function registry
│   └── SuiFunctions.js           # Sui-specific functions
├── scheduling/
│   └── FormulaRefreshScheduler.js
├── __tests__/
│   └── luckysheetApi.methods.test.js
├── index.js
└── README.md
```

**Dependencies**:
- @walsheetz/shared (Logger, ConfigLoader)
- @walsheetz/blockchain-integration (BrowserSuiService, BrowserWalletManager)

**Public API**:
```javascript
export { WalSheetzFunctions } from './functions/WalSheetzFunctions.js';
export { getSuiBalance, getSuiGasPrice } from './functions/SuiFunctions.js';
export { FormulaRefreshScheduler } from './scheduling/FormulaRefreshScheduler.js';
```

---

### 7. import-export/ - Data Import/Export
**Purpose**: CSV/Excel import/export, blob parsing
**Extractability**: ⭐⭐⭐ (generally useful)

**Files** (4 files):
```
import-export/
├── services/
│   └── SpreadsheetImportExportService.js
├── utils/
│   └── BlobParser.js
├── __tests__/
│   ├── CSVExportRegression.test.js
│   └── CSVImportIntegration.test.js
├── index.js
└── README.md
```

**Dependencies**:
- @walsheetz/shared (Logger)

**Public API**:
```javascript
export { SpreadsheetImportExportService } from './services/SpreadsheetImportExportService.js';
export { BlobParser } from './utils/BlobParser.js';
```

---

### 8. testing/ - Test Utilities
**Purpose**: Mocks, test adapters, test utilities
**Extractability**: ⭐⭐⭐⭐ (very useful for other projects)

**Files** (2 files):
```
testing/
├── mocks/
│   └── mockWalletConnection.js
├── adapters/
│   └── TestModeAdapter.js
├── index.js
└── README.md
```

**Dependencies**:
- @walsheetz/shared (testMode)

**Public API**:
```javascript
export { mockWalletConnection } from './mocks/mockWalletConnection.js';
export { TestModeAdapter } from './adapters/TestModeAdapter.js';
```

---

### 9. src/walrus/ - Walrus Storage (Already Good!)
**Purpose**: Walrus decentralized storage client
**Extractability**: ⭐⭐⭐⭐⭐ (perfect standalone package)

**Status**: Already well-organized! Just needs:
- Enhanced README.md with extraction guide
- Public API documentation
- Dependency documentation

**Current structure** (18 files):
```
walrus/
├── client/                       # Connection management
├── config/                       # Configuration
├── health/                       # Health monitoring
├── retry/                        # Retry logic
├── transports/                   # HTTP/proxy transports
├── utils/                        # Utilities
├── BrowserWalrusService.js       # Main service
├── WalrusSdkClient.js            # SDK client
├── WalrusSdkClientLoader.js      # Dynamic loader
└── index.js
```

---

## Files Not Included in Modules (Review Needed)

**Services to categorize** (9 files):
- CollaborationService.js → Maybe spreadsheet-core?
- DeFiStateManager.js → blockchain-integration?
- ErrorRecoveryService.js → shared?
- FaucetService.js → blockchain-integration?
- GridSizeManager.js → spreadsheet-core?
- GrpcClient.js → blockchain-integration (duplicate of BrowserGrpcService?)
- ProgressiveEnhancementService.js → shared?
- WebSocketService.js → New real-time module? Or collaboration?

**Tests to move**:
- All tests in src/sdk/services/__tests__/ should move with their modules
- Tests currently in frontend/services/__tests__/ are duplicates

---

## Migration Strategy

### Week 1: Foundation
**Goal**: Create shared module + module structure

1. **Create module directories** with index.js + README.md templates
2. **Move shared utilities first** (foundation for everything)
3. **Update imports** in all files to use @walsheetz/shared
4. **Write shared module README**
5. **Validate** all tests pass

### Week 2: Core Modules
**Goal**: Move blockchain, transaction, data-integrity modules

1. **Move blockchain-integration** (most independent)
2. **Move transaction-management** (depends on blockchain)
3. **Move data-integrity** (depends on blockchain + walrus)
4. **Update all imports**
5. **Write READMEs** for each module
6. **Validate** tests pass

### Week 3: Application Modules
**Goal**: Move spreadsheet, formula, import-export

1. **Move formula-engine** (least dependencies)
2. **Move import-export**
3. **Move spreadsheet-core** (depends on almost everything)
4. **Move testing** utilities
5. **Update all imports**
6. **Write READMEs**
7. **Validate** tests pass

### Week 4: Cleanup & Documentation
**Goal**: Delete old files, write extraction guides

1. **Delete frontend/services/** (except luckysheet/)
2. **Delete frontend/services/__tests__/** (all duplicates)
3. **Update tsconfig.json** path aliases
4. **Write extraction guides** for each module
5. **Create ARCHITECTURE.md** documenting module boundaries
6. **Final validation**
7. **Capture final coverage** (should be >80%)

---

## Success Criteria

- [ ] All modules have clear boundaries and public APIs
- [ ] Each module has comprehensive README.md
- [ ] Extraction guide exists for SONAR/Tundra
- [ ] No circular dependencies between modules
- [ ] All tests pass (448+ passed)
- [ ] Coverage ≥80% (up from 4.28%)
- [ ] Build passes
- [ ] frontend/services deleted (except luckysheet)
- [ ] Manual smoke test passes

---

## README Template for Each Module

```markdown
# @walsheetz/[module-name]

> [One-line description]

## Purpose

[What this module does and why it exists]

## When to Extract

This module is ideal for:
- [ ] SONAR (digital asset management)
- [ ] Tundra (document collaboration)
- [ ] Other Sui blockchain projects
- [ ] Other Walrus storage projects

## Installation (when extracted)

\`\`\`bash
npm install @walsheetz/[module-name]
\`\`\`

## Dependencies

**Required**:
- @walsheetz/shared (ConfigLoader, Logger, etc.)
- [other internal dependencies]

**External**:
- @mysten/sui.js
- [other npm packages]

## Public API

\`\`\`javascript
import { Service, utility } from '@walsheetz/[module-name]';
\`\`\`

[Detailed API documentation]

## Usage Examples

[Code examples showing common use cases]

## Architecture

[Explain internal structure, key patterns]

## Testing

\`\`\`bash
bun test [module-name]
\`\`\`

## Extraction Guide

Step-by-step guide to extract this module:

1. Copy module directory
2. Install dependencies
3. Update import paths
4. Configure build
5. Run tests

## License

[License info]
```

---

## Notes

- **Coverage will climb** as we migrate actual usage (not just tests)
- **Keep luckysheet** in frontend/services (UI integration layer)
- **Walrus is already modular** - just enhance documentation
- **Start with shared** to establish foundation
- **Test after each module** to catch regressions early
