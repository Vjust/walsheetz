import { useState, useEffect, useCallback, useRef } from 'react';
import {
  useCurrentAccount,
  useSignTransaction,
  useSuiClient,
  useWallets,
  useConnectWallet,
  useDisconnectWallet,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import type { WalletWithRequiredFeatures } from '@mysten/wallet-standard';
import { configLoader } from '../../../packages/shared/src/utils/ConfigLoader.js';
import { buildSaveVersionArgs } from '../../../packages/shared/src/utils/blockchain/AbiHelpers.js';
import type {
  WalletBalance,
  AvailableWallets,
  Wallet,
  TransactionResult,
  TransactionOptions,
  UseWalletConnection,
  WalletInfo,
} from '../../../packages/shared/src/types/wallet';

export function useWalletConnection(): UseWalletConnection {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const wallets = useWallets();
  const { mutate: connect } = useConnectWallet();
  const { mutate: disconnect } = useDisconnectWallet();
  const { mutate: signTransaction } = useSignTransaction();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isAutoConnecting, setIsAutoConnecting] = useState<boolean>(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);

  // Refs for connection timeout tracking (must be at hook top-level)
  const isConnectingRef = useRef<boolean>(false);
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);
  const autoConnectCompletedRef = useRef<boolean>(false);

  // Track auto-connect completion
  useEffect(() => {
    // Auto-connect happens on mount. We need to detect when it completes.
    // If we have wallets available and haven't completed auto-connect yet, set a small delay
    if (!autoConnectCompletedRef.current) {
      const timer = setTimeout(() => {
        console.log('[useWalletConnection] Auto-connect phase completed', {
          hasAccount: !!currentAccount?.address,
          walletsCount: wallets.length
        });
        autoConnectCompletedRef.current = true;
        setIsAutoConnecting(false);
      }, 1500); // Give dapp-kit time to auto-connect

      return () => clearTimeout(timer);
    }
  }, [wallets.length]);

  // Get wallet balance when connected
  useEffect(() => {
    if (currentAccount?.address) {
      fetchBalance();
    } else {
      setBalance(null);
    }
  }, [currentAccount?.address]);

  // Fetch SUI balance
  const fetchBalance = async (): Promise<void> => {
    if (!currentAccount?.address) return;

    try {
      const balanceResult = await suiClient.getBalance({
        owner: currentAccount.address,
        coinType: '0x2::sui::SUI'
      });

      setBalance({
        totalBalance: balanceResult.totalBalance,
        // Convert from MIST to SUI (1 SUI = 10^9 MIST)
        sui: (BigInt(balanceResult.totalBalance) / BigInt(1000000000)).toString(),
        mist: balanceResult.totalBalance
      });
    } catch (error) {
      console.error('Failed to fetch balance:', error);
      setBalance(null);
    }
  };

  // Connect to a specific wallet
  const connectWallet = useCallback((wallet: Wallet): Promise<unknown> => {
    console.log('Attempting to connect wallet:', wallet.name);

    // Set connecting state
    setIsConnecting(true);
    setConnectionError(null);
    setSelectedWallet(wallet);
    isConnectingRef.current = true;

    // Return a promise for better async handling
    return new Promise((resolve, reject) => {
      connect(
        { wallet: wallet as WalletWithRequiredFeatures },
        {
          onSuccess: (result: unknown) => {
            console.log('Wallet connection successful:', result);
            isConnectingRef.current = false;
            if (timeoutIdRef.current) {
              clearTimeout(timeoutIdRef.current);
              timeoutIdRef.current = null;
            }
            setIsConnecting(false);
            setConnectionError(null);
            resolve(result);
          },
          onError: (error: Error) => {
            console.error('Wallet connection failed:', error);
            isConnectingRef.current = false;
            if (timeoutIdRef.current) {
              clearTimeout(timeoutIdRef.current);
              timeoutIdRef.current = null;
            }
            setIsConnecting(false);
            const errorMessage = error?.message || error?.toString() || 'Failed to connect wallet';
            setConnectionError(errorMessage);
            reject(new Error(errorMessage));
          }
        }
      );

      // Add timeout to prevent hanging
      timeoutIdRef.current = setTimeout(() => {
        if (isConnectingRef.current) {
          isConnectingRef.current = false;
          setIsConnecting(false);
          setConnectionError('Connection timeout - please try again');
          reject(new Error('Connection timeout'));
        }
      }, 30000);
    });
  }, [connect]);

  // Disconnect wallet
  const disconnectWallet = useCallback((): void => {
    disconnect();
    setSelectedWallet(null);
    setBalance(null);
    setConnectionError(null);
  }, [disconnect]);

  // Sign a transaction
  const sign = useCallback((transaction: Transaction): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      signTransaction(
        { transaction },
        {
          onSuccess: (result: unknown) => {
            resolve(result);
          },
          onError: (error: Error) => {
            reject(error);
          }
        }
      );
    });
  }, [signTransaction]);

  // Sign and execute a transaction
  const signAndExecute = useCallback((transaction: Transaction, options: TransactionOptions = {}): Promise<TransactionResult> => {
    console.log('[useWalletConnection] 📝 signAndExecute called with:', {
      hasTransaction: !!transaction,
      transactionType: transaction?.constructor?.name,
      optionsKeys: Object.keys(options)
    });

    return new Promise((resolve, reject) => {
      signAndExecuteTransaction(
        {
          transaction,
          ...options
        },
        {
          onSuccess: (result: TransactionResult) => {
            console.log('[useWalletConnection] ✅ Transaction executed successfully:', {
              digest: result.digest,
              hasEffects: !!result.effects,
              hasObjectChanges: !!result.objectChanges
            });
            resolve(result);
          },
          onError: (error: Error) => {
            console.error('[useWalletConnection] ❌ Transaction execution failed:', {
              error: error.message,
              stack: error.stack
            });
            reject(error);
          }
        }
      );
    });
  }, [signAndExecuteTransaction]);

  // Create a spreadsheet transaction
  const createSpreadsheetTransaction = useCallback(async (title: string): Promise<Transaction> => {
    if (!currentAccount?.address) {
      throw new Error('No wallet connected');
    }

    const config = await configLoader.getConfig();
    const networkConfig = config.getCurrentNetwork();
    const tx = new Transaction();

    // Call the create_spreadsheet function from the smart contract
    tx.moveCall({
      target: `${networkConfig.packageId}::spreadsheet::create_spreadsheet`,
      arguments: [
        tx.object(networkConfig.registryObjectId),
        tx.pure.string(title)
      ],
    });

    tx.setGasBudget(10000000); // 0.01 SUI

    return tx;
  }, [currentAccount]);

  // Save version transaction
  const saveVersionTransaction = useCallback(async (
    spreadsheetId: string,
    walrusBlobId: string,
    contentHash: string,
    cellCount: number,
    description: string
  ): Promise<Transaction> => {
    if (!currentAccount?.address) {
      throw new Error('No wallet connected');
    }

    const config = await configLoader.getConfig();
    const networkConfig = config.getCurrentNetwork();
    const tx = new Transaction();

    // Use ABI-driven argument building to adapt to actual on-chain signature
    const { args, signature } = await buildSaveVersionArgs(tx, {
      spreadsheetId,
      walrusBlobId,
      contentHash,
      cellCount,
      description
    });

    tx.moveCall({
      target: `${networkConfig.packageId}::spreadsheet::save_version`,
      arguments: args,
    });

    tx.setGasBudget(10000000); // 0.01 SUI

    console.log('[ABI] save_version transaction built with signature:', signature.debug || signature);

    return tx;
  }, [currentAccount]);

  // Helper to check if a wallet is Slush
  const isSlushWallet = useCallback((wallet: Wallet): boolean => {
    const name = wallet.name.toLowerCase();
    return name.includes('slush') ||
           (name.includes('sui') && name.includes('wallet'));
  }, []);

  // Get available wallets - only Slush wallet
  const getAvailableWallets = useCallback((): AvailableWallets => {
    // Filter for only Slush wallet with required features
    // Updated for dapp-kit v0.17: use TransactionBlock feature names as primary
    const installed = wallets.filter((w: Wallet) => {
      const hasFeatures = w.features?.['sui:signAndExecuteTransactionBlock'] ||
                         w.features?.['sui:signTransactionBlock'] ||
                         // Fallback for older versions
                         w.features?.['sui:signAndExecuteTransaction'] ||
                         w.features?.['sui:signTransaction'];
      return hasFeatures && isSlushWallet(w);
    });

    // Slush wallet install info (only wallet we support)
    const slushWalletInfo: WalletInfo = {
      name: 'Slush',
      icon: 'https://slush.app/favicon.ico',
      url: 'https://chromewebstore.google.com/detail/slush-a-sui-wallet/opcgpfmipidbgpenhmajoajpbobppdil',
      installed: false
    };

    // Only show install option if Slush isn't already installed
    const notInstalled = installed.length === 0 ? [slushWalletInfo] : [];

    return { installed, notInstalled };
  }, [wallets, isSlushWallet]);

  // Check if we have a connection
  const isConnected = !!currentAccount?.address;

  // Format address for display
  const formatAddress = (address?: string): string => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return {
    // Connection state
    isConnected,
    isConnecting,
    isAutoConnecting,
    connectionError,

    // Account info
    currentAccount,
    address: currentAccount?.address,
    formattedAddress: formatAddress(currentAccount?.address),
    balance,

    // Wallet info
    wallets,
    selectedWallet,
    availableWallets: getAvailableWallets(),

    // Actions
    connectWallet,
    disconnectWallet,
    sign,
    signAndExecute,
    fetchBalance,

    // Transaction builders
    createSpreadsheetTransaction,
    saveVersionTransaction,

    // Client access
    suiClient,
  };
}