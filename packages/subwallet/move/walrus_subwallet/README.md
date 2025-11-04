# Walrus Sub-Wallet Move Contracts

Move smart contracts for on-chain sub-wallet policy enforcement and auditing.

## Overview

Move contracts deployed on Sui blockchain to enforce sub-wallet policies, including sponsor protection, balance requirements, and transaction sponsorship.

## Contracts

### wallet_policy.move
Core wallet policy enforcement.

```move
module walrus_subwallet::wallet_policy {
  /// Check if wallet is sponsor (wallet 0)
  public fun is_sponsor(wallet_id: u64): bool {
    wallet_id == 0
  }

  /// Check if wallet can be deleted
  public fun can_delete(wallet_id: u64, balance: u64): bool {
    !is_sponsor(wallet_id) && balance == 0
  }

  /// Enforce deletion policy
  public entry fun delete_wallet(
    wallet_id: u64,
    balance: u64
  ) {
    assert!(can_delete(wallet_id, balance), ECannotDelete);
    // Delete logic
  }
}
```

### sponsorship.move
Transaction sponsorship management.

```move
module walrus_subwallet::sponsorship {
  /// Create sponsored transaction
  public fun sponsor_transaction<T>(
    sponsor: &signer,
    worker: address,
    gas_budget: u64,
    tx: T
  ): SponsoredTransaction<T> {
    // Sponsorship logic
  }

  /// Verify sponsor is valid
  public fun verify_sponsor(sponsor: address): bool {
    // Verification logic
  }
}
```

### audit_log.move
On-chain audit logging.

```move
module walrus_subwallet::audit_log {
  /// Log wallet operation
  public entry fun log_operation(
    operation: vector<u8>,
    wallet_id: u64,
    amount: u64,
    timestamp: u64
  ) {
    // Create audit entry
  }

  /// Query audit log
  public fun get_operations(wallet_id: u64): vector<AuditEntry> {
    // Return audit history
  }
}
```

## Building

```bash
cd move/walrus_subwallet
sui move build
```

## Testing

```bash
sui move test
```

## Deployment

```bash
# Testnet
sui client publish --gas-budget 100000000

# Mainnet
sui client publish --gas-budget 100000000 --network mainnet
```

## Policy Rules

### Wallet 0 Protection
- `is_sponsor()` returns true for wallet 0
- `can_delete()` always returns false for wallet 0
- Contract-level enforcement

### Balance Requirements
- `can_delete()` checks balance == 0
- Prevents accidental fund loss
- On-chain validation

### Sponsorship
- Sponsor pays all gas fees
- Worker wallets use sponsored transactions
- Automatic sponsorship routing

## Related Modules

- [../../src/sub-wallet-walrus/contracts/](../../src/sub-wallet-walrus/contracts/) - Contract wrappers
- [../../src/sub-wallet-walrus/core/](../../src/sub-wallet-walrus/core/) - Uses contracts

## Notes

- Contracts are immutable after deployment
- Provides on-chain guarantees
- Auditable transaction history
- Gas-efficient implementations
