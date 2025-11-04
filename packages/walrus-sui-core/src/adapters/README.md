# Adapters Module

Adapter implementations for blockchain integration in @dreamlit/walrus-sui-core.

## Overview

This module contains adapter pattern implementations that bridge different blockchain services and provide standardized interfaces for blockchain operations.

## Structure

Adapters provide abstraction layers for:
- Blockchain service interactions
- Storage operations
- Transaction building
- Event handling

## Usage

Adapters are typically used internally by higher-level services. They provide consistent interfaces regardless of the underlying implementation (RPC, GraphQL, gRPC).

```javascript
// Example: Adapters abstract away implementation details
import { BlockchainAdapter } from '@dreamlit/walrus-sui-core/adapters';

const adapter = new BlockchainAdapter(config);
const result = await adapter.executeOperation(params);
```

## Related Modules

- [../blockchain/](../blockchain/) - Uses adapters for service abstraction
- [../blockchain-integration/](../blockchain-integration/) - Adapter implementations

## Notes

- Adapters follow the adapter pattern for clean architecture
- Provide swappable implementations (RPC ↔ GraphQL ↔ gRPC)
- Used internally by blockchain services
