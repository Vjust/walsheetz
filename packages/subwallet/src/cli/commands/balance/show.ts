import { Args } from '@oclif/core'
import { BaseCommand } from '../../base-command.js'
import { validateSuiAddress } from '../../utils/validation.js'
import { formatJson } from '../../utils/output.js'

export default class BalanceShow extends BaseCommand {
  static description = 'Show balance for a specific address'

  static examples = [
    '<%= config.bin %> <%= command.id %> 0x1234...',
    '<%= config.bin %> <%= command.id %> 0x1234... --json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  static args = {
    address: Args.string({
      description: 'Sui address to check',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(BalanceShow)

    try {
      const address = validateSuiAddress(args.address)
      const orchestrator = this.getOrchestrator()

      const balance = await orchestrator.getBalance(address)

      const balanceData = {
        address,
        sui: orchestrator.formatSui(balance.sui),
        wal: balance.wal ? orchestrator.formatWal(balance.wal) : '0',
      }

      this.output(balanceData, formatJson(balanceData))
    } catch (error) {
      this.handleError(error)
    }
  }
}
