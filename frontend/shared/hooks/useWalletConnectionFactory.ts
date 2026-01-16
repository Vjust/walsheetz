/**
 * Wallet Connection Factory Hook
 *
 * Factory pattern that wraps the real useWalletConnection hook.
 * In test mode, returns a mock wallet connection to bypass blockchain.
 * Always calls the real hook to satisfy React's rules of hooks.
 */

import { useWalletConnection } from './useWalletConnection';
import { mockWalletConnection } from '@lib/spreadsheet/services/testing/mockWalletConnection';
import { isAuthBypassed } from '@lib/spreadsheet/utils/testMode';
import type { UseWalletConnection } from '@dreamlit/shared';

/**
 * Factory hook that provides either real or mock wallet connection
 * @returns {UseWalletConnection} Wallet connection object
 */
export function useWalletConnectionFactory(): UseWalletConnection {
  // Always call the real hook to satisfy React's rules of hooks
  const realConnection = useWalletConnection();

  // In test mode, return the mock connection instead
  if (isAuthBypassed()) {
    console.log('Test mode: using mock wallet connection');
    return mockWalletConnection as UseWalletConnection;
  }

  // Normal path: return the real wallet connection
  return realConnection;
}
