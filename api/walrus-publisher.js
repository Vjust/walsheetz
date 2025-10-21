/**
 * Vercel Edge Function - Walrus Publisher Proxy
 * Proxies requests to Walrus publisher endpoints with CORS support
 * Handles mainnet/testnet routing and blob upload operations
 */

export const config = { runtime: 'edge' }

export default async function handler(req) {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Walrus-Network',
        'Access-Control-Max-Age': '86400'
      }
    })
  }

  // Determine target network from header or default to testnet
  const network = req.headers.get('x-walrus-network') || 'testnet'

  // Publisher endpoint mapping
  const publisherUrls = {
    mainnet: 'https://walrus-mainnet-publisher-1.staketab.org',
    testnet: 'https://publisher.walrus-testnet.walrus.space'
  }

  const baseUrl = publisherUrls[network] || publisherUrls.testnet

  try {
    // Extract path from request URL (e.g., /v1/blobs or /v1/api)
    const url = new URL(req.url)
    const path = url.pathname.replace('/api/walrus-publisher', '')
    const queryString = url.search

    // Build full target URL with path and query parameters
    const targetUrl = `${baseUrl}${path}${queryString}`

    // Read request body for PUT requests (blob uploads)
    let bodyContent = undefined
    if (req.method === 'PUT') {
      // Read as ArrayBuffer to preserve binary data
      bodyContent = await req.arrayBuffer()
    }

    // Build headers for upstream request
    const proxyHeaders = new Headers()

    // Preserve Content-Type from original request
    const contentType = req.headers.get('content-type')
    if (contentType) {
      proxyHeaders.set('Content-Type', contentType)
    }

    // Add network header for tracing
    proxyHeaders.set('X-Walrus-Network', network)

    // Proxy the request to the target publisher endpoint with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const response = await fetch(targetUrl, {
      method: req.method,
      body: bodyContent,
      headers: proxyHeaders,
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    // Read response body (may be JSON or text)
    const responseBody = await response.text()

    // Build response headers with CORS support
    const responseHeaders = new Headers()

    // Preserve content type from upstream response
    const upstreamContentType = response.headers.get('content-type')
    if (upstreamContentType) {
      responseHeaders.set('Content-Type', upstreamContentType)
    }

    responseHeaders.set('Access-Control-Allow-Origin', '*')
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
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
      error: 'Walrus publisher proxy error',
      message: error.message || 'Unknown error',
      network,
      timestamp: new Date().toISOString()
    }

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Walrus-Network'
      }
    })
  }
}
