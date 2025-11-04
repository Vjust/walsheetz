import { BaseCommand } from '../../base-command.js'
import { withSpinner } from '../../utils/spinner.js'
import { formatBalanceTable, info } from '../../utils/output.js'

export default class BalanceCheck extends BaseCommand {
  static description = 'Check balances for all wallets'

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

      const balances = await withSpinner(
        'Checking balances...',
        async () => orchestrator.checkAllBalances(),
        {
          successText: 'Balances retrieved',
        }
      )

      const balanceData = balances.map((b) => ({
        address: b.address,
        sui: orchestrator.formatSui(b.sui),
        wal: b.wal ? orchestrator.formatWal(b.wal) : '0',
      }))

      this.output(balanceData, formatBalanceTable(balanceData))

      if (!this.jsonOutput) {
        this.log('')
        this.log(info(`Checked ${balances.length} wallet${balances.length !== 1 ? 's' : ''}`))
      }
    } catch (error) {
      this.handleError(error)
    }
  }
}
