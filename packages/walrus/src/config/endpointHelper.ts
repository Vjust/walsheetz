// Helper for proxy-first/fallback-second endpoint execution
// Handles transparent fallback from proxy to direct URLs on 404 errors

/**
 * Execute a function with proxy-first, direct-fallback endpoint logic
 * @param {string} type - 'publisher' or 'aggregator'
 * @param {Object} endpoints - Resolved endpoints from resolveWalrusEndpoints()
 * @param {Function} fn - Async function that takes (url) and returns result
 * @returns {Promise<any>} Result from fn execution
 */
export async function withWalrusEndpoint(type, endpoints, fn) {
  if (!endpoints || !endpoints[type]) {
    throw new Error(`Invalid endpoint type: ${type}`);
  }

  const endpoint = endpoints[type];
  const { proxy, direct, proxyEnabled } = endpoint;

  // Try proxy first if enabled
  if (proxyEnabled) {
    try {
      return await fn(proxy);
    } catch (error) {
      // Log fallback on 404 or proxy errors
      const err = error as Error & { status?: number };
      const shouldFallback =
        err.status === 404 ||
        err.message?.includes('ERR_INVALID_URL') ||
        err.message?.includes('Failed to fetch');

      if (shouldFallback) {
        console.log(`[endpointHelper] Proxy failed for ${type}, falling back to direct: ${direct}`);
        return await fn(direct);
      }

      // Non-fallback errors - rethrow
      throw error;
    }
  }

  // No proxy enabled, use direct URL
  return await fn(direct);
}
