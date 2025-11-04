#!/usr/bin/env node
/**
 * Example CLI tool using the SubWallet SDK in Node.js
 * Usage: ts-node examples/node-cli.ts <command> [args]
 */

import { SubWalletOrchestrator, NodeFsStorageAdapter } from '../src/index.js';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';

async function main() {
  // Initialize orchestrator with filesystem storage
  const orchestrator = new SubWalletOrchestrator({
    rpcUrl: process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443',
    storage: new NodeFsStorageAdapter(process.env.WALLETS_DIR || './wallets'),
    concurrency: 8,
  });

  const command = process.argv[2];

  switch (command) {
    case 'create': {
      const count = parseInt(process.argv[3] || '1');
      console.log(`Creating ${count} wallet(s)...`);
      const wallets = await orchestrator.createWallets(count);
      console.log(`Created ${wallets.length} wallets:`);
      wallets.forEach((w) => console.log(`  ${w.id}: ${w.address}`));
      break;
    }

    case 'list': {
      const wallets = await orchestrator.loadWallets();
      console.log(`Found ${wallets.length} wallets:`);
      wallets.forEach((w) => console.log(`  ${w.id}: ${w.address}`));
      break;
    }

    case 'balance': {
      console.log('Checking balances...');
      const balances = await orchestrator.checkAllBalances();
      const agg = await orchestrator.getAggregateBalance();

      console.log('\nWallet Balances:');
      balances.forEach((b) => {
        console.log(
          `  Wallet ${b.walletId}: ${orchestrator.formatSui(b.sui)} SUI, ${orchestrator.formatWal(b.wal)} WAL`
        );
      });

      console.log('\nTotal:');
      console.log(`  ${orchestrator.formatSui(agg.totalSui)} SUI`);
      console.log(`  ${orchestrator.formatWal(agg.totalWal)} WAL`);
      console.log(`  ${agg.count} wallets`);
      break;
    }

    case 'fund': {
      const amountStr = process.argv[3];
      if (!amountStr) {
        console.error('Usage: fund <amount-in-sui>');
        process.exit(1);
      }

      const amount = orchestrator.parseSui(amountStr);
      console.log(`Funding wallets with ${orchestrator.formatSui(amount)} SUI each...`);

      // Load sponsor keypair from env
      const sponsorKey = process.env.SPONSOR_PRIVATE_KEY_B64;
      if (!sponsorKey) {
        console.error('SPONSOR_PRIVATE_KEY_B64 environment variable not set');
        process.exit(1);
      }

      const decoded = Buffer.from(sponsorKey, 'base64');
      const secretKey = decoded.slice(-32);
      const sponsor = Ed25519Keypair.fromSecretKey(secretKey);

      const results = await orchestrator.fundWallets(sponsor, { amount });

      const success = results.filter((r) => !r.error);
      const failed = results.filter((r) => r.error);

      console.log(`\nSuccess: ${success.length}`);
      console.log(`Failed: ${failed.length}`);

      if (failed.length > 0) {
        console.log('\nErrors:');
        failed.forEach((r) => console.log(`  Wallet ${r.walletId}: ${r.error}`));
      }
      break;
    }

    case 'sweep': {
      const to = process.argv[3];
      if (!to) {
        console.error('Usage: sweep <target-address>');
        process.exit(1);
      }

      console.log(`Sweeping funds to ${to}...`);
      const results = await orchestrator.sweepWallets({ to });

      const success = results.filter((r) => !r.error);
      const failed = results.filter((r) => r.error);

      console.log(`\nSuccess: ${success.length}`);
      console.log(`Failed: ${failed.length}`);

      if (failed.length > 0) {
        console.log('\nErrors:');
        failed.forEach((r) => console.log(`  Wallet ${r.walletId}: ${r.error}`));
      }
      break;
    }

    default:
      console.log(`
SubWallet CLI

Usage: node-cli.ts <command> [args]

Commands:
  create <count>       Create N wallets
  list                 List all wallets
  balance              Check balances
  fund <amount-sui>    Fund wallets (requires SPONSOR_PRIVATE_KEY_B64)
  sweep <address>      Sweep funds to address

Environment:
  SUI_RPC_URL                Sui RPC endpoint (default: testnet)
  WALLETS_DIR                Wallets directory (default: ./wallets)
  SPONSOR_PRIVATE_KEY_B64    Base64 sponsor private key
`);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});

