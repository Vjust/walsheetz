import { Args } from '@oclif/core'
import { BaseCommand } from '../../base-command.js'
import { withSpinner } from '../../utils/spinner.js'
import { success, formatWalletsTable } from '../../utils/output.js'
import { validateNonNegativeInteger } from '../../utils/validation.js'

export default class WalletsCreate extends BaseCommand {
  static description = 'Create new sub-wallets'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> 5',
    '<%= config.bin %> <%= command.id %> 10 --json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  static args = {
    count: Args.integer({
      description: 'Number of wallets to create',
      default: 1,
    }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(WalletsCreate)

    try {
      const count = validateNonNegativeInteger(String(args.count), 'Count')
      const orchestrator = this.getOrchestrator()

      const wallets = await withSpinner(
        `Creating ${count} wallet${count !== 1 ? 's' : ''}...`,
        async () => orchestrator.createWallets(count),
        {
          successText: `Created ${count} wallet${count !== 1 ? 's' : ''}`,
        }
      )

      const walletsData = wallets.map((w) => ({
        id: w.id,
        address: w.address,
      }))

      this.output(walletsData, formatWalletsTable(walletsData))

      if (!this.jsonOutput) {
        this.log('')
        this.log(success(`Successfully created ${count} wallet${count !== 1 ? 's' : ''}`))
      }
    } catch (error) {
      this.handleError(error)
    }
  }
}
