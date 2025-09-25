// Suilend protocol adapter for WalSheetz DeFi integration
import { SuilendClient } from '@suilend/sdk';
import { SuiClient } from '@mysten/sui/client';
import { getCurrentConfig } from '../config.js';

export class SuilendAdapter {
  constructor() {
    this.name = 'Suilend';
    this.description = 'Suilend lending protocol adapter for borrowing, lending, and yield farming';
    this.version = '1.0.0';
    this.supportedNetworks = ['testnet', 'mainnet'];
    this.client = null;
    this.suiClient = null;
    this.initialized = false;

    // Cache for performance
    this.cache = new Map();
    this.cacheTimeout = 30000; // 30 seconds
  }

  async initialize() {
    if (this.initialized) return;

    try {
      const config = getCurrentConfig();

      // Initialize Sui client
      this.suiClient = new SuiClient({
        url: config.sui.rpcUrl
      });

      // Initialize Suilend client
      const network = config.environment === 'mainnet' ? 'mainnet' : 'testnet';
      this.client = await SuilendClient.initialize(this.suiClient, network);

      this.initialized = true;
      console.log(`[SuilendAdapter] Initialized for ${network} network`);
    } catch (error) {
      console.error('[SuilendAdapter] Initialization failed:', error);
      throw new Error(`Failed to initialize Suilend adapter: ${error.message}`);
    }
  }

  getName() {
    return this.name;
  }

  getDescription() {
    return this.description;
  }

  getVersion() {
    return this.version;
  }

  getSupportedNetworks() {
    return this.supportedNetworks;
  }

  getMethods() {
    return [
      {
        name: 'listMarkets',
        type: 'read',
        description: 'List all available lending markets',
        parameters: [],
        returns: 'Array of market objects'
      },
      {
        name: 'getMarkets',
        type: 'read',
        description: 'Get all markets with detailed information',
        parameters: [],
        returns: 'Array of detailed market objects'
      },
      {
        name: 'getReserves',
        type: 'read',
        description: 'Get reserve information for all assets',
        parameters: ['marketId'],
        returns: 'Array of reserve objects'
      },
      {
        name: 'getReserve',
        type: 'read',
        description: 'Get specific reserve information',
        parameters: ['coinType'],
        returns: 'Reserve object'
      },
      {
        name: 'getObligations',
        type: 'read',
        description: 'Get user obligations (debt positions)',
        parameters: ['userAddress'],
        returns: 'Array of obligation objects'
      },
      {
        name: 'getUserPosition',
        type: 'read',
        description: 'Get comprehensive user position across all markets',
        parameters: ['userAddress'],
        returns: 'User position object'
      },
      {
        name: 'getSupplyApy',
        type: 'read',
        description: 'Get supply APY for a specific asset',
        parameters: ['coinType'],
        returns: 'APY percentage'
      },
      {
        name: 'getBorrowApy',
        type: 'read',
        description: 'Get borrow APY for a specific asset',
        parameters: ['coinType'],
        returns: 'APY percentage'
      }
    ];
  }

  async validateArgs(method, args) {
    switch (method) {
      case 'getReserves':
        if (!args[0]) throw new Error('Market ID required');
        break;
      case 'getReserve':
      case 'getSupplyApy':
      case 'getBorrowApy':
        if (!args[0]) throw new Error('Coin type required');
        break;
      case 'getObligations':
      case 'getUserPosition':
        if (!args[0]) throw new Error('User address required');
        if (typeof args[0] !== 'string' || !args[0].startsWith('0x')) {
          throw new Error('Invalid user address format');
        }
        break;
    }
    return true;
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  getCached(key) {
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  // Read Methods Implementation

  async listMarkets() {
    await this.ensureInitialized();

    const cacheKey = 'listMarkets';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const markets = await this.client.getMarkets();
      const result = markets.map(market => ({
        id: market.id,
        name: market.name || `Market ${market.id}`,
        description: market.description || 'Lending market',
        totalSupplied: market.totalSupplied?.toString() || '0',
        totalBorrowed: market.totalBorrowed?.toString() || '0',
        utilizationRate: market.utilizationRate || 0,
        createdAt: market.createdAt
      }));

      this.setCache(cacheKey, result);
      return result;
    } catch (error) {
      console.error('[SuilendAdapter] Failed to list markets:', error);
      throw new Error(`Failed to list markets: ${error.message}`);
    }
  }

  async getMarkets() {
    await this.ensureInitialized();

    const cacheKey = 'getMarkets';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const markets = await this.client.getMarkets();
      this.setCache(cacheKey, markets);
      return markets;
    } catch (error) {
      console.error('[SuilendAdapter] Failed to get markets:', error);
      throw new Error(`Failed to get markets: ${error.message}`);
    }
  }

  async getReserves(marketId = null) {
    await this.ensureInitialized();

    const cacheKey = `getReserves:${marketId || 'all'}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      let reserves;
      if (marketId) {
        const market = await this.client.getMarket(marketId);
        reserves = market?.reserves || [];
      } else {
        // Get all markets and aggregate reserves
        const markets = await this.client.getMarkets();
        reserves = markets.flatMap(market => market.reserves || []);
      }

      const result = reserves.map(reserve => ({
        coinType: reserve.coinType,
        symbol: reserve.coinMetadata?.symbol || 'UNKNOWN',
        name: reserve.coinMetadata?.name || 'Unknown Coin',
        decimals: reserve.coinMetadata?.decimals || 9,
        totalSupply: reserve.depositedAmount?.toString() || '0',
        totalBorrowed: reserve.borrowedAmount?.toString() || '0',
        supplyApy: reserve.supplyApy || 0,
        borrowApy: reserve.borrowApy || 0,
        utilizationRate: reserve.utilizationRate || 0,
        liquidationThreshold: reserve.liquidationThreshold || 0,
        liquidationBonus: reserve.liquidationBonus || 0
      }));

      this.setCache(cacheKey, result);
      return result;
    } catch (error) {
      console.error('[SuilendAdapter] Failed to get reserves:', error);
      throw new Error(`Failed to get reserves: ${error.message}`);
    }
  }

  async getReserve(coinType) {
    await this.ensureInitialized();

    const cacheKey = `getReserve:${coinType}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const reserves = await this.getReserves();
      const reserve = reserves.find(r => r.coinType === coinType);

      if (!reserve) {
        throw new Error(`Reserve not found for coin type: ${coinType}`);
      }

      this.setCache(cacheKey, reserve);
      return reserve;
    } catch (error) {
      console.error('[SuilendAdapter] Failed to get reserve:', error);
      throw new Error(`Failed to get reserve: ${error.message}`);
    }
  }

  async getObligations(userAddress) {
    await this.ensureInitialized();

    const cacheKey = `getObligations:${userAddress}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const obligations = await this.client.getUserObligations(userAddress);

      const result = obligations.map(obligation => ({
        id: obligation.id,
        owner: obligation.owner,
        marketId: obligation.marketId,
        deposits: obligation.deposits?.map(deposit => ({
          coinType: deposit.coinType,
          amount: deposit.amount?.toString() || '0',
          marketValue: deposit.marketValue?.toString() || '0'
        })) || [],
        borrows: obligation.borrows?.map(borrow => ({
          coinType: borrow.coinType,
          amount: borrow.amount?.toString() || '0',
          marketValue: borrow.marketValue?.toString() || '0'
        })) || [],
        borrowedValue: obligation.borrowedValue?.toString() || '0',
        borrowedValueUsd: obligation.borrowedValueUsd || 0,
        depositedValue: obligation.depositedValue?.toString() || '0',
        depositedValueUsd: obligation.depositedValueUsd || 0,
        healthFactor: obligation.healthFactor || 0,
        liquidationThreshold: obligation.liquidationThreshold || 0
      }));

      this.setCache(cacheKey, result);
      return result;
    } catch (error) {
      console.error('[SuilendAdapter] Failed to get obligations:', error);
      throw new Error(`Failed to get obligations: ${error.message}`);
    }
  }

  async getUserPosition(userAddress) {
    await this.ensureInitialized();

    const cacheKey = `getUserPosition:${userAddress}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const obligations = await this.getObligations(userAddress);

      // Aggregate user's total position
      const totalDeposited = obligations.reduce((sum, obl) =>
        sum + (parseFloat(obl.depositedValueUsd) || 0), 0);
      const totalBorrowed = obligations.reduce((sum, obl) =>
        sum + (parseFloat(obl.borrowedValueUsd) || 0), 0);

      // Calculate overall health factor (weighted average)
      const healthFactors = obligations.filter(obl => obl.healthFactor > 0);
      const avgHealthFactor = healthFactors.length > 0 ?
        healthFactors.reduce((sum, obl) => sum + obl.healthFactor, 0) / healthFactors.length : 0;

      const result = {
        userAddress,
        totalDepositedUsd: totalDeposited,
        totalBorrowedUsd: totalBorrowed,
        netPositionUsd: totalDeposited - totalBorrowed,
        overallHealthFactor: avgHealthFactor,
        obligationsCount: obligations.length,
        obligations: obligations
      };

      this.setCache(cacheKey, result);
      return result;
    } catch (error) {
      console.error('[SuilendAdapter] Failed to get user position:', error);
      throw new Error(`Failed to get user position: ${error.message}`);
    }
  }

  async getSupplyApy(coinType) {
    await this.ensureInitialized();

    try {
      const reserve = await this.getReserve(coinType);
      return reserve.supplyApy;
    } catch (error) {
      console.error('[SuilendAdapter] Failed to get supply APY:', error);
      throw new Error(`Failed to get supply APY: ${error.message}`);
    }
  }

  async getBorrowApy(coinType) {
    await this.ensureInitialized();

    try {
      const reserve = await this.getReserve(coinType);
      return reserve.borrowApy;
    } catch (error) {
      console.error('[SuilendAdapter] Failed to get borrow APY:', error);
      throw new Error(`Failed to get borrow APY: ${error.message}`);
    }
  }

  // Helper method for getting Suilend client (used by transaction builder)
  async getSuilendClient() {
    await this.ensureInitialized();
    return this.client;
  }

  // Health check
  async healthCheck() {
    try {
      await this.ensureInitialized();

      // Try to fetch markets as a health check
      const markets = await this.client.getMarkets();

      return {
        status: 'healthy',
        marketsCount: markets.length,
        cacheSize: this.cache.size,
        lastCheck: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        lastCheck: new Date().toISOString()
      };
    }
  }

  // Schema description
  async describeSchema() {
    return {
      adapterId: 'suilend',
      name: this.name,
      description: this.description,
      version: this.version,
      supportedNetworks: this.supportedNetworks,
      methods: this.getMethods()
    };
  }

  // Cleanup
  destroy() {
    console.log('[SuilendAdapter] Cleaning up adapter...');
    this.cache.clear();
    this.client = null;
    this.suiClient = null;
    this.initialized = false;
  }
}