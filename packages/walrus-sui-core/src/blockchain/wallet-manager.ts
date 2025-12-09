// NOTE: Node/server/CLI usage only. The React UI must use @/sdk/* or @/walrus/* (Browser*Service).
// Wallet connection manager for WalSheetz
import { 
  getWallets,
  isWalletWithRequiredFeatureSet
} from '@mysten/wallet-standard';
import { getCurrentConfig } from './config.js';

class WalletManager {
  currentWallet: any = null;
  currentAccount: any = null;
  isConnected: boolean = false;
  eventListeners: Map<string, Function[]> = new Map();

  constructor() {
    this.currentWallet = null;
    this.currentAccount = null;
    this.isConnected = false;
    this.eventListeners = new Map();
  }

  // Event handling
  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  off(event: string, callback: Function): void {
    if (this.eventListeners.has(event)) {
      const callbacks = this.eventListeners.get(event)!;
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event: string, data?: any): void {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event)!.forEach(callback => callback(data));
    }
  }

  // Get available wallets
  async getAvailableWallets() {
    try {
      // getWallets() returns an object with a get() method, not an array directly
      const { get } = getWallets();
      const wallets = get(); // This returns the actual array of wallets
      
      // Filter for wallets with required Sui features
      return wallets.filter(wallet => 
        isWalletWithRequiredFeatureSet(wallet, ['standard:connect', 'sui:signAndExecuteTransactionBlock'])
      );
    } catch (error) {
      console.error('Failed to get available wallets:', error);
      return [];
    }
  }

  // Connect to wallet
  async connect(walletName = 'Sui Wallet') {
    try {
      const wallets = await this.getAvailableWallets();

      // Look for specific wallet by name (support both Sui Wallet and Slush Wallet)
      let targetWallet = wallets.find(wallet => {
        const name = wallet.name.toLowerCase();
        const searchName = walletName.toLowerCase();
        return name.includes(searchName) ||
               name.includes('slush') ||
               name.includes('sui');
      });

      // Fallback to first available wallet
      if (!targetWallet && wallets.length > 0) {
        targetWallet = wallets[0];
      }

      if (!targetWallet) {
        throw new Error('No compatible wallet found. Please install Slush Wallet (formerly Sui Wallet) or compatible wallet.');
      }

      console.log('Attempting to connect to wallet:', targetWallet.name);

      // Request connection
      const accounts = await (targetWallet.features as any)['standard:connect'].connect();

      if (!Array.isArray(accounts) || accounts.length === 0) {
        throw new Error('No accounts found in wallet');
      }

      this.currentWallet = targetWallet;
      this.currentAccount = accounts[0];
      this.isConnected = true;

      // Listen for account changes
      if ((targetWallet.features as any)['standard:events']) {
        (targetWallet.features as any)['standard:events'].on('change', (data: any) => {
          this.handleWalletChange(data);
        });
      }

      this.emit('connected', {
        wallet: targetWallet.name,
        account: this.currentAccount.address
      });

      return {
        success: true,
        wallet: targetWallet.name,
        address: this.currentAccount.address
      };

    } catch (error) {
      const err = error as Error;
      console.error('Wallet connection failed:', err);
      this.emit('error', err.message);
      return {
        success: false,
        error: err.message
      };
    }
  }

  // Disconnect wallet
  async disconnect() {
    try {
      if (this.currentWallet && (this.currentWallet.features as any)['standard:disconnect']) {
        await (this.currentWallet.features as any)['standard:disconnect'].disconnect();
      }

      this.currentWallet = null;
      this.currentAccount = null;
      this.isConnected = false;

      this.emit('disconnected', {});

      return { success: true };
    } catch (error) {
      const err = error as Error;
      console.error('Wallet disconnection failed:', err);
      return { success: false, error: err.message };
    }
  }

  // Handle wallet account changes
  handleWalletChange(data: any): void {
    if (data?.accounts && Array.isArray(data.accounts) && data.accounts.length > 0) {
      this.currentAccount = data.accounts[0];
      this.emit('accountChanged', {
        address: this.currentAccount.address
      });
    } else {
      // Wallet disconnected
      this.disconnect();
    }
  }

  // Sign and execute transaction
  async signAndExecuteTransaction(transaction: any) {
    if (!this.isConnected || !this.currentWallet) {
      throw new Error('Wallet not connected');
    }

    const maxRetries = 2;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Attempting transaction signing (attempt ${attempt}/${maxRetries})...`);

        const signAndExecuteFeature = (this.currentWallet.features as any)['sui:signAndExecuteTransactionBlock'];

        if (!signAndExecuteFeature) {
          throw new Error('Wallet does not support transaction signing');
        }

        const result = await signAndExecuteFeature.signAndExecuteTransactionBlock({
          transactionBlock: transaction,
          account: this.currentAccount,
          chain: getCurrentConfig().sui.rpcUrl.includes('testnet') ? 'sui:testnet' : 'sui:mainnet'
        });

        this.emit('transactionSigned', {
          digest: result.digest,
          effects: result.effects
        });

        console.log('Transaction executed successfully:', result.digest);
        return result;
      } catch (error) {
        const err = error as Error;
        console.error(`Transaction signing attempt ${attempt} failed:`, err);
        lastError = err;

        // Check if this is a message channel error that might be resolved with retry
        if (err.message && err.message.includes('message channel closed')) {
          console.warn(`Message channel error detected, ${maxRetries - attempt} retries remaining...`);

          // Wait before retrying (exponential backoff)
          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            console.log(`Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        } else {
          // If it's not a message channel error, don't retry
          break;
        }
      }
    }

    // If all retries failed, throw the last error with additional context
    console.error('Transaction signing failed after all retries:', lastError);
    this.emit('error', `Transaction failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
    throw lastError;
  }

  // Get current wallet info
  getWalletInfo() {
    return {
      isConnected: this.isConnected,
      walletName: this.currentWallet?.name || null,
      address: this.currentAccount?.address || null
    };
  }

  // Check if wallet supports required features
  async checkWalletCapabilities(wallet: any) {
    const requiredFeatures = [
      'standard:connect',
      'sui:signAndExecuteTransactionBlock'
    ];

    const supportedFeatures = Object.keys(wallet.features || {});
    const missingFeatures = requiredFeatures.filter(
      feature => !supportedFeatures.includes(feature)
    );

    return {
      isCompatible: missingFeatures.length === 0,
      missingFeatures,
      supportedFeatures
    };
  }

  // Auto-reconnect on page load
  async autoReconnect() {
    try {
      const wallets = await this.getAvailableWallets();

      for (const wallet of wallets) {
        try {
          // Check if wallet has existing connection
          const accounts = await (wallet.features as any)['standard:connect'].connect({ silent: true });

          if (Array.isArray(accounts) && accounts.length > 0) {
            this.currentWallet = wallet;
            this.currentAccount = accounts[0];
            this.isConnected = true;

            this.emit('reconnected', {
              wallet: wallet.name,
              account: this.currentAccount.address
            });

            return true;
          }
        } catch (error) {
          // Continue to next wallet if this one fails
          continue;
        }
      }

      return false;
    } catch (error) {
      const err = error as Error;
      console.error('Auto-reconnect failed:', err);
      return false;
    }
  }
}

// Create singleton instance
export const walletManager = new WalletManager();

// Convenience functions
export const connectWallet = (walletName) => walletManager.connect(walletName);
export const disconnectWallet = () => walletManager.disconnect();
export const getWalletInfo = () => walletManager.getWalletInfo();
export const signAndExecuteTransaction = (tx) => walletManager.signAndExecuteTransaction(tx);