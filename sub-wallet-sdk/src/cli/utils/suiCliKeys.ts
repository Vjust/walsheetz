import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519'

interface SuiConfig {
  keystore?: {
    File?: string
  }
  active_address?: string
  envs?: Record<string, {
    rpc: string
    ws?: string
  }>
  active_env?: string
}

interface KeystoreEntry {
  address: string
  keypair: Ed25519Keypair
  secretBase64: string
}

let cachedKeystore: KeystoreEntry[] | null = null

/**
 * Get the Sui config directory
 */
export function getSuiConfigDir(): string {
  return process.env.SUI_CONFIG_DIR || join(homedir(), '.sui', 'sui_config')
}

/**
 * Read and parse the Sui client.yaml config file
 */
export function readSuiConfig(): SuiConfig | null {
  const configPath = join(getSuiConfigDir(), 'client.yaml')

  if (!existsSync(configPath)) {
    return null
  }

  try {
    const content = readFileSync(configPath, 'utf-8')
    return parseYaml(content) as SuiConfig
  } catch (error) {
    console.warn(`Failed to read Sui config: ${error}`)
    return null
  }
}

/**
 * Get the keystore file path
 */
export function getKeystorePath(): string {
  const config = readSuiConfig()

  if (config?.keystore?.File) {
    return config.keystore.File
  }

  // Default keystore location
  return join(getSuiConfigDir(), 'sui.keystore')
}

/**
 * Load all keys from the Sui keystore
 * Keystore format: One base64-encoded secret key per line
 */
export function loadSuiKeystore(): KeystoreEntry[] {
  // Return cached keystore if available
  if (cachedKeystore) {
    return cachedKeystore
  }

  const keystorePath = getKeystorePath()

  if (!existsSync(keystorePath)) {
    return []
  }

  try {
    const content = readFileSync(keystorePath, 'utf-8')
    const lines = content.split('\n').filter((line) => line.trim())

    const entries: KeystoreEntry[] = []

    for (const line of lines) {
      try {
        // Each line is a base64-encoded key with format: [scheme_byte][32-byte secret]
        const fullBytes = Buffer.from(line.trim(), 'base64')

        // Strip the first byte (scheme/flag byte) to get the 32-byte secret
        // Sui keystore format: first byte is 0x00 for Ed25519
        const secretKey = fullBytes.slice(1)

        const keypair = Ed25519Keypair.fromSecretKey(secretKey)
        const address = keypair.getPublicKey().toSuiAddress()

        entries.push({
          address,
          keypair,
          secretBase64: line.trim(),
        })
      } catch (error) {
        // Skip invalid entries
        console.warn(`Skipping invalid keystore entry: ${error}`)
      }
    }

    // Cache the keystore
    cachedKeystore = entries
    return entries
  } catch (error) {
    console.warn(`Failed to load Sui keystore: ${error}`)
    return []
  }
}

/**
 * Get the active address from Sui config
 */
export function getActiveSuiAddress(): string | null {
  const config = readSuiConfig()
  return config?.active_address || null
}

/**
 * Get the active Sui keypair and secret
 */
export function getActiveSuiKey(): { keypair: Ed25519Keypair; secretBase64: string } | null {
  const activeAddress = getActiveSuiAddress()

  if (!activeAddress) {
    return null
  }

  return getKeyForAddress(activeAddress)
}

/**
 * Get keypair for a specific address
 */
export function getKeyForAddress(address: string): { keypair: Ed25519Keypair; secretBase64: string } | null {
  const keystore = loadSuiKeystore()

  // Normalize address (ensure 0x prefix and lowercase)
  const normalizedAddress = address.toLowerCase().startsWith('0x') ? address.toLowerCase() : `0x${address.toLowerCase()}`

  const entry = keystore.find((e) => e.address.toLowerCase() === normalizedAddress)

  if (!entry) {
    return null
  }

  return {
    keypair: entry.keypair,
    secretBase64: entry.secretBase64,
  }
}

/**
 * Get the active RPC URL from Sui config
 */
export function getActiveSuiRpcUrl(): string | null {
  const config = readSuiConfig()

  if (!config) {
    return null
  }

  // Get active environment
  const activeEnv = config.active_env || 'testnet'

  // Access the environment configuration from the envs record
  const env = config.envs?.[activeEnv]

  return env?.rpc || null
}

/**
 * Check if Sui CLI is configured
 */
export function isSuiCliConfigured(): boolean {
  const configPath = join(getSuiConfigDir(), 'client.yaml')
  const keystorePath = getKeystorePath()

  return existsSync(configPath) && existsSync(keystorePath)
}

/**
 * Clear the keystore cache (useful for testing or when keystore changes)
 */
export function clearKeystoreCache(): void {
  cachedKeystore = null
}

/**
 * Decode a Sui CLI keystore secret (base64-encoded with optional scheme byte)
 * Returns the 32-byte secret key suitable for Ed25519Keypair.fromSecretKey()
 */
export function decodeSuiSecret(base64Secret: string): Buffer {
  const fullBytes = Buffer.from(base64Secret, 'base64')

  // If 33 bytes, strip the scheme byte (first byte is 0x00 for Ed25519)
  // If 32 bytes, use as-is
  return fullBytes.length === 33 ? fullBytes.slice(1) : fullBytes
}
