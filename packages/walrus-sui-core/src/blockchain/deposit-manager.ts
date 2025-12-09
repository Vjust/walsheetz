// Deposit manager for WalSheetz - handles user deposits and gas sponsorship
import { getCurrentConfig } from './config.js';
import { gasEstimator, estimateTransactionCost } from './gas-estimator.js';
import { walletManager } from './wallet-manager.js';

class DepositManager {
  private config: any;
  private depositConfig: any;
  private storage: any;
  private deposits: Map<string, number>;
  private gasConsumption: Map<string, any[]>;
  private transactionQueue: Map<string, any[]>;
  private eventListeners: Map<string, Function[]>;
  private storageKey: string;

  constructor() {
    this.config = getCurrentConfig();
    this.depositConfig = this.config.deposit;
    this.storage = this.createStorageAdapter();
    
    // User deposit tracking (address -> balance in MIST)
    this.deposits = new Map();
    
    // Gas consumption history (address -> transactions array)
    this.gasConsumption = new Map();
    
    // Transaction queue for sponsored operations
    this.transactionQueue = new Map(); // address -> pending transactions
    
    // Event listeners
    this.eventListeners = new Map();
    
    // Local storage key for persistence
    this.storageKey = 'walsheetz_deposits';
    
    // Load existing deposits from local storage
    this.loadDeposits();
  }

  // Event handling
  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  emit(event: string, data: any): void {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event)!.forEach((callback: Function) => {
        try {
          callback(data);
        } catch (error) {
          const err = error as Error;
          console.error('Event listener error:', err);
        }
      });
    }
  }

  // Load deposits from local storage
  loadDeposits(): void {
    if (!this.storage) return;

    try {
      const stored = this.storage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        this.deposits = new Map(data.deposits || []);
        this.gasConsumption = new Map(data.gasConsumption || []);
      }
    } catch (error) {
      const err = error as Error;
      console.warn('Failed to load deposits from storage:', err);
    }
  }

  // Save deposits to local storage
  saveDeposits(): void {
    if (!this.storage) return;

    try {
      const data = {
        deposits: Array.from(this.deposits.entries()),
        gasConsumption: Array.from(this.gasConsumption.entries()),
        lastUpdate: Date.now()
      };
      this.storage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      const err = error as Error;
      console.warn('Failed to save deposits to storage:', err);
    }
  }

  // Convert SUI to MIST
  suiToMist(suiAmount: number): number {
    return Math.floor(suiAmount * this.depositConfig.mistPerSui);
  }

  // Convert MIST to SUI
  mistToSui(mistAmount: number): number {
    return mistAmount / this.depositConfig.mistPerSui;
  }

  // Get user's current deposit balance
  getBalance(userAddress: string): number {
    return this.deposits.get(userAddress) || 0;
  }

  // Get user's balance in SUI
  getBalanceInSui(userAddress: string): number {
    const mistBalance = this.getBalance(userAddress);
    return this.mistToSui(mistBalance);
  }

  // Add deposit for a user
  async deposit(userAddress: string, suiAmount: number): Promise<any> {
    try {
      // Validate minimum deposit
      if (suiAmount < this.depositConfig.minDepositAmount) {
        throw new Error(`Minimum deposit is ${this.depositConfig.minDepositAmount} SUI`);
      }

      const mistAmount = this.suiToMist(suiAmount);
      const currentBalance = this.getBalance(userAddress);
      const newBalance = currentBalance + mistAmount;
      
      // Update balance
      this.deposits.set(userAddress, newBalance);
      
      // Log deposit transaction
      this.logTransaction(userAddress, {
        type: 'deposit',
        amount: mistAmount,
        suiAmount,
        timestamp: Date.now(),
        balanceBefore: currentBalance,
        balanceAfter: newBalance
      });

      // Save to storage
      this.saveDeposits();

      // Emit event
      this.emit('deposit', {
        userAddress,
        amount: mistAmount,
        suiAmount,
        newBalance: this.mistToSui(newBalance)
      });

      return {
        success: true,
        deposited: suiAmount,
        newBalance: this.mistToSui(newBalance),
        mistBalance: newBalance
      };
    } catch (error) {
      const err = error as Error;
      console.error('Deposit failed:', err);
      throw err;
    }
  }

  // Withdraw funds for a user
  async withdraw(userAddress: string, suiAmount: number): Promise<any> {
    try {
      const mistAmount = this.suiToMist(suiAmount);
      const currentBalance = this.getBalance(userAddress);
      
      if (mistAmount > currentBalance) {
        throw new Error('Insufficient balance for withdrawal');
      }

      const newBalance = currentBalance - mistAmount;
      
      // Update balance
      this.deposits.set(userAddress, newBalance);
      
      // Log withdrawal transaction
      this.logTransaction(userAddress, {
        type: 'withdrawal',
        amount: mistAmount,
        suiAmount,
        timestamp: Date.now(),
        balanceBefore: currentBalance,
        balanceAfter: newBalance
      });

      // Save to storage
      this.saveDeposits();

      // Emit event
      this.emit('withdrawal', {
        userAddress,
        amount: mistAmount,
        suiAmount,
        newBalance: this.mistToSui(newBalance)
      });

      return {
        success: true,
        withdrawn: suiAmount,
        newBalance: this.mistToSui(newBalance),
        mistBalance: newBalance
      };
    } catch (error) {
      const err = error as Error;
      console.error('Withdrawal failed:', err);
      throw err;
    }
  }

  // Check if user has sufficient balance for a transaction
  async checkBalance(userAddress: string, estimatedCost: number): Promise<any> {
    const currentBalance = this.getBalance(userAddress);
    const buffer = estimatedCost * (this.depositConfig.gasBuffer - 1); // Additional buffer
    const requiredBalance = estimatedCost + buffer;

    return {
      sufficient: currentBalance >= requiredBalance,
      currentBalance,
      requiredBalance,
      estimatedCost,
      shortfall: Math.max(0, requiredBalance - currentBalance)
    };
  }

  // Deduct gas cost from user's deposit
  async deductGas(userAddress: string, transactionResult: any): Promise<any> {
    try {
      if (!transactionResult.effects || !transactionResult.effects.gasUsed) {
        throw new Error('Invalid transaction result - no gas usage data');
      }

      const gasUsed = transactionResult.effects.gasUsed;
      const totalCost = parseInt(gasUsed.computationCost) +
                       parseInt(gasUsed.storageCost) -
                       parseInt(gasUsed.storageRebate || 0);

      const currentBalance = this.getBalance(userAddress);

      if (totalCost > currentBalance) {
        // This shouldn't happen if we checked balance first, but handle gracefully
        console.warn('Gas cost exceeds deposit balance', {
          userAddress,
          totalCost,
          currentBalance
        });

        // Deduct what we can
        const deductedAmount = Math.min(totalCost, currentBalance);
        this.deposits.set(userAddress, currentBalance - deductedAmount);

        this.emit('balanceInsufficient', {
          userAddress,
          requiredCost: totalCost,
          availableBalance: currentBalance,
          deductedAmount
        });
      } else {
        // Normal deduction
        const newBalance = currentBalance - totalCost;
        this.deposits.set(userAddress, newBalance);
      }

      // Log gas consumption
      this.logGasUsage(userAddress, {
        transactionDigest: transactionResult.digest,
        gasUsed,
        totalCost,
        timestamp: Date.now(),
        balanceBefore: currentBalance,
        balanceAfter: this.getBalance(userAddress)
      });

      // Save to storage
      this.saveDeposits();

      // Emit event
      this.emit('gasDeducted', {
        userAddress,
        gasUsed,
        totalCost,
        newBalance: this.mistToSui(this.getBalance(userAddress))
      });

      // Check if balance is low
      const newBalance = this.getBalance(userAddress);
      const lowThreshold = this.suiToMist(this.depositConfig.lowBalanceThreshold);

      if (newBalance <= lowThreshold) {
        this.emit('lowBalance', {
          userAddress,
          currentBalance: this.mistToSui(newBalance),
          threshold: this.depositConfig.lowBalanceThreshold
        });
      }

      return {
        success: true,
        deducted: this.mistToSui(totalCost),
        newBalance: this.mistToSui(newBalance),
        gasUsed
      };
    } catch (error) {
      const err = error as Error;
      console.error('Gas deduction failed:', err);
      throw err;
    }
  }

  // Log transaction (deposit/withdrawal)
  logTransaction(userAddress: string, transaction: any): void {
    if (!this.gasConsumption.has(userAddress)) {
      this.gasConsumption.set(userAddress, []);
    }

    const history = this.gasConsumption.get(userAddress)!;
    history.push({
      ...transaction,
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    });

    // Keep only last 100 transactions per user
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }

  // Log gas usage
  logGasUsage(userAddress: string, gasData: any): void {
    this.logTransaction(userAddress, {
      type: 'gas_usage',
      ...gasData
    });
  }

  // Get user's transaction history
  getTransactionHistory(userAddress: string, limit: number = 50): any[] {
    const history = this.gasConsumption.get(userAddress) || [];
    return history.slice(-limit).reverse(); // Most recent first
  }

  // Get gas usage analytics for a user
  getGasAnalytics(userAddress: string): any {
    const history = this.getTransactionHistory(userAddress);
    const gasTransactions = history.filter(tx => tx.type === 'gas_usage');
    
    return gasEstimator.getGasAnalytics(gasTransactions);
  }

  // Suggest deposit amount based on usage pattern
  async suggestDepositAmount(userAddress: string): Promise<any> {
    try {
      const history = this.getTransactionHistory(userAddress, 20);
      const gasTransactions = history.filter((tx: any) => tx.type === 'gas_usage');

      // Calculate average gas usage
      let avgDailyCost = 0;
      if (gasTransactions.length > 0) {
        const totalCost = gasTransactions.reduce((sum: number, tx: any) => sum + (tx.totalCost || 0), 0);
        const avgCostPerTransaction = totalCost / gasTransactions.length;

        // Estimate daily transactions based on recent activity
        const recentTxs = gasTransactions.filter((tx: any) =>
          (Date.now() - tx.timestamp) < 24 * 60 * 60 * 1000 // Last 24 hours
        );
        const avgDailyTransactions = Math.max(10, recentTxs.length); // Minimum 10

        avgDailyCost = avgCostPerTransaction * avgDailyTransactions;
      } else {
        // No history, use estimates based on typical usage
        const gasPrice = await gasEstimator.getCurrentGasPrice();
        avgDailyCost = 1000 * gasPrice.gasPrice * 20; // 20 simple operations per day
      }

      const suggestions = {
        light: this.mistToSui(avgDailyCost * 3),     // 3 days
        moderate: this.mistToSui(avgDailyCost * 7),   // 1 week
        heavy: this.mistToSui(avgDailyCost * 30),     // 1 month
        custom: this.mistToSui(avgDailyCost)          // 1 day for custom calculation
      };

      return {
        suggestions,
        avgDailyCost: this.mistToSui(avgDailyCost),
        basedOnTransactions: gasTransactions.length
      };
    } catch (error) {
      const err = error as Error;
      console.error('Failed to suggest deposit amount:', err);
      return {
        suggestions: {
          light: 0.01,    // 0.01 SUI
          moderate: 0.05, // 0.05 SUI
          heavy: 0.1,     // 0.1 SUI
          custom: 0.01
        },
        avgDailyCost: 0.003,
        basedOnTransactions: 0
      };
    }
  }

  // Get all user balances (for admin/debugging)
  getAllBalances(): Record<string, any> {
    const balances: Record<string, any> = {};
    for (const [address, mistBalance] of this.deposits.entries()) {
      balances[address] = {
        sui: this.mistToSui(mistBalance),
        mist: mistBalance
      };
    }
    return balances;
  }

  // Get total deposits across all users
  getTotalDeposits(): any {
    let totalMist = 0;
    for (const balance of this.deposits.values()) {
      totalMist += balance;
    }
    return {
      sui: this.mistToSui(totalMist),
      mist: totalMist,
      users: this.deposits.size
    };
  }

  // Check if user needs to top up
  shouldTopUp(userAddress: string): boolean {
    const balance = this.getBalance(userAddress);
    const threshold = this.suiToMist(this.depositConfig.lowBalanceThreshold);
    return balance <= threshold;
  }

  // Clear user data (for testing/reset)
  clearUserData(userAddress: string): void {
    this.deposits.delete(userAddress);
    this.gasConsumption.delete(userAddress);
    this.transactionQueue.delete(userAddress);
    this.saveDeposits();

    this.emit('userDataCleared', { userAddress });
  }

  // Clear all data
  clearAllData(): void {
    this.deposits.clear();
    this.gasConsumption.clear();
    this.transactionQueue.clear();
    if (this.storage) {
      try {
        this.storage.removeItem(this.storageKey);
      } catch (error) {
        const err = error as Error;
        console.warn('Failed to clear deposits from storage:', err);
      }
    }

    this.emit('allDataCleared', {});
  }

  createStorageAdapter(): any {
    try {
      if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
        return globalThis.localStorage;
      }
    } catch (error) {
      const err = error as Error;
      console.warn('localStorage unavailable, using in-memory storage:', err);
    }

    const memoryStore = new Map();

    return {
      getItem(key: string): string | null {
        return memoryStore.has(key) ? memoryStore.get(key) : null;
      },
      setItem(key: string, value: string): void {
        memoryStore.set(key, value);
      },
      removeItem(key: string): void {
        memoryStore.delete(key);
      }
    };
  }

  // Get status for current user
  getStatus(): any {
    const currentUser = walletManager.getWalletInfo().address;

    if (!currentUser) {
      return {
        connected: false,
        address: null,
        balance: 0
      };
    }

    return {
      connected: true,
      address: currentUser,
      balance: this.getBalanceInSui(currentUser),
      mistBalance: this.getBalance(currentUser),
      needsTopUp: this.shouldTopUp(currentUser),
      threshold: this.depositConfig.lowBalanceThreshold,
      transactionCount: this.getTransactionHistory(currentUser).length
    };
  }
}

// Create singleton instance
export const depositManager = new DepositManager();

// Convenience functions
export const deposit = (userAddress, amount) => depositManager.deposit(userAddress, amount);
export const withdraw = (userAddress, amount) => depositManager.withdraw(userAddress, amount);
export const getBalance = (userAddress) => depositManager.getBalance(userAddress);
export const deductGas = (userAddress, transactionResult) => depositManager.deductGas(userAddress, transactionResult);
export const getDepositStatus = () => depositManager.getStatus();