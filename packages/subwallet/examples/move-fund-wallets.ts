import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { MoveSubWalletOrchestrator } from '../src/contracts/MoveSubWalletOrchestrator.js';

async function main() {
  const client = new SuiClient({ url: process.env.SUI_RPC_URL || getFullnodeUrl('testnet') });

  if (!process.env.WALRUS_SUBWALLET_PACKAGE || !process.env.WALRUS_SUBWALLET_POLICY) {
    throw new Error('Set WALRUS_SUBWALLET_PACKAGE and WALRUS_SUBWALLET_POLICY env vars');
  }

  const sponsorKeypair = Ed25519Keypair.fromSecretKey(
    Buffer.from(process.env.SPONSOR_PRIVATE_KEY_B64!, 'base64').slice(-32),
  );

  const move = new MoveSubWalletOrchestrator({
    client,
    packageId: process.env.WALRUS_SUBWALLET_PACKAGE,
    policyId: process.env.WALRUS_SUBWALLET_POLICY,
  });

  const result = await move.fundWallets(
    {
      sponsorCapId: process.env.WALRUS_SPONSOR_CAP!,
      coinObjectId: process.env.SUI_COIN_ID!,
      recipients: process.env.SUBWALLET_RECIPIENTS!.split(','),
      amounts: process.env.SUBWALLET_AMOUNTS!.split(',').map((value) => BigInt(value.trim())),
    },
    sponsorKeypair,
  );

  console.log('Move fund_wallets_sui digest:', result.digest);
}

void main();
