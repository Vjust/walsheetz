# Dreamlit Walrus SDK

A collection of enterprise-grade SDKs for building on Walrus and Sui blockchain.

## Packages

### [@walrus/subwallet-sdk](./sub-wallet-sdk)

A comprehensive SDK for managing sub-wallet fleets on Sui/Walrus with automatic sponsor bootstrapping and safety features.

**🎯 Key Features:**
- **Automatic Sponsor Wallet Bootstrapping** - Wallet 0 auto-synced with Sui CLI
- **Protected Sponsor Wallet** - Wallet 0 cannot be deleted, always funded
- **Sponsored Transactions** - Gasless operations for all worker wallets
- **Move Contract Integration** - On-chain policy enforcement and auditing
- **CLI with Plugin System** - Extend functionality with custom commands
- **Intelligent Configuration** - Auto-loads from Sui CLI with override support
- **Browser & Node.js** - Works everywhere with pluggable storage adapters

**🛡️ Safety Architecture:**
```
┌─────────────────────────────────────────┐
│         Wallet Protection Layer         │
├─────────────────────────────────────────┤
│  Wallet 0 (Sponsor)                     │
│  ✓ Synced with Sui CLI active address  │
│  ✓ Protected from deletion             │
│  ✓ Can hold funds                       │
│  ✓ Pays gas for all operations         │
├─────────────────────────────────────────┤
│  Wallets 1-N (Workers)                  │
│  ✓ Deletable only when balance = 0     │
│  ✓ Use sponsored transactions           │
│  ✓ Auto-sweep before bulk clear         │
└─────────────────────────────────────────┘
```

**Installation:**
```bash
npm install @walrus/subwallet-sdk
# or install globally for CLI
npm install -g @walrus/subwallet-sdk
```

**Quick Start:**
```typescript
import { SubWalletOrchestrator, NodeFsStorageAdapter } from '@walrus/subwallet-sdk';

const storage = new NodeFsStorageAdapter('./wallets');
const orchestrator = new SubWalletOrchestrator({
  rpcUrl: 'https://fullnode.testnet.sui.io:443',
  storage,
});

// Wallet 0 auto-created from Sui CLI sponsor
// Create 10 worker wallets
const wallets = await orchestrator.createWallets(10);

// Fund all wallets (sponsor pays gas)
await orchestrator.fundWallets(sponsorKeypair, {
  amount: BigInt(100_000_000) // 0.1 SUI each
});

// Sweep funds back to sponsor when done
await orchestrator.sweepToSponsor();
```

**CLI Workflow:**
```bash
# Install globally
npm install -g @walrus/subwallet-sdk

# Wallet 0 auto-created from Sui CLI on first use
walrus-wallet wallets create 5

# Fund wallets (sponsor pays gas)
walrus-wallet fund wallets 0.1 --sponsor-key <KEY>

# Check balances
walrus-wallet balance check

# Clean up (auto-sweep funds, delete wallets 1-5, keep wallet 0)
walrus-wallet wallets clear --sweep
```

**Protected Operations:**
```bash
# ❌ Cannot delete wallet 0 (sponsor)
walrus-wallet wallets remove 0
# Error: Cannot delete wallet 0 (sponsor wallet). This wallet is protected.

# ❌ Cannot delete wallets with funds
walrus-wallet wallets remove 3
# Error: Wallet '3' has funds (0.500000 SUI). Sweep funds first.

# ✅ Sweep then delete
walrus-wallet sweep to-sponsor
walrus-wallet wallets remove 3
```

See the [sub-wallet-sdk documentation](./sub-wallet-sdk/README.md) for complete API reference and advanced usage.

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to the main repository.

## License

MIT
