import { Flags } from '@oclif/core'
import { BaseCommand } from '../../base-command.js'
import { success, warning, error as errorMsg } from '../../utils/output.js'
import { withSpinner } from '../../utils/spinner.js'
import { unlinkSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'

export default class WalletsClear extends BaseCommand {
  static description = 'Clear all wallets except wallet 0 (sponsor wallet)'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --force',
    '<%= config.bin %> <%= command.id %> --sweep',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    force: Flags.boolean({
      char: 'f',
      description: 'Skip confirmation prompt',
      default: false,
    }),
    sweep: Flags.boolean({
      char: 's',
      description: 'Automatically sweep funds to sponsor before clearing',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(WalletsClear)

    try {
      const orchestrator = this.getOrchestrator()
      const wallets = await orchestrator.loadWallets()

      // Filter out wallet 0 (sponsor wallet) - these are the wallets to delete
      const walletsToDelete = wallets.filter((w) => w.id !== '0')

      if (walletsToDelete.length === 0) {
        this.log('No wallets to clear (only sponsor wallet exists)')
        return
      }

      // Check balances
      if (!flags.sweep) {
        const balances = await orchestrator.checkAllBalances()
        const walletsWithFunds = balances.filter(
          (b) => b.walletId !== '0' && (b.sui > 0n || b.wal > 0n)
        )

        if (walletsWithFunds.length > 0) {
          this.error(
            `${walletsWithFunds.length} wallet(s) have funds. Use --sweep to automatically sweep funds to sponsor, or run 'walrus-wallet sweep to-sponsor' first.`
          )
        }
      } else {
        // Sweep funds to sponsor first
        this.log(warning('Sweeping all funds to sponsor before clearing...'))
        await orchestrator.sweepWallets({ to: wallets[0].address })
      }

      // Confirm deletion unless --force is used
      if (!flags.force && !this.jsonOutput) {
        this.log(
          warning(
            `This will permanently delete ${walletsToDelete.length} wallet(s). Wallet 0 (sponsor) will be preserved.`
          )
        )

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

      const deletedCount = await withSpinner(
        `Deleting ${walletsToDelete.length} wallet(s)...`,
        async () => {
          const walletsDir = this.cliConfig.walletsDir || '/Users/angel/.walrus-wallets'
          let deleted = 0

          for (const wallet of walletsToDelete) {
            try {
              // Delete wallet metadata file
              if (wallet.filePath) {
                try {
                  unlinkSync(wallet.filePath)
                } catch (err) {
                  // File might not exist
                }
              }

              // Delete keypair file
              const keypairPath = join(walletsDir, `sui_client_${wallet.id}.yaml`)
              try {
                unlinkSync(keypairPath)
              } catch (err) {
                // File might not exist
              }

              deleted++
            } catch (err) {
              this.log(errorMsg(`Failed to delete wallet ${wallet.id}: ${err}`))
            }
          }

          // Update wallet list to only include wallet 0
          const sponsorWallet = wallets.filter((w) => w.id === '0')
          await orchestrator.saveWallets(sponsorWallet)

          return deleted
        },
        {
          successText: 'Wallets cleared',
        }
      )

      if (this.jsonOutput) {
        this.output({
          deleted: deletedCount,
          remaining: 1, // Only wallet 0
        })
      } else {
        this.log('')
        this.log(
          success(`Cleared ${deletedCount} wallet(s). Wallet 0 (sponsor) preserved.`)
        )
      }
    } catch (error) {
      this.handleError(error)
    }
  }
}
