import { Args, Flags } from '@oclif/core'
import { BaseCommand } from '../../base-command.js'
import { success, warning, error as errorMsg } from '../../utils/output.js'
import { unlinkSync } from 'node:fs'
import { createInterface } from 'node:readline'

export default class WalletsRemove extends BaseCommand {
  static description = 'Remove a wallet (use with caution!)'

  static examples = [
    '<%= config.bin %> <%= command.id %> wallet-0',
    '<%= config.bin %> <%= command.id %> wallet-5 --force',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    force: Flags.boolean({
      char: 'f',
      description: 'Skip confirmation prompt',
      default: false,
    }),
  }

  static args = {
    id: Args.string({
      description: 'Wallet ID to remove',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(WalletsRemove)

    try {
      const orchestrator = this.getOrchestrator()
      const wallet = await orchestrator.getWallet(args.id)

      if (!wallet) {
        this.error(`Wallet '${args.id}' not found`)
      }

      // Confirm deletion unless --force is used
      if (!flags.force && !this.jsonOutput) {
        this.log(warning(`This will permanently delete wallet '${args.id}' (${wallet.address})`))

        // Simple confirmation prompt
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout,
        })

        const response = await new Promise<boolean>((resolve) => {
          rl.question('Are you sure? (y/n) ', (answer) => {
            rl.close()
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
          })
        })

        if (!response) {
          this.log('Cancelled')
          return
        }
      }

      // Delete the wallet file if it has a filePath
      if (wallet.filePath) {
        try {
          unlinkSync(wallet.filePath)
        } catch (err) {
          this.log(errorMsg(`Failed to delete wallet file: ${err}`))
        }
      }

      // Remove from wallet list
      const wallets = await orchestrator.loadWallets()
      const updatedWallets = wallets.filter((w) => w.id !== args.id)
      await orchestrator.saveWallets(updatedWallets)

      if (this.jsonOutput) {
        this.output({ deleted: true, id: args.id })
      } else {
        this.log(success(`Wallet '${args.id}' removed`))
      }
    } catch (error) {
      this.handleError(error)
    }
  }
}
