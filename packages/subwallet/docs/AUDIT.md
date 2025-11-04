## Legacy Sub-Wallet Orchestration Audit

### Source Material
- `scripts/sponsor_batch.js` (see `old.md` → `scripts/sponsor_batch.js`)
- `walrus-wallet-manager.sh` and `wallet-batch-ops.sh` (see `old.md` → sections 40 and 241)
- `docs/SPONSORED_TRANSACTIONS.md`, `docs/SPONSOR_USAGE.md`

### Key Observations
1. **No Move modules for orchestration**
   - Sponsorship logic is entirely in TypeScript using `@mysten/sui.js` PTBs.
   - Sub-wallet management is Bash + Sui CLI; no published Move entry points.

2. **PTB and CLI workflow**
   - `sponsor_batch.js` builds a PTB that transfers SUI from sponsor to sub-wallets.
   - Dual signature flow: sender (sub-wallet) and sponsor sign; executed via RPC.
   - CLI scripts handle creation, funding, sweeping via shell loops calling `sui client`.

3. **Sponsored transactions**
   - Documentation describes sponsor account providing gas; no on-chain allowlist or limit management.
   - Gas budgets hardcoded in scripts (1_000_000 mist).

4. **Walrus integration**
   - `walrus_32_parallel.sh` orchestrates uploads via command-line; uses wallet files but no Move components.
   - Funding thresholds and inventory maintained in JSON/YAML.

### Requirements Gap
- Need Move entry points to:
  - Register sponsor permissions/limits.
  - Batch fund/sweep sub-wallets atomically.
  - Emit Walrus-specific events for coordination.
- SDK should build PTBs targeting new Move functions while preserving CLI wrapper workflows for dev/test.
