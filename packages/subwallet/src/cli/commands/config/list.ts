import { BaseCommand } from '../../base-command.js'
import { configManager } from '../../config/manager.js'
import { formatConfigTable } from '../../utils/output.js'

export default class ConfigList extends BaseCommand {
  static description = 'List all configuration values'

  static examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --json']

  static flags = {
    ...BaseCommand.baseFlags,
  }

  async run(): Promise<void> {
    try {
      const config = configManager.getAll()

      this.output(config, formatConfigTable(config))
    } catch (error) {
      this.handleError(error)
    }
  }
}
