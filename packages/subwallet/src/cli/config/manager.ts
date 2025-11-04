import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { getActiveSuiKey, getActiveSuiRpcUrl, isSuiCliConfigured } from '../utils/suiCliKeys.js'

export interface CliConfig {
  rpcUrl?: string
  walletsDir?: string
  network?: 'mainnet' | 'testnet' | 'devnet' | 'localnet'
  defaultSponsorKey?: string
  useSuiCliKeystore?: boolean
}

const DEFAULT_CONFIG: CliConfig = {
  rpcUrl: 'https://fullnode.testnet.sui.io:443',
  walletsDir: join(homedir(), '.walrus-wallets'),
  network: 'testnet',
  useSuiCliKeystore: true, // Enable automatic Sui CLI keystore usage by default
}

export class ConfigManager {
  private configPath: string

  constructor(configPath?: string) {
    this.configPath = configPath || join(homedir(), '.config', 'walrus-wallet', 'config.json')
  }

  /**
   * Get the full configuration with environment variable overrides and Sui CLI auto-detection
   */
  getConfig(): CliConfig {
    const fileConfig = this.readConfigFile()

    // Start with defaults and file config
    const config: CliConfig = {
      ...DEFAULT_CONFIG,
      ...fileConfig,
    }

    // Environment variables take precedence
    if (process.env.SUI_RPC_URL) {
      config.rpcUrl = process.env.SUI_RPC_URL
    }
    if (process.env.WALLETS_DIR) {
      config.walletsDir = process.env.WALLETS_DIR
    }
    if (process.env.SUI_NETWORK) {
      config.network = process.env.SUI_NETWORK as any
    }
    if (process.env.SPONSOR_PRIVATE_KEY_B64) {
      config.defaultSponsorKey = process.env.SPONSOR_PRIVATE_KEY_B64
    }

    // Auto-load from Sui CLI if enabled and no explicit key is set
    if (config.useSuiCliKeystore !== false && !config.defaultSponsorKey) {
      this.autoLoadSuiCliDefaults(config)
    }

    return config
  }

  /**
   * Auto-load defaults from Sui CLI configuration
   */
  private autoLoadSuiCliDefaults(config: CliConfig): void {
    if (!isSuiCliConfigured()) {
      return
    }

    try {
      // Try to load active key from Sui CLI
      const activeKey = getActiveSuiKey()
      if (activeKey) {
        config.defaultSponsorKey = activeKey.secretBase64
      }

      // Try to load RPC URL if not explicitly set
      if (!config.rpcUrl || config.rpcUrl === DEFAULT_CONFIG.rpcUrl) {
        const suiRpcUrl = getActiveSuiRpcUrl()
        if (suiRpcUrl) {
          config.rpcUrl = suiRpcUrl
        }
      }
    } catch (error) {
      // Silently fail if Sui CLI config is invalid
      // Users can still provide keys manually
    }
  }

  /**
   * Get a specific config value
   */
  get<K extends keyof CliConfig>(key: K): CliConfig[K] {
    const config = this.getConfig()
    return config[key]
  }

  /**
   * Set a config value and save to file
   */
  set<K extends keyof CliConfig>(key: K, value: CliConfig[K]): void {
    const config = this.readConfigFile()
    config[key] = value
    this.writeConfigFile(config)
  }

  /**
   * Delete a config value
   */
  delete(key: keyof CliConfig): void {
    const config = this.readConfigFile()
    delete config[key]
    this.writeConfigFile(config)
  }

  /**
   * Get all config keys and values
   */
  getAll(): CliConfig {
    return this.getConfig()
  }

  /**
   * Reset config to defaults
   */
  reset(): void {
    this.writeConfigFile({})
  }

  /**
   * Check if config file exists
   */
  exists(): boolean {
    return existsSync(this.configPath)
  }

  /**
   * Read config from file (without env overrides)
   */
  private readConfigFile(): CliConfig {
    if (!existsSync(this.configPath)) {
      return {}
    }

    try {
      const content = readFileSync(this.configPath, 'utf-8')
      return JSON.parse(content) as CliConfig
    } catch (error) {
      console.error(`Error reading config file: ${error}`)
      return {}
    }
  }

  /**
   * Write config to file
   */
  private writeConfigFile(config: CliConfig): void {
    const dir = dirname(this.configPath)

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
  }
}

// Export a singleton instance
export const configManager = new ConfigManager()
