import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './presentation/App.jsx'
import './presentation/styles/index.css'

// Single deterministic Luckysheet adapter replaces 5-layer injection
import { luckysheetAdapter } from './services/luckysheet/LuckysheetAdapter.js'
import { startRenderTimeInjection } from './services/luckysheet/injectAtRenderTime.js'

console.log('🔧 [main.jsx] Initializing Luckysheet adapter...')

/**
 * Initialize Luckysheet adapter
 * Single deterministic initialization replaces multi-layer monkey-patching
 */
async function initializeLuckysheet() {
  try {
    const success = await luckysheetAdapter.initialize()

    if (success) {
      console.log('🔧 [main.jsx] ✅ Luckysheet adapter initialized')

      // Start render-time injection for autocomplete (Layer 5 - still needed for DOM watching)
      startRenderTimeInjection()
      console.log('🔧 [main.jsx] ✅ Autocomplete DOM injection active')
    } else {
      console.error('🔧 [main.jsx] ❌ Luckysheet adapter failed to initialize')
    }
  } catch (error) {
    console.error('🔧 [main.jsx] ❌ Error initializing Luckysheet:', error)
  }
}

// Initialize adapter
initializeLuckysheet()

// Render React app immediately (adapter will handle Luckysheet when ready)
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)