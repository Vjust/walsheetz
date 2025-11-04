import { Args, Flags } from '@oclif/core'
import { BaseCommand } from '../../base-command.js'
import { withSpinner } from '../../utils/spinner.js'
import { success } from '../../utils/output.js'
import { validatePositiveNumber, validateBase64, validateSuiAddress, validatePositiveBigInt } from '../../utils/validation.js'
import { decodeSuiSecret } from '../../utils/suiCliKeys.js'
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519'

export default class FundViaMove extends BaseCommand {
  static description = 'Fund wallets via Move contract with on-chain policy enforcement'

  static examples = [
    '<%= config.bin %> <%= command.id %> 1.0 --package-id 0x... --sponsor-cap-id 0x... --coin-object-id 0x... --sponsor-key <BASE64_KEY>',
    '<%= config.bin %> <%= command.id %> 0.5 --package-id 0x... --policy-id 0x... --sponsor-cap-id 0x... --coin-object-id 0x...',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    'sponsor-key': Flags.string({
      description: 'Sponsor private key (base64 encoded) - auto-loaded from Sui CLI if available',
      env: 'SPONSOR_PRIVATE_KEY_B64',
    }),
    'package-id': Flags.string({
      description: 'Move package ID',
      required: true,
    }),
    'policy-id': Flags.string({
      description: 'Policy object ID',
    }),
    'sponsor-cap-id': Flags.string({
      description: 'Sponsor capability object ID',
      required: true,
    }),
    'coin-object-id': Flags.string({
      description: 'Coin object ID to use for funding',
      required: true,
    }),
    'gas-budget': Flags.string({
      description: 'Gas budget (default: 100000000)',
      default: '100000000',
    }),
  }

  static args = {
    amount: Args.string({
      description: 'Amount of SUI to send to each wallet',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(FundViaMove)

    try {
      const amountSui = validatePositiveNumber(args.amount, 'Amount')
      const sponsorKeyB64 = flags['sponsor-key'] || this.cliConfig.defaultSponsorKey

      if (!sponsorKeyB64) {
        this.error(
          'Sponsor key is required. Provide via --sponsor-key flag, config, SPONSOR_PRIVATE_KEY_B64 env var, or ensure Sui CLI is configured with an active address.'
        )
      }

      validateBase64(sponsorKeyB64, 'Sponsor key')
      const packageId = validateSuiAddress(flags['package-id'])
      const sponsorCapId = validateSuiAddress(flags['sponsor-cap-id'])
      const coinObjectId = validateSuiAddress(flags['coin-object-id'])
      const policyId = flags['policy-id'] ? validateSuiAddress(flags['policy-id']) : undefined
      const gasBudget = validatePositiveBigInt(flags['gas-budget'], 'Gas budget')

      // Get orchestrator with Move configuration
      const orchestrator = this.getOrchestrator({
        move: {
          packageId,
          policyId,
        },
      })

      // Decode sponsor key (handles Sui keystore format with scheme byte)
      const secretKey = decodeSuiSecret(sponsorKeyB64)
      const signer = Ed25519Keypair.fromSecretKey(secretKey)

      // Get all wallets to build recipients and amounts arrays
      const wallets = await orchestrator.loadWallets()
      if (wallets.length === 0) {
        this.error('No wallets found. Create wallets first using the wallets:create command.')
      }

      const recipients = wallets.map((w) => w.address)
      const amount = orchestrator.parseSui(args.amount)
      const amounts = wallets.map(() => amount)

      const result = await withSpinner(
        `Funding ${wallets.length} wallet${wallets.length !== 1 ? 's' : ''} via Move contract (${amountSui} SUI each)...`,
        async () =>
          orchestrator.fundWalletsViaMove(
            {
              policyId,
              sponsorCapId,
              coinObjectId,
              recipients,
              amounts,
              gasBudget,
            },
            signer
          ),
        {
          successText: 'Wallets funded via Move contract',
        }
      )

      this.output({ digest: result.digest, walletsFunded: wallets.length })

      if (!this.jsonOutput) {
        this.log('')
        this.log(
          success(`Successfully funded ${wallets.length} wallet${wallets.length !== 1 ? 's' : ''} (via Move)`)
        )
        this.log(`Transaction: ${result.digest}`)
      }
    } catch (error) {
      this.handleError(error)
    }
  }
}
