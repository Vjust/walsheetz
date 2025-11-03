/**
 * Example React component using SubWallet SDK in browser
 * Works with Next.js, Vite, or any React app
 */

import { useState, useEffect } from 'react';
import { SubWalletOrchestrator, MemoryStorageAdapter } from '@walrus/subwallet-sdk';
import type { WalletBalance } from '@walrus/subwallet-sdk';

// Initialize orchestrator (can be moved to a context/provider)
const storage = new MemoryStorageAdapter();
const orchestrator = new SubWalletOrchestrator({
  rpcUrl: 'https://fullnode.testnet.sui.io:443',
  storage,
  concurrency: 4,
});

export function WalletDashboard() {
  const [balances, setBalances] = useState<WalletBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [walletCount, setWalletCount] = useState(0);

  useEffect(() => {
    loadBalances();
  }, []);

  const loadBalances = async () => {
    setLoading(true);
    try {
      const bals = await orchestrator.checkAllBalances();
      setBalances(bals);
      setWalletCount(bals.length);
    } catch (err) {
      console.error('Failed to load balances:', err);
    } finally {
      setLoading(false);
    }
  };

  const createWallets = async (count: number) => {
    setLoading(true);
    try {
      await orchestrator.createWallets(count);
      await loadBalances();
    } catch (err) {
      console.error('Failed to create wallets:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Sub-Wallet Manager</h1>

      <div className="mb-6 flex gap-4">
        <button
          onClick={() => createWallets(1)}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          Create Wallet
        </button>
        <button
          onClick={() => createWallets(5)}
          disabled={loading}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
        >
          Create 5 Wallets
        </button>
        <button
          onClick={loadBalances}
          disabled={loading}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <div className="mb-4">
        <p className="text-lg">Total Wallets: {walletCount}</p>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-4 py-2">Wallet ID</th>
                <th className="border border-gray-300 px-4 py-2">Address</th>
                <th className="border border-gray-300 px-4 py-2">SUI Balance</th>
                <th className="border border-gray-300 px-4 py-2">WAL Balance</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((balance) => (
                <tr key={balance.walletId}>
                  <td className="border border-gray-300 px-4 py-2">{balance.walletId}</td>
                  <td className="border border-gray-300 px-4 py-2 font-mono text-sm">
                    {balance.address.slice(0, 10)}...{balance.address.slice(-6)}
                  </td>
                  <td className="border border-gray-300 px-4 py-2">
                    {orchestrator.formatSui(balance.sui)} SUI
                  </td>
                  <td className="border border-gray-300 px-4 py-2">
                    {orchestrator.formatWal(balance.wal)} WAL
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Next.js App Router usage:
// app/wallets/page.tsx
// 'use client';
// export { WalletDashboard as default } from './WalletDashboard';

// Next.js Pages Router usage:
// pages/wallets.tsx
// export { WalletDashboard as default } from '../components/WalletDashboard';

// Vite usage:
// src/pages/Wallets.tsx
// export { WalletDashboard } from '../components/WalletDashboard';

