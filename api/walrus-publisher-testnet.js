/**
 * Vercel Edge Function - Walrus Publisher Proxy (Testnet)
 * Optional catch-all routing to handle base path and all subpaths
 */

import { corsHeaders, stripUpstreamCorsHeaders, stripDisallowedHeaders } from './_utils/cors.js'

export const config = { runtime: 'edge' }

const TARGET_BASE = 'https://publisher.walrus-testnet.walrus.space'

export default async function handler(req) {
  const url = new URL(req.url)
  const basePath = '/api/walrus-publisher-testnet'
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
    // Read body for PUT/POST, skip for GET/HEAD
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
