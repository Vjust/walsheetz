import { Args, Flags } from '@oclif/core'
import { BaseCommand } from '../../base-command.js'
import { withSpinner } from '../../utils/spinner.js'
import { success } from '../../utils/output.js'
import { validatePositiveNumber, validateBase64 } from '../../utils/validation.js'
import { decodeSuiSecret } from '../../utils/suiCliKeys.js'
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519'

export default class FundSponsored extends BaseCommand {
  static description = 'Fund wallets using sponsored transactions (gasless for recipients)'

  static examples = [
    '<%= config.bin %> <%= command.id %> 1.0 --sponsor-key <BASE64_KEY>',
    '<%= config.bin %> <%= command.id %> 0.5 --json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    'sponsor-key': Flags.string({
      description: 'Sponsor private key (base64 encoded) - auto-loaded from Sui CLI if available',
      env: 'SPONSOR_PRIVATE_KEY_B64',
    }),
  }

  static args = {
    amount: Args.string({
      description: 'Amount of SUI to send to each wallet',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(FundSponsored)

    try {
      const amountSui = validatePositiveNumber(args.amount, 'Amount')
      const sponsorKeyB64 = flags['sponsor-key'] || this.cliConfig.defaultSponsorKey

      if (!sponsorKeyB64) {
        this.error(
          'Sponsor key is required. Provide via --sponsor-key flag, config, SPONSOR_PRIVATE_KEY_B64 env var, or ensure Sui CLI is configured with an active address.'
        )
      }

      validateBase64(sponsorKeyB64, 'Sponsor key')

      const orchestrator = this.getOrchestrator()

      // Decode sponsor key (handles Sui keystore format with scheme byte)
      const secretKey = decodeSuiSecret(sponsorKeyB64)
      const sponsor = Ed25519Keypair.fromSecretKey(secretKey)

      const results = await withSpinner(
        `Funding wallets via sponsored transactions (${amountSui} SUI each)...`,
        async () =>
          orchestrator.fundWalletsSponsored({
            sponsor,
            amount: orchestrator.parseSui(args.amount),
          }),
        {
          successText: 'Wallets funded via sponsored transactions',
        }
      )

      this.output(results)

      if (!this.jsonOutput) {
        this.log('')
        this.log(
          success(`Successfully funded ${results.length} wallet${results.length !== 1 ? 's' : ''} (sponsored)`)
        )
      }
    } catch (error) {
      this.handleError(error)
    }
  }
}
