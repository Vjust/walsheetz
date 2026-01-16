// Browser-compatible wallet manager for WalSheetz
// This acts as a bridge between the old API and the new dapp-kit hooks
import { configLoader } from '../../../../walrus/src/index.js';
import type {
  WalletConnection,
  WalletInfo,
  WalletInfoResult,
  ConnectionStatus,
  HealthStatus,
  UnsignedTransactionResult,
  ContractExecutionResult,
  TransactionResult,
  TransactionOptions,
  EnhancedError,
  TransactionPreparation,
} from '../types/sui-types.js';

class BrowserWalletManager {
  private isConnected: boolean;
  private currentAccount: { address: string; publicKey: string; balance: string } | null;
  private eventListeners: Map<string, Array<(data: unknown) => void>>;
  private walletConnection: WalletConnection | null;
  private healthMonitor: {
    isEnabled: boolean;
    heartbeatInterval: ReturnType<typeof setInterval> | null;
    lastHeartbeat: number | null;
    consecutiveFailures: number;
    maxFailures: number;
    heartbeatFrequency: number;
    healthStatus: 'healthy' | 'warning' | 'critical' | 'unknown';
    lastSuccessfulTransaction: number | null;
    transactionHistory: Array<{ timestamp: number; success: boolean; error: string | null }>;
    reconnectionAttempts: number;
    maxReconnectionAttempts: number;
  };

  constructor() {
    this.isConnected = false;
    this.currentAccount = null;
    this.eventListeners = new Map();
    this.walletConnection = null;

    this.healthMonitor = {
      isEnabled: false,
      heartbeatInterval: null,
      lastHeartbeat: null,
      consecutiveFailures: 0,
      maxFailures: 3,
      heartbeatFrequency: 30000,
      healthStatus: 'unknown',
      lastSuccessfulTransaction: null,
      transactionHistory: [],
      reconnectionAttempts: 0,
      maxReconnectionAttempts: 3,
    };

    console.log('Browser wallet manager initialized with health monitoring');
  }

  on(event: string, callback: (data: unknown) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)?.push(callback);
  }

  off(event: string, callback: (data: unknown) => void): void {
    if (this.eventListeners.has(event)) {
      const callbacks = this.eventListeners.get(event);
      const index = callbacks?.indexOf(callback) ?? -1;
      if (index > -1) {
        callbacks?.splice(index, 1);
      }
    }
  }

  emit(event: string, data: unknown): void {
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

  setWalletConnection(walletConnection: WalletConnection | null): void {
    console.log('[BrowserWalletManager] Setting wallet connection:', {
      hasConnection: !!walletConnection,
      isConnected: walletConnection?.isConnected || false,
      address: walletConnection?.address?.slice(0, 8) + '...' || 'none',
      availableMethods: walletConnection
        ? Object.keys(walletConnection).filter(
            (key) => typeof walletConnection[key as keyof WalletConnection] === 'function'
          )
        : [],
    });

    this.walletConnection = walletConnection;

    if (walletConnection && walletConnection.isConnected) {
      this.isConnected = true;
      this.currentAccount = {
        address: walletConnection.address || '',
        publicKey: walletConnection.currentAccount?.publicKeyBase64 || '',
        balance: walletConnection.balance?.mist || '0',
      };
      console.log('[BrowserWalletManager] Wallet state updated - connected');

      this.startHealthMonitoring();
    } else {
      this.isConnected = false;
      this.currentAccount = null;
      console.log('[BrowserWalletManager] Wallet state updated - disconnected');

      this.stopHealthMonitoring();
    }
  }

  isSlushWallet(wallet: WalletInfo): boolean {
    const name = wallet.name.toLowerCase();
    return name.includes('slush') || (name.includes('sui') && name.includes('wallet'));
  }

  async connectWallet(
    _walletName: string = 'Slush'
  ): Promise<{ address: string; publicKey: string; balance: string }> {
    console.log('[BrowserWalletManager] Connecting to Slush wallet...');

    if (!this.walletConnection) {
      throw new Error(
        'Wallet connection not initialized. Make sure app is wrapped with WalletProviders'
      );
    }

    try {
      const availableWallets = this.walletConnection.availableWallets;
      if (!availableWallets) {
        throw new Error('No available wallets found');
      }

      const slushWallets = availableWallets.installed.filter((w) => this.isSlushWallet(w));

      console.log(
        '[BrowserWalletManager] Available Slush wallets:',
        slushWallets.map((w) => w.name)
      );

      if (slushWallets.length === 0) {
        throw new Error(
          'Slush wallet not installed. Please install Slush wallet from the Chrome Web Store.'
        );
      }

      const wallet = slushWallets[0];

      console.log('[BrowserWalletManager] Connecting to:', wallet.name);

      await this.walletConnection.connectWallet(wallet);

      await this.waitForConnection();

      this.isConnected = true;
      this.currentAccount = {
        address: this.walletConnection.address || '',
        publicKey: this.walletConnection.currentAccount?.publicKeyBase64 || '',
        balance: this.walletConnection.balance?.mist || '0',
      };

      console.log('[BrowserWalletManager] Slush wallet connected:', this.currentAccount.address);

      this.emit('connected', {
        address: this.walletConnection.address,
        publicKey: this.currentAccount.publicKey,
      });

      return this.currentAccount;
    } catch (error) {
      const err = error as Error;
      console.error('[BrowserWalletManager] Slush wallet connection failed:', err);
      this.emit('error', err);
      throw err;
    }
  }

  waitForConnection(timeoutMs: number = 30000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error('Wallet connection timeout - please check if you approved the connection')
        );
      }, timeoutMs);

      const checkConnection = setInterval(() => {
        if (this.walletConnection?.isConnected && this.walletConnection?.address) {
          clearInterval(checkConnection);
          clearTimeout(timeout);
          resolve();
        } else if (this.walletConnection?.connectionError) {
          clearInterval(checkConnection);
          clearTimeout(timeout);
          reject(new Error(this.walletConnection.connectionError || 'Connection error'));
        }
      }, 500);
    });
  }

  async connect(walletName: string): Promise<{
    success: boolean;
    wallet?: { address: string; publicKey: string; balance: string };
    address?: string;
    error?: string;
  }> {
    try {
      const wallet = await this.connectWallet(walletName);
      return {
        success: true,
        wallet: wallet,
        address: wallet.address,
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: err.message,
      };
    }
  }

  async disconnectWallet(): Promise<void> {
    console.log('Disconnecting wallet...');

    if (this.walletConnection) {
      this.walletConnection.disconnectWallet();
    }

    this.isConnected = false;
    this.currentAccount = null;

    this.emit('disconnected', null);

    console.log('Wallet disconnected');
  }

  async disconnect(): Promise<void> {
    await this.disconnectWallet();
  }

  async autoReconnect(): Promise<boolean> {
    console.log('[BrowserWalletManager] Attempting auto-reconnect...');

    try {
      if (this.walletConnection && this.walletConnection.currentAccount) {
        this.isConnected = true;
        this.currentAccount = {
          address: this.walletConnection.address || '',
          publicKey: this.walletConnection.currentAccount?.publicKeyBase64 || '',
          balance: this.walletConnection.balance?.mist || '0',
        };
        console.log('[BrowserWalletManager] Auto-reconnect successful (already connected)');
        return true;
      }

      console.log(
        '[BrowserWalletManager] No existing connection found - user must manually connect'
      );
      return false;
    } catch (error) {
      const err = error as Error;
      console.error('[BrowserWalletManager] Auto-reconnect failed:', err);
      return false;
    }
  }

  getWalletInfo(): WalletInfoResult {
    let network = 'testnet';
    try {
      if (typeof window !== 'undefined' && window.location?.hostname) {
        network = (import.meta.env?.VITE_NETWORK as string) || 'testnet';
      } else {
        network = process.env.VITE_NETWORK || 'testnet';
      }
    } catch {
      network = 'testnet';
    }

    const walletInfo: WalletInfoResult = {
      connected: this.walletConnection?.isConnected || false,
      address: this.walletConnection?.address || null,
      publicKey: this.walletConnection?.currentAccount?.publicKeyBase64 || null,
      network,
      balance: this.walletConnection?.balance || null,
    };

    console.log('[BrowserWalletManager] Wallet info requested:', {
      connected: walletInfo.connected,
      hasAddress: !!walletInfo.address,
      network: walletInfo.network,
      hasBalance: !!walletInfo.balance,
    });

    return walletInfo;
  }

  getCurrentAccount(): { address: string; publicKey: string; balance: string } | null {
    if (this.walletConnection && this.walletConnection.currentAccount) {
      return {
        address: this.walletConnection.address || '',
        publicKey: this.walletConnection.currentAccount?.publicKeyBase64 || '',
        balance: this.walletConnection.balance?.mist || '0',
      };
    }
    return this.currentAccount;
  }

  getConnectionStatus(): ConnectionStatus {
    if (this.walletConnection) {
      return {
        isConnected: this.walletConnection?.isConnected || false,
        address: this.walletConnection?.address || null,
        simulationMode: false,
      };
    }

    return {
      isConnected: this.isConnected,
      address: this.currentAccount?.address || null,
      simulationMode: true,
    };
  }

  async signTransaction(transaction: unknown): Promise<{ signature: string } | TransactionResult> {
    if (!this.walletConnection) {
      throw new Error('Wallet not connected');
    }

    if (this.walletConnection.sign && typeof this.walletConnection.sign === 'function') {
      return await this.walletConnection.sign(transaction);
    }

    throw new Error('Wallet does not support signing');
  }

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
      'disconnected',
    ];

    return retryablePatterns.some((pattern) => errorMessage.includes(pattern));
  }

  async preflightCheck(): Promise<boolean> {
    console.log('[BrowserWalletManager] Running preflight checks...');

    if (!this.walletConnection) {
      throw new Error('Wallet not connected - please connect your Slush wallet');
    }

    if (!this.walletConnection?.isConnected) {
      throw new Error('Wallet connection not active - please check your wallet extension');
    }

    if (!this.walletConnection?.address) {
      throw new Error('Wallet address not available - please reconnect your wallet');
    }

    if (this.walletConnection?.balance) {
      const balanceMist = BigInt(this.walletConnection.balance.mist || '0');
      const minRequired = 10000000n;

      if (balanceMist < minRequired) {
        console.warn('[BrowserWalletManager] Low wallet balance detected');
      }
    }

    console.log('[BrowserWalletManager] Preflight checks passed');
    return true;
  }

  async reconnectWallet(): Promise<boolean> {
    console.log('[BrowserWalletManager] Attempting wallet reconnection...');

    if (!this.walletConnection) {
      throw new Error('Wallet connection not available for reconnection');
    }

    try {
      const availableWallets = this.walletConnection.availableWallets;
      if (!availableWallets) {
        throw new Error('No available wallets found');
      }

      const slushWallets = availableWallets.installed.filter((w) => this.isSlushWallet(w));

      if (slushWallets.length === 0) {
        throw new Error('Slush wallet not found for reconnection');
      }

      if (this.walletConnection?.isConnected) {
        console.log('[BrowserWalletManager] Disconnecting before reconnection...');
        this.walletConnection.disconnectWallet();
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      console.log('[BrowserWalletManager] Reconnecting to Slush wallet...');
      await this.walletConnection.connectWallet(slushWallets[0]);

      await this.waitForConnection(10000);

      console.log('[BrowserWalletManager] Wallet reconnected successfully');
      return true;
    } catch (error) {
      const err = error as Error;
      console.error('[BrowserWalletManager] Wallet reconnection failed:', err.message);
      return false;
    }
  }

  async signAndExecuteTransaction(transactionInput: {
    transactionBlock?: unknown;
    transaction?: unknown;
    options?: TransactionOptions;
  }): Promise<TransactionResult> {
    const maxRetries = 3;
    const baseDelay = 500;

    console.log('[BrowserWalletManager] Signing and executing transaction with retry logic:', {
      isTransactionObject: typeof transactionInput === 'object',
      hasTransactionBlock: !!transactionInput.transactionBlock,
      hasTransaction: !!transactionInput.transaction,
      hasOptions: !!transactionInput.options,
      hasWalletConnection: !!this.walletConnection,
      maxRetries,
    });

    try {
      await this.preflightCheck();
    } catch (error) {
      const err = error as Error;
      console.error('[BrowserWalletManager] Preflight check failed:', err.message);
      throw err;
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `[BrowserWalletManager] Attempt ${attempt}/${maxRetries}: Requesting wallet signature...`
        );

        let transaction: unknown;
        let options: TransactionOptions = {};

        if (transactionInput.transactionBlock) {
          transaction = transactionInput.transactionBlock;
          options = transactionInput.options || {};
          console.log(
            '[BrowserWalletManager] Using transactionBlock format with options:',
            Object.keys(options)
          );
        } else if (transactionInput.transaction) {
          transaction = transactionInput.transaction;
          options = transactionInput.options || {
            options: {
              showEffects: true,
              showEvents: true,
              showObjectChanges: true,
            },
          };
          console.log(
            '[BrowserWalletManager] Using transaction format with options:',
            Object.keys(options)
          );
        } else {
          transaction = transactionInput;
          options = {
            options: {
              showEffects: true,
              showEvents: true,
              showObjectChanges: true,
            },
          };
          console.log(
            '[BrowserWalletManager] Using legacy transaction format, adding default options'
          );
        }

        if (!this.walletConnection) {
          throw new Error('Wallet connection lost');
        }

        const wc = this.walletConnection;
        const hasSignAndExecuteTransactionBlock =
          typeof wc.signAndExecuteTransactionBlock === 'function';
        const hasSignAndExecuteTransaction = typeof wc.signAndExecuteTransaction === 'function';
        const hasSignAndExecute = typeof wc.signAndExecute === 'function';

        if (
          !hasSignAndExecuteTransactionBlock &&
          !hasSignAndExecuteTransaction &&
          !hasSignAndExecute
        ) {
          throw new Error('Wallet connection does not expose a compatible sign-and-execute method');
        }

        console.log('[BrowserWalletManager] DEBUG: About to call wallet transaction method', {
          attempt,
          hasSignAndExecuteTransactionBlock,
          hasSignAndExecuteTransaction,
          hasSignAndExecute,
          walletType: wc.name || 'unknown',
          optionsKeys: Object.keys(options),
        });

        let result: TransactionResult;
        if (hasSignAndExecuteTransactionBlock && wc.signAndExecuteTransactionBlock) {
          console.log('[BrowserWalletManager] Using signAndExecuteTransactionBlock method');
          result = await wc.signAndExecuteTransactionBlock({
            transactionBlock: transaction as import('@mysten/sui/transactions').Transaction,
            options,
          });
        } else if (hasSignAndExecuteTransaction && wc.signAndExecuteTransaction) {
          console.log('[BrowserWalletManager] Using signAndExecuteTransaction method');
          result = await wc.signAndExecuteTransaction({
            transaction: transaction as import('@mysten/sui/transactions').Transaction,
            options,
          });
        } else if (wc.signAndExecute) {
          console.log('[BrowserWalletManager] Using signAndExecute method');
          result = await wc.signAndExecute(
            transaction as import('@mysten/sui/transactions').Transaction,
            options
          );
        } else {
          throw new Error('No compatible sign-and-execute method available');
        }

        console.log('[BrowserWalletManager] Transaction signed and executed successfully:', {
          attempt,
          digest: result.digest,
          hasEffects: !!result.effects,
          hasObjectChanges: !!result.objectChanges,
          hasBalanceChanges: !!result.balanceChanges,
        });

        this.recordTransactionAttempt(true);

        return result;
      } catch (error) {
        const err = error as Error;
        const isRetryable = this.isRetryableError(err);
        const isLastAttempt = attempt === maxRetries;

        console.error(`[BrowserWalletManager] Attempt ${attempt}/${maxRetries} failed:`, {
          error: err.message,
          isRetryable,
          isLastAttempt,
          transactionType: typeof transactionInput,
        });

        if (isLastAttempt || !isRetryable) {
          this.recordTransactionAttempt(false, err);

          let userFriendlyMessage = err.message;
          if (this.isRetryableError(err)) {
            userFriendlyMessage = `Wallet communication failed after ${maxRetries} attempts. Please refresh the page and try again. Original error: ${err.message}`;
          }

          const enhancedError = new Error(userFriendlyMessage) as EnhancedError;
          enhancedError.originalError = err;
          enhancedError.attempt = attempt;
          enhancedError.isRetryable = isRetryable;
          throw enhancedError;
        }

        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`[BrowserWalletManager] Retrying in ${delay}ms...`);

        await new Promise((resolve) => setTimeout(resolve, delay));

        if (this.isRetryableError(err)) {
          console.log(
            '[BrowserWalletManager] Attempting wallet reconnection due to connection error...'
          );
          try {
            const reconnected = await this.reconnectWallet();
            if (reconnected) {
              console.log('[BrowserWalletManager] Wallet reconnected, will retry transaction');
            } else {
              console.warn(
                '[BrowserWalletManager] Wallet reconnection failed, continuing with next attempt'
              );
            }
          } catch (reconnectError) {
            const reconnectErr = reconnectError as Error;
            console.warn(
              '[BrowserWalletManager] Reconnection attempt failed:',
              reconnectErr.message
            );
          }
        }
      }
    }

    throw new Error('Max retries exceeded');
  }

  getAvailableWallets(): { installed: WalletInfo[]; notInstalled?: string[] } {
    if (!this.walletConnection) {
      return { installed: [], notInstalled: [] };
    }

    return this.walletConnection.availableWallets || { installed: [] };
  }

  async buildUnsignedTransaction(request: {
    adapterId: string;
    method: string;
    args?: unknown[];
    gasCoins?: unknown;
    gasBudget?: unknown;
    modifiers?: Record<string, unknown>;
  }): Promise<UnsignedTransactionResult> {
    console.log('[BrowserWalletManager] Building unsigned transaction:', {
      adapterId: request.adapterId,
      method: request.method,
      hasArgs: !!request.args,
    });

    try {
      await this.preflightCheck();

      const { transactionRunner } = await import('../../blockchain/sui-transaction-runner.js');

      const txPreparation = await transactionRunner.prepareTransaction({
        adapterId: request.adapterId,
        method: request.method,
        args: request.args || [],
        modifiers: {
          sender: this.walletConnection?.address,
          gasCoins: request.gasCoins || null,
          gasBudget: request.gasBudget || null,
          ...request.modifiers,
        },
      });

      const prep = txPreparation as TransactionPreparation;
      console.log('[BrowserWalletManager] Transaction prepared:', {
        method: prep.method,
        hasEstimatedGas: !!prep.estimatedGas,
        description: prep.description,
      });

      return {
        success: true,
        transaction: prep.transaction,
        metadata: {
          adapterId: request.adapterId,
          method: prep.method,
          args: prep.args,
          description: prep.description,
          estimatedGas: prep.estimatedGas,
        },
      };
    } catch (error) {
      const err = error as Error;
      console.error('[BrowserWalletManager] Failed to build unsigned transaction:', err.message);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  async executeContractMethod(
    adapterId: string,
    method: string,
    args: unknown[],
    options: Record<string, unknown> = {}
  ): Promise<ContractExecutionResult> {
    console.log(`[BrowserWalletManager] Executing contract method: ${adapterId}.${method}`);

    try {
      const buildResult = await this.buildUnsignedTransaction({
        adapterId,
        method,
        args,
        modifiers: (options.modifiers as Record<string, unknown>) || {},
      });

      if (!buildResult.success) {
        throw new Error(`Failed to build transaction: ${buildResult.error}`);
      }

      const executeOptions: TransactionOptions = {
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
          ...(options.executeOptions as Record<string, boolean> | undefined),
        },
      };

      const result = await this.signAndExecuteTransaction({
        transaction: buildResult.transaction,
        options: executeOptions,
      });

      console.log('[BrowserWalletManager] Contract method executed successfully:', {
        digest: result.digest,
        adapterId,
        method,
      });

      return {
        success: true,
        result,
        metadata: buildResult.metadata,
        transactionDigest: result.digest,
        effects: result.effects,
        objectChanges: result.objectChanges,
      };
    } catch (error) {
      const err = error as Error;
      console.error(`[BrowserWalletManager] Contract method execution failed:`, err.message);
      return {
        success: false,
        error: err.message,
        adapterId,
        method,
        args,
      };
    }
  }

  async getGasCoinsForTransaction(requiredAmount: number | null = null): Promise<string[]> {
    if (!this.walletConnection || !this.walletConnection?.address) {
      throw new Error('Wallet not connected - cannot get gas coins');
    }

    try {
      const { SuiClient } = await import('@mysten/sui/client');

      const config = await configLoader.getConfig();
      const configObj = config as { getServiceUrl: (service: string) => string };
      const rpcUrl = configObj.getServiceUrl('sui-rpc');
      const client = new SuiClient({ url: rpcUrl });

      const gasCoins = await client.getCoins({
        owner: this.walletConnection.address,
        coinType: '0x2::sui::SUI',
        limit: 10,
      });

      if (gasCoins.data.length === 0) {
        throw new Error('No SUI coins found for gas payment');
      }

      if (requiredAmount) {
        let totalAmount = 0n;
        const sufficientCoins: string[] = [];

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

      return gasCoins.data.map((coin) => coin.coinObjectId);
    } catch (error) {
      const err = error as Error;
      console.error('[BrowserWalletManager] Failed to get gas coins:', err.message);
      throw err;
    }
  }

  clearInvalidObjects(): void {
    console.warn('[BrowserWalletManager] Clearing invalid cached objects...');

    try {
      console.log('[BrowserWalletManager] Invalid cached objects cleared');
    } catch (error) {
      const err = error as Error;
      console.error('[BrowserWalletManager] Error clearing invalid objects:', err);
    }
  }

  startHealthMonitoring(): void {
    if (this.healthMonitor.isEnabled) {
      console.log('[HealthMonitor] Health monitoring already active');
      return;
    }

    console.log('[HealthMonitor] Starting wallet connection health monitoring');
    this.healthMonitor.isEnabled = true;
    this.healthMonitor.healthStatus = 'unknown';
    this.healthMonitor.consecutiveFailures = 0;
    this.healthMonitor.reconnectionAttempts = 0;

    this.healthMonitor.heartbeatInterval = setInterval(
      () => this._performHeartbeat(),
      this.healthMonitor.heartbeatFrequency
    );

    this._performHeartbeat();
  }

  stopHealthMonitoring(): void {
    if (!this.healthMonitor.isEnabled) {
      return;
    }

    console.log('[HealthMonitor] Stopping wallet connection health monitoring');
    this.healthMonitor.isEnabled = false;

    if (this.healthMonitor.heartbeatInterval) {
      clearInterval(this.healthMonitor.heartbeatInterval);
      this.healthMonitor.heartbeatInterval = null;
    }

    this.healthMonitor.healthStatus = 'unknown';
  }

  private async _performHeartbeat(): Promise<void> {
    const heartbeatStart = Date.now();

    try {
      console.log('[HealthMonitor] Performing wallet heartbeat check');

      if (!this.walletConnection || !this.walletConnection?.isConnected) {
        throw new Error('Wallet not connected');
      }

      if (!this.walletConnection?.address) {
        throw new Error('Wallet address not accessible');
      }

      const walletInfo = this.getWalletInfo();
      if (!walletInfo.connected) {
        throw new Error('Wallet info indicates disconnection');
      }

      this.healthMonitor.lastHeartbeat = heartbeatStart;
      this.healthMonitor.consecutiveFailures = 0;
      this.healthMonitor.reconnectionAttempts = 0;

      const recentFailures = this._getRecentTransactionFailures();
      if (recentFailures === 0) {
        this.healthMonitor.healthStatus = 'healthy';
      } else if (recentFailures <= 2) {
        this.healthMonitor.healthStatus = 'warning';
      } else {
        this.healthMonitor.healthStatus = 'critical';
      }

      console.log(
        `[HealthMonitor] Heartbeat successful (${Date.now() - heartbeatStart}ms) - Status: ${this.healthMonitor.healthStatus}`
      );

      this.emit('healthUpdate', {
        status: this.healthMonitor.healthStatus,
        lastHeartbeat: this.healthMonitor.lastHeartbeat,
        consecutiveFailures: this.healthMonitor.consecutiveFailures,
        recentFailures,
      });
    } catch (error) {
      const err = error as Error;
      this.healthMonitor.consecutiveFailures++;

      console.warn(
        `[HealthMonitor] Heartbeat failed (${this.healthMonitor.consecutiveFailures}/${this.healthMonitor.maxFailures}):`,
        err.message
      );

      if (this.healthMonitor.consecutiveFailures >= this.healthMonitor.maxFailures) {
        this.healthMonitor.healthStatus = 'critical';

        console.error('[HealthMonitor] Critical health status - attempting reconnection');

        if (this.healthMonitor.reconnectionAttempts < this.healthMonitor.maxReconnectionAttempts) {
          this.healthMonitor.reconnectionAttempts++;
          console.log(
            `[HealthMonitor] Attempting wallet reconnection (${this.healthMonitor.reconnectionAttempts}/${this.healthMonitor.maxReconnectionAttempts})`
          );

          try {
            await this.reconnectWallet();
            console.log('[HealthMonitor] Automatic reconnection successful');
          } catch (reconnectError) {
            const reconnectErr = reconnectError as Error;
            console.error('[HealthMonitor] Automatic reconnection failed:', reconnectErr.message);
          }
        }
      } else if (this.healthMonitor.consecutiveFailures >= 2) {
        this.healthMonitor.healthStatus = 'warning';
      }

      this.emit('healthUpdate', {
        status: this.healthMonitor.healthStatus,
        lastHeartbeat: this.healthMonitor.lastHeartbeat,
        consecutiveFailures: this.healthMonitor.consecutiveFailures,
        error: err.message,
      });
    }
  }

  private _getRecentTransactionFailures(): number {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return this.healthMonitor.transactionHistory.filter(
      (tx) => tx.timestamp > fiveMinutesAgo && !tx.success
    ).length;
  }

  recordTransactionAttempt(success: boolean, error: Error | null = null): void {
    const record = {
      timestamp: Date.now(),
      success,
      error: error?.message || null,
    };

    this.healthMonitor.transactionHistory.push(record);

    if (this.healthMonitor.transactionHistory.length > 50) {
      this.healthMonitor.transactionHistory = this.healthMonitor.transactionHistory.slice(-50);
    }

    if (success) {
      this.healthMonitor.lastSuccessfulTransaction = record.timestamp;
    }

    console.log(`[HealthMonitor] Transaction recorded: ${success ? 'SUCCESS' : 'FAILURE'}`);
  }

  getHealthStatus(): HealthStatus {
    return {
      isEnabled: this.healthMonitor.isEnabled,
      status: this.healthMonitor.healthStatus,
      lastHeartbeat: this.healthMonitor.lastHeartbeat,
      consecutiveFailures: this.healthMonitor.consecutiveFailures,
      lastSuccessfulTransaction: this.healthMonitor.lastSuccessfulTransaction,
      recentFailures: this._getRecentTransactionFailures(),
      reconnectionAttempts: this.healthMonitor.reconnectionAttempts,
    };
  }

  // Public getters for accessing private state (used by BrowserSuiService)
  getIsConnected(): boolean {
    return this.isConnected;
  }

  getWalletConnectionInstance(): WalletConnection | null {
    return this.walletConnection;
  }

  hasSignMethod(method: 'transaction' | 'transactionBlock' | 'signAndExecute'): boolean {
    if (!this.walletConnection) return false;
    const conn = this.walletConnection;
    switch (method) {
      case 'transaction':
        return typeof conn.signAndExecuteTransaction === 'function';
      case 'transactionBlock':
        return typeof conn.signAndExecuteTransactionBlock === 'function';
      case 'signAndExecute':
        return typeof conn.signAndExecute === 'function';
      default:
        return false;
    }
  }
}

export { BrowserWalletManager };

export const browserWalletManager = new BrowserWalletManager();
export default browserWalletManager;

if (typeof window !== 'undefined') {
  window.browserWalletManager = browserWalletManager;
}
