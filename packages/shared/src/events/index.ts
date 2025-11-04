/**
 * Type-safe event emitter utilities
 */

import type { EventHandler } from '../types/index.js'

/**
 * Event map type for defining events
 */
export type EventMap = Record<string, unknown>

/**
 * Type-safe event emitter
 */
export class TypedEventEmitter<Events extends EventMap = EventMap> {
  private listeners: Map<keyof Events, Set<EventHandler<unknown>>> = new Map()

  /**
   * Register an event listener
   */
  on<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }

    const handlers = this.listeners.get(event)!
    handlers.add(handler as EventHandler<unknown>)

    // Return unsubscribe function
    return () => {
      handlers.delete(handler as EventHandler<unknown>)
      if (handlers.size === 0) {
        this.listeners.delete(event)
      }
    }
  }

  /**
   * Register a one-time event listener
   */
  once<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void {
    const wrappedHandler = async (data: Events[K]) => {
      unsubscribe()
      await handler(data)
    }

    const unsubscribe = this.on(event, wrappedHandler)
    return unsubscribe
  }

  /**
   * Emit an event
   */
  async emit<K extends keyof Events>(event: K, data: Events[K]): Promise<void> {
    const handlers = this.listeners.get(event)
    if (!handlers) return

    await Promise.all(
      Array.from(handlers).map(async (handler) => {
        try {
          await handler(data)
        } catch (error) {
          console.error(`Error in event handler for ${String(event)}:`, error)
        }
      })
    )
  }

  /**
   * Remove all listeners for an event
   */
  removeAllListeners(event?: keyof Events): void {
    if (event) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
    }
  }

  /**
   * Get the number of listeners for an event
   */
  listenerCount(event: keyof Events): number {
    return this.listeners.get(event)?.size ?? 0
  }

  /**
   * Get all event names with listeners
   */
  eventNames(): Array<keyof Events> {
    return Array.from(this.listeners.keys())
  }
}

/**
 * Create a typed event emitter
 */
export function createEventEmitter<Events extends EventMap>(): TypedEventEmitter<Events> {
  return new TypedEventEmitter<Events>()
}
