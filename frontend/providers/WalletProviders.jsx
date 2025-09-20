import React from 'react';
import { 
  createNetworkConfig, 
  SuiClientProvider, 
  WalletProvider 
} from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mysten/dapp-kit/dist/index.css';

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

// Network configuration for Sui
const { networkConfig } = createNetworkConfig({
  testnet: { 
    url: getFullnodeUrl('testnet'),
    variables: {
      packageId: '0xe7f62142b48f1b1746bd7dd7b695f0e2e5952879662ab7d755fdd9081b189fa7',
      registryObjectId: '0x9a6b94f79762fa608c5f0938d092744a8e5b69852f860eb17afa4ab11e24fe25',
    }
  },
  mainnet: { 
    url: getFullnodeUrl('mainnet'),
    variables: {
      packageId: null, // To be deployed
      registryObjectId: null, // To be created
    }
  },
  devnet: { 
    url: getFullnodeUrl('devnet'),
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

export function WalletProviders({ children, defaultNetwork = 'testnet' }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={defaultNetwork}>
        <WalletProvider {...walletConfig}>
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}

// Export network config for use in other components
export { networkConfig, queryClient };