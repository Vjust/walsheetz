/**
 * Service for requesting test SUI tokens from the Sui testnet faucet
 */
class FaucetService {
  constructor() {
    // Default to Sui testnet faucet endpoint
    this.faucetUrl = 'https://faucet.testnet.sui.io/v1/gas';
    this.isRequesting = false;
  }

  /**
   * Request test SUI tokens for the given address
   * @param {string} address - The SUI address to send tokens to
   * @returns {Promise<{success: boolean, message?: string, txId?: string, error?: string}>}
   */
  async requestTestSui(address) {
    if (this.isRequesting) {
      return {
        success: false,
        error: 'Faucet request already in progress'
      };
    }

    if (!address) {
      return {
        success: false,
        error: 'Address is required'
      };
    }

    console.log('[FaucetService] Requesting test SUI for address:', address.slice(0, 8) + '...');

    this.isRequesting = true;

    try {
      const response = await fetch(this.faucetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          FixedAmountRequest: {
            recipient: address
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[FaucetService] Faucet request failed:', response.status, data);
        return {
          success: false,
          error: data.message || data.error || `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status
        };
      }

      // Success response format: { transferredGasObjects: [...], error: null }
      if (data.error) {
        console.error('[FaucetService] Faucet returned error:', data.error);
        return {
          success: false,
          error: data.error
        };
      }

      const transferredObjects = data.transferredGasObjects || [];
      const amount = transferredObjects.length > 0 ?
        transferredObjects.reduce((sum, obj) => sum + (obj.amount || 0), 0) / 1_000_000_000 :
        1; // Default assumption

      console.log('[FaucetService] ✅ Test SUI requested successfully:', {
        recipient: address.slice(0, 8) + '...',
        estimatedAmount: `${amount} SUI`,
        objects: transferredObjects.length
      });

      return {
        success: true,
        message: `Successfully requested ${amount} SUI from testnet faucet`,
        amount: amount,
        transferredObjects: transferredObjects
      };

    } catch (error) {
      console.error('[FaucetService] Network error requesting test SUI:', error);
      return {
        success: false,
        error: `Network error: ${error.message}`,
        isNetworkError: true
      };
    } finally {
      this.isRequesting = false;
    }
  }

  /**
   * Check if a faucet request is currently in progress
   * @returns {boolean}
   */
  isRequestInProgress() {
    return this.isRequesting;
  }

  /**
   * Get the official Sui testnet faucet URL for fallback
   * @returns {string}
   */
  getOfficialFaucetUrl() {
    return 'https://testnet.sui.io/faucet';
  }
}

// Export singleton instance
export const faucetService = new FaucetService();
export { FaucetService };