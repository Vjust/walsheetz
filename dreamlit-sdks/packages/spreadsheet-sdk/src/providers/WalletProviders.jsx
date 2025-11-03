import React from 'react';
import {
  createNetworkConfig,
  SuiClientProvider,
  WalletProvider
} from '@mysten/dapp-kit';
import { SuiHTTPTransport } from '@mysten/sui/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mysten/dapp-kit/dist/index.css';
import { useNetwork } from './NetworkProvider.jsx';

// Create a query client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
    },
  },
});

// Helper to create RPC proxy transport for mainnet/testnet (avoids CORS issues)
const createProxyTransport = (network) => new SuiHTTPTransport({
  url: '/api/sui-rpc-proxy',
  rpc: {
    headers: {
      'X-Sui-Network': network
    }
  }
});

// Network configuration for Sui
const { networkConfig } = createNetworkConfig({
  testnet: {
    transport: createProxyTransport('testnet'),
    variables: {
      packageId: '0xe7f62142b48f1b1746bd7dd7b695f0e2e5952879662ab7d755fdd9081b189fa7',
      registryObjectId: '0x9a6b94f79762fa608c5f0938d092744a8e5b69852f860eb17afa4ab11e24fe25',
    }
  },
  mainnet: {
    transport: createProxyTransport('mainnet'),
    variables: {
      packageId: '0x991454976a4ef8535ed3572bb1c500dcd565855d49a51f1fadc7f70a316c9631',
      registryObjectId: '0x66f68bfb639dbc7f24519bcdbbfdb376057d87c6d508ea7a8d67746a11721ca5',
    }
  },
  devnet: {
    url: 'https://fullnode.devnet.sui.io:443',
    variables: {
      packageId: null,
      registryObjectId: null,
    }
  },
  localnet: {
    url: 'http://127.0.0.1:9000',
    variables: {
      packageId: null,
      registryObjectId: null,
    }
  },
});

// Wallet configuration
const walletConfig = {
  // Required wallet features - these are essential for compatibility
  requiredFeatures: [
    'sui:signAndExecuteTransactionBlock',
    'sui:signTransaction',
    'standard:connect',
    'standard:events'
  ],

  // Auto-connect to previously connected wallet
  autoConnect: true,

  // Only support Slush wallet
  preferredWallets: [
    'Slush'
  ],

  // Storage key for wallet preference
  storageKey: 'walsheetz_wallet_preference',

  // Enable wallet-standard for all compatible wallets
  enableUnsafeBurner: false,

  // Filter to only allow Slush wallet
  walletFilter: (wallet) => {
    const name = wallet.name.toLowerCase();
    return name.includes('slush') ||
           (name.includes('sui') && name.includes('wallet'));
  },

  // Enhanced wallet connection options with recovery features
  walletConnectOptions: {
    // Enable wallet-standard detection
    enableWalletStandard: true,

    // Extended timeout for better reliability
    timeout: 45000,

    // Retry attempts for connection recovery
    maxRetries: 3,

    // Enable connection recovery features
    enableConnectionRecovery: true,

    // Retry delay between connection attempts
    retryDelay: 2000,

    // Auto-reconnect on page focus/visibility change
    autoReconnectOnFocus: true,

    // Connection health check interval (in ms)
    healthCheckInterval: 30000,

    // Enable graceful error handling
    gracefulErrorHandling: true
  }
};

export function WalletProviders({ children }) {
  const { network } = useNetwork();
  
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={network}>
        <WalletProvider {...walletConfig}>
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}

// Export network config for use in other components
export { networkConfig, queryClient };