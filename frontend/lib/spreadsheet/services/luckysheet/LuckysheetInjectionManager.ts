/**
 * LuckysheetInjectionManager
 *
 * Consolidates all injection logic: CDN polling, hook creation, and DOM monitoring.
 * Tracks all intervals and observers for cleanup.
 */

const INIT_TIMEOUT = 10000
const CHECK_INTERVAL = 50

interface InjectionResources {
  intervals: NodeJS.Timeout[]
  observers: MutationObserver[]
}

class LuckysheetInjectionManager {
  private resources: InjectionResources = {
    intervals: [],
    observers: []
  }
  private hookInstalled = false

  /**
   * Wait for Luckysheet CDN to load with polling
   */
  async waitForLuckysheet(): Promise<boolean> {
    return new Promise((resolve) => {
      const startTime = Date.now()

      const checkInterval = setInterval(() => {
        if (window.luckysheet) {
          clearInterval(checkInterval)
          this.removeTrackedInterval(checkInterval)
          console.log('[LuckysheetInjectionManager] Luckysheet CDN loaded')
          resolve(true)
          return
        }

        if (Date.now() - startTime > INIT_TIMEOUT) {
          clearInterval(checkInterval)
          this.removeTrackedInterval(checkInterval)
          console.error('[LuckysheetInjectionManager] Timeout waiting for Luckysheet CDN')
          resolve(false)
        }
      }, CHECK_INTERVAL)

      this.trackInterval(checkInterval)

      // Immediate check
      if (window.luckysheet) {
        clearInterval(checkInterval)
        this.removeTrackedInterval(checkInterval)
        console.log('[LuckysheetInjectionManager] Luckysheet CDN already loaded')
        resolve(true)
      }
    })
  }

  /**
   * Install hook on luckysheet.create() for WZ injection
   */
  installCreateHook(
    onCreateCalled: (config: any) => void
  ): boolean {
    if (this.hookInstalled) {
      console.log('[LuckysheetInjectionManager] Hook already installed')
      return true
    }

    if (!window.luckysheet) {
      console.error('[LuckysheetInjectionManager] window.luckysheet not available')
      return false
    }

    if (typeof window.luckysheet.create !== 'function') {
      console.error('[LuckysheetInjectionManager] window.luckysheet.create is not a function')
      return false
    }

    const originalCreate = window.luckysheet.create

    window.luckysheet.create = function(config: any) {
      console.log('[LuckysheetInjectionManager] luckysheet.create() called')
      onCreateCalled(config)
      return originalCreate.call(this, config)
    }

    this.hookInstalled = true
    console.log('[LuckysheetInjectionManager] Hook installed on window.luckysheet.create')

    return true
  }

  /**
   * Monitor DOM for autocomplete containers and inject functions
   */
  startDOMMonitoring(
    onNodeAdded: (node: Node) => void
  ): void {
    console.log('[LuckysheetInjectionManager] Starting DOM monitoring')

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return // Only element nodes

          const className = (node as Element).className || ''

          if (
            typeof className === 'string' &&
            (className.includes('luckysheet-formula-search') ||
              className.includes('formula-search-c'))
          ) {
            console.log(
              `[LuckysheetInjectionManager] Autocomplete detected: ${className}`
            )
            onNodeAdded(node)
          }
        })
      })
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true
    })

    this.trackObserver(observer)
    console.log('[LuckysheetInjectionManager] DOM monitoring active')
  }

  /**
   * Clean up all tracked resources
   */
  cleanup(): void {
    // Clear all intervals
    this.resources.intervals.forEach((intervalId) => {
      clearInterval(intervalId)
    })
    this.resources.intervals = []

    // Disconnect all observers
    this.resources.observers.forEach((observer) => {
      observer.disconnect()
    })
    this.resources.observers = []

    this.hookInstalled = false
    console.log('[LuckysheetInjectionManager] Cleanup complete')
  }

  private trackInterval(intervalId: NodeJS.Timeout): void {
    this.resources.intervals.push(intervalId)
  }

  private removeTrackedInterval(intervalId: NodeJS.Timeout): void {
    this.resources.intervals = this.resources.intervals.filter(
      (id) => id !== intervalId
    )
  }

  private trackObserver(observer: MutationObserver): void {
    this.resources.observers.push(observer)
  }
}

export const luckysheetInjectionManager = new LuckysheetInjectionManager()
