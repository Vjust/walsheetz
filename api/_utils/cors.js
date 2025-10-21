/**
 * Shared CORS utilities for Walrus Edge Function proxies
 * Ensures consistent CORS handling across all endpoints
 */

/**
 * Standard CORS headers for WalSheetz application
 * @returns {Object} CORS headers object
 */
export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': 'https://walsheetz.vercel.app',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Expose-Headers': 'Content-Type'
  }
}

/**
 * Strip all upstream CORS headers to prevent duplication
 * Preserves important non-CORS headers like Vary, Content-Type, etc.
 *
 * @param {Headers} upstreamHeaders - Headers from upstream response
 * @returns {Object} Filtered headers object without CORS headers
 */
export function stripUpstreamCorsHeaders(upstreamHeaders) {
  const filtered = {}

  for (const [key, value] of upstreamHeaders.entries()) {
    const lower = key.toLowerCase()

    // Skip all Access-Control-* headers to prevent duplication
    if (lower.startsWith('access-control-')) {
      continue
    }

    // Preserve all other headers (Content-Type, Vary, etc.)
    filtered[key] = value
  }

  return filtered
}

/**
 * Strip disallowed request headers before proxying to upstream
 * Removes headers that should not be forwarded to prevent conflicts
 *
 * @param {Headers} headers - Request headers
 * @returns {Headers} Filtered headers object
 */
export function stripDisallowedHeaders(headers) {
  const allowed = new Headers()

  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase()

    // Skip problematic headers that cause conflicts
    if (
      lower === 'host' ||
      lower === 'connection' ||
      lower === 'accept-encoding' ||
      lower.startsWith('access-control-')
    ) {
      continue
    }

    allowed.set(key, value)
  }

  return allowed
}
