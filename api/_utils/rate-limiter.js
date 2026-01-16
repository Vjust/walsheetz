/**
 * Rate Limiter Utility for Vercel Edge Functions
 * Implements per-IP and per-session rate limiting with sliding window
 */

// In-memory store (resets on cold start - acceptable for edge)
const requestCounts = new Map()

// Configuration
const RATE_LIMITS = {
  // Per-IP limits (unauthenticated)
  ip: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30
  },
  // Per-session limits (authenticated)
  session: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100
  },
  // Request size limits
  maxBodySize: 5 * 1024 * 1024 // 5MB
}

/**
 * Get client IP from request headers
 */
export function getClientIP(req) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

/**
 * Get session ID from cookie
 */
export function getSessionId(req) {
  const cookieHeader = req.headers.get('cookie') || ''
  const match = cookieHeader.match(/walsheetz_session=([^;]+)/)
  return match ? match[1] : null
}

/**
 * Check rate limit for a given key
 * @returns {Object} { allowed: boolean, remaining: number, resetAt: number }
 */
function checkLimit(key, limit) {
  const now = Date.now()
  const windowStart = now - limit.windowMs

  // Get or create entry
  let entry = requestCounts.get(key)
  if (!entry || entry.windowStart < windowStart) {
    entry = { windowStart: now, count: 0 }
  }

  // Check if over limit
  if (entry.count >= limit.maxRequests) {
    const resetAt = entry.windowStart + limit.windowMs
    return {
      allowed: false,
      remaining: 0,
      resetAt
    }
  }

  // Increment and store
  entry.count++
  requestCounts.set(key, entry)

  // Cleanup old entries periodically (1 in 100 requests)
  if (Math.random() < 0.01) {
    cleanupOldEntries(limit.windowMs)
  }

  return {
    allowed: true,
    remaining: limit.maxRequests - entry.count,
    resetAt: entry.windowStart + limit.windowMs
  }
}

/**
 * Remove expired entries from the store
 */
function cleanupOldEntries(windowMs) {
  const cutoff = Date.now() - windowMs
  for (const [key, entry] of requestCounts.entries()) {
    if (entry.windowStart < cutoff) {
      requestCounts.delete(key)
    }
  }
}

/**
 * Rate limit middleware for Edge Functions
 * @returns {Response|null} Returns error response if rate limited, null if allowed
 */
export async function rateLimit(req) {
  const ip = getClientIP(req)
  const sessionId = getSessionId(req)

  // Check IP-based limit first
  const ipKey = `ip:${ip}`
  const ipCheck = checkLimit(ipKey, RATE_LIMITS.ip)

  if (!ipCheck.allowed) {
    return rateLimitResponse(ipCheck.resetAt)
  }

  // If authenticated, also check session limit (more permissive)
  if (sessionId) {
    const sessionKey = `session:${sessionId}`
    const sessionCheck = checkLimit(sessionKey, RATE_LIMITS.session)

    if (!sessionCheck.allowed) {
      return rateLimitResponse(sessionCheck.resetAt)
    }
  }

  return null // Allowed
}

/**
 * Check request body size
 * @returns {Response|null} Returns error response if too large, null if allowed
 */
export async function checkBodySize(req) {
  const contentLength = req.headers.get('content-length')

  if (contentLength && parseInt(contentLength) > RATE_LIMITS.maxBodySize) {
    return new Response(
      JSON.stringify({
        error: 'Request body too large',
        maxSize: RATE_LIMITS.maxBodySize
      }),
      {
        status: 413,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }

  return null
}

/**
 * Create rate limit error response
 */
function rateLimitResponse(resetAt) {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000)

  return new Response(
    JSON.stringify({
      error: 'Too many requests',
      retryAfter
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter)
      }
    }
  )
}

/**
 * Verify Origin header for CSRF protection
 * @returns {boolean} True if origin is valid
 */
export function verifyOrigin(req, allowedOrigins) {
  const origin = req.headers.get('origin')

  // No origin header (same-origin request or non-browser)
  if (!origin) {
    return true
  }

  return allowedOrigins.some(allowed => {
    if (allowed === '*') return true
    if (allowed.startsWith('*.')) {
      // Wildcard subdomain match
      const domain = allowed.slice(2)
      return origin.endsWith(domain) || origin.endsWith('.' + domain)
    }
    return origin === allowed || origin === `https://${allowed}`
  })
}
