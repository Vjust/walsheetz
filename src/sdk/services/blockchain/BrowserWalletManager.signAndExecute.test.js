/**
 * @vitest-environment jsdom
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrowserWalletManager } from "@/sdk/services/blockchain/BrowserWalletManager.js";

describe('BrowserWalletManager signAndExecuteTransaction', () => {
  let walletManager;
  let mockWalletConnection;

  beforeEach(() => {
    walletManager = new BrowserWalletManager();

    mockWalletConnection = {
      address: '0xtest123',
      isConnected: true,
      name: 'test-wallet'
    };

    walletManager.setWalletConnection(mockWalletConnection);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should use signAndExecuteTransactionBlock when available', async () => {
    const mockResult = { digest: '0xdigest123', success: true };

    mockWalletConnection.signAndExecuteTransactionBlock = vi.fn().mockResolvedValueOnce(mockResult);
    mockWalletConnection.preflightCheck = vi.fn().mockResolvedValueOnce(undefined);

    walletManager.preflightCheck = vi.fn().mockResolvedValueOnce(undefined);

    const transaction = { test: 'transaction' };
    const options = { showEffects: true };

    const result = await walletManager.signAndExecuteTransaction({
      transaction,
      options
    });

    expect(mockWalletConnection.signAndExecuteTransactionBlock).toHaveBeenCalledWith({
      transactionBlock: transaction,
      options: options
    });
    expect(result).toEqual(mockResult);
  });

  test('should fall back to signAndExecute when signAndExecuteTransactionBlock not available', async () => {
    const mockResult = { digest: '0xdigest456', success: true };

    mockWalletConnection.signAndExecute = vi.fn().mockResolvedValueOnce(mockResult);
    mockWalletConnection.signAndExecuteTransactionBlock = undefined;

    walletManager.preflightCheck = vi.fn().mockResolvedValueOnce(undefined);

    const transaction = { test: 'transaction' };
    const options = { showEffects: true };

    const result = await walletManager.signAndExecuteTransaction({
      transaction,
      options
    });

    expect(mockWalletConnection.signAndExecute).toHaveBeenCalledWith(transaction, options);
    expect(result).toEqual(mockResult);
  });

  test('should throw error if both methods are unavailable', async () => {
    mockWalletConnection.signAndExecuteTransactionBlock = undefined;
    mockWalletConnection.signAndExecute = undefined;

    walletManager.preflightCheck = vi.fn().mockResolvedValueOnce(undefined);

    const transaction = { test: 'transaction' };

    await expect(
      walletManager.signAndExecuteTransaction({ transaction })
    ).rejects.toThrow(/sign-and-execute/);
  });

  test('should handle transactionBlock format', async () => {
    const mockResult = { digest: '0xdigest789', success: true };

    mockWalletConnection.signAndExecuteTransactionBlock = vi.fn().mockResolvedValueOnce(mockResult);

    walletManager.preflightCheck = vi.fn().mockResolvedValueOnce(undefined);

    const transaction = { test: 'transaction' };

    const result = await walletManager.signAndExecuteTransaction({
      transactionBlock: transaction,
      options: { showEffects: true }
    });

    expect(mockWalletConnection.signAndExecuteTransactionBlock).toHaveBeenCalledWith({
      transactionBlock: transaction,
      options: { showEffects: true }
    });
    expect(result).toEqual(mockResult);
  });

  test('should add default options if not provided', async () => {
    const mockResult = { digest: '0xdigest999', success: true };

    mockWalletConnection.signAndExecute = vi.fn().mockResolvedValueOnce(mockResult);
    mockWalletConnection.signAndExecuteTransactionBlock = undefined;

    walletManager.preflightCheck = vi.fn().mockResolvedValueOnce(undefined);

    const transaction = { test: 'transaction' };

    await walletManager.signAndExecuteTransaction(transaction);

    expect(mockWalletConnection.signAndExecute).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        showEffects: true,
        showEvents: true,
        showObjectChanges: true
      })
    );
  });

  test('should retry on retryable errors', async () => {
    const mockResult = { digest: '0xdigest111', success: true };
    let attempts = 0;

    mockWalletConnection.signAndExecute = vi.fn().mockImplementation(() => {
      attempts++;
      if (attempts === 1) {
        const error = new Error('Connection timeout');
        error.name = 'TimeoutError';
        return Promise.reject(error);
      }
      return Promise.resolve(mockResult);
    });

    mockWalletConnection.signAndExecuteTransactionBlock = undefined;
    mockWalletConnection.isConnected = true;

    walletManager.preflightCheck = vi.fn().mockResolvedValue(undefined);
    walletManager.isRetryableError = vi.fn().mockReturnValue(true);
    walletManager.recordTransactionAttempt = vi.fn();
    walletManager.reconnectWallet = vi.fn().mockResolvedValue(true);

    const transaction = { test: 'transaction' };

    const result = await walletManager.signAndExecuteTransaction(transaction);

    expect(attempts).toBe(2);
    expect(result).toEqual(mockResult);
  });

  test('should record transaction attempt on success', async () => {
    const mockResult = { digest: '0xdigest222', success: true };

    mockWalletConnection.signAndExecute = vi.fn().mockResolvedValueOnce(mockResult);
    mockWalletConnection.signAndExecuteTransactionBlock = undefined;

    walletManager.preflightCheck = vi.fn().mockResolvedValueOnce(undefined);
    walletManager.recordTransactionAttempt = vi.fn();

    const transaction = { test: 'transaction' };

    await walletManager.signAndExecuteTransaction(transaction);

    expect(walletManager.recordTransactionAttempt).toHaveBeenCalledWith(true);
  });

  test('should record transaction attempt on failure', async () => {
    const error = new Error('Transaction failed');

    mockWalletConnection.signAndExecute = vi.fn().mockRejectedValueOnce(error);
    mockWalletConnection.signAndExecuteTransactionBlock = undefined;

    walletManager.preflightCheck = vi.fn().mockResolvedValueOnce(undefined);
    walletManager.recordTransactionAttempt = vi.fn();
    walletManager.isRetryableError = vi.fn().mockReturnValue(false);

    const transaction = { test: 'transaction' };

    try {
      await walletManager.signAndExecuteTransaction(transaction);
    } catch (e) {

      // Expected to throw
    }
    expect(walletManager.recordTransactionAttempt).toHaveBeenCalledWith(false, expect.any(Error));
  });

  test('should handle legacy format with direct transaction', async () => {
    const mockResult = { digest: '0xdigest333', success: true };

    mockWalletConnection.signAndExecute = vi.fn().mockResolvedValueOnce(mockResult);
    mockWalletConnection.signAndExecuteTransactionBlock = undefined;

    walletManager.preflightCheck = vi.fn().mockResolvedValueOnce(undefined);

    const transaction = { test: 'transaction' };

    const result = await walletManager.signAndExecuteTransaction(transaction);

    expect(mockWalletConnection.signAndExecute).toHaveBeenCalledWith(
      transaction,
      expect.any(Object)
    );
    expect(result).toEqual(mockResult);
  });
});