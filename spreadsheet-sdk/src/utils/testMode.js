/**
 * Test Mode Utility
 *
 * Provides utilities for detecting and working with walletless test mode.
 * When VITE_TEST_AUTH_BYPASS is enabled, the application runs without
 * requiring wallet connection or blockchain interaction.
 */

/**
 * Check if test mode is active (wallet authentication bypassed)
 * @returns {boolean} True if test mode is enabled
 */
export function isAuthBypassed() {
  return import.meta.env.VITE_TEST_AUTH_BYPASS === 'true';
}

/**
 * Get test mode configuration
 * @returns {Object} Test mode configuration
 */
export function getTestModeConfig() {
  return {
    enabled: isAuthBypassed(),
    storagePrefix: 'walsheetz_test_',
    features: {
      blockchain: !isAuthBypassed(),
      walrus: !isAuthBypassed(),
      collaboration: !isAuthBypassed(),
      localStorage: true
    }
  };
}

/**
 * Log test mode status (for debugging)
 */
export function logTestModeStatus() {
  if (isAuthBypassed()) {
    console.log('🧪 Test Mode Active - Wallet/Blockchain Bypassed');
    console.log('📊 Data will be stored in localStorage only');
    console.log('⚠️  Collaboration and Walrus features disabled');
  }
}
