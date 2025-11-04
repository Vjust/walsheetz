import { vi, beforeEach } from 'vitest'

Reflect.set(globalThis, '__walrusTest__', true)

const memoryStorage = () => {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(String(key), String(value))
    },
    removeItem: (key: string) => {
      store.delete(String(key))
    },
    clear: () => {
      store.clear()
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    }
  }
}

const ensureWindow = () => {
  if (typeof globalThis.window !== 'undefined') return

  const listeners = new Map<string, Set<EventListener>>()

  globalThis.window = {
    addEventListener: (event: string, listener: EventListener) => {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(listener)
    },
    removeEventListener: (event: string, listener: EventListener) => {
      listeners.get(event)?.delete(listener)
    },
    dispatchEvent: (event: Event) => {
      listeners.get(event.type)?.forEach((listener) => listener(event))
      return true
    },
    location: {
      origin: 'http://localhost',
      hostname: 'localhost'
    },
    navigator: {
      userAgent: 'bun vitest'
    },
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage()
  } as unknown as Window
}

const ensureDocument = () => {
  if (typeof globalThis.document !== 'undefined') return
  globalThis.document = {
    createElement: () => ({})
  } as unknown as Document
}

const ensureCustomEvent = () => {
  if (typeof globalThis.CustomEvent !== 'undefined') return
  globalThis.CustomEvent = class CustomEvent<T = any> extends Event {
    detail: T
    constructor(type: string, params?: CustomEventInit<T>) {
      super(type, params)
      this.detail = params?.detail as T
    }
  }
}

const ensureFetch = () => {
  if (typeof globalThis.fetch === 'function') return
  globalThis.fetch = vi.fn(async () => {
    throw new TypeError('fetch() URL is invalid')
  }) as unknown as typeof fetch
}

ensureWindow()
ensureDocument()
ensureCustomEvent()
ensureFetch()

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = memoryStorage()
}

if (typeof globalThis.sessionStorage === 'undefined') {
  globalThis.sessionStorage = memoryStorage()
}

beforeEach(() => {
  if ('localStorage' in globalThis && typeof globalThis.localStorage?.clear === 'function') {
    globalThis.localStorage.clear()
  }
  if ('sessionStorage' in globalThis && typeof globalThis.sessionStorage?.clear === 'function') {
    globalThis.sessionStorage.clear()
  }
})
