import { Args, Flags } from '@oclif/core'
import { BaseCommand } from '../../base-command.js'
import { withSpinner } from '../../utils/spinner.js'
import { success } from '../../utils/output.js'
import { validatePositiveNumber, validateBase64 } from '../../utils/validation.js'
import { decodeSuiSecret } from '../../utils/suiCliKeys.js'
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519'

export default class FundWallets extends BaseCommand {
  static description = 'Fund all wallets with SUI'

  static examples = [
    '<%= config.bin %> <%= command.id %> 1.0 --sponsor-key <BASE64_KEY>',
    '<%= config.bin %> <%= command.id %> 0.5 --json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    'sponsor-key': Flags.string({
      description: 'Sponsor private key (base64 encoded)',
      env: 'SPONSOR_PRIVATE_KEY_B64',
    }),
    'amount-per-wallet': Flags.string({
      description: 'Amount of SUI per wallet (overrides the main amount arg)',
    }),
  }

  static args = {
    amount: Args.string({
      description: 'Amount of SUI to send to each wallet',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(FundWallets)

    try {
      const amountSui = validatePositiveNumber(args.amount, 'Amount')
      const sponsorKeyB64 = flags['sponsor-key'] || this.cliConfig.defaultSponsorKey

      if (!sponsorKeyB64) {
        this.error(
          'Sponsor key is required. Provide via --sponsor-key flag, config, or SPONSOR_PRIVATE_KEY_B64 env var.'
        )
      }

      validateBase64(sponsorKeyB64, 'Sponsor key')

      const orchestrator = this.getOrchestrator()

      // Decode sponsor key (handles Sui keystore format with scheme byte)
      const secretKey = decodeSuiSecret(sponsorKeyB64)
      const sponsor = Ed25519Keypair.fromSecretKey(secretKey)

      const results = await withSpinner(
        `Funding wallets with ${amountSui} SUI each...`,
        async () =>
          orchestrator.fundWallets(sponsor, {
            amount: orchestrator.parseSui(args.amount),
          }),
        {
          successText: 'Wallets funded',
        }
      )

      this.output(results)

      if (!this.jsonOutput) {
        this.log('')
        this.log(success(`Successfully funded ${results.length} wallet${results.length !== 1 ? 's' : ''}`))
      }
    } catch (error) {
      this.handleError(error)
    }
  }
}
