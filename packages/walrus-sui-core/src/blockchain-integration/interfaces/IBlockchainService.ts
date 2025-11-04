/**
 * Interface for blockchain operations
 */
export class IBlockchainService {
  /**
   * Connect to wallet
   * @returns {Promise<{success: boolean, wallet?: string, address?: string, error?: string}>}
   */
  async connectWallet() {
    throw new Error('connectWallet method must be implemented')
  }

  /**
   * Disconnect from wallet
   * @returns {Promise<void>}
   */
  async disconnectWallet() {
    throw new Error('disconnectWallet method must be implemented')
  }

  /**
   * Save data to blockchain
   * @param {Object} data - Data to save
   * @returns {Promise<{success: boolean, transactionId?: string, error?: string}>}
   */
  async saveToBlockchain(data) {
    throw new Error('saveToBlockchain method must be implemented')
  }

  /**
   * Track cell edit
   * @param {number} row - Row index
   * @param {number} col - Column index
   * @param {*} oldValue - Previous value
   * @param {*} newValue - New value
   */
  trackCellEdit(row, col, oldValue, newValue) {
    throw new Error('trackCellEdit method must be implemented')
  }

  /**
   * Get synchronization status
   * @returns {Object} Sync status
   */
  getSyncStatus() {
    throw new Error('getSyncStatus method must be implemented')
  }

  /**
   * Check if wallet is connected
   * @returns {boolean}
   */
  isWalletConnected() {
    throw new Error('isWalletConnected method must be implemented')
  }

  /**
   * Get wallet address
   * @returns {string|null}
   */
  getWalletAddress() {
    throw new Error('getWalletAddress method must be implemented')
  }
}