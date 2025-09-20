#!/usr/bin/env node

/**
 * WalSheetz Blockchain Integration Test Script
 *
 * This script tests the complete blockchain integration flow:
 * 1. Service initialization
 * 2. Transaction creation
 * 3. Walrus storage
 * 4. Data retrieval
 *
 * Run with: node scripts/test-blockchain-integration.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the browser services directly for testing
import { browserSuiService } from '../frontend/services/BrowserSuiService.js';
import { browserWalrusService } from '../frontend/services/BrowserWalrusService.js';
import { browserWalletManager } from '../frontend/services/BrowserWalletManager.js';

class BlockchainIntegrationTest {
  constructor() {
    this.testResults = {
      passed: [],
      failed: [],
      warnings: []
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] ${message}`;

    switch (type) {
      case 'success':
        console.log(`✅ ${formatted}`);
        this.testResults.passed.push(message);
        break;
      case 'error':
        console.error(`❌ ${formatted}`);
        this.testResults.failed.push(message);
        break;
      case 'warning':
        console.warn(`⚠️  ${formatted}`);
        this.testResults.warnings.push(message);
        break;
      case 'info':
      default:
        console.log(`ℹ️  ${formatted}`);
        break;
    }
  }

  async testServiceInitialization() {
    console.log('\n🧪 Testing Service Initialization...\n');

    try {
      // Test Sui service initialization
      this.log('Testing Sui service initialization...');
      const suiInitialized = await browserSuiService.initialize();

      if (suiInitialized) {
        this.log('Sui service initialized successfully', 'success');
      } else {
        this.log('Sui service initialization failed', 'error');
        return false;
      }

      // Test Walrus service connectivity
      this.log('Testing Walrus service connectivity...');
      const walrusConnected = await browserWalrusService.connect();

      if (walrusConnected) {
        this.log('Walrus service connected successfully', 'success');
      } else {
        this.log('Walrus service connection failed', 'warning');
      }

      return true;
    } catch (error) {
      this.log(`Service initialization error: ${error.message}`, 'error');
      return false;
    }
  }

  async testTransactionCreation() {
    console.log('\n🧪 Testing Transaction Creation...\n');

    try {
      // Test spreadsheet creation transaction
      this.log('Testing spreadsheet creation transaction...');
      const createTx = await browserSuiService.createSpreadsheetTransaction('Test Spreadsheet');

      if (createTx) {
        this.log('Spreadsheet creation transaction created successfully', 'success');
      } else {
        this.log('Failed to create spreadsheet transaction', 'error');
        return false;
      }

      // Test storage transaction
      this.log('Testing storage transaction...');
      const testData = {
        spreadsheetObjectId: '0x123456789abcdef',
        walrusBlobId: 'test-blob-id-123',
        cellCount: 5,
        description: 'Test version',
        version: 'v1.0-test'
      };

      const storageTx = await browserSuiService.createStorageTransaction(testData);

      if (storageTx) {
        this.log('Storage transaction created successfully', 'success');
      } else {
        this.log('Failed to create storage transaction', 'error');
        return false;
      }

      return true;
    } catch (error) {
      this.log(`Transaction creation error: ${error.message}`, 'error');
      return false;
    }
  }

  async testWalrusStorage() {
    console.log('\n🧪 Testing Walrus Storage...\n');

    try {
      // Test data validation
      this.log('Testing data validation...');
      const testData = {
        spreadsheetId: 'test-123',
        version: 'v1.0-test',
        cells: {
          'A1': { value: 'Hello', displayValue: 'Hello', type: 'General' },
          'B1': { value: 'World', displayValue: 'World', type: 'General' }
        },
        metadata: {
          title: 'Test Spreadsheet',
          cellCount: 2
        }
      };

      const validation = browserWalrusService.validateDataForWalrus(testData);

      if (validation.valid) {
        this.log('Data validation passed', 'success');
      } else {
        this.log(`Data validation failed: ${validation.error}`, 'warning');
      }

      // Test blob storage (this will likely fail without real wallet, but tests the flow)
      this.log('Testing blob storage flow...');
      try {
        const result = await browserWalrusService.storeBlob(testData, {
          epochs: 1,
          maxRetries: 1
        });

        if (result.success) {
          this.log('Blob storage test successful', 'success');
          return result.blobId;
        } else {
          this.log(`Blob storage test failed: ${result.error}`, 'warning');
          return null;
        }
      } catch (storageError) {
        this.log(`Blob storage test error: ${storageError.message}`, 'warning');
        return null;
      }

    } catch (error) {
      this.log(`Walrus storage test error: ${error.message}`, 'error');
      return null;
    }
  }

  async testConfiguration() {
    console.log('\n🧪 Testing Configuration...\n');

    try {
      // Test Sui service configuration
      const suiConfig = browserSuiService.config?.sui;
      if (suiConfig) {
        this.log('Sui service configuration loaded', 'success');

        const requiredSuiFields = ['rpcUrl', 'packageId', 'registryObjectId'];
        for (const field of requiredSuiFields) {
          if (suiConfig[field]) {
            this.log(`Sui config field '${field}' is set`, 'success');
          } else {
            this.log(`Sui config field '${field}' is missing`, 'warning');
          }
        }
      } else {
        this.log('Sui service configuration not found', 'error');
        return false;
      }

      // Test Walrus service configuration
      // BrowserWalrusService gets config directly in constructor, so check its properties
      if (browserWalrusService.publisherUrl && browserWalrusService.aggregatorUrl) {
        this.log('Walrus service configuration loaded', 'success');

        this.log(`Walrus publisher URL: ${browserWalrusService.publisherUrl}`, 'success');
        this.log(`Walrus aggregator URL: ${browserWalrusService.aggregatorUrl}`, 'success');
      } else {
        this.log('Walrus service configuration not found', 'error');
        return false;
      }

      return true;
    } catch (error) {
      this.log(`Configuration test error: ${error.message}`, 'error');
      return false;
    }
  }

  async testServiceIntegration() {
    console.log('\n🧪 Testing Service Integration...\n');

    try {
      // Test that services are properly instantiated
      if (browserSuiService && typeof browserSuiService.initialize === 'function') {
        this.log('BrowserSuiService properly instantiated', 'success');
      } else {
        this.log('BrowserSuiService not properly instantiated', 'error');
        return false;
      }

      if (browserWalrusService && typeof browserWalrusService.connect === 'function') {
        this.log('BrowserWalrusService properly instantiated', 'success');
      } else {
        this.log('BrowserWalrusService not properly instantiated', 'error');
        return false;
      }

      if (browserWalletManager && typeof browserWalletManager.connect === 'function') {
        this.log('BrowserWalletManager properly instantiated', 'success');
      } else {
        this.log('BrowserWalletManager not properly instantiated', 'error');
        return false;
      }

      // Test service status
      const suiStatus = browserSuiService.getStatus();
      if (suiStatus) {
        this.log('Sui service status retrieved successfully', 'success');
      }

      const walrusStatus = browserWalrusService.getStatus();
      if (walrusStatus) {
        this.log('Walrus service status retrieved successfully', 'success');
      }

      return true;
    } catch (error) {
      this.log(`Service integration test error: ${error.message}`, 'error');
      return false;
    }
  }

  async runAllTests() {
    console.log('🚀 Starting WalSheetz Blockchain Integration Tests...\n');
    console.log('='.repeat(60));

    const tests = [
      { name: 'Configuration Test', method: this.testConfiguration.bind(this) },
      { name: 'Service Integration Test', method: this.testServiceIntegration.bind(this) },
      { name: 'Service Initialization Test', method: this.testServiceInitialization.bind(this) },
      { name: 'Transaction Creation Test', method: this.testTransactionCreation.bind(this) },
      { name: 'ABI Detection Test', method: this.testABIDetection.bind(this) },
      { name: 'Walrus Storage Test', method: this.testWalrusStorage.bind(this) }
    ];

    for (const test of tests) {
      try {
        console.log(`\n📋 Running ${test.name}...`);
        const result = await test.method();

        if (result === false) {
          this.log(`${test.name} failed`, 'error');
        } else {
          this.log(`${test.name} completed`, 'success');
        }
      } catch (error) {
        this.log(`${test.name} threw exception: ${error.message}`, 'error');
      }
    }

    this.generateReport();
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('WalSheetz Blockchain Integration Test Report');
    console.log('='.repeat(60));

    console.log(`\n✅ PASSED (${this.testResults.passed.length}):`);
    this.testResults.passed.forEach(item => console.log(`   • ${item}`));

    if (this.testResults.warnings.length > 0) {
      console.log(`\n⚠️  WARNINGS (${this.testResults.warnings.length}):`);
      this.testResults.warnings.forEach(item => console.log(`   • ${item}`));
    }

    if (this.testResults.failed.length > 0) {
      console.log(`\n❌ FAILED (${this.testResults.failed.length}):`);
      this.testResults.failed.forEach(item => console.log(`   • ${item}`));
    }

    console.log('\n' + '='.repeat(60));

    const totalTests = this.testResults.passed.length + this.testResults.warnings.length + this.testResults.failed.length;
    const successRate = ((this.testResults.passed.length) / totalTests * 100).toFixed(1);

    console.log(`\nOverall Success Rate: ${successRate}%`);
    console.log(`Total Tests: ${totalTests}`);

    if (this.testResults.failed.length === 0 && this.testResults.warnings.length === 0) {
      console.log('🎉 All tests passed! Blockchain integration should be working correctly.');
    } else if (this.testResults.failed.length === 0) {
      console.log('⚠️  Some tests had warnings but no failures. Integration should work with limitations.');
    } else {
      console.log('❌ Some tests failed. Check the issues above before proceeding.');
    }

    console.log('\nNext Steps:');
    if (this.testResults.failed.length > 0) {
      console.log('1. Fix the failed tests listed above');
    }
    console.log('2. Test with a real wallet connection');
    console.log('3. Test actual spreadsheet creation and saving');
    console.log('4. Verify data persistence across browser sessions');

    console.log('\n' + '='.repeat(60));
  }

  async testABIDetection() {
    console.log('\n🔍 Testing ABI Detection...\n');

    try {
      // Import ABI helpers for testing
      const { configLoader } = await import('../frontend/utils/ConfigLoader.js');
      const { detectSaveVersionSignature } = await import('../frontend/utils/AbiHelpers.js');

      this.log('Testing ABI detection for save_version function...');
      const abiInfo = await detectSaveVersionSignature();

      if (!abiInfo.params || abiInfo.params.length === 0) {
        this.log('ABI detection failed - no parameters found', 'error');
        console.log('ABI Response:', abiInfo);
        return false;
      }

      this.log(`ABI detection successful! Found ${abiInfo.params.length} parameters`, 'success');
      this.log(`Expects content_hash: ${abiInfo.expectsContentHash}`, 'info');

      console.log('ABI Debug Info:', JSON.stringify(abiInfo.debug, null, 2));

      // Validate that we can build arguments correctly
      if (abiInfo.expectsContentHash) {
        this.log('Contract expects content_hash parameter (7 args total)', 'info');
      } else {
        this.log('Contract does NOT expect content_hash parameter (6 args total)', 'info');
      }

      return true;

    } catch (error) {
      this.log(`ABI detection test failed: ${error.message}`, 'error');
      console.error('Error details:', error);
      return false;
    }
  }
}

// Run tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const testSuite = new BlockchainIntegrationTest();
  testSuite.runAllTests().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}

export default BlockchainIntegrationTest;
