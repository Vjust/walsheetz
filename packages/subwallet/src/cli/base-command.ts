import { Command, Flags } from '@oclif/core'
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519'
import { SubWalletOrchestrator } from '../index.js'
import { NodeFsStorageAdapter } from '../sub-wallet-walrus/storage/node-fs-adapter.js'
import { configManager, type CliConfig } from './config/manager.js'
import { formatJson } from './utils/output.js'
import { decodeSuiSecret } from './utils/suiCliKeys.js'

export abstract class BaseCommand extends Command {
  static baseFlags = {
    json: Flags.boolean({
      description: 'Output in JSON format',
      default: false,
    }),
    'rpc-url': Flags.string({
      description: 'Sui RPC URL',
      env: 'SUI_RPC_URL',
    }),
    'wallets-dir': Flags.string({
      description: 'Directory to store wallets',
      env: 'WALLETS_DIR',
    }),
    'config-path': Flags.string({
      description: 'Path to config file',
    }),
  }

  protected cliConfig!: CliConfig
  protected jsonOutput = false

  /**
   * Initialize the command
   */
  async init(): Promise<void> {
    await super.init()

    // Load configuration
    const { flags } = await this.parse(this.constructor as any)

    if (flags['config-path']) {
      // Use custom config path if provided
      this.cliConfig = new (await import('./config/manager.js')).ConfigManager(flags['config-path']).getConfig()
    } else {
      this.cliConfig = configManager.getConfig()
    }

    // Override with flags if provided
    if (flags['rpc-url']) {
      this.cliConfig.rpcUrl = flags['rpc-url']
    }
    if (flags['wallets-dir']) {
      this.cliConfig.walletsDir = flags['wallets-dir']
    }

    this.jsonOutput = flags.json || false
  }

  /**
   * Get or create a SubWalletOrchestrator instance
   */
  protected getOrchestrator(options?: {
    rpcUrl?: string
    walletsDir?: string
    move?: {
      packageId: string
      policyId?: string
    }
  }): SubWalletOrchestrator {
    const rpcUrl = options?.rpcUrl || this.cliConfig.rpcUrl
    const walletsDir = options?.walletsDir || this.cliConfig.walletsDir

    if (!rpcUrl) {
      throw new Error('RPC URL is required. Set it via config, --rpc-url flag, or SUI_RPC_URL env var.')
    }

    if (!walletsDir) {
      throw new Error('Wallets directory is required. Set it via config, --wallets-dir flag, or WALLETS_DIR env var.')
    }

    // Validate Move configuration if provided
    if (options?.move) {
      if (!options.move.packageId || options.move.packageId.trim() === '') {
        throw new Error('Move packageId is required when Move configuration is provided.')
      }
    }

    const storage = new NodeFsStorageAdapter(walletsDir)

    // Import sponsor key from Sui CLI if available
    let sponsor: Ed25519Keypair | undefined
    if (this.cliConfig.defaultSponsorKey) {
      try {
        const secret = decodeSuiSecret(this.cliConfig.defaultSponsorKey)
        sponsor = Ed25519Keypair.fromSecretKey(secret)
      } catch (error) {
        this.warn(
          `Failed to import default sponsor key from Sui CLI: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    }

    return new SubWalletOrchestrator({
      rpcUrl,
      storage,
      move: options?.move,
      ...(sponsor ? { sponsor } : {}),
    })
  }

  /**
   * Output data in the appropriate format (JSON or human-readable)
   */
  protected output(data: any, humanReadable?: string): void {
    if (this.jsonOutput) {
      this.log(formatJson(data))
    } else if (humanReadable) {
      this.log(humanReadable)
    } else {
      this.log(formatJson(data))
    }
  }

  /**
   * Handle errors consistently
   */
  protected handleError(error: unknown): never {
    if (error instanceof Error) {
      this.error(error.message)
    } else {
      this.error(String(error))
    }
  }
}
