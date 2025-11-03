# @walrus/subwallet-sdk

> Unified TypeScript toolkit for orchestrating Walrus/Sui sub-wallet fleets — usable as a library, CLI, or plugin platform.

## Table of contents

- [System overview](#system-overview)
- [Architecture map](#architecture-map)
- [Installation](#installation)
- [Configuration](#configuration)
- [Quick start (Node/CLI)](#quick-start-nodecli)
- [Integrating in web applications](#integrating-in-web-applications)
- [Command-line interface](#command-line-interface)
- [Programmatic API reference](#programmatic-api-reference)
- [Storage adapters](#storage-adapters)
- [Move policy & on-chain integration](#move-policy--on-chain-integration)
- [CLI plugins & extension points](#cli-plugins--extension-points)
- [Examples](#examples)
- [Development & testing](#development--testing)
- [Troubleshooting](#troubleshooting)

## System overview

The SDK targets three core workflows you run into when managing Walrus/Sui fleets:

1. **Wallet lifecycle** – batch creation, persistence, inspection, and deletion of sub-wallets.
2. **Funding & sweeping** – concurrent transfers into/out of hundreds of wallets, optionally enforced by an on-chain Move policy.
3. **Sponsored execution** – gasless operations where a sponsor pays transaction fees on behalf of wallets.

All of those are available from both a programmatic API (`SubWalletOrchestrator`) and an oclif-powered CLI (`walrus-wallet`). Internally they share the same orchestration engine so that automation scripts, web dashboards, and terminal tooling behave identically.

## Architecture map

```
┌──────────────────────────────┐
│ Web / Server / Scripts (TS)  │    CLI commands (`walrus-wallet …`)
└───────────────┬──────────────┘    ┌──────────────────────────────┐
                │                   │ BaseCommand (oclif runtime)   │
                │                   └──────────────┬───────────────┘
                ▼                                  ▼
         SubWalletOrchestrator  ◄────────────── shared business logic
                │
     ┌──────────┴───────────┐
     │                      │
StorageAdapter         SponsoredTransactions
(Node FS, memory,      (gasless workflows,
 custom adapters)       Move helpers)
     │                      │
     ▼                      ▼
File system / DB /    Sui RPC + Move policy
browser storage
```

Highlights:

- **Storage adapters** define where wallet metadata & key material live (filesystem YAML, memory, localStorage, custom DB, etc.).
- **Sui CLI auto-discovery** (for the CLI) imports the active RPC endpoint and sponsor key from `~/.sui/sui_config` so most flows work without extra flags.
- **Move orchestration** uses the deployed `walrus_subwallet` package to enforce limits, register sponsors, and emit audit events.
- **Plugin surface** lets internal teams extend the CLI without patching the core.

## Installation

### Library usage

```bash
npm install @walrus/subwallet-sdk
# pnpm add @walrus/subwallet-sdk
# yarn add @walrus/subwallet-sdk
# bun add @walrus/subwallet-sdk
```

### CLI only

```bash
npm install -g @walrus/subwallet-sdk
walrus-wallet --help
```

Or invoke without a global install:

```bash
npx @walrus/subwallet-sdk wallets list
```

## Configuration

The library and CLI accept the same settings. Precedence: **flags** → **environment variables** → **config file** → **defaults**.

| Location | Keys | Notes |
| -------- | ---- | ----- |
| Config file (`~/.config/walrus-wallet/config.json`) | `rpcUrl`, `walletsDir`, `network`, `defaultSponsorKey`, `useSuiCliKeystore` | Generated/managed by the CLI |
| Environment | `SUI_RPC_URL`, `WALLETS_DIR`, `SUI_NETWORK`, `SPONSOR_PRIVATE_KEY_B64` | Override the config file; ideal for CI |
| CLI flags | `--rpc-url`, `--wallets-dir`, `--sponsor-key`, `--config-path`, … | Highest precedence per command |

Additional behavior:

- When `useSuiCliKeystore` is enabled (default) and no explicit key is set, the CLI inspects `client.yaml` + `sui.keystore` to auto-load the active sponsor key and RPC URL.
- `NodeFsStorageAdapter` writes the same YAML structure as the original Walrus shell scripts (`sui_client_<n>.yaml`), enabling easy migration.
- Browser or service environments can supply their own `StorageAdapter` implementation to keep key material wherever it belongs.

## Quick start (Node/CLI)

```typescript
import {
  SubWalletOrchestrator,
  NodeFsStorageAdapter,
} from '@walrus/subwallet-sdk';
import { decodeSuiSecret } from '@walrus/subwallet-sdk/cli/utils/suiCliKeys.js';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';

const orchestrator = new SubWalletOrchestrator({
  rpcUrl: process.env.SUI_RPC_URL ?? 'https://fullnode.testnet.sui.io:443',
  storage: new NodeFsStorageAdapter(process.env.WALLETS_DIR ?? './wallets'),
  concurrency: 8,
  move: process.env.WALRUS_PACKAGE_ID
    ? { packageId: process.env.WALRUS_PACKAGE_ID, policyId: process.env.WALRUS_POLICY_ID }
    : undefined,
});

// Provision wallets (IDs are sequential by default)
await orchestrator.createWallets(16);

// Fund each wallet with 0.05 SUI using the active sponsor key
const sponsorSecret = decodeSuiSecret(process.env.SPONSOR_PRIVATE_KEY_B64!);
const sponsor = Ed25519Keypair.fromSecretKey(sponsorSecret);
await orchestrator.fundWallets(sponsor, { amount: orchestrator.parseSui('0.05') });

// Inspect holdings
const { totalSui, count } = await orchestrator.getAggregateBalance();
console.log(`Holding ${orchestrator.formatSui(totalSui)} SUI across ${count} wallets`);

// Sweep residual funds back to the sponsor address
await orchestrator.sweepToSponsor({ gasReserve: orchestrator.parseSui('0.01') });
```

## Integrating in web applications

Everything in `src/` is ESM-compatible and works in modern bundlers. For browsers, choose a non-Node storage adapter (`MemoryStorageAdapter` ships with the SDK).

```tsx
import { useEffect, useMemo, useState } from 'react';
import {
  SubWalletOrchestrator,
  MemoryStorageAdapter,
  type WalletMetadata,
} from '@walrus/subwallet-sdk';

export function WalletDashboard() {
  const [wallets, setWallets] = useState<WalletMetadata[]>([]);
  const [loading, setLoading] = useState(false);

  const storage = useMemo(() => new MemoryStorageAdapter(), []);
  const orchestrator = useMemo(() => {
    return new SubWalletOrchestrator({
      rpcUrl: process.env.NEXT_PUBLIC_SUI_RPC ?? 'https://fullnode.testnet.sui.io:443',
      storage,
      concurrency: 4,
    });
  }, [storage]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const existing = await orchestrator.loadWallets();
      setWallets(existing.length ? existing : await orchestrator.createWallets(3));
      setLoading(false);
    })();
  }, [orchestrator]);

  return (
    <section>
      <h2>Sub-wallets ({wallets.length})</h2>
      {loading ? <p>Loading…</p> : null}
      <ul>
        {wallets.map((wallet) => (
          <li key={wallet.id}>
            <code>{wallet.id}</code> – {wallet.address}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

For production dashboards, replace `MemoryStorageAdapter` with a custom adapter that proxies to your backend (see [Storage adapters](#storage-adapters)).

## Command-line interface

The `walrus-wallet` CLI wraps the orchestrator with human-friendly output and JSON mode for automation.

```bash
# Inspect current defaults (auto-filled from Sui CLI when available)
walrus-wallet config list

# Create and fund wallets
walrus-wallet wallets create 8
walrus-wallet fund wallets 0.25

# Fund via Move policy with policy/sponsor caps
walrus-wallet fund via-move 0.1 \
  --package-id 0xPACKAGE \
  --sponsor-cap-id 0xCAP \
  --coin-object-id 0xCOIN \
  --policy-id 0xPOLICY

# Sweep funds back to the sponsor address
walrus-wallet sweep to-sponsor --keep-amount 0.02
```

Every command accepts `--json` for machine-readable output. Check [docs/CLI.md](./docs/CLI.md) for the full surface.

## Programmatic API reference

### SubWalletOrchestrator

Main facade for all operations.

#### Constructor

```typescript
new SubWalletOrchestrator(config: OrchestratorConfig)
```

**Config options:**
- `rpcUrl: string` – Sui RPC endpoint
- `storage: StorageAdapter` – Storage adapter for wallet metadata
- `concurrency?: number` – Max parallel operations (default: 8)
- `sponsor?: Ed25519Keypair` – Optional sponsor keypair for gasless operations
- `move?: { packageId: string; policyId?: string }` – Optional Move integration

#### Wallet Management

```typescript
// Create wallets
createWallet(id?: string): Promise<WalletMetadata>
createWallets(count: number): Promise<WalletMetadata[]>

// Load/save
loadWallets(): Promise<WalletMetadata[]>
saveWallets(wallets: WalletMetadata[]): Promise<void>
getWallet(id: string): Promise<WalletMetadata | null>
getWalletKeypair(id: string): Promise<Ed25519Keypair | null>
```

#### Balance Operations

```typescript
// Check balances
getBalance(address: string): Promise<{ sui: bigint; wal: bigint }>
checkAllBalances(): Promise<WalletBalance[]>
getAggregateBalance(): Promise<{ totalSui: bigint; totalWal: bigint; count: number }>
```

#### Funding

```typescript
// Fund wallets
fundWallets(sponsorKeypair: Ed25519Keypair, options: FundOptions): Promise<TransferResult[]>
fundWalletsSponsored(options: { sponsor?: Ed25519Keypair; amount: bigint; concurrency?: number }): Promise<TransferResult[]>
```

#### Sweeping

```typescript
// Sweep funds back
sweepWallets(options: SweepOptions): Promise<TransferResult[]>
sweepToSponsor(options?: { includeWal?: boolean; includeSui?: boolean; gasReserve?: bigint; concurrency?: number }): Promise<TransferResult[]>
```

#### Sponsored Transactions

```typescript
// Execute custom sponsored transaction
executeSponsoredTransaction(options: {
  sender: Ed25519Keypair;
  sponsor?: Ed25519Keypair;
  buildTransaction: (tx: import('@mysten/sui.js/transactions').TransactionBlock) => void;
  gasBudget?: bigint;
}): Promise<{ digest: string }>
```

#### Utilities

```typescript
// Format/parse
formatSui(mist: bigint): string;  // MIST -> SUI (e.g., "0.050000")
formatWal(units: bigint): string; // units -> WAL
parseSui(sui: string): bigint;    // SUI -> MIST
parseWal(wal: string): bigint;    // WAL -> units
```

## Storage adapters

### NodeFsStorageAdapter

Reads/writes wallet YAML files compatible with the original shell scripts.

```typescript
import { NodeFsStorageAdapter } from '@walrus/subwallet-sdk';

const storage = new NodeFsStorageAdapter('./wallets');
```

**YAML format:**

```yaml
active_address: "0x..."
quickwalrus_secret_b64: "base64-encoded-keypair"
```

### MemoryStorageAdapter

In-memory storage for browser or testing.

```typescript
import { MemoryStorageAdapter } from '@walrus/subwallet-sdk';

const storage = new MemoryStorageAdapter();
// Optional: pass initial wallets
const storage = new MemoryStorageAdapter([
  { id: '0', address: '0x...' },
]);
```

### Custom adapters

Implement the `StorageAdapter` interface:

```typescript
interface StorageAdapter {
  loadWallets(): Promise<WalletMetadata[]>;
  saveWallets(wallets: WalletMetadata[]): Promise<void>;
  loadKeypair(walletId: string): Promise<Ed25519Keypair | null>;
  saveKeypair(walletId: string, keypair: Ed25519Keypair): Promise<void>;
}
```

## Move policy & on-chain integration

Move-aware flows enforce policy-level constraints (e.g., sponsor allowances) by calling into the deployed `walrus_subwallet` package.

```typescript
const result = await orchestrator.fundWalletsViaMove(
  {
    policyId: '0xPOLICY',
    sponsorCapId: '0xCAP',
    coinObjectId: '0xCOIN',
    recipients: wallets.map((w) => w.address),
    amounts: wallets.map(() => orchestrator.parseSui('0.10')),
    gasBudget: orchestrator.parseSui('1'),
  },
  sponsor
);

console.log('Move PTB digest:', result.digest);
```

Provide `move.packageId` (and optionally `policyId`) when constructing the orchestrator to cache configuration across calls. The CLI exposes the same parameters via `walrus-wallet fund via-move` flags.

## CLI plugins & extension points

- **BaseCommand** centralizes config loading, JSON formatting, and error handling. Plugins can extend it to inherit the same ergonomics.
- Install plugins with `walrus-wallet plugins install <pkg>` — the CLI already bundles `@oclif/plugin-plugins`.
- Minimal plugin command:

```typescript
import { BaseCommand } from '@walrus/subwallet-sdk/cli';

export default class VerifyInventory extends BaseCommand {
  static description = 'Compare wallet inventory with an internal registry';

  async run(): Promise<void> {
    const orchestrator = this.getOrchestrator();
    const wallets = await orchestrator.loadWallets();
    // ...custom logic...
    this.output({ count: wallets.length });
  }
}
```

See [docs/PLUGIN_DEVELOPMENT.md](./docs/PLUGIN_DEVELOPMENT.md) and the sample plugin in `examples/plugin-custom-api/` for a complete walkthrough.

## Examples

A handful of end-to-end samples live under `examples/`:

- [`examples/node-cli.ts`](./examples/node-cli.ts) – compose the orchestrator in a custom script
- [`examples/custom-storage.ts`](./examples/custom-storage.ts) – implement a bespoke storage adapter
- [`examples/browser-usage.tsx`](./examples/browser-usage.tsx) – React component wiring via `MemoryStorageAdapter`
- [`examples/move-fund-wallets.ts`](./examples/move-fund-wallets.ts) – orchestrate Move policy funding

## Development & testing

```bash
# Install dependencies (root)
npm install

# Type-check & build (produces dist/)
npm run build

# Run tests (Vitest)
npm run test

# Lint sources
npm run lint

# Generate CLI manifest (done automatically during build)
npm run prepack
```

Tips:

- The CLI expects Node ≥ 18.17 for ESM + top-level `await`.
- Use `npm run cli:dev` for a watch-mode development loop while testing CLI commands.
- `npm run cli:ptb` executes the Move PTB harness in `scripts/run_move_ptb.ts` against local fixtures.

## Troubleshooting

| Symptom | Likely cause | Resolution |
| ------- | ------------ | ---------- |
| `Move orchestrator not configured` when running `fund via-move` | `--package-id` (or `move.packageId`) missing | Supply the flag or set the value in config before invoking the command |
| `Sponsor key is required` despite having Sui CLI installed | `client.yaml` / `sui.keystore` not found or active address missing | Export `SPONSOR_PRIVATE_KEY_B64`, set `SUI_CONFIG_DIR`, or disable auto keystore (`walrus-wallet config set useSuiCliKeystore false`) |
| Spinner artifacts appear in JSON output | Command logged non-JSON text while `--json` flag was enabled | Avoid `this.log` in plugins when `this.jsonOutput` is true; rely on `this.output` |
| Browser build errors referencing `fs/promises` | Using `NodeFsStorageAdapter` in a browser bundle | Switch to `MemoryStorageAdapter` or implement a browser-safe adapter |

If issues persist, capture command output with `--json` (where available) and file an internal ticket with the reproduction steps.

