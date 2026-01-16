/**
 * WalletAssetTable Component
 * Display wallet assets from GraphQL queries in a table format
 */
import React, { useState, useEffect } from 'react';
import { suiGraphQLService } from '@dreamlit/walrus-sui-core/blockchain';
import { logger, LogComponent } from '@dreamlit/walrus';
import '../styles/WalletAssetTable.css';

export function WalletAssetTable({ walletAddress, onAssetClick }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('type'); // type, balance, symbol
  const [sortOrder, setSortOrder] = useState('asc');

  useEffect(() => {
    if (walletAddress) {
      loadAssets();
    }
  }, [walletAddress]);

  const loadAssets = async () => {
    setLoading(true);
    setError(null);

    try {
      logger.debug(LogComponent.UI, 'wallet_assets_load', 'Loading wallet assets', {
        walletAddress
      });

      const result = await suiGraphQLService.getWalletHistory(walletAddress);

      if (result.error) {
        throw new Error(result.error.message || 'Failed to load assets');
      }

      // Transform transaction history into asset list
      // NOTE: Currently tx.coins is empty (needs balanceChanges extraction in GraphQL service)
      // This component will show "No assets found" until coins are properly extracted
      // See blockchain/sui-graphql-service.js _transformTransactionsResponse line 390
      const assetMap = new Map();

      result.items.forEach(tx => {
        if (tx.coins && Array.isArray(tx.coins)) {
          tx.coins.forEach(coin => {
            const key = coin.coinType || 'Unknown';
            if (!assetMap.has(key)) {
              assetMap.set(key, {
                coinType: key,
                symbol: extractSymbol(key),
                balance: 0,
                transactions: 0
              });
            }
            const asset = assetMap.get(key);
            asset.balance += coin.amount || 0;
            asset.transactions++;
          });
        }
      });

      setAssets(Array.from(assetMap.values()));

      logger.info(LogComponent.UI, 'wallet_assets_loaded', 'Wallet assets loaded', {
        count: assetMap.size
      });
    } catch (error) {
      logger.error(LogComponent.UI, 'wallet_assets_error', 'Failed to load wallet assets', {
        error: error.message
      });
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const extractSymbol = (coinType) => {
    if (!coinType) return 'Unknown';
    const parts = coinType.split('::');
    return parts[parts.length - 1] || 'Unknown';
  };

  const formatBalance = (balance) => {
    return (balance / 1e9).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 9
    });
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const getSortedAssets = () => {
    return [...assets].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'balance':
          comparison = a.balance - b.balance;
          break;
        case 'symbol':
          comparison = a.symbol.localeCompare(b.symbol);
          break;
        case 'type':
        default:
          comparison = a.coinType.localeCompare(b.coinType);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };

  if (loading) {
    return (
      <div className="wallet-asset-table loading">
        <div className="spinner"></div>
        <p>Loading assets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="wallet-asset-table error">
        <p>Error loading assets: {error}</p>
        <button onClick={loadAssets}>Retry</button>
      </div>
    );
  }

  const sortedAssets = getSortedAssets();

  return (
    <div className="wallet-asset-table">
      <div className="table-header">
        <h3>Wallet Assets</h3>
        <p className="wallet-address">{walletAddress?.substring(0, 16)}...</p>
      </div>

      {sortedAssets.length === 0 ? (
        <div className="empty-state">
          <p>No assets found</p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th onClick={() => handleSort('symbol')} className="sortable">
                Symbol {sortBy === 'symbol' && (sortOrder === 'asc' ? '▲' : '▼')}
              </th>
              <th onClick={() => handleSort('balance')} className="sortable">
                Balance {sortBy === 'balance' && (sortOrder === 'asc' ? '▲' : '▼')}
              </th>
              <th onClick={() => handleSort('type')} className="sortable">
                Type {sortBy === 'type' && (sortOrder === 'asc' ? '▲' : '▼')}
              </th>
              <th>Transactions</th>
            </tr>
          </thead>
          <tbody>
            {sortedAssets.map(asset => (
              <tr
                key={asset.coinType}
                onClick={() => onAssetClick?.(asset)}
                className={onAssetClick ? 'clickable' : ''}
              >
                <td className="asset-symbol">{asset.symbol}</td>
                <td className="asset-balance">{formatBalance(asset.balance)}</td>
                <td className="asset-type">
                  <code>{asset.coinType.substring(0, 40)}...</code>
                </td>
                <td className="asset-tx-count">{asset.transactions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="table-footer">
        <p>Total Assets: {sortedAssets.length}</p>
      </div>
    </div>
  );
}

export default WalletAssetTable;
