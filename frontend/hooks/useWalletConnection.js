import { useState, useEffect, useCallback } from 'react';
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
import { configLoader } from '../utils/ConfigLoader.js';
import { buildSaveVersionArgs } from '../utils/AbiHelpers.js';

export function useWalletConnection() {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const wallets = useWallets();
  const { mutate: connect } = useConnectWallet();
  const { mutate: disconnect } = useDisconnectWallet();
  const { mutate: signTransaction } = useSignTransaction();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [balance, setBalance] = useState(null);
  const [selectedWallet, setSelectedWallet] = useState(null);

  // Get wallet balance when connected
  useEffect(() => {
    if (currentAccount?.address) {
      fetchBalance();
    } else {
      setBalance(null);
    }
  }, [currentAccount?.address]);

  // Fetch SUI balance
  const fetchBalance = async () => {
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
  const connectWallet = useCallback((wallet) => {
    console.log('Attempting to connect wallet:', wallet.name);
    setIsConnecting(true);
    setConnectionError(null);
    setSelectedWallet(wallet);
    
    // Return a promise for better async handling
    return new Promise((resolve, reject) => {
      connect(
        { wallet },
        {
          onSuccess: (result) => {
            console.log('Wallet connection successful:', result);
            setIsConnecting(false);
            setConnectionError(null);
            resolve(result);
          },
          onError: (error) => {
            console.error('Wallet connection failed:', error);
            setIsConnecting(false);
            const errorMessage = error?.message || error?.toString() || 'Failed to connect wallet';
            setConnectionError(errorMessage);
            reject(new Error(errorMessage));
          }
        }
      );
      
      // Add timeout to prevent hanging
      setTimeout(() => {
        if (isConnecting) {
          setIsConnecting(false);
          setConnectionError('Connection timeout - please try again');
          reject(new Error('Connection timeout'));
        }
      }, 30000);
    });
  }, [connect, isConnecting]);

  // Disconnect wallet
  const disconnectWallet = useCallback(() => {
    disconnect();
    setSelectedWallet(null);
    setBalance(null);
    setConnectionError(null);
  }, [disconnect]);

  // Sign a transaction
  const sign = useCallback((transaction) => {
    return new Promise((resolve, reject) => {
      signTransaction(
        { transaction },
        {
          onSuccess: (result) => {
            resolve(result);
          },
          onError: (error) => {
            reject(error);
          }
        }
      );
    });
  }, [signTransaction]);

  // Sign and execute a transaction
  const signAndExecute = useCallback((transaction, options = {}) => {
    console.log('[useWalletConnection] 📝 signAndExecute called with:', {
      hasTransaction: !!transaction,
      transactionType: transaction?.constructor?.name,
      optionsKeys: Object.keys(options)
    });

    return new Promise((resolve, reject) => {
      signAndExecuteTransaction(
        {
          transaction,
          options: {
            showEffects: true,
            showEvents: true,
            showObjectChanges: true,
            showBalanceChanges: true,
            ...options
          }
        },
        {
          onSuccess: (result) => {
            console.log('[useWalletConnection] ✅ Transaction executed successfully:', {
              digest: result.digest,
              hasEffects: !!result.effects,
              hasObjectChanges: !!result.objectChanges
            });
            resolve(result);
          },
          onError: (error) => {
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
  const createSpreadsheetTransaction = useCallback(async (title) => {
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
  const saveVersionTransaction = useCallback(async (spreadsheetId, walrusBlobId, contentHash, cellCount, description) => {
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
  const isSlushWallet = useCallback((wallet) => {
    const name = wallet.name.toLowerCase();
    return name.includes('slush') || 
           (name.includes('sui') && name.includes('wallet'));
  }, []);

  // Get available wallets - only Slush wallet
  const getAvailableWallets = useCallback(() => {
    // Filter for only Slush wallet with required features
    const installed = wallets.filter(w => {
      const hasFeatures = w.features?.['sui:signAndExecuteTransaction'] || 
                         w.features?.['sui:signTransaction'];
      return hasFeatures && isSlushWallet(w);
    });
    
    // Slush wallet install info (only wallet we support)
    const slushWalletInfo = {
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
  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return {
    // Connection state
    isConnected,
    isConnecting,
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
