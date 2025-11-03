import { BaseCommand } from '../../base-command.js'
import { formatWalletsTable, info } from '../../utils/output.js'

export default class WalletsList extends BaseCommand {
  static description = 'List all sub-wallets'

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
      const wallets = await orchestrator.loadWallets()

      const walletsData = wallets.map((w) => ({
        id: w.id,
        address: w.address,
      }))

      if (walletsData.length === 0) {
        if (!this.jsonOutput) {
          this.log(info('No wallets found. Create some with: walrus-wallet wallets create'))
        } else {
          this.output([])
        }
        return
      }

      this.output(walletsData, formatWalletsTable(walletsData))

      if (!this.jsonOutput) {
        this.log('')
        this.log(info(`Total: ${walletsData.length} wallet${walletsData.length !== 1 ? 's' : ''}`))
      }
    } catch (error) {
      this.handleError(error)
    }
  }
}
