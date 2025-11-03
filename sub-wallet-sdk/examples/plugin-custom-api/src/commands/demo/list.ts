import { Flags } from '@oclif/core'
import { BaseCommand } from '@walrus/subwallet-sdk/cli'
import { CustomApiClient } from '../../lib/api-client.js'
import Table from 'cli-table3'
import chalk from 'chalk'

export default class DemoList extends BaseCommand {
  static description = 'List all deployments'

  static examples = [
    '<%= config.bin %> <%= command.id %> --api-key YOUR_KEY',
    '<%= config.bin %> <%= command.id %> --json',
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

  async run(): Promise<void> {
    const { flags } = await this.parse(DemoList)

    try {
      const apiClient = new CustomApiClient(flags['api-key'], flags['api-url'])

      const deployments = await apiClient.listDeployments()

      if (this.jsonOutput) {
        this.output(deployments)
      } else {
        const table = new Table({
          head: [chalk.cyan('ID'), chalk.cyan('Status'), chalk.cyan('URL')],
          style: { head: [], border: [] },
        })

        for (const deployment of deployments) {
          table.push([
            deployment.id,
            deployment.status,
            deployment.url || chalk.gray('(pending)'),
          ])
        }

        this.log(table.toString())
        this.log('')
        this.log(chalk.blue(`Total: ${deployments.length} deployment${deployments.length !== 1 ? 's' : ''}`))
      }
    } catch (error) {
      this.handleError(error)
    }
  }
}
