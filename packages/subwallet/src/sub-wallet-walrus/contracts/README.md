# Contracts Module

Move smart contract definitions for on-chain wallet policy enforcement.

## Overview

Move contracts for enforcing sub-wallet policies on-chain, including sponsor protection and transaction auditing.

## Contracts

### WalletPolicy
Enforces wallet protection rules on-chain.

```move
module wallet_policy {
  // Wallet 0 cannot be deleted
  public fun is_sponsor(wallet_id: u64): bool;

  // Check if wallet can be deleted
  public fun can_delete(wallet_id: u64, balance: u64): bool;
}
```

### SponsorshipManager
Manages sponsored transactions.

```move
module sponsorship {
  // Create sponsored transaction
  public fun sponsor_transaction(
    sponsor: &signer,
    worker: address,
    gas_budget: u64
  );

  // Verify sponsor
  public fun verify_sponsor(sponsor: address): bool;
}
```

## Usage

Contracts are deployed and used by the SDK:

```typescript
import { WalletPolicyContract } from '@walrus/subwallet-sdk/contracts';

const policy = new WalletPolicyContract(packageId);

// Check if wallet can be deleted
const canDelete = await policy.canDelete(walletId, balance);

// Verify sponsor
const isValidSponsor = await policy.verifySponsor(address);
```

## Policy Rules

1. **Wallet 0 Protection**
   - Cannot be deleted via smart contract
   - Must remain as sponsor

2. **Balance Requirements**
   - Worker wallets must have 0 balance to delete
   - Enforced on-chain

3. **Sponsorship Rules**
   - Only sponsor can pay gas
   - Automatic sponsorship for worker transactions

## Related Modules

- [../core/](../core/) - Uses contracts
- [../../../move/](../../../move/) - Move source files

## Notes

- Contracts provide on-chain enforcement
- Policies cannot be bypassed
- Deployed on Sui testnet/mainnet
- Auditable transaction history
