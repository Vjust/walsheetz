/**
 * Configuration loading and management utilities
 */

import type { Config } from '../types/index.js'

/**
 * Configuration loader interface
 */
export interface ConfigLoader<T extends Config = Config> {
  load(): T | Promise<T>
  reload?(): T | Promise<T>
}

/**
 * Environment variable configuration loader
 */
export class EnvConfigLoader<T extends Config = Config> implements ConfigLoader<T> {
  private envPrefix: string
  private defaults: Partial<T>
  private transformers: Map<string, (value: string) => unknown>

  constructor(options: {
    envPrefix?: string
    defaults?: Partial<T>
    transformers?: Record<string, (value: string) => unknown>
  } = {}) {
    this.envPrefix = options.envPrefix || ''
    this.defaults = options.defaults || {}
    this.transformers = new Map(Object.entries(options.transformers || {}))
  }

  load(): T {
    const config: Config = { ...this.defaults }
    const env = typeof process !== 'undefined' ? process.env : {}

    for (const [key, value] of Object.entries(env)) {
      if (!value || (this.envPrefix && !key.startsWith(this.envPrefix))) {
        continue
      }

      const configKey = this.envPrefix ? key.slice(this.envPrefix.length) : key
      const transformer = this.transformers.get(configKey)

      config[configKey] = transformer ? transformer(value) : value
    }

    return config as T
  }

  reload(): T {
    return this.load()
  }
}

/**
 * Object-based configuration loader
 */
export class ObjectConfigLoader<T extends Config = Config> implements ConfigLoader<T> {
  constructor(private config: T) {}

  load(): T {
    return { ...this.config }
  }
}

/**
 * Composite configuration loader (merges multiple sources)
 */
export class CompositeConfigLoader<T extends Config = Config> implements ConfigLoader<T> {
  constructor(private loaders: Array<ConfigLoader<Partial<T>>>) {}

  async load(): Promise<T> {
    const configs = await Promise.all(this.loaders.map((loader) => loader.load()))
    return Object.assign({}, ...configs) as T
  }

  async reload(): Promise<T> {
    const configs = await Promise.all(
      this.loaders.map((loader) => (loader.reload ? loader.reload() : loader.load()))
    )
    return Object.assign({}, ...configs) as T
  }
}

/**
 * Configuration validator
 */
export interface ConfigValidator<T extends Config = Config> {
  validate(config: T): { valid: boolean; errors: string[] }
}

/**
 * Simple schema-based configuration validator
 */
export class SchemaConfigValidator<T extends Config = Config> implements ConfigValidator<T> {
  private requiredKeys: Set<string>
  private typeChecks: Map<string, (value: unknown) => boolean>

  constructor(schema: {
    required?: string[]
    types?: Record<string, (value: unknown) => boolean>
  } = {}) {
    this.requiredKeys = new Set(schema.required || [])
    this.typeChecks = new Map(Object.entries(schema.types || {}))
  }

  validate(config: T): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // Check required keys
    for (const key of this.requiredKeys) {
      if (!(key in config)) {
        errors.push(`Missing required configuration key: ${key}`)
      }
    }

    // Check types
    for (const [key, typeCheck] of this.typeChecks) {
      if (key in config && !typeCheck(config[key])) {
        errors.push(`Invalid type for configuration key: ${key}`)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }
}

/**
 * Create a configuration loader from environment variables
 */
export function createEnvLoader<T extends Config = Config>(
  options?: ConstructorParameters<typeof EnvConfigLoader<T>>[0]
): ConfigLoader<T> {
  return new EnvConfigLoader<T>(options)
}

/**
 * Create a configuration loader from an object
 */
export function createObjectLoader<T extends Config = Config>(config: T): ConfigLoader<T> {
  return new ObjectConfigLoader<T>(config)
}

/**
 * Create a composite configuration loader
 */
export function createCompositeLoader<T extends Config = Config>(
  loaders: Array<ConfigLoader<Partial<T>>>
): ConfigLoader<T> {
  return new CompositeConfigLoader<T>(loaders)
}

/**
 * Create a schema validator
 */
export function createValidator<T extends Config = Config>(
  schema: ConstructorParameters<typeof SchemaConfigValidator<T>>[0]
): ConfigValidator<T> {
  return new SchemaConfigValidator<T>(schema)
}
