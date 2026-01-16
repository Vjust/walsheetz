import { corsHeaders, stripUpstreamCorsHeaders, stripDisallowedHeaders } from './cors.js';
import { rateLimit, checkBodySize } from './rate-limiter.js';

const PROXY_TIMEOUT_MS = 30000;

export function createProxyHandler({ targetBase, basePath }) {
  return async function handler(req) {
    const url = new URL(req.url);
    const upstreamPath = url.pathname.slice(basePath.length) || '';
    const upstream = targetBase + upstreamPath + url.search;

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }

    const rateLimitResponse = await rateLimit(req);
    if (rateLimitResponse) return rateLimitResponse;

    const bodySizeResponse = await checkBodySize(req);
    if (bodySizeResponse) return bodySizeResponse;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

    try {
      const body = req.method !== 'GET' && req.method !== 'HEAD'
        ? await req.arrayBuffer()
        : undefined;

      const response = await fetch(upstream, {
        method: req.method,
        body,
        headers: stripDisallowedHeaders(req.headers),
        signal: controller.signal,
      });

      const result = await response.arrayBuffer();

      return new Response(result, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...stripUpstreamCorsHeaders(response.headers),
          ...corsHeaders(req),
        },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error.message,
          upstream,
          timestamp: new Date().toISOString(),
        }),
        {
          status: error.name === 'AbortError' ? 504 : 502,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }
  };
}
