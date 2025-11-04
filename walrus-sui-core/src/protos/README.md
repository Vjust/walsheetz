# Protos Module

Protocol buffer definitions for Sui gRPC services.

## Overview

This module contains `.proto` files defining the gRPC service interfaces for Sui blockchain operations. These are used by the gRPC services for high-performance blockchain interactions.

## Structure

```
protos/
└── sui/
    └── rpc/
        └── v2beta2/
            ├── common.proto
            ├── ledger_service.proto
            ├── live_data_service.proto
            ├── subscription_service.proto
            └── transaction_execution_service.proto
```

## Protocol Buffers

### common.proto
Common message types and enums shared across services.

### ledger_service.proto
Ledger query operations (objects, transactions, checkpoints).

### live_data_service.proto
Real-time data streaming (events, transaction status).

### subscription_service.proto
Event subscription and filtering.

### transaction_execution_service.proto
Transaction submission and execution.

## Usage

These proto files are compiled during the build process and used by gRPC services:

```javascript
import { suiGrpcService } from '@dreamlit/walrus-sui-core/blockchain';

// gRPC services use compiled protos internally
const stream = await suiGrpcService.subscribeToEvents(filter);
```

## Build Process

Proto files are automatically copied to `dist/protos/` during build:

```bash
bun run build
# Executes: tsup && npm run copy-protos
```

## Dependencies

- `protobufjs` - Protocol buffer runtime
- Sui gRPC service definitions

## Related Modules

- [../blockchain/](../blockchain/) - Uses compiled protos
- gRPC services depend on these definitions

## Notes

- Proto files define the gRPC API contract
- Compiled during build process
- Required for gRPC high-performance operations
- Based on Sui RPC v2beta2 specification
