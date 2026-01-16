/**
 * Mock Wallet Connection for Test Mode
 *
 * Provides a fake wallet connection that satisfies the UseWalletConnection interface
 * without requiring actual wallet interaction. Used when VITE_TEST_AUTH_BYPASS is enabled.
 */

import { Transaction } from '@mysten/sui/transactions';

// Fake test wallet address
const TEST_WALLET_ADDRESS = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

/**
 * Mock SuiClient that returns fake data
 */
const mockSuiClient = {
  getBalance: async ({ owner, coinType }) => ({
    totalBalance: '1000000000000', // 1000 SUI in MIST
    coinType: coinType || '0x2::sui::SUI',
    coinObjectCount: 1
  }),
  // Add other methods as needed for test compatibility
  queryEvents: async () => ({ data: [], hasNextPage: false }),
  getObject: async () => ({ data: null })
};

/**
 * Mock wallet info
 */
const mockWallet = {
  name: 'Test Wallet',
  icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><text y="24" font-size="24">T</text></svg>',
  features: {
    'sui:signAndExecuteTransactionBlock': {},
    'sui:signTransactionBlock': {}
  }
};

/**
 * Mock wallet account
 */
const mockAccount = {
  address: TEST_WALLET_ADDRESS,
  publicKey: new Uint8Array(32),
  chains: ['sui:testnet'],
  features: ['sui:signAndExecuteTransactionBlock']
};

/**
 * Mock wallet state (mutable for connect/disconnect flows)
 */
const mockState = {
  isConnected: true,
  isConnecting: false,
  connectionError: null,
  currentAccount: mockAccount,
  address: TEST_WALLET_ADDRESS,
  formattedAddress: `${TEST_WALLET_ADDRESS.slice(0, 6)}...${TEST_WALLET_ADDRESS.slice(-4)}`,
  balance: {
    totalBalance: '1000000000000',
    sui: '1000',
    mist: '1000000000000'
  },
  selectedWallet: mockWallet
};

/**
 * Mock wallet connection object
 * Matches the UseWalletConnection interface from frontend/types/wallet.d.ts
 * Now stateful to support connect/disconnect flows in tests
 */
export const mockWalletConnection = {
  // Connection state (getters to access mutable state)
  get isConnected() { return mockState.isConnected; },
  get isConnecting() { return mockState.isConnecting; },
  get connectionError() { return mockState.connectionError; },

  // Account info (getters to access mutable state)
  get currentAccount() { return mockState.currentAccount; },
  get address() { return mockState.address; },
  get formattedAddress() { return mockState.formattedAddress; },
  get balance() { return mockState.balance; },

  // Wallet info
  wallets: [mockWallet],
  get selectedWallet() { return mockState.selectedWallet; },
  availableWallets: {
    installed: [mockWallet],
    notInstalled: []
  },

  // Actions - now update state
  connectWallet: async (wallet) => {
    console.log('Test mode: mock wallet connect', wallet?.name);
    mockState.isConnecting = true;

    // Simulate async connection
    await new Promise(resolve => setTimeout(resolve, 10));

    mockState.isConnected = true;
    mockState.isConnecting = false;
    mockState.currentAccount = mockAccount;
    mockState.address = TEST_WALLET_ADDRESS;
    mockState.formattedAddress = `${TEST_WALLET_ADDRESS.slice(0, 6)}...${TEST_WALLET_ADDRESS.slice(-4)}`;
    mockState.selectedWallet = wallet || mockWallet;
    mockState.connectionError = null;

    return Promise.resolve({ success: true });
  },

  disconnectWallet: () => {
    console.log('Test mode: mock wallet disconnect');
    mockState.isConnected = false;
    mockState.currentAccount = null;
    mockState.address = undefined;
    mockState.formattedAddress = '';
    mockState.selectedWallet = null;
    mockState.balance = null;
  },

  sign: async (transaction) => {
    console.log('Test mode: mock transaction sign');
    return Promise.resolve({
      signature: new Uint8Array(64),
      transactionBlockBytes: new Uint8Array(100)
    });
  },

  signAndExecute: async (transaction, options = {}) => {
    console.log('Test mode: mock transaction signAndExecute', options);
    // Return a fake transaction result
    return Promise.resolve({
      digest: `test-tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      effects: {
        status: { status: 'success' }
      },
      objectChanges: [],
      events: [],
      balanceChanges: []
    });
  },

  fetchBalance: async () => {
    console.log('Test mode: mock fetch balance');
    return Promise.resolve();
  },

  // Transaction builders - return mock transactions
  createSpreadsheetTransaction: async (title) => {
    console.log('Test mode: mock create spreadsheet transaction', title);
    const tx = new Transaction();
    tx.setGasBudget(10000000);
    return tx;
  },

  saveVersionTransaction: async (spreadsheetId, walrusBlobId, contentHash, cellCount, description) => {
    console.log('Test mode: mock save version transaction', { spreadsheetId, walrusBlobId });
    const tx = new Transaction();
    tx.setGasBudget(10000000);
    return tx;
  },

  // Client access
  suiClient: mockSuiClient
};

/**
 * Reset mock wallet state to initial connected state
 * Useful for test cleanup between test cases
 */
export function resetMockWalletState() {
  mockState.isConnected = true;
  mockState.isConnecting = false;
  mockState.connectionError = null;
  mockState.currentAccount = mockAccount;
  mockState.address = TEST_WALLET_ADDRESS;
  mockState.formattedAddress = `${TEST_WALLET_ADDRESS.slice(0, 6)}...${TEST_WALLET_ADDRESS.slice(-4)}`;
  mockState.balance = {
    totalBalance: '1000000000000',
    sui: '1000',
    mist: '1000000000000'
  };
  mockState.selectedWallet = mockWallet;
}

/**
 * Create a mock wallet connection (for testing that needs fresh instances)
 * @returns {Object} Mock wallet connection object
 */
export function createMockWalletConnection() {
  return mockWalletConnection; // Return same object since it's now stateful
}
