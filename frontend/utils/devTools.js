/**
 * Development tools utility functions
 */

export const createDevTools = (spreadsheetHook) => {
  return {
    forceSave: () => spreadsheetHook.saveToBlockchain(),
    getStatus: () => spreadsheetHook.getStatus(),
    reset: () => confirm('Clear all data?') ? spreadsheetHook.clearData() : null,
    connectWallet: () => spreadsheetHook.connectWallet()
  }
}

// Global dev tools setup
export const setupGlobalDevTools = (spreadsheetHook) => {
  if (typeof window !== 'undefined' && import.meta.env.DEV) {
    window.devTools = createDevTools(spreadsheetHook)
    console.log('🦭 WalSheetz Dev Tools available via window.devTools')
    console.log('Available commands:', Object.keys(window.devTools))
  }
}