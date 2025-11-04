/**
 * SponsoredTransactions - handle dual-signature sponsored transactions
 * Ports logic from scripts/sponsor_batch.js
 */

import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import type { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import pLimit from 'p-limit';
import type { TransferResult } from '../../types.js';

export class SponsoredTransactions {
  private client: SuiClient;

  constructor(client: SuiClient) {
    this.client = client;
  }

  /**
   * Create a sponsored transfer of SUI
   * The sender signs the transaction, sponsor provides gas and signs as well
   */
  async sponsorTransferSui(options: {
    sender: Ed25519Keypair;
    sponsor: Ed25519Keypair;
    to: string;
    amount: bigint;
    gasBudget?: bigint;
  }): Promise<{ digest: string }> {
    const { sender, sponsor, to, amount, gasBudget = BigInt(10_000_000) } = options;

    // Validate inputs
    if (amount <= BigInt(0)) {
      throw new Error(`Invalid amount: ${amount}. Amount must be positive.`);
    }
    if (!to || to.length === 0) {
      throw new Error('Invalid recipient address: address cannot be empty');
    }

    const tx = new TransactionBlock();
    tx.setSender(sender.getPublicKey().toSuiAddress());
    tx.setGasBudget(gasBudget);

    // Transfer SUI
    tx.transferObjects([tx.splitCoins(tx.gas, [amount])[0]], to);

    // Sign with sender
    const senderSig = await tx.sign({ client: this.client, signer: sender });

    // Sign with sponsor
    const sponsorSig = await tx.sign({ client: this.client, signer: sponsor });

    // Execute with both signatures
    const result = await this.client.executeTransactionBlock({
      transactionBlock: senderSig.bytes,
      signature: [senderSig.signature, sponsorSig.signature],
      options: {
        showEffects: true,
      },
    });

    return { digest: result.digest };
  }

  /**
   * Batch sponsor transfers to multiple recipients
   * Useful for funding many sub-wallets without requiring each to have gas
   */
  async batchSponsorTransfers(options: {
    sponsor: Ed25519Keypair;
    recipients: Array<{ sender: Ed25519Keypair; to: string; amount: bigint }>;
    concurrency?: number;
  }): Promise<TransferResult[]> {
    const { sponsor, recipients, concurrency = 5 } = options;
    const limit = pLimit(concurrency);
    const results: TransferResult[] = [];

    const tasks = recipients.map((recipient, idx) =>
      limit(async () => {
        try {
          const res = await this.sponsorTransferSui({
            sender: recipient.sender,
            sponsor,
            to: recipient.to,
            amount: recipient.amount,
          });

          return {
            walletId: String(idx),
            to: recipient.to,
            digest: res.digest,
          };
        } catch (err) {
          return {
            walletId: String(idx),
            to: recipient.to,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })
    );

    const txResults = await Promise.all(tasks);
    results.push(...txResults);

    return results;
  }

  /**
   * Execute a custom sponsored transaction
   * Allows building arbitrary transactions with sponsor paying gas
   */
  async executeSponsoredTransaction(options: {
    sender: Ed25519Keypair;
    sponsor: Ed25519Keypair;
    buildTransaction: (tx: TransactionBlock) => void;
    gasBudget?: bigint;
  }): Promise<{ digest: string }> {
    const { sender, sponsor, buildTransaction, gasBudget = BigInt(10_000_000) } = options;

    const tx = new TransactionBlock();
    tx.setSender(sender.getPublicKey().toSuiAddress());
    tx.setGasBudget(gasBudget);

    // Let caller build the transaction
    buildTransaction(tx);

    // Sign with sender
    const senderSig = await tx.sign({ client: this.client, signer: sender });

    // Sign with sponsor
    const sponsorSig = await tx.sign({ client: this.client, signer: sponsor });

    // Execute with both signatures
    const result = await this.client.executeTransactionBlock({
      transactionBlock: senderSig.bytes,
      signature: [senderSig.signature, sponsorSig.signature],
      options: {
        showEffects: true,
      },
    });

    return { digest: result.digest };
  }
}

