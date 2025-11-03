# Dreamlit Walrus SDK

A collection of SDKs for building on Walrus and Sui blockchain.

## Packages

### [@walrus/subwallet-sdk](./sub-wallet-sdk)

A comprehensive SDK for managing sub-wallets on Sui/Walrus with CLI support.

**Features:**
- Sub-wallet creation and management
- Sponsored transactions (gasless operations)
- Move contract integration
- CLI with plugin system
- Automatic Sui CLI integration
- Browser and Node.js support

**Installation:**
```bash
npm install @walrus/subwallet-sdk
```

**Quick Start:**
```typescript
import { SubWalletOrchestrator, NodeFsStorageAdapter } from '@walrus/subwallet-sdk';

const storage = new NodeFsStorageAdapter('./wallets');
const orchestrator = new SubWalletOrchestrator({
  rpcUrl: 'https://fullnode.testnet.sui.io:443',
  storage,
});

// Create wallets
const wallets = await orchestrator.createWallets(10);

// Fund wallets
await orchestrator.fundWallets(sponsorKeypair, { amount: BigInt(1_000_000_000) });
```

**CLI Usage:**
```bash
# Install globally
npm install -g @walrus/subwallet-sdk

# Use CLI
walrus-wallet wallets create 5
walrus-wallet fund wallets 1.0 --sponsor-key <KEY>
walrus-wallet balance check
```

See the [sub-wallet-sdk documentation](./sub-wallet-sdk/README.md) for more details.

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to the main repository.

## License

MIT
