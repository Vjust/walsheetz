/**
 * Vercel Edge Function - Sui RPC Proxy
 * Proxies RPC requests to Sui RPC endpoints with CORS support
 * Handles mainnet/testnet routing and Authorization header forwarding
 */

import { corsHeaders } from './_utils/cors.js';
import { rateLimit, checkBodySize } from './_utils/rate-limiter.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        ...corsHeaders(req),
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Rate limit check
  const rateLimitResponse = await rateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  // Body size check
  const bodySizeResponse = await checkBodySize(req);
  if (bodySizeResponse) return bodySizeResponse;

  // Determine target network from header or default to testnet
  const network = req.headers.get('x-sui-network') || 'testnet';

  // RPC endpoint mapping
  const rpcUrls = {
    mainnet: 'https://fullnode.mainnet.sui.io:443',
    testnet: 'https://fullnode.testnet.sui.io:443',
  };

  const targetUrl = rpcUrls[network] || rpcUrls.testnet;

  let timeoutId;
  try {
    // Read request body once (can't reuse req.body)
    const bodyText = await req.text();

    // Build headers for upstream request
    const proxyHeaders = new Headers();
    proxyHeaders.set('Content-Type', 'application/json');

    // Forward Authorization header if present (for wallet auth)
    const auth = req.headers.get('authorization');
    if (auth) {
      proxyHeaders.set('Authorization', auth);
    }

    // Forward X-Sui-Network header for tracing
    proxyHeaders.set('X-Sui-Network', network);

    // Proxy the request to the target RPC endpoint with proper timeout using AbortController
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(targetUrl, {
      method: req.method,
      body: bodyText || undefined,
      headers: proxyHeaders,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Read response body
    const responseBody = await response.text();

    // Build response headers with CORS support
    const responseHeaders = new Headers(corsHeaders(req));
    responseHeaders.set('Content-Type', 'application/json');
    responseHeaders.set('X-Proxy-Network', network);

    // Return proxied response with status from upstream
    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    // Clear timeout on error to prevent memory leaks
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Return error response with CORS headers
    const errorResponse = {
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'RPC proxy error: ' + (error.message || 'Unknown error'),
        data: {
          network,
          timestamp: new Date().toISOString(),
        },
      },
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: {
        ...corsHeaders(req),
        'Content-Type': 'application/json',
      },
    });
  }
}
