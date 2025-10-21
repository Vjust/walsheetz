/**
 * Vercel Edge Function - Walrus Aggregator Proxy (Mainnet)
 * Optional catch-all routing to handle base path and all subpaths
 */

import { corsHeaders, stripUpstreamCorsHeaders, stripDisallowedHeaders } from './_utils/cors.js'

export const config = { runtime: 'edge' }

const TARGET_BASE = 'https://wal-aggregator-mainnet.staketab.org'

export default async function handler(req) {
  const url = new URL(req.url)
  const basePath = '/api/walrus-aggregator-mainnet'
  const upstreamPath = url.pathname.slice(basePath.length) || ''
  const upstream = TARGET_BASE + upstreamPath + url.search

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    })
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    // Aggregator is primarily GET/HEAD, but handle POST/PUT just in case
    let body
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await req.arrayBuffer()
    }

    const response = await fetch(upstream, {
      method: req.method,
      body,
      headers: stripDisallowedHeaders(req.headers),
      signal: controller.signal
    })

    const result = await response.arrayBuffer()

    return new Response(result, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...stripUpstreamCorsHeaders(response.headers),
        ...corsHeaders()
      }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message,
      upstream,
      timestamp: new Date().toISOString()
    }), {
      status: error.name === 'AbortError' ? 504 : 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  } finally {
    clearTimeout(timeoutId)
  }
}
