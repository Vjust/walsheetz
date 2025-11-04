// Centralized Walrus endpoint resolution
// Provides proxy and direct URLs with fallback flags

/**
 * Resolves Walrus endpoints from config with proxy and direct URLs
 * @param {Object} config - Configuration object from configLoader
 * @returns {Object} { publisher: {proxy, direct, proxyEnabled}, aggregator: {proxy, direct, proxyEnabled} }
 */
export function resolveWalrusEndpoints(config) {
  if (!config) {
    throw new Error('Config is required for endpoint resolution');
  }

  // Get service bases (proxy URLs like /api/walrus-publisher)
  const publisherProxy = config.getWalrusServiceBase('publisher');
  const aggregatorProxy = config.getWalrusServiceBase('aggregator');

  // Get fallback URLs (direct Walrus URLs)
  // Fallback to service base if getWalrusFallback doesn't exist (for test mocks)
  const publisherDirect = config.getWalrusFallback ? config.getWalrusFallback('publisher') : publisherProxy;
  const aggregatorDirect = config.getWalrusFallback ? config.getWalrusFallback('aggregator') : aggregatorProxy;

  // Proxy is enabled if the proxy URL is different from direct URL
  const publisherProxyEnabled = publisherProxy !== publisherDirect;
  const aggregatorProxyEnabled = aggregatorProxy !== aggregatorDirect;

  return {
    publisher: {
      proxy: publisherProxy,
      direct: publisherDirect,
      proxyEnabled: publisherProxyEnabled
    },
    aggregator: {
      proxy: aggregatorProxy,
      direct: aggregatorDirect,
      proxyEnabled: aggregatorProxyEnabled
    }
  };
}
