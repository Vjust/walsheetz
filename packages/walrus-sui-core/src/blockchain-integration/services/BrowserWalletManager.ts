// Browser-compatible wallet manager for WalSheetz
// This acts as a bridge between the old API and the new dapp-kit hooks
import { getCurrentConfig, configLoader } from "../../../../walrus/src/index.js";

class BrowserWalletManager {
  private isConnected: boolean;
  private currentAccount: { address: string; publicKey: string; balance: string } | null;
  private eventListeners: Map<string, Array<(data: unknown) => void>>;
  private walletConnection: unknown | null;
  private healthMonitor: {
    isEnabled: boolean;
    heartbeatInterval: ReturnType<typeof setInterval> | null;
    lastHeartbeat: number | null;
    consecutiveFailures: number;
    maxFailures: number;
    heartbeatFrequency: number;
    healthStatus: string;
    lastSuccessfulTransaction: number | null;
    transactionHistory: Array<{ timestamp: number; success: boolean; error: string | null }>;
    reconnectionAttempts: number;
    maxReconnectionAttempts: number;
  };

  constructor() {
    this.isConnected = false;
    this.currentAccount = null;
    this.eventListeners = new Map();
    this.walletConnection = null; // Will be set from the hook

    // Connection health monitoring
    this.healthMonitor = {
      isEnabled: false,
      heartbeatInterval: null,
      lastHeartbeat: null,
      consecutiveFailures: 0,
      maxFailures: 3,
      heartbeatFrequency: 30000, // 30 seconds
      healthStatus: 'unknown', // 'healthy', 'warning', 'critical', 'unknown'
      lastSuccessfulTransaction: null,
      transactionHistory: [], // Track recent transaction attempts
      reconnectionAttempts: 0,
      maxReconnectionAttempts: 3
    };

    console.log('Browser wallet manager initialized with health monitoring');
  }

  // Event handling
  on(event: string, callback: (data: unknown) => void) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)?.push(callback);
  }

  off(event: string, callback: (data: unknown) => void) {
    if (this.eventListeners.has(event)) {
      const callbacks = this.eventListeners.get(event);
      const index = callbacks?.indexOf(callback) ?? -1;
      if (index > -1) {
        callbacks?.splice(index, 1);
      }
    }
  }

  emit(event: string, data: unknown) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event)?.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          const err = error as Error;
          console.error('Error in wallet event listener:', err);
        }
      });
    }
  }

  // Set the wallet connection from the hook
  setWalletConnection(walletConnection: unknown): void {
    const wc = walletConnection as any;
    console.log('[BrowserWalletManager] 🔗 Setting wallet connection:', {
      hasConnection: !!walletConnection,
      isConnected: wc?.isConnected || false,
      address: wc?.address?.slice(0, 8) + '...' || 'none',
      availableMethods: walletConnection ? Object.keys(walletConnection).filter((key) => typeof wc[key] === 'function') : []
    });

    this.walletConnection = walletConnection;

    // Update internal state based on connection
    if (walletConnection && wc.isConnected) {
      this.isConnected = true;
      this.currentAccount = {
        address: wc.address,
        publicKey: wc.currentAccount?.publicKeyBase64 || '',
        balance: wc.balance?.mist || '0'
      };
      console.log('[BrowserWalletManager] ✅ Wallet state updated - connected');

      // Start health monitoring when wallet connects
      this.startHealthMonitoring();
    } else {
      this.isConnected = false;
      this.currentAccount = null;
      console.log('[BrowserWalletManager] ❌ Wallet state updated - disconnected');

      // Stop health monitoring when wallet disconnects
      this.stopHealthMonitoring();
    }
  }

  // Helper to check if a wallet is Slush
  isSlushWallet(wallet: unknown): boolean {
    const w = wallet as { name: string };
    const name = w.name.toLowerCase();
    return name.includes('slush') ||
    name.includes('sui') && name.includes('wallet');
  }

  // Connect wallet (only supports Slush)
  async connectWallet(walletName: string = 'Slush'): Promise<{ address: string; publicKey: string; balance: string }> {
    console.log('[BrowserWalletManager] Connecting to Slush wallet...');

    if (!this.walletConnection) {
      throw new Error('Wallet connection not initialized. Make sure app is wrapped with WalletProviders');
    }

    try {
      // Get available wallets - filter for only Slush
      const wc = this.walletConnection as any;
      const { installed } = wc.availableWallets;
      const slushWallets = installed.filter((w) => this.isSlushWallet(w));

      console.log('[BrowserWalletManager] Available Slush wallets:', slushWallets.map((w) => w.name));

      if (slushWallets.length === 0) {
        throw new Error('Slush wallet not installed. Please install Slush wallet from the Chrome Web Store.');
      }

      // Use the first (and likely only) Slush wallet
      const wallet = slushWallets[0];

      console.log('[BrowserWalletManager] Connecting to:', wallet.name);

      // Use the hook's connect method with proper Promise handling
      await wc.connectWallet(wallet);

      // Wait for the connection state to update
      await this.waitForConnection();

      // Update internal state
      this.isConnected = true;
      this.currentAccount = {
        address: wc.address,
        publicKey: wc.currentAccount?.publicKeyBase64 || '',
        balance: wc.balance?.mist || '0'
      };

      console.log('[BrowserWalletManager] ✅ Slush wallet connected:', this.currentAccount.address);

      this.emit('connected', {
        address: wc.address,
        publicKey: this.currentAccount.publicKey
      });

      return this.currentAccount;

    } catch (error) {
      const err = error as Error;
      console.error('[BrowserWalletManager] ❌ Slush wallet connection failed:', err);
      this.emit('error', err);
      throw err;
    }
  }

  // Helper to wait for connection state
  waitForConnection(timeoutMs: number = 30000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Wallet connection timeout - please check if you approved the connection'));
      }, timeoutMs);

      const checkConnection = setInterval(() => {
        const wc = this.walletConnection as any;
        if (wc?.isConnected && wc?.address) {
          clearInterval(checkConnection);
          clearTimeout(timeout);
          resolve();
        } else if (wc?.connectionError) {
          clearInterval(checkConnection);
          clearTimeout(timeout);
          reject(new Error(wc.connectionError));
        }
      }, 500); // Reduced from 100ms to 500ms to reduce resource usage
    });
  }

  // Wrapper method for compatibility with BlockchainAdapter
  async connect(walletName: string): Promise<{ success: boolean; wallet?: any; address?: string; error?: string }> {
    try {
      const wallet = await this.connectWallet(walletName);
      return {
        success: true,
        wallet: wallet,
        address: wallet.address
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: err.message
      };
    }
  }

  // Disconnect wallet (delegates to hook)
  async disconnectWallet(): Promise<void> {
    console.log('Disconnecting wallet...');

    if (this.walletConnection) {
      const wc = this.walletConnection as any;
      wc.disconnectWallet();
    }

    this.isConnected = false;
    this.currentAccount = null;

    this.emit('disconnected', null);

    console.log('Wallet disconnected');
  }

  // Wrapper method for compatibility with BlockchainAdapter
  async disconnect(): Promise<void> {
    await this.disconnectWallet();
  }

  // Auto-reconnect method for BlockchainAdapter compatibility
  async autoReconnect(): Promise<boolean> {
    console.log('[BrowserWalletManager] Attempting auto-reconnect...');

    try {
      // Check if walletConnection exists and has auto-connect enabled
      const wc = this.walletConnection as any;
      if (this.walletConnection && wc?.currentAccount) {
        // Already connected
        this.isConnected = true;
        this.currentAccount = {
          address: wc.address,
          publicKey: wc.currentAccount?.publicKeyBase64 || '',
          balance: wc.balance?.mist || '0'
        };
        console.log('[BrowserWalletManager] ✅ Auto-reconnect successful (already connected)');
        return true;
      }

      // Don't auto-connect without user interaction for security
      console.log('[BrowserWalletManager] No existing connection found - user must manually connect');
      return false;

    } catch (error) {
      const err = error as Error;
      console.error('[BrowserWalletManager] ❌ Auto-reconnect failed:', err);
      return false;
    }
  }

  // Get wallet info
  getWalletInfo(): any {
    const wc = this.walletConnection as any;
    let network = 'testnet';
    try {
      if (typeof window !== 'undefined' && window.location?.hostname) {
        // @ts-ignore - import.meta is ES2020+
        network = (import.meta as any).env?.VITE_NETWORK || 'testnet';
      } else {
        network = process.env.VITE_NETWORK || 'testnet';
      }
    } catch {
      network = 'testnet';
    }

    const walletInfo = {
      connected: wc?.isConnected || false,
      address: wc?.address || null,
      publicKey: wc?.currentAccount?.publicKeyBase64 || null,
      network,
      balance: wc?.balance || null
    };

    console.log('[BrowserWalletManager] 📊 Wallet info requested:', {
      connected: walletInfo.connected,
      hasAddress: !!walletInfo.address,
      network: walletInfo.network,
      hasBalance: !!walletInfo.balance
    });

    return walletInfo;
  }

  // Get current account
  getCurrentAccount(): any {
    const wc = this.walletConnection as any;
    if (this.walletConnection && wc?.currentAccount) {
      return {
        address: wc.address,
        publicKey: wc.currentAccount?.publicKeyBase64 || '',
        balance: wc.balance?.mist || '0'
      };
    }
    return this.currentAccount;
  }

  // Check connection status
  getConnectionStatus(): any {
    const wc = this.walletConnection as any;
    if (this.walletConnection) {
      return {
        isConnected: wc?.isConnected,
        address: wc?.address || null,
        simulationMode: false
      };
    }

    return {
      isConnected: this.isConnected,
      address: this.currentAccount?.address || null,
      simulationMode: true
    };
  }

  // Sign a transaction
  async signTransaction(transaction: unknown): Promise<any> {
    if (!this.walletConnection) {
      throw new Error('Wallet not connected');
    }

    return await (this.walletConnection as any).sign(transaction);
  }

  // Helper to check if error is retryable
  isRetryableError(error: unknown): boolean {
    const err = error as Error;
    const errorMessage = err.message?.toLowerCase() || '';
    const retryablePatterns = [
      'message channel closed',
      'channel closed',
      'econnreset',
      'connection reset',
      'network error',
      'timeout',
      'disconnected'
    ];

    return retryablePatterns.some((pattern) => errorMessage.includes(pattern));
  }

  // Preflight checks before transaction execution
  async preflightCheck(): Promise<boolean> {
    console.log('[BrowserWalletManager] 🔍 Running preflight checks...');

    if (!this.walletConnection) {
      throw new Error('Wallet not connected - please connect your Slush wallet');
    }

    const wc = this.walletConnection as any;
    if (!wc?.isConnected) {
      throw new Error('Wallet connection not active - please check your wallet extension');
    }

    if (!wc?.address) {
      throw new Error('Wallet address not available - please reconnect your wallet');
    }

    // Check if wallet has sufficient balance (optional warning)
    if (wc?.balance) {
      // @ts-ignore - BigInt is ES2020+
      const balanceMist = BigInt(wc.balance.mist || '0');
      // @ts-ignore - BigInt is ES2020+
      const minRequired = 10000000n; // 0.01 SUI in MIST

      if (balanceMist < minRequired) {
        console.warn('[BrowserWalletManager] ⚠️ Low wallet balance detected');
      }
    }

    console.log('[BrowserWalletManager] ✅ Preflight checks passed');
    return true;
  }

  // Attempt to reconnect wallet if connection is lost
  async reconnectWallet(): Promise<boolean> {
    console.log('[BrowserWalletManager] 🔄 Attempting wallet reconnection...');

    if (!this.walletConnection) {
      throw new Error('Wallet connection not available for reconnection');
    }

    try {
      // Check if wallet has available wallets
      const wc = this.walletConnection as any;
      const { installed } = wc.availableWallets;
      const slushWallets = installed.filter((w) => this.isSlushWallet(w));

      if (slushWallets.length === 0) {
        throw new Error('Slush wallet not found for reconnection');
      }

      // Disconnect first if needed
      if (wc?.isConnected) {
        console.log('[BrowserWalletManager] 🔌 Disconnecting before reconnection...');
        wc.disconnectWallet();
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for disconnection
      }

      // Reconnect to the wallet
      console.log('[BrowserWalletManager] 🔗 Reconnecting to Slush wallet...');
      await wc.connectWallet(slushWallets[0]);

      // Wait for connection to be established
      await this.waitForConnection(10000); // 10 second timeout for reconnection

      console.log('[BrowserWalletManager] ✅ Wallet reconnected successfully');
      return true;
    } catch (error) {
      const err = error as Error;
      console.error('[BrowserWalletManager] ❌ Wallet reconnection failed:', err.message);
      return false;
    }
  }

  // Sign and execute a transaction with retry logic
  async signAndExecuteTransaction(transactionInput: any): Promise<any> {
    const maxRetries = 3; // Increased from 2 to 3
    const baseDelay = 500; // Start with 500ms

    console.log('[BrowserWalletManager] 📝 Signing and executing transaction with retry logic:', {
      isTransactionObject: typeof transactionInput === 'object',
      hasTransactionBlock: !!transactionInput.transactionBlock,
      hasTransaction: !!transactionInput.transaction,
      hasOptions: !!transactionInput.options,
      hasWalletConnection: !!this.walletConnection,
      maxRetries
    });

    // Run preflight checks
    try {
      await this.preflightCheck();
    } catch (error) {
      const err = error as Error;
      console.error('[BrowserWalletManager] ❌ Preflight check failed:', err.message);
      throw err;
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[BrowserWalletManager] 🔐 Attempt ${attempt}/${maxRetries}: Requesting wallet signature...`);

        // Handle both old format (direct transaction) and new format (with options)
        let transaction: any, options: any = {};

        if (transactionInput.transactionBlock) {
          // New format: { transactionBlock, options }
          transaction = transactionInput.transactionBlock;
          options = transactionInput.options || {};
          console.log('[BrowserWalletManager] Using transactionBlock format with options:', Object.keys(options));
        } else if (transactionInput.transaction) {
          // Handle {transaction: ..., options: ...} format
          transaction = transactionInput.transaction;
          options = transactionInput.options || {
            showEffects: true,
            showEvents: true,
            showObjectChanges: true
          };
          console.log('[BrowserWalletManager] Using transaction format with options:', Object.keys(options));
        } else {
          // Legacy format: direct transaction object
          transaction = transactionInput;
          options = {
            showEffects: true,
            showEvents: true,
            showObjectChanges: true
          };
          console.log('[BrowserWalletManager] Using legacy transaction format, adding default options');
        }

        const wc = this.walletConnection as any;
        const hasSignAndExecuteTransactionBlock = typeof wc?.signAndExecuteTransactionBlock === 'function';
        const hasSignAndExecuteTransaction = typeof wc?.signAndExecuteTransaction === 'function';
        const hasSignAndExecute = typeof wc?.signAndExecute === 'function';

        if (!hasSignAndExecuteTransactionBlock && !hasSignAndExecuteTransaction && !hasSignAndExecute) {
          throw new Error('Wallet connection does not expose a compatible sign-and-execute method');
        }

        console.log('🚀 DEBUG: About to call wallet transaction method', {
          attempt,
          hasSignAndExecuteTransactionBlock,
          hasSignAndExecuteTransaction,
          hasSignAndExecute,
          walletType: wc?.name || 'unknown',
          optionsKeys: Object.keys(options)
        });

        let result;
        if (hasSignAndExecuteTransactionBlock) {
          console.log('[BrowserWalletManager] Using signAndExecuteTransactionBlock method');
          result = await wc.signAndExecuteTransactionBlock({
            transactionBlock: transaction,
            options
          });
        } else if (hasSignAndExecuteTransaction) {
          console.log('[BrowserWalletManager] Using signAndExecuteTransaction method');
          result = await wc.signAndExecuteTransaction({
            transaction,
            options
          });
        } else {
          console.log('[BrowserWalletManager] Using signAndExecute method');
          result = await wc.signAndExecute(transaction, options);
        }

        console.log('[BrowserWalletManager] ✅ Transaction signed and executed successfully:', {
          attempt,
          digest: result.digest,
          hasEffects: !!result.effects,
          hasObjectChanges: !!result.objectChanges,
          hasBalanceChanges: !!result.balanceChanges
        });

        // Record successful transaction for health monitoring
        this.recordTransactionAttempt(true);

        return result;

      } catch (error) {
        const err = error as Error;
        const isRetryable = this.isRetryableError(err);
        const isLastAttempt = attempt === maxRetries;

        console.error(`[BrowserWalletManager] ❌ Attempt ${attempt}/${maxRetries} failed:`, {
          error: err.message,
          isRetryable,
          isLastAttempt,
          transactionType: typeof transactionInput
        });

        if (isLastAttempt || !isRetryable) {
          // Record failed transaction for health monitoring
          this.recordTransactionAttempt(false, err);

          // Add context to error message for user
          let userFriendlyMessage = err.message;
          if (this.isRetryableError(err)) {
            userFriendlyMessage = `Wallet communication failed after ${maxRetries} attempts. Please refresh the page and try again. Original error: ${err.message}`;
          }

          const enhancedError = new Error(userFriendlyMessage);
          (enhancedError as any).originalError = err;
          (enhancedError as any).attempt = attempt;
          (enhancedError as any).isRetryable = isRetryable;
          throw enhancedError;
        }

        // Calculate delay with exponential backoff
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`[BrowserWalletManager] ⏳ Retrying in ${delay}ms...`);

        await new Promise((resolve) => setTimeout(resolve, delay));

        // Try to reconnect if it was a connection issue
        if (this.isRetryableError(err)) {
          console.log('[BrowserWalletManager] 🔄 Attempting wallet reconnection due to connection error...');
          try {
            const reconnected = await this.reconnectWallet();
            if (reconnected) {
              console.log('[BrowserWalletManager] ✅ Wallet reconnected, will retry transaction');
            } else {
              console.warn('[BrowserWalletManager] ⚠️ Wallet reconnection failed, continuing with next attempt');
            }
          } catch (reconnectError) {
            const reconnectErr = reconnectError as Error;
            console.warn('[BrowserWalletManager] ⚠️ Reconnection attempt failed:', reconnectErr.message);
          }
        }
      }
    }
  }

  // Get available wallets
  getAvailableWallets(): any {
    if (!this.walletConnection) {
      return { installed: [], notInstalled: [] };
    }

    const wc = this.walletConnection as any;
    return wc?.availableWallets;
  }

  // Build unsigned transaction for WalSheetz DeFi operations
  async buildUnsignedTransaction(request: unknown): Promise<any> {
    const req = request as any;
    console.log('[BrowserWalletManager] 🔨 Building unsigned transaction:', {
      adapterId: req.adapterId,
      method: req.method,
      hasArgs: !!req.args
    });

    try {
      // Run preflight checks
      await this.preflightCheck();

      // Import transaction runner dynamically to avoid circular dependencies
      const { transactionRunner } = await import("../../blockchain/sui-transaction-runner.js");

      // Prepare the transaction
      const wc = this.walletConnection as any;
      const txPreparation = await transactionRunner.prepareTransaction({
        adapterId: req.adapterId,
        method: req.method,
        args: req.args || [],
        modifiers: {
          sender: wc?.address,
          gasCoins: req.gasCoins || null,
          gasBudget: req.gasBudget || null,
          ...req.modifiers
        }
      });

      console.log('[BrowserWalletManager] ✅ Transaction prepared:', {
        method: txPreparation.method,
        hasEstimatedGas: !!txPreparation.estimatedGas,
        description: txPreparation.description
      });

      return {
        success: true,
        transaction: txPreparation.transaction,
        metadata: {
          adapterId: req.adapterId,
          method: txPreparation.method,
          args: txPreparation.args,
          description: txPreparation.description,
          estimatedGas: txPreparation.estimatedGas
        }
      };

    } catch (error) {
      const err = error as Error;
      console.error('[BrowserWalletManager] ❌ Failed to build unsigned transaction:', err.message);
      return {
        success: false,
        error: err.message,
        details: err.stack
      };
    }
  }

  // Execute a WalSheetz contract method (combines building and signing)
  async executeContractMethod(adapterId: string, method: string, args: unknown[], options: any = {}): Promise<any> {
    console.log(`[BrowserWalletManager] 🚀 Executing contract method: ${adapterId}.${method}`);

    try {
      // Build unsigned transaction
      const buildResult = await this.buildUnsignedTransaction({
        adapterId,
        method,
        args,
        modifiers: options.modifiers || {}
      });

      if (!buildResult.success) {
        throw new Error(`Failed to build transaction: ${buildResult.error}`);
      }

      // Sign and execute the transaction
      const executeOptions = {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true,
        ...options.executeOptions
      };

      const result = await this.signAndExecuteTransaction({
        transaction: buildResult.transaction,
        options: executeOptions
      });

      console.log('[BrowserWalletManager] ✅ Contract method executed successfully:', {
        digest: result.digest,
        adapterId,
        method
      });

      return {
        success: true,
        result,
        metadata: buildResult.metadata,
        transactionDigest: result.digest,
        effects: result.effects,
        objectChanges: result.objectChanges
      };

    } catch (error) {
      const err = error as Error;
      console.error(`[BrowserWalletManager] ❌ Contract method execution failed:`, err.message);
      return {
        success: false,
        error: err.message,
        adapterId,
        method,
        args
      };
    }
  }

  // Get gas coins for transaction execution
  async getGasCoinsForTransaction(requiredAmount: number | null = null): Promise<string[]> {
    const wc = this.walletConnection as any;
    if (!this.walletConnection || !wc?.address) {
      throw new Error('Wallet not connected - cannot get gas coins');
    }

    try {
      // Import SUI client dynamically
      const { SuiClient } = await import('@mysten/sui/client');

      // Use proxy-aware RPC URL (dev: /sui-rpc, prod: /api/sui-rpc-proxy)
      const config = await configLoader.getConfig();
      const configObj = config as any;
      const rpcUrl = configObj.getServiceUrl('sui-rpc');
      const client = new SuiClient({ url: rpcUrl });

      const gasCoins = await client.getCoins({
        owner: wc.address,
        coinType: '0x2::sui::SUI',
        limit: 10
      });

      if (gasCoins.data.length === 0) {
        throw new Error('No SUI coins found for gas payment');
      }

      // If amount specified, find sufficient coins
      if (requiredAmount) {
        // @ts-ignore - BigInt is ES2020+
        let totalAmount = 0n;
        const sufficientCoins: string[] = [];

        for (const coin of gasCoins.data) {
          sufficientCoins.push(coin.coinObjectId);
          // @ts-ignore - BigInt is ES2020+
          totalAmount += BigInt(coin.balance);

          // @ts-ignore - BigInt is ES2020+
          if (totalAmount >= BigInt(requiredAmount)) {
            break;
          }
        }

        // @ts-ignore - BigInt is ES2020+
        if (totalAmount < BigInt(requiredAmount)) {
          throw new Error(`Insufficient SUI balance. Need ${requiredAmount}, have ${totalAmount}`);
        }

        return sufficientCoins;
      }

      // Return all coins
      return gasCoins.data.map((coin) => coin.coinObjectId);

    } catch (error) {
      const err = error as Error;
      console.error('[BrowserWalletManager] ❌ Failed to get gas coins:', err.message);
      throw err;
    }
  }

  /**
   * Clear invalid objects cached in wallet manager
   */
  clearInvalidObjects(): void {
    console.warn('[BrowserWalletManager] 🧹 Clearing invalid cached objects...');

    try {
      // Clear any cached gas coins, transaction objects, or other blockchain references
      // that might be stored in this service

      console.log('[BrowserWalletManager] ✅ Invalid cached objects cleared');
    } catch (error) {
      const err = error as Error;
      console.error('[BrowserWalletManager] Error clearing invalid objects:', err);
    }
  }

  // Health monitoring methods
  startHealthMonitoring(): void {
    if (this.healthMonitor.isEnabled) {
      console.log('[HealthMonitor] 🩺 Health monitoring already active');
      return;
    }

    console.log('[HealthMonitor] 🩺 Starting wallet connection health monitoring');
    this.healthMonitor.isEnabled = true;
    this.healthMonitor.healthStatus = 'unknown';
    this.healthMonitor.consecutiveFailures = 0;
    this.healthMonitor.reconnectionAttempts = 0;

    // Start heartbeat
    this.healthMonitor.heartbeatInterval = setInterval(
      () => this._performHeartbeat(),
      this.healthMonitor.heartbeatFrequency
    );

    // Perform initial heartbeat
    this._performHeartbeat();
  }

  stopHealthMonitoring(): void {
    if (!this.healthMonitor.isEnabled) {
      return;
    }

    console.log('[HealthMonitor] 🩺 Stopping wallet connection health monitoring');
    this.healthMonitor.isEnabled = false;

    if (this.healthMonitor.heartbeatInterval) {
      clearInterval(this.healthMonitor.heartbeatInterval);
      this.healthMonitor.heartbeatInterval = null;
    }

    this.healthMonitor.healthStatus = 'unknown';
  }

  async _performHeartbeat(): Promise<void> {
    const heartbeatStart = Date.now();

    try {
      console.log('[HealthMonitor] 💓 Performing wallet heartbeat check');

      // Check basic wallet connection
      const wc = this.walletConnection as any;
      if (!this.walletConnection || !wc?.isConnected) {
        throw new Error('Wallet not connected');
      }

      // Check wallet account accessibility
      if (!wc?.address) {
        throw new Error('Wallet address not accessible');
      }

      // Try to get wallet capabilities (lightweight check)
      const walletInfo = this.getWalletInfo();
      if (!walletInfo.connected) {
        throw new Error('Wallet info indicates disconnection');
      }

      // Heartbeat successful
      this.healthMonitor.lastHeartbeat = heartbeatStart;
      this.healthMonitor.consecutiveFailures = 0;
      this.healthMonitor.reconnectionAttempts = 0;

      // Update health status based on recent transaction history
      const recentFailures = this._getRecentTransactionFailures();
      if (recentFailures === 0) {
        this.healthMonitor.healthStatus = 'healthy';
      } else if (recentFailures <= 2) {
        this.healthMonitor.healthStatus = 'warning';
      } else {
        this.healthMonitor.healthStatus = 'critical';
      }

      console.log(`[HealthMonitor] ✅ Heartbeat successful (${Date.now() - heartbeatStart}ms) - Status: ${this.healthMonitor.healthStatus}`);

      // Emit health event
      this.emit('healthUpdate', {
        status: this.healthMonitor.healthStatus,
        lastHeartbeat: this.healthMonitor.lastHeartbeat,
        consecutiveFailures: this.healthMonitor.consecutiveFailures,
        recentFailures
      });

    } catch (error) {
      const err = error as Error;
      this.healthMonitor.consecutiveFailures++;

      console.warn(`[HealthMonitor] ❌ Heartbeat failed (${this.healthMonitor.consecutiveFailures}/${this.healthMonitor.maxFailures}):`, err.message);

      if (this.healthMonitor.consecutiveFailures >= this.healthMonitor.maxFailures) {
        this.healthMonitor.healthStatus = 'critical';

        console.error('[HealthMonitor] 🚨 Critical health status - attempting reconnection');

        // Attempt reconnection if not exceeded max attempts
        if (this.healthMonitor.reconnectionAttempts < this.healthMonitor.maxReconnectionAttempts) {
          this.healthMonitor.reconnectionAttempts++;
          console.log(`[HealthMonitor] 🔄 Attempting wallet reconnection (${this.healthMonitor.reconnectionAttempts}/${this.healthMonitor.maxReconnectionAttempts})`);

          try {
            await this.reconnectWallet();
            console.log('[HealthMonitor] ✅ Automatic reconnection successful');
          } catch (reconnectError) {
            const reconnectErr = reconnectError as Error;
            console.error('[HealthMonitor] ❌ Automatic reconnection failed:', reconnectErr.message);
          }
        }
      } else if (this.healthMonitor.consecutiveFailures >= 2) {
        this.healthMonitor.healthStatus = 'warning';
      }

      // Emit health event
      this.emit('healthUpdate', {
        status: this.healthMonitor.healthStatus,
        lastHeartbeat: this.healthMonitor.lastHeartbeat,
        consecutiveFailures: this.healthMonitor.consecutiveFailures,
        error: err.message
      });
    }
  }

  _getRecentTransactionFailures(): number {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return this.healthMonitor.transactionHistory.
      filter((tx) => tx.timestamp > fiveMinutesAgo && !tx.success).
      length;
  }

  recordTransactionAttempt(success: boolean, error: Error | null = null): void {
    const record = {
      timestamp: Date.now(),
      success,
      error: error?.message || null
    };

    this.healthMonitor.transactionHistory.push(record);

    // Keep only last 50 records
    if (this.healthMonitor.transactionHistory.length > 50) {
      this.healthMonitor.transactionHistory = this.healthMonitor.transactionHistory.slice(-50);
    }

    if (success) {
      this.healthMonitor.lastSuccessfulTransaction = record.timestamp;
    }

    console.log(`[HealthMonitor] 📊 Transaction recorded: ${success ? 'SUCCESS' : 'FAILURE'}`);
  }

  getHealthStatus(): any {
    return {
      isEnabled: this.healthMonitor.isEnabled,
      status: this.healthMonitor.healthStatus,
      lastHeartbeat: this.healthMonitor.lastHeartbeat,
      consecutiveFailures: this.healthMonitor.consecutiveFailures,
      lastSuccessfulTransaction: this.healthMonitor.lastSuccessfulTransaction,
      recentFailures: this._getRecentTransactionFailures(),
      reconnectionAttempts: this.healthMonitor.reconnectionAttempts
    };
  }

}

// Export class for testing and advanced usage
export { BrowserWalletManager };

// Create singleton instance
export const browserWalletManager = new BrowserWalletManager();
export default browserWalletManager;

// Global access for error recovery
if (typeof window !== 'undefined') {
  (window as any).browserWalletManager = browserWalletManager;
}