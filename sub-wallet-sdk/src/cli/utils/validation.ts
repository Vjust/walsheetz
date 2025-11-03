/**
 * Validate that a value is a positive number
 */
export function validatePositiveNumber(value: string, name: string): number {
  const num = Number(value)

  if (Number.isNaN(num)) {
    throw new Error(`${name} must be a valid number`)
  }

  if (num <= 0) {
    throw new Error(`${name} must be greater than 0`)
  }

  return num
}

/**
 * Validate that a value is a non-negative integer
 */
export function validateNonNegativeInteger(value: string, name: string): number {
  const num = Number(value)

  if (Number.isNaN(num)) {
    throw new Error(`${name} must be a valid number`)
  }

  if (!Number.isInteger(num)) {
    throw new Error(`${name} must be an integer`)
  }

  if (num < 0) {
    throw new Error(`${name} must be non-negative`)
  }

  return num
}

/**
 * Validate Sui address format (0x followed by 64 hex characters)
 */
export function validateSuiAddress(address: string): string {
  const normalizedAddress = address.toLowerCase()

  if (!normalizedAddress.startsWith('0x')) {
    throw new Error('Sui address must start with 0x')
  }

  const hexPart = normalizedAddress.slice(2)

  if (hexPart.length !== 64) {
    throw new Error('Sui address must be 64 hex characters (excluding 0x prefix)')
  }

  if (!/^[0-9a-f]+$/.test(hexPart)) {
    throw new Error('Sui address must contain only hexadecimal characters')
  }

  return normalizedAddress
}

/**
 * Validate base64 encoded string
 */
export function validateBase64(value: string, name: string): string {
  const base64Regex = /^[A-Za-z0-9+/]+=*$/

  if (!base64Regex.test(value)) {
    throw new Error(`${name} must be a valid base64 encoded string`)
  }

  return value
}

/**
 * Validate network name
 */
export function validateNetwork(network: string): 'mainnet' | 'testnet' | 'devnet' | 'localnet' {
  const validNetworks = ['mainnet', 'testnet', 'devnet', 'localnet'] as const

  if (!validNetworks.includes(network as any)) {
    throw new Error(`Network must be one of: ${validNetworks.join(', ')}`)
  }

  return network as 'mainnet' | 'testnet' | 'devnet' | 'localnet'
}

/**
 * Validate URL format
 */
export function validateUrl(url: string): string {
  try {
    new URL(url)
    return url
  } catch {
    throw new Error('Must be a valid URL')
  }
}

/**
 * Validate and convert a string to a positive BigInt
 */
export function validatePositiveBigInt(value: string, name: string): bigint {
  // Check if the string is a valid integer format
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`${name} must be a valid positive integer`)
  }

  try {
    const bigIntValue = BigInt(value)

    if (bigIntValue <= 0n) {
      throw new Error(`${name} must be greater than 0`)
    }

    return bigIntValue
  } catch (error) {
    throw new Error(`${name} must be a valid integer: ${error}`)
  }
}
