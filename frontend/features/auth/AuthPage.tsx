import React, { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallets, useConnectWallet, useCurrentAccount } from '@mysten/dapp-kit';
import ArcticSprite from '@shared/components/ArcticSprite';
import { useSpreadsheetContext } from '@features/spreadsheet/components';
import { useEnokiAuth } from './useEnokiAuth';
import './AuthPage.css';

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const AppleIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
  </svg>
);

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="#1877F2">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const TwitchIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="#9146FF">
    <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
  </svg>
);

const PROVIDERS = [
  { id: 'google', label: 'Google', icon: <GoogleIcon /> },
  { id: 'apple', label: 'Apple', icon: <AppleIcon /> },
  { id: 'facebook', label: 'Facebook', icon: <FacebookIcon /> },
  { id: 'twitch', label: 'Twitch', icon: <TwitchIcon /> },
] as const;

export function AuthPage() {
  const navigate = useNavigate();
  const wallets = useWallets();
  const { mutate: connectWallet, isPending: walletConnecting } = useConnectWallet();
  const currentAccount = useCurrentAccount();
  const { login, isLoading, error, isAuthenticated, getPostAuthDestination } = useEnokiAuth();
  const { getUserSpreadsheets } = useSpreadsheetContext();

  const navigateToDestination = useCallback(async () => {
    const dest = await getPostAuthDestination(getUserSpreadsheets);
    if (dest.type === 'spreadsheet') {
      navigate(`/spreadsheet/${dest.id}`);
    } else if (dest.type === 'dashboard') {
      navigate('/');
    } else {
      navigate(`/spreadsheet/${dest.id}`, {
        state: { title: 'Untitled Spreadsheet', template: null, isLocal: true },
      });
    }
  }, [getPostAuthDestination, getUserSpreadsheets, navigate]);

  // Redirect if already authenticated
  useEffect(() => {
    if (currentAccount || isAuthenticated) {
      navigateToDestination();
    }
  }, [currentAccount, isAuthenticated, navigateToDestination]);

  const handleWalletConnect = (wallet: (typeof wallets)[0]) => {
    connectWallet({ wallet }, { onSuccess: navigateToDestination });
  };

  return (
    <div className="auth-page">
      <div className="auth-page__background" />

      <div className="auth-page__container">
        <div className="auth-page__logo">WALSHEETZ</div>

        <div className="auth-page__mascot">
          <ArcticSprite type="walrus" />
          <div className="auth-page__speech-bubble">Let's Authenticate!</div>
        </div>

        <h1 className="auth-page__title">Connect</h1>

        {error && <div className="auth-page__error">{error}</div>}

        <button
          className="auth-page__wallet-btn"
          onClick={() => wallets[0] && handleWalletConnect(wallets[0])}
          disabled={walletConnecting || !wallets.length}
        >
          {walletConnecting ? 'Connecting...' : 'Select Sui wallet'}
        </button>

        {wallets.length > 1 && (
          <div className="auth-page__wallet-list">
            {wallets.map((wallet) => (
              <button
                key={wallet.name}
                className="auth-page__wallet-option"
                onClick={() => handleWalletConnect(wallet)}
                disabled={walletConnecting}
              >
                {wallet.icon && <img src={wallet.icon} alt="" className="auth-page__wallet-icon" />}
                {wallet.name}
              </button>
            ))}
          </div>
        )}

        <div className="auth-page__divider">
          <span>Or connect with</span>
        </div>

        <div className="auth-page__providers">
          {PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              className={`auth-page__provider auth-page__provider--${provider.id}`}
              onClick={() => login(provider.id)}
              disabled={isLoading}
            >
              <span className="auth-page__provider-icon">{provider.icon}</span>
            </button>
          ))}
        </div>

        <p className="auth-page__legal">
          By connecting to WalSheetz, you agree to our <a href="/terms">Terms</a> and{' '}
          <a href="/privacy">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}

export function AuthCallback() {
  const navigate = useNavigate();
  const { handleCallback, getPostAuthDestination } = useEnokiAuth();
  const { getUserSpreadsheets } = useSpreadsheetContext();

  useEffect(() => {
    const processCallback = async () => {
      const result = await handleCallback();
      if (result.success) {
        const dest = await getPostAuthDestination(getUserSpreadsheets);
        if (dest.type === 'spreadsheet') {
          navigate(`/spreadsheet/${dest.id}`);
        } else if (dest.type === 'dashboard') {
          navigate('/');
        } else {
          navigate(`/spreadsheet/${dest.id}`, {
            state: { title: 'Untitled Spreadsheet', template: null, isLocal: true },
          });
        }
      } else {
        navigate('/auth');
      }
    };
    processCallback();
  }, [handleCallback, getPostAuthDestination, getUserSpreadsheets, navigate]);

  return (
    <div className="auth-page auth-page--callback">
      <div className="auth-page__loading">Authenticating...</div>
    </div>
  );
}
