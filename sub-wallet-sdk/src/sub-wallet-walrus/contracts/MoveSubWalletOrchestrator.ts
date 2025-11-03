import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiClient, type SuiTransactionBlockResponse } from '@mysten/sui.js/client';
import type { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';

export interface MoveSubWalletConfig {
  client: SuiClient;
  packageId: string;
  policyId?: string;
}

export interface FundWalletsParams {
  policyId?: string;
  sponsorCapId: string;
  coinObjectId: string;
  recipients: string[];
  amounts: bigint[] | number[];
  gasBudget?: bigint | number;
}

export interface RegisterSponsorParams {
  policyId?: string;
  adminCapId: string;
  sponsorAddress: string;
  allowance: bigint | number;
  perTxLimit: bigint | number;
  gasBudget?: bigint | number;
}

export interface SetAllowanceParams {
  policyId?: string;
  adminCapId: string;
  sponsorCapId: string;
  newAllowance: bigint | number;
  newPerTxLimit: bigint | number;
  gasBudget?: bigint | number;
}

export interface InitPolicyParams {
  minSuiPerWallet: bigint | number;
  minWalrusPerWallet: bigint | number;
  gasBudget?: bigint | number;
}

/**
 * Move function name constants
 * These MUST match the published Move contract exactly.
 * Centralized here to avoid string duplication and make updates easier.
 */
export const MOVE_FUNCTIONS = {
  CREATE_POLICY: 'create_policy', // NOT 'init'
  REGISTER_SPONSOR: 'register_sponsor',
  SET_SPONSOR_ALLOWANCE: 'set_sponsor_allowance',
  FUND_WALLETS_SUI: 'fund_wallets_sui',
} as const;

/**
 * MoveSubWalletOrchestrator - builds and executes transactions for Move smart contracts
 *
 * IMPORTANT: Move Function Targets
 * This class builds PTBs that call specific Move functions in the WalrusSubwallet package.
 * The function names MUST match the published Move contract exactly.
 *
 * Function names are centralized in MOVE_FUNCTIONS constant above.
 * These targets are validated by regression tests in:
 * src/__tests__/MoveSubWalletOrchestrator.test.ts
 *
 * If Move function names change, update BOTH the MOVE_FUNCTIONS constant AND the Move contract.
 */
export class MoveSubWalletOrchestrator {
  private readonly client: SuiClient;
  private readonly packageId: string;
  private readonly defaultPolicyId?: string;

  constructor(config: MoveSubWalletConfig) {
    this.client = config.client;
    this.packageId = config.packageId;
    this.defaultPolicyId = config.policyId;
  }

  buildInitPolicyTransaction(params: InitPolicyParams): TransactionBlock {
    const tx = new TransactionBlock();
    tx.moveCall({
      target: `${this.packageId}::policy::${MOVE_FUNCTIONS.CREATE_POLICY}`,
      arguments: [
        tx.pure.u64(this.toU64(params.minSuiPerWallet)),
        tx.pure.u64(this.toU64(params.minWalrusPerWallet)),
      ],
    });
    if (params.gasBudget) {
      tx.setGasBudget(this.toU64(params.gasBudget));
    }
    return tx;
  }

  buildRegisterSponsorTransaction(params: RegisterSponsorParams): TransactionBlock {
    const policyId = this.requirePolicyId(params.policyId);
    const tx = new TransactionBlock();
    tx.moveCall({
      target: `${this.packageId}::policy::${MOVE_FUNCTIONS.REGISTER_SPONSOR}`,
      arguments: [
        tx.object(policyId),
        tx.object(params.adminCapId),
        tx.pure.address(params.sponsorAddress),
        tx.pure.u64(this.toU64(params.allowance)),
        tx.pure.u64(this.toU64(params.perTxLimit)),
      ],
    });
    if (params.gasBudget) {
      tx.setGasBudget(this.toU64(params.gasBudget));
    }
    return tx;
  }

  buildSetAllowanceTransaction(params: SetAllowanceParams): TransactionBlock {
    const policyId = this.requirePolicyId(params.policyId);
    const tx = new TransactionBlock();
    tx.moveCall({
      target: `${this.packageId}::policy::${MOVE_FUNCTIONS.SET_SPONSOR_ALLOWANCE}`,
      arguments: [
        tx.object(policyId),
        tx.object(params.adminCapId),
        tx.object(params.sponsorCapId),
        tx.pure.u64(this.toU64(params.newAllowance)),
        tx.pure.u64(this.toU64(params.newPerTxLimit)),
      ],
    });
    if (params.gasBudget) {
      tx.setGasBudget(this.toU64(params.gasBudget));
    }
    return tx;
  }

  buildFundWalletsTransaction(params: FundWalletsParams): TransactionBlock {
    const policyId = this.requirePolicyId(params.policyId);
    if (params.recipients.length === 0) {
      throw new Error('recipients cannot be empty');
    }
    if (params.recipients.length !== params.amounts.length) {
      throw new Error('recipients and amounts length mismatch');
    }

    const tx = new TransactionBlock();
    tx.moveCall({
      target: `${this.packageId}::policy::${MOVE_FUNCTIONS.FUND_WALLETS_SUI}`,
      arguments: [
        tx.object(policyId),
        tx.object(params.sponsorCapId),
        tx.object(params.coinObjectId),
        tx.pure(params.recipients, 'vector<address>'),
        tx.pure(params.amounts.map((value) => this.toU64(value)), 'vector<u64>'),
      ],
    });

    if (params.gasBudget) {
      tx.setGasBudget(this.toU64(params.gasBudget));
    }
    return tx;
  }

  async executeTransaction(tx: TransactionBlock, signer: Ed25519Keypair): Promise<SuiTransactionBlockResponse> {
    return this.client.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      signer,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });
  }

  async registerSponsor(params: RegisterSponsorParams, signer: Ed25519Keypair): Promise<SuiTransactionBlockResponse> {
    const tx = this.buildRegisterSponsorTransaction(params);
    return this.executeTransaction(tx, signer);
  }

  async setSponsorAllowance(params: SetAllowanceParams, signer: Ed25519Keypair): Promise<SuiTransactionBlockResponse> {
    const tx = this.buildSetAllowanceTransaction(params);
    return this.executeTransaction(tx, signer);
  }

  async fundWallets(params: FundWalletsParams, signer: Ed25519Keypair): Promise<SuiTransactionBlockResponse> {
    const tx = this.buildFundWalletsTransaction(params);
    return this.executeTransaction(tx, signer);
  }

  private requirePolicyId(policyId?: string): string {
    if (policyId) return policyId;
    if (this.defaultPolicyId) return this.defaultPolicyId;
    throw new Error('policyId is required');
  }

  private toU64(value: bigint | number): bigint {
    if (typeof value === 'number') {
      return BigInt(value);
    }
    return value;
  }
}
