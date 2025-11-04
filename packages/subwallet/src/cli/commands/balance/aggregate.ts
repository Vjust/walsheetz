import { BaseCommand } from '../../base-command.js'
import { withSpinner } from '../../utils/spinner.js'
import { formatJson, info } from '../../utils/output.js'

export default class BalanceAggregate extends BaseCommand {
  static description = 'Get aggregate balance across all wallets'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  async run(): Promise<void> {
    try {
      const orchestrator = this.getOrchestrator()

      const aggregate = await withSpinner(
        'Calculating aggregate balance...',
        async () => orchestrator.getAggregateBalance(),
        {
          successText: 'Aggregate balance calculated',
        }
      )

      const aggregateData = {
        totalSui: orchestrator.formatSui(aggregate.totalSui),
        totalWal: orchestrator.formatWal(aggregate.totalWal),
        walletCount: aggregate.count,
      }

      this.output(aggregateData, formatJson(aggregateData))

      if (!this.jsonOutput) {
        this.log('')
        this.log(info(`Across ${aggregate.count} wallet${aggregate.count !== 1 ? 's' : ''}`))
      }
    } catch (error) {
      this.handleError(error)
    }
  }
}
