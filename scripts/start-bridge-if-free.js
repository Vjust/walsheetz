#!/usr/bin/env node

// Start the WebSocket-gRPC bridge only if port 8081 isn't already in use
// Uses health endpoint to detect an already running bridge, otherwise spawns the bridge

import { spawn } from 'node:child_process'

const HEALTH_URL = process.env.BRIDGE_HEALTH_URL || 'http://localhost:8081/health'

async function isBridgeRunning() {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)
    const res = await fetch(HEALTH_URL, { method: 'GET', signal: controller.signal })
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}

async function main() {
  const running = await isBridgeRunning()
  if (running) {
    console.log('🟢 Bridge already running (health OK). Skipping new start.')
    process.exit(0)
  }

  console.log('🟡 Bridge not detected on 8081. Starting bridge...')
  const child = spawn(process.execPath, ['scripts/start-bridge.js'], {
    stdio: 'inherit',
    env: process.env
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`Bridge process terminated with signal: ${signal}`)
      process.exit(0)
    } else {
      console.log(`Bridge process exited with code: ${code ?? 0}`)
      process.exit(code ?? 0)
    }
  })
}

main().catch(err => {
  console.error('Failed to start bridge conditionally:', err)
  process.exit(1)
})