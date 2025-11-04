import { Args, Flags } from '@oclif/core'
import { BaseCommand } from '../../base-command.js'
import { withSpinner } from '../../utils/spinner.js'
import { success } from '../../utils/output.js'
import { validateSuiAddress } from '../../utils/validation.js'

export default class SweepAll extends BaseCommand {
  static description = 'Sweep all funds from wallets to a target address'

  static examples = [
    '<%= config.bin %> <%= command.id %> 0x1234...',
    '<%= config.bin %> <%= command.id %> 0x1234... --json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    'keep-amount': Flags.string({
      description: 'Amount of SUI to keep in each wallet (default: 0)',
      default: '0',
    }),
  }

  static args = {
    address: Args.string({
      description: 'Target address to sweep funds to',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SweepAll)

    try {
      const targetAddress = validateSuiAddress(args.address)
      const orchestrator = this.getOrchestrator()

      const results = await withSpinner(
        `Sweeping funds to ${targetAddress}...`,
        async () =>
          orchestrator.sweepWallets({
            to: targetAddress,
            gasReserve: orchestrator.parseSui(flags['keep-amount']),
          }),
        {
          successText: 'Funds swept',
        }
      )

      this.output(results)

      if (!this.jsonOutput) {
        this.log('')
        this.log(success(`Successfully swept ${results.length} wallet${results.length !== 1 ? 's' : ''}`))
      }
    } catch (error) {
      this.handleError(error)
    }
  }
}
