import { Args, Flags } from '@oclif/core'
import { BaseCommand } from '@walrus/subwallet-sdk/cli'
import { CustomApiClient } from '../../lib/api-client.js'
import { formatJson } from '@walrus/subwallet-sdk/cli'

export default class DemoStatus extends BaseCommand {
  static description = 'Check deployment status'

  static examples = [
    '<%= config.bin %> <%= command.id %> deploy-123 --api-key YOUR_KEY',
    '<%= config.bin %> <%= command.id %> deploy-456 --json',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
    'api-key': Flags.string({
      description: 'API key for custom service',
      env: 'CUSTOM_API_KEY',
      required: true,
    }),
    'api-url': Flags.string({
      description: 'API base URL',
      default: 'https://api.example.com',
    }),
  }

  static args = {
    deploymentId: Args.string({
      description: 'Deployment ID to check',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(DemoStatus)

    try {
      const apiClient = new CustomApiClient(flags['api-key'], flags['api-url'])

      const status = await apiClient.getStatus(args.deploymentId)

      this.output(status, formatJson(status))
    } catch (error) {
      this.handleError(error)
    }
  }
}
