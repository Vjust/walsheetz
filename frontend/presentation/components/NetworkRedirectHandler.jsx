/**
 * NetworkRedirectHandler Component
 * Handles client-side redirect after network switch
 * Reads redirect param from URL and navigates to stored route
 *
 * Security:
 * - Only allows internal routes (must start with /)
 * - Blocks external URLs (contains //, protocols)
 * - Validates redirect before using
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export function NetworkRedirectHandler() {
  const navigate = useNavigate()

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const redirect = params.get('redirect')

      if (!redirect) {
        // No redirect needed
        return
      }

      // Decode the redirect path
      const decoded = decodeURIComponent(redirect)

      // Security: Validate redirect is internal route
      // - Must start with /
      // - Cannot contain // (blocks protocol attempts)
      // - Cannot contain http: or https: (blocks protocol URLs)
      const isValid =
        decoded.startsWith('/') &&
        !decoded.includes('//') &&
        !decoded.match(/^https?:/)

      if (!isValid) {
        console.warn('[NetworkRedirectHandler] Invalid redirect blocked:', {
          original: redirect,
          decoded,
          reason: 'failed validation (external URL or protocol detected)'
        })
        // Fallback to home on invalid redirect
        navigate('/', { replace: true })
        return
      }

      console.log('[NetworkRedirectHandler] Restoring route after network switch:', decoded)
      navigate(decoded, { replace: true })
    } catch (error) {
      console.error('[NetworkRedirectHandler] Redirect error:', {
        error: error.message,
        stack: error.stack
      })
      // Fallback to home on error
      navigate('/', { replace: true })
    }
  }, [navigate])

  // This component has no UI, only handles navigation
  return null
}
