import { useState, useCallback, useEffect } from 'react';
import { EnokiClient } from '@mysten/enoki';
import { useSuiClient } from '@mysten/dapp-kit';

const enokiClient = new EnokiClient({
  apiKey: import.meta.env.VITE_ENOKI_API_KEY,
});

type Provider = 'google' | 'apple' | 'facebook' | 'twitch';

interface ZkLoginState {
  address: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useEnokiAuth() {
  const _suiClient = useSuiClient();
  const [state, setState] = useState<ZkLoginState>({
    address: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
  });

  // Check for existing session on mount
  useEffect(() => {
    const stored = sessionStorage.getItem('enoki_session');
    if (stored) {
      try {
        const session = JSON.parse(stored);
        if (session.address && session.expiresAt > Date.now()) {
          setState((s) => ({ ...s, address: session.address, isAuthenticated: true }));
        } else {
          sessionStorage.removeItem('enoki_session');
        }
      } catch {
        sessionStorage.removeItem('enoki_session');
      }
    }
  }, []);

  const login = useCallback(async (provider: Provider) => {
    setState((s) => ({ ...s, isLoading: true, error: null }));

    try {
      const redirectUrl =
        import.meta.env.VITE_AUTH_REDIRECT_URL || `${window.location.origin}/auth/callback`;
      const authUrl = await enokiClient.createAuthorizationURL({
        provider,
        redirectUrl,
        network: import.meta.env.VITE_SUI_NETWORK || 'testnet',
      });
      window.location.href = authUrl;
    } catch (err) {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Login failed',
      }));
    }
  }, []);

  const handleCallback = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));

    try {
      const hash = window.location.hash.slice(1);
      const params = new URLSearchParams(hash);
      const idToken = params.get('id_token');

      if (!idToken) {
        throw new Error('No token received');
      }

      const { address } = await enokiClient.handleAuthorizationResponse({
        idToken,
      });

      // Store session (24h expiry matching maxEpoch)
      sessionStorage.setItem(
        'enoki_session',
        JSON.stringify({
          address,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        })
      );

      setState({ address, isAuthenticated: true, isLoading: false, error: null });
      return { success: true, address };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Auth callback failed';
      setState((s) => ({ ...s, isLoading: false, error }));
      return { success: false, error };
    }
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('enoki_session');
    localStorage.removeItem('walsheetz_last_spreadsheet');
    setState({ address: null, isAuthenticated: false, isLoading: false, error: null });
  }, []);

  const getPostAuthDestination = useCallback(
    async (getUserSpreadsheets: () => Promise<{ success: boolean; spreadsheets?: unknown[] }>) => {
      const lastId = localStorage.getItem('walsheetz_last_spreadsheet');
      if (lastId) return { type: 'spreadsheet' as const, id: lastId };

      try {
        const result = await getUserSpreadsheets();
        if (result.success && result.spreadsheets?.length) {
          return { type: 'dashboard' as const };
        }
      } catch {
        // Fall through to new spreadsheet
      }

      return { type: 'new' as const, id: `local-${Date.now()}` };
    },
    []
  );

  return {
    ...state,
    login,
    handleCallback,
    logout,
    getPostAuthDestination,
  };
}
