import { Args } from '@oclif/core'
import { BaseCommand } from '../../base-command.js'
import { formatJson } from '../../utils/output.js'

export default class WalletsShow extends BaseCommand {
  static description = 'Show details for a specific wallet'

  static examples = [
    '<%= config.bin %> <%= command.id %> wallet-0',
    '<%= config.bin %> <%= command.id %> wallet-5 --json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  static args = {
    id: Args.string({
      description: 'Wallet ID',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(WalletsShow)

    try {
      const orchestrator = this.getOrchestrator()
      const wallet = await orchestrator.getWallet(args.id)

      if (!wallet) {
        this.error(`Wallet '${args.id}' not found`)
      }

      const walletData = {
        id: wallet.id,
        address: wallet.address,
        ...(wallet.filePath && { filePath: wallet.filePath }),
        ...(wallet.metadata && { metadata: wallet.metadata }),
      }

      this.output(walletData, formatJson(walletData))
    } catch (error) {
      this.handleError(error)
    }
  }
}
