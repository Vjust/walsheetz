import { Flags } from '@oclif/core'
import { BaseCommand } from '../../base-command.js'
import { withSpinner } from '../../utils/spinner.js'
import { success } from '../../utils/output.js'
import { validateBase64 } from '../../utils/validation.js'
import { decodeSuiSecret } from '../../utils/suiCliKeys.js'
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519'

export default class SweepToSponsor extends BaseCommand {
  static description = 'Sweep all funds from wallets back to the sponsor address'

  static examples = [
    '<%= config.bin %> <%= command.id %> --sponsor-key <BASE64_KEY>',
    '<%= config.bin %> <%= command.id %> --json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    'sponsor-key': Flags.string({
      description: 'Sponsor private key (base64 encoded) - auto-loaded from Sui CLI if available',
      env: 'SPONSOR_PRIVATE_KEY_B64',
    }),
    'keep-amount': Flags.string({
      description: 'Amount of SUI to keep in each wallet (default: 0)',
      default: '0',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(SweepToSponsor)

    try {
      const sponsorKeyB64 = flags['sponsor-key'] || this.cliConfig.defaultSponsorKey

      if (!sponsorKeyB64) {
        this.error(
          'Sponsor key is required. Provide via --sponsor-key flag, config, SPONSOR_PRIVATE_KEY_B64 env var, or ensure Sui CLI is configured with an active address.'
        )
      }

      validateBase64(sponsorKeyB64, 'Sponsor key')

      // Decode sponsor key (handles Sui keystore format with scheme byte)
      const secretKey = decodeSuiSecret(sponsorKeyB64)
      const sponsor = Ed25519Keypair.fromSecretKey(secretKey)
      const sponsorAddress = sponsor.getPublicKey().toSuiAddress()
      const orchestrator = this.getOrchestrator()

      const results = await withSpinner(
        `Sweeping funds back to sponsor (${sponsorAddress})...`,
        async () =>
          orchestrator.sweepWallets({
            to: sponsorAddress,
            gasReserve: orchestrator.parseSui(flags['keep-amount']),
          }),
        {
          successText: 'Funds swept to sponsor',
        }
      )

      this.output(results)

      if (!this.jsonOutput) {
        this.log('')
        this.log(
          success(
            `Successfully swept ${results.length} wallet${results.length !== 1 ? 's' : ''} to sponsor (${sponsorAddress})`
          )
        )
      }
    } catch (error) {
      this.handleError(error)
    }
  }
}
