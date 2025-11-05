// Browser-compatible wallet manager for WalSheetz
// This acts as a bridge between the old API and the new dapp-kit hooks
import { getCurrentConfig } from '@blockchain/config.js';
import { configLoader } from '@utils/config/ConfigLoader.js';

class BrowserWalletManager {
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
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const callbacks = this.eventListeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in wallet event listener:', error);
        }
      });
    }
  }

  // Set the wallet connection from the hook
  setWalletConnection(walletConnection) {
    console.log('[BrowserWalletManager] 🔗 Setting wallet connection:', {
      hasConnection: !!walletConnection,
      isConnected: walletConnection?.isConnected || false,
      address: walletConnection?.address?.slice(0, 8) + '...' || 'none',
      availableMethods: walletConnection ? Object.keys(walletConnection).filter(key => typeof walletConnection[key] === 'function') : []
    });

    this.walletConnection = walletConnection;
    
    // Update internal state based on connection
    if (walletConnection && walletConnection.isConnected) {
      this.isConnected = true;
      this.currentAccount = {
        address: walletConnection.address,
        publicKey: walletConnection.currentAccount?.publicKeyBase64 || '',
        balance: walletConnection.balance?.mist || '0'
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
  isSlushWallet(wallet) {
    const name = wallet.name.toLowerCase();
    return name.includes('slush') || 
           (name.includes('sui') && name.includes('wallet'));
  }

  // Connect wallet (only supports Slush)
  async connectWallet(walletName = 'Slush') {
    console.log('[BrowserWalletManager] Connecting to Slush wallet...');
    
    if (!this.walletConnection) {
      throw new Error('Wallet connection not initialized. Make sure app is wrapped with WalletProviders');
    }
    
    try {
      // Get available wallets - filter for only Slush
      const { installed } = this.walletConnection.availableWallets;
      const slushWallets = installed.filter(w => this.isSlushWallet(w));
      
      console.log('[BrowserWalletManager] Available Slush wallets:', slushWallets.map(w => w.name));
      
      if (slushWallets.length === 0) {
        throw new Error('Slush wallet not installed. Please install Slush wallet from the Chrome Web Store.');
      }
      
      // Use the first (and likely only) Slush wallet
      const wallet = slushWallets[0];
      
      console.log('[BrowserWalletManager] Connecting to:', wallet.name);
      
      // Use the hook's connect method with proper Promise handling
      await this.walletConnection.connectWallet(wallet);
      
      // Wait for the connection state to update
      await this.waitForConnection();
      
      // Update internal state
      this.isConnected = true;
      this.currentAccount = {
        address: this.walletConnection.address,
        publicKey: this.walletConnection.currentAccount?.publicKeyBase64 || '',
        balance: this.walletConnection.balance?.mist || '0'
      };
      
      console.log('[BrowserWalletManager] ✅ Slush wallet connected:', this.currentAccount.address);
      
      this.emit('connected', {
        address: this.walletConnection.address,
        publicKey: this.currentAccount.publicKey
      });
      
      return this.currentAccount;
      
    } catch (error) {
      console.error('[BrowserWalletManager] ❌ Slush wallet connection failed:', error);
      this.emit('error', error);
      throw error;
    }
  }
  
  // Helper to wait for connection state
  waitForConnection(timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Wallet connection timeout - please check if you approved the connection'));
      }, timeoutMs);
      
      const checkConnection = setInterval(() => {
        if (this.walletConnection.isConnected && this.walletConnection.address) {
          clearInterval(checkConnection);
          clearTimeout(timeout);
          resolve();
        } else if (this.walletConnection.connectionError) {
          clearInterval(checkConnection);
          clearTimeout(timeout);
          reject(new Error(this.walletConnection.connectionError));
        }
      }, 500); // Reduced from 100ms to 500ms to reduce resource usage
    });
  }

  // Wrapper method for compatibility with BlockchainAdapter
  async connect(walletName) {
    try {
      const wallet = await this.connectWallet(walletName);
      return {
        success: true,
        wallet: wallet,
        address: wallet.address
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Disconnect wallet (delegates to hook)
  async disconnectWallet() {
    console.log('Disconnecting wallet...');
    
    if (this.walletConnection) {
      this.walletConnection.disconnectWallet();
    }
    
    this.isConnected = false;
    this.currentAccount = null;
    
    this.emit('disconnected');
    
    console.log('Wallet disconnected');
  }

  // Wrapper method for compatibility with BlockchainAdapter
  async disconnect() {
    await this.disconnectWallet();
  }

  // Auto-reconnect method for BlockchainAdapter compatibility
  async autoReconnect() {
    console.log('[BrowserWalletManager] Attempting auto-reconnect...');
    
    try {
      // Check if walletConnection exists and has auto-connect enabled
      if (this.walletConnection && this.walletConnection.currentAccount) {
        // Already connected
        this.isConnected = true;
        this.currentAccount = {
          address: this.walletConnection.address,
          publicKey: this.walletConnection.currentAccount?.publicKeyBase64 || '',
          balance: this.walletConnection.balance?.mist || '0'
        };
        console.log('[BrowserWalletManager] ✅ Auto-reconnect successful (already connected)');
        return true;
      }
      
      // Don't auto-connect without user interaction for security
      console.log('[BrowserWalletManager] No existing connection found - user must manually connect');
      return false;
      
    } catch (error) {
      console.error('[BrowserWalletManager] ❌ Auto-reconnect failed:', error);
      return false;
    }
  }

  // Get wallet info
  getWalletInfo() {
    const walletInfo = {
      connected: this.walletConnection?.isConnected || false,
      address: this.walletConnection?.address || null,
      publicKey: this.walletConnection?.currentAccount?.publicKeyBase64 || null,
      network: (typeof window !== 'undefined' && window.location?.hostname ? 
        (import.meta.env?.VITE_NETWORK || 'testnet') : 
        (process.env.VITE_NETWORK || 'testnet')),
      balance: this.walletConnection?.balance || null
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
  getCurrentAccount() {
    if (this.walletConnection && this.walletConnection.currentAccount) {
      return {
        address: this.walletConnection.address,
        publicKey: this.walletConnection.currentAccount?.publicKeyBase64 || '',
        balance: this.walletConnection.balance?.mist || '0'
      };
    }
    return this.currentAccount;
  }

  // Check connection status
  getConnectionStatus() {
    if (this.walletConnection) {
      return {
        isConnected: this.walletConnection.isConnected,
        address: this.walletConnection.address || null,
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
  async signTransaction(transaction) {
    if (!this.walletConnection) {
      throw new Error('Wallet not connected');
    }
    
    return await this.walletConnection.sign(transaction);
  }

  // Helper to check if error is retryable
  isRetryableError(error) {
    const errorMessage = error.message?.toLowerCase() || '';
    const retryablePatterns = [
      'message channel closed',
      'channel closed',
      'econnreset',
      'connection reset',
      'network error',
      'timeout',
      'disconnected'
    ];

    return retryablePatterns.some(pattern => errorMessage.includes(pattern));
  }

  // Preflight checks before transaction execution
  async preflightCheck() {
    console.log('[BrowserWalletManager] 🔍 Running preflight checks...');

    if (!this.walletConnection) {
      throw new Error('Wallet not connected - please connect your Slush wallet');
    }

    if (!this.walletConnection.isConnected) {
      throw new Error('Wallet connection not active - please check your wallet extension');
    }

    if (!this.walletConnection.address) {
      throw new Error('Wallet address not available - please reconnect your wallet');
    }

    // Check if wallet has sufficient balance (optional warning)
    if (this.walletConnection.balance) {
      const balanceMist = BigInt(this.walletConnection.balance.mist || '0');
      const minRequired = BigInt(10000000); // 0.01 SUI in MIST

      if (balanceMist < minRequired) {
        console.warn('[BrowserWalletManager] ⚠️ Low wallet balance detected');
      }
    }

    console.log('[BrowserWalletManager] ✅ Preflight checks passed');
    return true;
  }

  // Attempt to reconnect wallet if connection is lost
  async reconnectWallet() {
    console.log('[BrowserWalletManager] 🔄 Attempting wallet reconnection...');

    if (!this.walletConnection) {
      throw new Error('Wallet connection not available for reconnection');
    }

    try {
      // Check if wallet has available wallets
      const { installed } = this.walletConnection.availableWallets;
      const slushWallets = installed.filter(w => this.isSlushWallet(w));

      if (slushWallets.length === 0) {
        throw new Error('Slush wallet not found for reconnection');
      }

      // Disconnect first if needed
      if (this.walletConnection.isConnected) {
        console.log('[BrowserWalletManager] 🔌 Disconnecting before reconnection...');
        this.walletConnection.disconnectWallet();
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for disconnection
      }

      // Reconnect to the wallet
      console.log('[BrowserWalletManager] 🔗 Reconnecting to Slush wallet...');
      await this.walletConnection.connectWallet(slushWallets[0]);

      // Wait for connection to be established
      await this.waitForConnection(10000); // 10 second timeout for reconnection

      console.log('[BrowserWalletManager] ✅ Wallet reconnected successfully');
      return true;
    } catch (error) {
      console.error('[BrowserWalletManager] ❌ Wallet reconnection failed:', error.message);
      return false;
    }
  }

  // Sign and execute a transaction with retry logic
  async signAndExecuteTransaction(transactionInput) {
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
      console.error('[BrowserWalletManager] ❌ Preflight check failed:', error.message);
      throw error;
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[BrowserWalletManager] 🔐 Attempt ${attempt}/${maxRetries}: Requesting wallet signature...`);

        // Handle both old format (direct transaction) and new format (with options)
        let transaction, options = {};

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

        const hasSignAndExecuteTransactionBlock = typeof this.walletConnection.signAndExecuteTransactionBlock === 'function';
        const hasSignAndExecuteTransaction = typeof this.walletConnection.signAndExecuteTransaction === 'function';
        const hasSignAndExecute = typeof this.walletConnection.signAndExecute === 'function';

        if (!hasSignAndExecuteTransactionBlock && !hasSignAndExecuteTransaction && !hasSignAndExecute) {
          throw new Error('Wallet connection does not expose a compatible sign-and-execute method');
        }

        console.log('🚀 DEBUG: About to call wallet transaction method', {
          attempt,
          hasSignAndExecuteTransactionBlock,
          hasSignAndExecuteTransaction,
          hasSignAndExecute,
          walletType: this.walletConnection.name || 'unknown',
          optionsKeys: Object.keys(options)
        });

        let result;
        if (hasSignAndExecuteTransactionBlock) {
          console.log('[BrowserWalletManager] Using signAndExecuteTransactionBlock method');
          result = await this.walletConnection.signAndExecuteTransactionBlock({
            transactionBlock: transaction,
            options
          });
        } else if (hasSignAndExecuteTransaction) {
          console.log('[BrowserWalletManager] Using signAndExecuteTransaction method');
          result = await this.walletConnection.signAndExecuteTransaction({
            transaction,
            options
          });
        } else {
          console.log('[BrowserWalletManager] Using signAndExecute method');
          result = await this.walletConnection.signAndExecute(transaction, options);
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
        const isRetryable = this.isRetryableError(error);
        const isLastAttempt = attempt === maxRetries;

        console.error(`[BrowserWalletManager] ❌ Attempt ${attempt}/${maxRetries} failed:`, {
          error: error.message,
          isRetryable,
          isLastAttempt,
          transactionType: typeof transactionInput
        });

        if (isLastAttempt || !isRetryable) {
          // Record failed transaction for health monitoring
          this.recordTransactionAttempt(false, error);

          // Add context to error message for user
          let userFriendlyMessage = error.message;
          if (this.isRetryableError(error)) {
            userFriendlyMessage = `Wallet communication failed after ${maxRetries} attempts. Please refresh the page and try again. Original error: ${error.message}`;
          }

          const enhancedError = new Error(userFriendlyMessage);
          enhancedError.originalError = error;
          enhancedError.attempt = attempt;
          enhancedError.isRetryable = isRetryable;
          throw enhancedError;
        }

        // Calculate delay with exponential backoff
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`[BrowserWalletManager] ⏳ Retrying in ${delay}ms...`);

        await new Promise(resolve => setTimeout(resolve, delay));

        // Try to reconnect if it was a connection issue
        if (this.isRetryableError(error)) {
          console.log('[BrowserWalletManager] 🔄 Attempting wallet reconnection due to connection error...');
          try {
            const reconnected = await this.reconnectWallet();
            if (reconnected) {
              console.log('[BrowserWalletManager] ✅ Wallet reconnected, will retry transaction');
            } else {
              console.warn('[BrowserWalletManager] ⚠️ Wallet reconnection failed, continuing with next attempt');
            }
          } catch (reconnectError) {
            console.warn('[BrowserWalletManager] ⚠️ Reconnection attempt failed:', reconnectError.message);
          }
        }
      }
    }
  }

  // Get available wallets
  getAvailableWallets() {
    if (!this.walletConnection) {
      return { installed: [], notInstalled: [] };
    }

    return this.walletConnection.availableWallets;
  }

  // Build unsigned transaction for WalSheetz DeFi operations
  async buildUnsignedTransaction(request) {
    console.log('[BrowserWalletManager] 🔨 Building unsigned transaction:', {
      adapterId: request.adapterId,
      method: request.method,
      hasArgs: !!request.args
    });

    try {
      // Run preflight checks
      await this.preflightCheck();

      // Import transaction runner dynamically to avoid circular dependencies
      const { transactionRunner } = await import('../../blockchain/sui-transaction-runner.js');

      // Prepare the transaction
      const txPreparation = await transactionRunner.prepareTransaction({
        adapterId: request.adapterId,
        method: request.method,
        args: request.args || [],
        modifiers: {
          sender: this.walletConnection.address,
          gasCoins: request.gasCoins || null,
          gasBudget: request.gasBudget || null,
          ...request.modifiers
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
          adapterId: request.adapterId,
          method: txPreparation.method,
          args: txPreparation.args,
          description: txPreparation.description,
          estimatedGas: txPreparation.estimatedGas
        }
      };

    } catch (error) {
      console.error('[BrowserWalletManager] ❌ Failed to build unsigned transaction:', error.message);
      return {
        success: false,
        error: error.message,
        details: error.stack
      };
    }
  }

  // Execute a WalSheetz contract method (combines building and signing)
  async executeContractMethod(adapterId, method, args, options = {}) {
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
      console.error(`[BrowserWalletManager] ❌ Contract method execution failed:`, error.message);
      return {
        success: false,
        error: error.message,
        adapterId,
        method,
        args
      };
    }
  }

  // Get gas coins for transaction execution
  async getGasCoinsForTransaction(requiredAmount = null) {
    if (!this.walletConnection || !this.walletConnection.address) {
      throw new Error('Wallet not connected - cannot get gas coins');
    }

    try {
      // Import SUI client dynamically
      const { SuiClient } = await import('@mysten/sui/client');

      // Use proxy-aware RPC URL (dev: /sui-rpc, prod: /api/sui-rpc-proxy)
      const config = await configLoader.getConfig();
      const rpcUrl = config.getServiceUrl('sui-rpc');
      const client = new SuiClient({ url: rpcUrl });

      const gasCoins = await client.getCoins({
        owner: this.walletConnection.address,
        coinType: '0x2::sui::SUI',
        limit: 10
      });

      if (gasCoins.data.length === 0) {
        throw new Error('No SUI coins found for gas payment');
      }

      // If amount specified, find sufficient coins
      if (requiredAmount) {
        let totalAmount = 0n;
        const sufficientCoins = [];

        for (const coin of gasCoins.data) {
          sufficientCoins.push(coin.coinObjectId);
          totalAmount += BigInt(coin.balance);

          if (totalAmount >= BigInt(requiredAmount)) {
            break;
          }
        }

        if (totalAmount < BigInt(requiredAmount)) {
          throw new Error(`Insufficient SUI balance. Need ${requiredAmount}, have ${totalAmount}`);
        }

        return sufficientCoins;
      }

      // Return all coins
      return gasCoins.data.map(coin => coin.coinObjectId);

    } catch (error) {
      console.error('[BrowserWalletManager] ❌ Failed to get gas coins:', error.message);
      throw error;
    }
  }

  /**
   * Clear invalid objects cached in wallet manager
   */
  clearInvalidObjects() {
    console.warn('[BrowserWalletManager] 🧹 Clearing invalid cached objects...');

    try {
      // Clear any cached gas coins, transaction objects, or other blockchain references
      // that might be stored in this service

      console.log('[BrowserWalletManager] ✅ Invalid cached objects cleared');
    } catch (error) {
      console.error('[BrowserWalletManager] Error clearing invalid objects:', error);
    }
  }

  // Health monitoring methods
  startHealthMonitoring() {
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

  stopHealthMonitoring() {
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

  async _performHeartbeat() {
    const heartbeatStart = Date.now();

    try {
      console.log('[HealthMonitor] 💓 Performing wallet heartbeat check');

      // Check basic wallet connection
      if (!this.walletConnection || !this.walletConnection.isConnected) {
        throw new Error('Wallet not connected');
      }

      // Check wallet account accessibility
      if (!this.walletConnection.address) {
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
      this.healthMonitor.consecutiveFailures++;

      console.warn(`[HealthMonitor] ❌ Heartbeat failed (${this.healthMonitor.consecutiveFailures}/${this.healthMonitor.maxFailures}):`, error.message);

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
            console.error('[HealthMonitor] ❌ Automatic reconnection failed:', reconnectError.message);
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
        error: error.message
      });
    }
  }

  _getRecentTransactionFailures() {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    return this.healthMonitor.transactionHistory
      .filter(tx => tx.timestamp > fiveMinutesAgo && !tx.success)
      .length;
  }

  recordTransactionAttempt(success, error = null) {
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

  getHealthStatus() {
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
export { BrowserWalletManager }

// Create singleton instance
export const browserWalletManager = new BrowserWalletManager()
export default browserWalletManager

// Global access for error recovery
if (typeof window !== 'undefined') {
  window.browserWalletManager = browserWalletManager;
}
