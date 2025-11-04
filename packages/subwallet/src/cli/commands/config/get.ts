import { Args } from '@oclif/core'
import { BaseCommand } from '../../base-command.js'
import { configManager } from '../../config/manager.js'
import { formatJson } from '../../utils/output.js'

export default class ConfigGet extends BaseCommand {
  static description = 'Get a configuration value'

  static examples = [
    '<%= config.bin %> <%= command.id %> rpcUrl',
    '<%= config.bin %> <%= command.id %> network',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  static args = {
    key: Args.string({
      description: 'Config key to retrieve',
      required: true,
      options: ['rpcUrl', 'walletsDir', 'network', 'defaultSponsorKey'],
    }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(ConfigGet)

    try {
      const value = configManager.get(args.key as any)

      if (this.jsonOutput) {
        this.output({ key: args.key, value })
      } else {
        this.log(formatJson({ [args.key]: value }))
      }
    } catch (error) {
      this.handleError(error)
    }
  }
}
