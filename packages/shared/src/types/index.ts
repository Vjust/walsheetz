/**
 * Common TypeScript types used across SDK packages
 */

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }

/**
 * Maybe type for optional values
 */
export type Maybe<T> = T | null | undefined

/**
 * Async result type
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>

/**
 * Generic callback type
 */
export type Callback<T = void> = (value: T) => void

/**
 * Async callback type
 */
export type AsyncCallback<T = void> = (value: T) => Promise<void>

/**
 * Disposable resource interface
 */
export interface Disposable {
  dispose(): void | Promise<void>
}

/**
 * Event handler type
 */
export type EventHandler<T = unknown> = (event: T) => void | Promise<void>

/**
 * Configuration object type
 */
export interface Config {
  [key: string]: unknown
}

/**
 * Logger levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Network retry options
 */
export interface RetryOptions {
  maxAttempts?: number
  initialDelay?: number
  maxDelay?: number
  backoffMultiplier?: number
  retryableErrors?: (error: Error) => boolean
}

/**
 * Rate limit options
 */
export interface RateLimitOptions {
  maxRequests: number
  windowMs: number
}

/**
 * Helper to create successful result
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

/**
 * Helper to create failed result
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

/**
 * Check if value is defined (not null or undefined)
 */
export function isDefined<T>(value: Maybe<T>): value is T {
  return value !== null && value !== undefined
}

/**
 * Unwrap Result or throw error
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value
  }
  throw result.error
}

/**
 * Unwrap Result or return default value
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue
}
