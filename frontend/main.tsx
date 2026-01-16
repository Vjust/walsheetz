import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@app/App'
import { BlockchainAdapterProvider } from '@lib/spreadsheet/contexts/BlockchainAdapterContext'
import '@app/styles/index.css'

// Single deterministic Luckysheet adapter replaces 5-layer injection
import { luckysheetAdapter } from './lib/spreadsheet/services/luckysheet/LuckysheetAdapter.ts'
import { startRenderTimeInjection } from './lib/spreadsheet/services/luckysheet/injectAtRenderTime.ts'

console.log('[main] Initializing Luckysheet adapter...')

/**
 * Initialize Luckysheet adapter
 * Single deterministic initialization replaces multi-layer monkey-patching
 */
async function initializeLuckysheet() {
  try {
    const success = await luckysheetAdapter.initialize()

    if (success) {
      console.log('[main] Luckysheet adapter initialized')

      // Start render-time injection for autocomplete (Layer 5 - still needed for DOM watching)
      startRenderTimeInjection()
      console.log('[main] Autocomplete DOM injection active')
    } else {
      console.error('[main] Luckysheet adapter failed to initialize')
    }
  } catch (error) {
    console.error('[main] Error initializing Luckysheet:', error)
  }
}

// Initialize adapter
initializeLuckysheet()

// Render React app immediately (adapter will handle Luckysheet when ready)
ReactDOM.createRoot(document.getElementById('root')).render(
  <BlockchainAdapterProvider>
    <App />
  </BlockchainAdapterProvider>
)
