/**
 * Test Mode Utility
 *
 * Provides utilities for detecting and working with walletless test mode.
 */

interface ImportMeta {
  env: Record<string, string | undefined>;
}

declare const importMeta: ImportMeta;

export function isAuthBypassed(): boolean {
  return (import.meta as unknown as ImportMeta).env?.VITE_TEST_AUTH_BYPASS === 'true';
}

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

export function logTestModeStatus(): void {
  if (isAuthBypassed()) {
    console.log('Test Mode Active - Wallet/Blockchain Bypassed');
    console.log('Data will be stored in localStorage only');
    console.log('Collaboration and Walrus features disabled');
  }
}
