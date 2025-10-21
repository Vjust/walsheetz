/**
 * Vercel Edge Function - Walrus Aggregator Proxy
 * Proxies requests to Walrus aggregator endpoints with CORS support
 * Handles mainnet/testnet routing and blob retrieval operations
 */

export const config = { runtime: 'edge' }

export default async function handler(req) {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Walrus-Network',
        'Access-Control-Max-Age': '86400'
      }
    })
  }

  // Determine target network from header or default to testnet
  const network = req.headers.get('x-walrus-network') || 'testnet'

  // Aggregator endpoint mapping
  const aggregatorUrls = {
    mainnet: 'https://wal-aggregator-mainnet.staketab.org',
    testnet: 'https://aggregator.walrus-testnet.walrus.space'
  }

  const baseUrl = aggregatorUrls[network] || aggregatorUrls.testnet

  try {
    // Extract path from request URL (e.g., /v1/blobs/{blob_id} or /v1/api)
    const url = new URL(req.url)
    const path = url.pathname.replace('/api/walrus-aggregator', '')
    const queryString = url.search

    // Build full target URL with path and query parameters
    const targetUrl = `${baseUrl}${path}${queryString}`

    // Build headers for upstream request
    const proxyHeaders = new Headers()

    // Add network header for tracing
    proxyHeaders.set('X-Walrus-Network', network)

    // Proxy the request to the target aggregator endpoint with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: proxyHeaders,
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    // Read response body as ArrayBuffer to preserve binary data
    const responseBody = await response.arrayBuffer()

    // Build response headers with CORS support
    const responseHeaders = new Headers()

    // Preserve content type from upstream response
    const upstreamContentType = response.headers.get('content-type')
    if (upstreamContentType) {
      responseHeaders.set('Content-Type', upstreamContentType)
    }

    responseHeaders.set('Access-Control-Allow-Origin', '*')
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, X-Walrus-Network')
    responseHeaders.set('X-Proxy-Network', network)
    responseHeaders.set('X-Proxy-Target', baseUrl)

    // Return proxied response with status from upstream
    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    })
  } catch (error) {
    // Return error response with CORS headers
    const errorResponse = {
      error: 'Walrus aggregator proxy error',
      message: error.message || 'Unknown error',
      network,
      timestamp: new Date().toISOString()
    }

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Walrus-Network'
      }
    })
  }
}
