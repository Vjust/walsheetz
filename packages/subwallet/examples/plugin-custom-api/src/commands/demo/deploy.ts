import { Args, Flags } from '@oclif/core'
import { BaseCommand } from '@walrus/subwallet-sdk/cli'
import { CustomApiClient } from '../../lib/api-client.js'
import { success, info } from '@walrus/subwallet-sdk/cli'

export default class DemoDeploy extends BaseCommand {
  static description = 'Deploy content using custom API with wallet management'

  static examples = [
    '<%= config.bin %> <%= command.id %> "Hello World" --api-key YOUR_KEY',
    '<%= config.bin %> <%= command.id %> "My Content" --wallet-count 5 --json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    'api-key': Flags.string({
      description: 'API key for custom service',
      env: 'CUSTOM_API_KEY',
      required: true,
    }),
    'wallet-count': Flags.integer({
      description: 'Number of wallets to use',
      default: 3,
    }),
    'api-url': Flags.string({
      description: 'API base URL',
      default: 'https://api.example.com',
    }),
  }

  static args = {
    content: Args.string({
      description: 'Content to deploy',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(DemoDeploy)

    try {
      // Initialize API client
      const apiClient = new CustomApiClient(flags['api-key'], flags['api-url'])

      // Get orchestrator
      const orchestrator = this.getOrchestrator()

      // Load or create wallets
      let wallets = await orchestrator.loadWallets()

      if (wallets.length < flags['wallet-count']) {
        const needed = flags['wallet-count'] - wallets.length

        if (!this.jsonOutput) {
          this.log(info(`Creating ${needed} additional wallet${needed > 1 ? 's' : ''}...`))
        }

        const newWallets = await orchestrator.createWallets(needed)
        wallets = [...wallets, ...newWallets]
      }

      // Get wallet addresses
      const walletAddresses = wallets.slice(0, flags['wallet-count']).map((w) => w.address)

      if (!this.jsonOutput) {
        this.log(info(`Using ${walletAddresses.length} wallet${walletAddresses.length > 1 ? 's' : ''}`))
        this.log('')
      }

      // Deploy via API
      const result = await apiClient.deploy({
        content: args.content,
        walletAddresses,
      })

      // Output result
      const outputData = {
        deploymentId: result.id,
        status: result.status,
        url: result.url,
        walletsUsed: walletAddresses.length,
      }

      this.output(outputData)

      if (!this.jsonOutput) {
        this.log('')
        this.log(success(`Deployment created: ${result.id}`))

        if (result.url) {
          this.log(info(`View at: ${result.url}`))
        }
      }
    } catch (error) {
      this.handleError(error)
    }
  }
}
