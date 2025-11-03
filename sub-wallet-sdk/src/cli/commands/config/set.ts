import { Args } from '@oclif/core'
import { BaseCommand } from '../../base-command.js'
import { configManager } from '../../config/manager.js'
import { success } from '../../utils/output.js'
import { validateNetwork, validateUrl } from '../../utils/validation.js'

export default class ConfigSet extends BaseCommand {
  static description = 'Set a configuration value'

  static examples = [
    '<%= config.bin %> <%= command.id %> rpcUrl https://fullnode.mainnet.sui.io:443',
    '<%= config.bin %> <%= command.id %> network mainnet',
    '<%= config.bin %> <%= command.id %> walletsDir ~/.my-wallets',
  ]

  static flags = {
    ...BaseCommand.baseFlags,
  }

  static args = {
    key: Args.string({
      description: 'Config key (rpcUrl, walletsDir, network, defaultSponsorKey)',
      required: true,
      options: ['rpcUrl', 'walletsDir', 'network', 'defaultSponsorKey'],
    }),
    value: Args.string({
      description: 'Config value',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(ConfigSet)

    try {
      let value: any = args.value

      // Validate based on key type
      if (args.key === 'network') {
        value = validateNetwork(args.value)
      } else if (args.key === 'rpcUrl') {
        value = validateUrl(args.value)
      }

      configManager.set(args.key as any, value)

      if (this.jsonOutput) {
        this.output({ key: args.key, value })
      } else {
        this.log(success(`Set ${args.key} = ${value}`))
      }
    } catch (error) {
      this.handleError(error)
    }
  }
}
