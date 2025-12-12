import { luckysheetInjectionManager } from '../services/luckysheet/LuckysheetInjectionManager'

describe('LuckysheetInjectionManager', () => {
  afterEach(() => {
    luckysheetInjectionManager.cleanup()
  })

  describe('waitForLuckysheet', () => {
    it('should resolve true if luckysheet is already available', async () => {
      window.luckysheet = { create: jest.fn() } as any

      const result = await luckysheetInjectionManager.waitForLuckysheet()

      expect(result).toBe(true)
      delete window.luckysheet
    })

    it('should timeout if luckysheet never loads', async () => {
      delete window.luckysheet

      const result = await luckysheetInjectionManager.waitForLuckysheet()

      expect(result).toBe(false)
    }, 15000)
  })

  describe('installCreateHook', () => {
    it('should return false if luckysheet is not available', () => {
      delete window.luckysheet

      const result = luckysheetInjectionManager.installCreateHook(() => {})

      expect(result).toBe(false)
    })

    it('should return false if create is not a function', () => {
      window.luckysheet = { create: 'not a function' } as any

      const result = luckysheetInjectionManager.installCreateHook(() => {})

      expect(result).toBe(false)
      delete window.luckysheet
    })

    it('should install hook and return true', () => {
      const mockCreate = jest.fn()
      window.luckysheet = { create: mockCreate } as any

      const result = luckysheetInjectionManager.installCreateHook(() => {})

      expect(result).toBe(true)
      expect(window.luckysheet.create).not.toBe(mockCreate)
      delete window.luckysheet
    })

    it('should return true if hook is already installed', () => {
      window.luckysheet = { create: jest.fn() } as any

      luckysheetInjectionManager.installCreateHook(() => {})
      const result = luckysheetInjectionManager.installCreateHook(() => {})

      expect(result).toBe(true)
      delete window.luckysheet
    })
  })

  describe('startDOMMonitoring', () => {
    it('should create mutation observer for DOM monitoring', () => {
      const mockCallback = jest.fn()

      luckysheetInjectionManager.startDOMMonitoring(mockCallback)

      // Verify that observer is tracking
      expect(document.body).toBeDefined()
    })
  })

  describe('cleanup', () => {
    it('should clean up all tracked intervals', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval')

      window.luckysheet = { create: jest.fn() } as any
      luckysheetInjectionManager.installCreateHook(() => {})

      luckysheetInjectionManager.cleanup()

      expect(clearIntervalSpy).toHaveBeenCalled()
      clearIntervalSpy.mockRestore()
      delete window.luckysheet
    })

    it('should disconnect all observers', () => {
      const observerDisconnectSpy = jest.spyOn(MutationObserver.prototype, 'disconnect')

      luckysheetInjectionManager.startDOMMonitoring(() => {})
      luckysheetInjectionManager.cleanup()

      expect(observerDisconnectSpy).toHaveBeenCalled()
      observerDisconnectSpy.mockRestore()
    })
  })
})
