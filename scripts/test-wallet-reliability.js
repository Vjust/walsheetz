#!/usr/bin/env node

/**
 * WalSheetz Wallet Connection Reliability Test Script
 *
 * This script tests wallet connection reliability including retry logic,
 * error handling, and recovery mechanisms.
 *
 * Run with: node scripts/test-wallet-reliability.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WalletReliabilityTester {
  constructor() {
    this.testResults = [];
    this.failures = [];
    this.warnings = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] ${message}`;

    switch (type) {
      case 'error':
        console.error(`❌ ${formatted}`);
        this.failures.push(message);
        break;
      case 'warning':
        console.warn(`⚠️  ${formatted}`);
        this.warnings.push(message);
        break;
      case 'success':
        console.log(`✅ ${formatted}`);
        this.testResults.push({ test: message, status: 'passed' });
        break;
      case 'info':
      default:
        console.log(`ℹ️  ${formatted}`);
        break;
    }
  }

  async testBrowserWalletManagerRetryLogic() {
    this.log('Testing BrowserWalletManager retry logic...', 'info');

    const walletManagerPath = path.join(__dirname, '..', 'frontend', 'services', 'BrowserWalletManager.js');

    if (!fs.existsSync(walletManagerPath)) {
      this.log('BrowserWalletManager.js not found', 'error');
      return false;
    }

    const content = fs.readFileSync(walletManagerPath, 'utf8');

    // Test for retry logic implementation
    const hasRetryLogic = content.includes('maxRetries') && content.includes('for (let attempt');
    if (hasRetryLogic) {
      this.log('Retry logic found in BrowserWalletManager', 'success');
    } else {
      this.log('Retry logic missing in BrowserWalletManager', 'error');
      return false;
    }

    // Test for retryable error detection
    const hasRetryableErrorCheck = content.includes('isRetryableError') && content.includes('message channel closed');
    if (hasRetryableErrorCheck) {
      this.log('Retryable error detection implemented', 'success');
    } else {
      this.log('Retryable error detection missing', 'error');
      return false;
    }

    // Test for preflight checks
    const hasPreflightChecks = content.includes('preflightCheck') && content.includes('walletConnection.isConnected');
    if (hasPreflightChecks) {
      this.log('Preflight checks implemented', 'success');
    } else {
      this.log('Preflight checks missing', 'error');
      return false;
    }

    // Test for exponential backoff
    const hasExponentialBackoff = content.includes('Math.pow(2, attempt');
    if (hasExponentialBackoff) {
      this.log('Exponential backoff implemented', 'success');
    } else {
      this.log('Exponential backoff missing', 'warning');
    }

    return true;
  }

  async testTransactionFormatStandardization() {
    this.log('Testing transaction format standardization...', 'info');

    const suiServicePath = path.join(__dirname, '..', 'frontend', 'services', 'BrowserSuiService.js');

    if (!fs.existsSync(suiServicePath)) {
      this.log('BrowserSuiService.js not found', 'error');
      return false;
    }

    const content = fs.readFileSync(suiServicePath, 'utf8');

    // Check that service uses 'transaction' not 'transactionBlock' in wallet execution
    const walletExecutionSection = content.match(/signAndExecuteTransaction\(\{[\s\S]*?\}\);/);

    if (walletExecutionSection) {
      const executionCode = walletExecutionSection[0];
      const usesStandardizedFormat = executionCode.includes('transaction: transaction') &&
                                    !executionCode.includes('transactionBlock: transaction');

      if (usesStandardizedFormat) {
        this.log('Transaction format standardized to use "transaction" property in wallet execution', 'success');
      } else {
        this.log('Transaction format not standardized in wallet execution section', 'error');
        return false;
      }
    } else {
      this.log('Could not find signAndExecuteTransaction section to verify format', 'warning');
    }

    return true;
  }

  async testHookMutationAlignment() {
    this.log('Testing useWalletConnection hook mutation alignment...', 'info');

    const hookPath = path.join(__dirname, '..', 'frontend', 'hooks', 'useWalletConnection.js');

    if (!fs.existsSync(hookPath)) {
      this.log('useWalletConnection.js not found', 'error');
      return false;
    }

    const content = fs.readFileSync(hookPath, 'utf8');

    // Check for enhanced logging
    const hasEnhancedLogging = content.includes('signAndExecute called with:') &&
                              content.includes('Transaction executed successfully:');

    if (hasEnhancedLogging) {
      this.log('Enhanced logging implemented in useWalletConnection hook', 'success');
    } else {
      this.log('Enhanced logging missing in useWalletConnection hook', 'warning');
    }

    // Check for proper error handling
    const hasErrorHandling = content.includes('Transaction execution failed:') &&
                            content.includes('onError: (error)');

    if (hasErrorHandling) {
      this.log('Proper error handling implemented in hook', 'success');
    } else {
      this.log('Error handling missing in hook', 'error');
      return false;
    }

    return true;
  }

  async testWalletProviderRecoveryOptions() {
    this.log('Testing WalletProvider recovery options...', 'info');

    const providerPath = path.join(__dirname, '..', 'frontend', 'providers', 'WalletProviders.jsx');

    if (!fs.existsSync(providerPath)) {
      this.log('WalletProviders.jsx not found', 'error');
      return false;
    }

    const content = fs.readFileSync(providerPath, 'utf8');

    // Check for extended timeout
    const hasExtendedTimeout = content.includes('timeout: 45000');
    if (hasExtendedTimeout) {
      this.log('Extended timeout (45s) configured for wallet connections', 'success');
    } else {
      this.log('Extended timeout not configured', 'warning');
    }

    // Check for retry configuration
    const hasRetryConfig = content.includes('maxRetries: 3') && content.includes('retryDelay: 2000');
    if (hasRetryConfig) {
      this.log('Retry configuration present in wallet provider', 'success');
    } else {
      this.log('Retry configuration missing in wallet provider', 'error');
      return false;
    }

    // Check for recovery features
    const hasRecoveryFeatures = content.includes('enableConnectionRecovery: true') &&
                               content.includes('gracefulErrorHandling: true');
    if (hasRecoveryFeatures) {
      this.log('Connection recovery features enabled', 'success');
    } else {
      this.log('Connection recovery features missing', 'warning');
    }

    return true;
  }

  async testStatusBarHealthIndicator() {
    this.log('Testing StatusBar wallet health indicator...', 'info');

    const statusBarPath = path.join(__dirname, '..', 'frontend', 'presentation', 'components', 'StatusBar.jsx');

    if (!fs.existsSync(statusBarPath)) {
      this.log('StatusBar.jsx not found', 'error');
      return false;
    }

    const content = fs.readFileSync(statusBarPath, 'utf8');

    // Check for wallet health status function
    const hasHealthStatus = content.includes('getWalletHealthStatus') &&
                           content.includes('low-balance') &&
                           content.includes('connecting');

    if (hasHealthStatus) {
      this.log('Wallet health status indicator implemented', 'success');
    } else {
      this.log('Wallet health status indicator missing', 'error');
      return false;
    }

    // Check for enhanced wallet info display
    const hasEnhancedDisplay = content.includes('formatAddress') &&
                              content.includes('formatBalance') &&
                              content.includes('walletNetwork');

    if (hasEnhancedDisplay) {
      this.log('Enhanced wallet information display implemented', 'success');
    } else {
      this.log('Enhanced wallet information display missing', 'warning');
    }

    return true;
  }

  async testErrorHandlingEnhancements() {
    this.log('Testing error handling enhancements in useSpreadsheet...', 'info');

    const spreadsheetPath = path.join(__dirname, '..', 'frontend', 'business', 'useSpreadsheet.js');

    if (!fs.existsSync(spreadsheetPath)) {
      this.log('useSpreadsheet.js not found', 'error');
      return false;
    }

    const content = fs.readFileSync(spreadsheetPath, 'utf8');

    // Check for enhanced error handling in saveToBlockchain
    const hasSaveErrorHandling = content.includes('saveToBlockchain failed:') &&
                                content.includes('Wallet communication failed') &&
                                content.includes('isRetryable');

    if (hasSaveErrorHandling) {
      this.log('Enhanced error handling implemented for saveToBlockchain', 'success');
    } else {
      this.log('Enhanced error handling missing for saveToBlockchain', 'error');
      return false;
    }

    // Check for enhanced error handling in createNewSpreadsheet
    const hasCreateErrorHandling = content.includes('createNewSpreadsheet failed:') &&
                                  content.includes('refresh the page and reconnect');

    if (hasCreateErrorHandling) {
      this.log('Enhanced error handling implemented for createNewSpreadsheet', 'success');
    } else {
      this.log('Enhanced error handling missing for createNewSpreadsheet', 'error');
      return false;
    }

    return true;
  }

  async testDependencyVersions() {
    this.log('Testing dependency versions...', 'info');

    const packageJsonPath = path.join(__dirname, '..', 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      this.log('package.json not found', 'error');
      return false;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const deps = packageJson.dependencies || {};

    // Check Sui dapp-kit version
    const dappKitVersion = deps['@mysten/dapp-kit'];
    if (dappKitVersion && dappKitVersion.includes('0.17')) {
      this.log(`@mysten/dapp-kit version ${dappKitVersion} is compatible`, 'success');
    } else {
      this.log(`@mysten/dapp-kit version ${dappKitVersion} may have compatibility issues`, 'warning');
    }

    // Check Sui SDK version
    const suiVersion = deps['@mysten/sui'];
    if (suiVersion && suiVersion.includes('1.0')) {
      this.log(`@mysten/sui version ${suiVersion} is compatible`, 'success');
    } else {
      this.log(`@mysten/sui version ${suiVersion} may have compatibility issues`, 'warning');
    }

    return true;
  }

  async runAllTests() {
    this.log('Starting wallet connection reliability tests...', 'info');

    const tests = [
      { name: 'BrowserWalletManager Retry Logic', test: () => this.testBrowserWalletManagerRetryLogic() },
      { name: 'Transaction Format Standardization', test: () => this.testTransactionFormatStandardization() },
      { name: 'Hook Mutation Alignment', test: () => this.testHookMutationAlignment() },
      { name: 'Wallet Provider Recovery Options', test: () => this.testWalletProviderRecoveryOptions() },
      { name: 'StatusBar Health Indicator', test: () => this.testStatusBarHealthIndicator() },
      { name: 'Error Handling Enhancements', test: () => this.testErrorHandlingEnhancements() },
      { name: 'Dependency Versions', test: () => this.testDependencyVersions() },
    ];

    let passedTests = 0;
    let totalTests = tests.length;

    for (const { name, test } of tests) {
      try {
        this.log(`Running test: ${name}`, 'info');
        const result = await test();
        if (result) {
          passedTests++;
        }
      } catch (error) {
        this.log(`Test "${name}" threw an error: ${error.message}`, 'error');
      }
    }

    this.log('', 'info');
    this.log('='.repeat(60), 'info');
    this.log('WALLET RELIABILITY TEST SUMMARY', 'info');
    this.log('='.repeat(60), 'info');
    this.log(`Total Tests: ${totalTests}`, 'info');
    this.log(`Passed: ${passedTests}`, passedTests === totalTests ? 'success' : 'warning');
    this.log(`Failed: ${totalTests - passedTests}`, totalTests - passedTests === 0 ? 'success' : 'error');
    this.log(`Warnings: ${this.warnings.length}`, this.warnings.length === 0 ? 'success' : 'warning');

    if (this.failures.length > 0) {
      this.log('', 'info');
      this.log('CRITICAL FAILURES:', 'error');
      this.failures.forEach(failure => this.log(`- ${failure}`, 'error'));
    }

    if (this.warnings.length > 0) {
      this.log('', 'info');
      this.log('WARNINGS:', 'warning');
      this.warnings.forEach(warning => this.log(`- ${warning}`, 'warning'));
    }

    this.log('', 'info');
    this.log('RECOMMENDATIONS:', 'info');
    this.log('1. Test wallet connections manually after these changes', 'info');
    this.log('2. Monitor console logs for retry attempts during wallet operations', 'info');
    this.log('3. Verify "message channel closed" errors are now handled gracefully', 'info');
    this.log('4. Test with intentional wallet disconnections to verify recovery', 'info');

    return passedTests === totalTests;
  }
}

// Run the tests
const tester = new WalletReliabilityTester();
tester.runAllTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });