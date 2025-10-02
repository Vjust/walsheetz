import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './presentation/App.jsx'
import './presentation/styles/index.css'

// CRITICAL: Multi-layer WZ formula injection strategy
// Layer 1 (PRE-INIT): Patch globals BEFORE luckysheet.create()
// Layer 2 (HOOK): Hook luckysheet.create() to patch sheet objects
// Layer 3 (CONFIG): Pass functions in luckysheet config (handled in Spreadsheet.jsx)
// Layer 4 (INTERNAL STORE): Attempt to patch internal Store.functionlist
// Layer 5 (DISPLAY-TIME): Inject WZ functions into autocomplete dropdown at render time
import { patchLuckysheetGlobalsBeforeInit } from './services/luckysheet/injectWZLocalePatch.js'
import { setupLuckysheetHook } from './services/luckysheet/injectWzIntoSheets.js'
import { startRenderTimeInjection } from './services/luckysheet/injectAtRenderTime.js'

console.log('🔧 [main.jsx] Setting up multi-layer Luckysheet WZ formula injection...')

/**
 * Setup both pre-init patching and hook as soon as window.luckysheet is available
 * This MUST happen before luckysheet.create() is called
 */
function setupHookWhenReady() {
  if (window.luckysheet) {
    console.log('🔧 [main.jsx] window.luckysheet detected - applying multi-layer injection')

    // LAYER 1: Pre-init global patching (FIRST - before anything else)
    const preInitPatched = patchLuckysheetGlobalsBeforeInit()
    console.log(`🔧 [main.jsx] ✅ Layer 1 (Pre-Init): ${preInitPatched} WZ functions added to globals`)

    // LAYER 2: Install create() hook (SECOND - wraps create to patch sheets)
    const hookSuccess = setupLuckysheetHook()
    if (hookSuccess) {
      console.log('🔧 [main.jsx] ✅ Layer 2 (Hook): luckysheet.create() hook installed')
    } else {
      console.error('🔧 [main.jsx] ❌ Layer 2 (Hook): Failed to install hook')
    }

    // LAYER 5: Start display-time injection (monitors DOM for autocomplete dropdown)
    startRenderTimeInjection()
    console.log('🔧 [main.jsx] ✅ Layer 5 (Display-Time): Autocomplete DOM injection active')

    return true
  }
  return false
}

// Try to setup hook immediately (if CDN script already loaded)
if (!setupHookWhenReady()) {
  // CDN script not loaded yet, wait for it
  console.log('🔧 [main.jsx] Waiting for Luckysheet CDN to load...')

  const checkInterval = setInterval(() => {
    if (setupHookWhenReady()) {
      clearInterval(checkInterval)
    }
  }, 50)

  // Failsafe: stop checking after 10 seconds
  setTimeout(() => {
    clearInterval(checkInterval)
    if (!window.luckysheet) {
      console.error('🔧 [main.jsx] ❌ Luckysheet CDN failed to load within 10 seconds')
    }
  }, 10000)
}

// Render React app immediately (hook will intercept luckysheet.create when called)
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)