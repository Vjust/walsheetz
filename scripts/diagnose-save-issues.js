#!/usr/bin/env node

/**
 * WalSheetz Save Functionality Diagnostic Script
 *
 * This script diagnoses issues with saving to blockchain and Walrus storage
 * Run with: node scripts/diagnose-save-issues.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SaveDiagnostics {
  constructor() {
    this.issues = [];
    this.passed = [];
    this.warnings = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] ${message}`;

    switch (type) {
      case 'error':
        console.error(`❌ ${formatted}`);
        this.issues.push(message);
        break;
      case 'warning':
        console.warn(`⚠️  ${formatted}`);
        this.warnings.push(message);
        break;
      case 'success':
        console.log(`✅ ${formatted}`);
        this.passed.push(message);
        break;
      case 'info':
      default:
        console.log(`ℹ️  ${formatted}`);
        break;
    }
  }

  async checkFileExists(filePath, description) {
    if (fs.existsSync(filePath)) {
      this.log(`${description} found: ${filePath}`, 'success');
      return true;
    } else {
      this.log(`${description} missing: ${filePath}`, 'error');
      return false;
    }
  }

  async checkFrontendService(servicePath, serviceName) {
    const fullPath = path.join(__dirname, '..', 'frontend', servicePath);
    if (!await this.checkFileExists(fullPath, `${serviceName} service`)) {
      return false;
    }

    try {
      const content = fs.readFileSync(fullPath, 'utf8');

      // Check for key methods
      const requiredMethods = {
        'BlockchainAdapter': ['saveToBlockchain', 'createNewSpreadsheetOptimized'],
        'BrowserSuiService': ['createSpreadsheetTransaction', 'executeTransaction'],
        'BrowserWalrusService': ['storeBlob', 'connect'],
        'SpreadsheetEngine': ['save', 'collectSpreadsheetData'],
        'StorageAdapter': ['saveData', 'loadData']
      };

      const serviceMethods = requiredMethods[serviceName] || [];
      let methodsFound = 0;

      for (const method of serviceMethods) {
        if (content.includes(`async ${method}(`) || content.includes(`${method}(`)) {
          methodsFound++;
        } else {
          this.log(`Method ${method} not found in ${serviceName}`, 'warning');
        }
      }

      if (methodsFound === serviceMethods.length) {
        this.log(`All required methods found in ${serviceName}`, 'success');
      } else {
        this.log(`Some methods missing in ${serviceName}: ${methodsFound}/${serviceMethods.length} found`, 'warning');
      }

      return true;
    } catch (error) {
      this.log(`Error reading ${serviceName}: ${error.message}`, 'error');
      return false;
    }
  }

  async checkBackendService(servicePath, serviceName) {
    const fullPath = path.join(__dirname, '..', 'blockchain', servicePath);
    if (!await this.checkFileExists(fullPath, `Backend ${serviceName} service`)) {
      return false;
    }

    try {
      const content = fs.readFileSync(fullPath, 'utf8');

      // Check for key methods (backend services - frontend services are more important)
      const requiredMethods = {
        'sui-service': ['createSpreadsheetTransaction', 'executeTransaction', 'storeSpreadsheetVersion'],
        'walrus-service': ['storeBlob', 'retrieveBlob'], // connect method not required for backend
        'wallet-manager': ['connect', 'signAndExecuteTransaction']
      };

      const serviceMethods = requiredMethods[serviceName] || [];
      let methodsFound = 0;

      for (const method of serviceMethods) {
        if (content.includes(`async ${method}(`) || content.includes(`${method}(`)) {
          methodsFound++;
        } else {
          this.log(`Method ${method} not found in ${serviceName}`, 'warning');
        }
      }

      if (methodsFound === serviceMethods.length) {
        this.log(`All required methods found in ${serviceName}`, 'success');
      } else {
        this.log(`Some methods missing in ${serviceName}: ${methodsFound}/${serviceMethods.length} found`, 'warning');
      }

      return true;
    } catch (error) {
      this.log(`Error reading ${serviceName}: ${error.message}`, 'error');
      return false;
    }
  }

  async checkConfiguration() {
    const configPath = path.join(__dirname, '..', 'blockchain', 'config.js');
    if (!await this.checkFileExists(configPath, 'Configuration file')) {
      return false;
    }

    try {
      const content = fs.readFileSync(configPath, 'utf8');

      // Check for required configuration sections (actual config structure)
      const requiredConfigs = [
        'rpcUrl',
        'packageId',
        'registryObjectId',
        'publisherUrl',
        'aggregatorUrl'
      ];

      let configsFound = 0;
      for (const config of requiredConfigs) {
        if (content.includes(config)) {
          configsFound++;
        } else {
          this.log(`Configuration ${config} not found`, 'warning');
        }
      }

      if (configsFound === requiredConfigs.length) {
        this.log('All required configurations found', 'success');
      } else {
        this.log(`Some configurations missing: ${configsFound}/${requiredConfigs.length} found`, 'warning');
      }

      // Check for placeholder values
      if (content.includes('REPLACE_WITH_ACTUAL') || content.includes('YOUR_')) {
        this.log('Configuration contains placeholder values that need to be replaced', 'warning');
      }

      return true;
    } catch (error) {
      this.log(`Error reading configuration: ${error.message}`, 'error');
      return false;
    }
  }

  async checkIntegrationPoints() {
    const useSpreadsheetPath = path.join(__dirname, '..', 'frontend', 'business', 'useSpreadsheet.js');

    if (!await this.checkFileExists(useSpreadsheetPath, 'Main useSpreadsheet hook')) {
      return false;
    }

    try {
      const content = fs.readFileSync(useSpreadsheetPath, 'utf8');

      // Check for key integration points
      const integrationPoints = [
        'saveToBlockchain',
        'SpreadsheetEngine',
        'BlockchainAdapter',
        'StorageAdapter',
        'engineRef.current.save'
      ];

      let pointsFound = 0;
      for (const point of integrationPoints) {
        if (content.includes(point)) {
          pointsFound++;
        } else {
          this.log(`Integration point ${point} not found in useSpreadsheet`, 'warning');
        }
      }

      if (pointsFound === integrationPoints.length) {
        this.log('All key integration points found in useSpreadsheet', 'success');
      } else {
        this.log(`Some integration points missing: ${pointsFound}/${integrationPoints.length} found`, 'warning');
      }

      return true;
    } catch (error) {
      this.log(`Error reading useSpreadsheet: ${error.message}`, 'error');
      return false;
    }
  }

  async checkSaveFlow() {
    const spreadsheetEnginePath = path.join(__dirname, '..', 'frontend', 'core', 'SpreadsheetEngine.js');

    if (!await this.checkFileExists(spreadsheetEnginePath, 'SpreadsheetEngine')) {
      return false;
    }

    try {
      const content = fs.readFileSync(spreadsheetEnginePath, 'utf8');

      // Check for complete save flow
      const saveFlowSteps = [
        'collectSpreadsheetData',
        'storageService.saveData',
        'blockchainService.saveToBlockchain',
        'this.editCount = 0',
        'this.pendingEdits.clear'
      ];

      let stepsFound = 0;
      for (const step of saveFlowSteps) {
        if (content.includes(step)) {
          stepsFound++;
        } else {
          this.log(`Save flow step missing: ${step}`, 'warning');
        }
      }

      if (stepsFound === saveFlowSteps.length) {
        this.log('Complete save flow found in SpreadsheetEngine', 'success');
      } else {
        this.log(`Incomplete save flow: ${stepsFound}/${saveFlowSteps.length} steps found`, 'warning');
      }

      return true;
    } catch (error) {
      this.log(`Error reading SpreadsheetEngine: ${error.message}`, 'error');
      return false;
    }
  }

  async checkAutoSave() {
    const spreadsheetEnginePath = path.join(__dirname, '..', 'frontend', 'core', 'SpreadsheetEngine.js');

    try {
      const content = fs.readFileSync(spreadsheetEnginePath, 'utf8');

      // Check for auto-save functionality
      const autoSaveFeatures = [
        'autoSaveInterval',
        'editThreshold',
        'autoSaveTimer',
        'setupAutoSave',
        'setInterval'
      ];

      let featuresFound = 0;
      for (const feature of autoSaveFeatures) {
        if (content.includes(feature)) {
          featuresFound++;
        } else {
          this.log(`Auto-save feature missing: ${feature}`, 'warning');
        }
      }

      if (featuresFound === autoSaveFeatures.length) {
        this.log('Auto-save functionality is properly implemented', 'success');
      } else {
        this.log(`Auto-save incomplete: ${featuresFound}/${autoSaveFeatures.length} features found`, 'warning');
      }

      return true;
    } catch (error) {
      this.log(`Error checking auto-save: ${error.message}`, 'error');
      return false;
    }
  }

  async checkWalrusEndpoints() {
    this.log('Checking Walrus endpoint connectivity...', 'info');

    try {
      // Test publisher health endpoint
      const publisherResponse = await fetch('http://localhost:3005/walrus-publisher/v1/info');
      const publisherStatus = publisherResponse.status;

      if (publisherStatus === 200 || publisherStatus === 404) {
        this.log(`Walrus Publisher endpoint accessible (${publisherStatus})`, 'success');
      } else {
        this.log(`Walrus Publisher endpoint returned ${publisherStatus}`, 'warning');
      }

      // Test aggregator health endpoint
      const aggregatorResponse = await fetch('http://localhost:3005/walrus-aggregator/v1/info');
      const aggregatorStatus = aggregatorResponse.status;

      if (aggregatorStatus === 200 || aggregatorStatus === 404) {
        this.log(`Walrus Aggregator endpoint accessible (${aggregatorStatus})`, 'success');
      } else {
        this.log(`Walrus Aggregator endpoint returned ${aggregatorStatus}`, 'warning');
      }

      // Optional: Test a small PUT to validate functionality
      this.log('Testing Walrus Publisher with small payload...', 'info');
      try {
        const testData = JSON.stringify({ diagnostic: 'test', timestamp: Date.now() });
        const putResponse = await fetch('http://localhost:3005/walrus-publisher/v1/blobs?epochs=1', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: testData
        });

        if (putResponse.ok) {
          const result = await putResponse.json();
          if (result.newlyCreated || result.alreadyCertified) {
            this.log('Walrus Publisher PUT test successful', 'success');
          } else {
            this.log('Walrus Publisher PUT returned unexpected response format', 'warning');
          }
        } else {
          this.log(`Walrus Publisher PUT test failed with status ${putResponse.status}`, 'warning');
        }
      } catch (putError) {
        this.log(`Walrus Publisher PUT test error: ${putError.message}`, 'warning');
      }

      return true;
    } catch (error) {
      this.log(`Walrus endpoint connectivity test failed: ${error.message}`, 'error');
      this.log('Remediation: Check if Vite dev server is running (bun run dev)', 'info');
      this.log('Remediation: Verify proxy configuration in vite.config.js', 'info');
      this.log('Remediation: Check if Walrus testnet endpoints are reachable', 'info');
      return false;
    }
  }

  async generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('WalSheetz Save Functionality Diagnostic Report');
    console.log('='.repeat(60));

    console.log(`\n✅ PASSED (${this.passed.length}):`);
    this.passed.forEach(item => console.log(`   • ${item}`));

    if (this.warnings.length > 0) {
      console.log(`\n⚠️  WARNINGS (${this.warnings.length}):`);
      this.warnings.forEach(item => console.log(`   • ${item}`));
    }

    if (this.issues.length > 0) {
      console.log(`\n❌ ISSUES (${this.issues.length}):`);
      this.issues.forEach(item => console.log(`   • ${item}`));
    }

    console.log('\n' + '='.repeat(60));

    // Overall assessment
    const totalChecks = this.passed.length + this.warnings.length + this.issues.length;
    const healthScore = ((this.passed.length * 1 + this.warnings.length * 0.5) / totalChecks * 100).toFixed(1);

    console.log(`\nOverall Health Score: ${healthScore}%`);

    if (this.issues.length === 0 && this.warnings.length === 0) {
      console.log('🎉 All checks passed! Save functionality should be working correctly.');
    } else if (this.issues.length === 0) {
      console.log('⚠️  Save functionality should work but may have minor issues.');
    } else {
      console.log('❌ Critical issues found that need to be addressed.');
    }

    console.log('\nRecommendations:');
    if (this.issues.length > 0) {
      console.log('1. Fix the critical issues listed above');
    }
    if (this.warnings.length > 0) {
      console.log('2. Address the warnings to improve reliability');
    }
    console.log('3. Test the save functionality manually after fixes');
    console.log('4. Check browser console for runtime errors');
    console.log('5. Verify wallet connection and network configuration');

    console.log('\n' + '='.repeat(60));
  }

  async runDiagnostics() {
    console.log('🔍 Starting WalSheetz Save Functionality Diagnostics...\n');

    // Check Walrus endpoint connectivity first
    await this.checkWalrusEndpoints();

    // Check frontend services
    await this.checkFrontendService('adapters/BlockchainAdapter.js', 'BlockchainAdapter');
    await this.checkFrontendService('services/BrowserSuiService.js', 'BrowserSuiService');
    await this.checkFrontendService('services/BrowserWalrusService.js', 'BrowserWalrusService');
    await this.checkFrontendService('core/SpreadsheetEngine.js', 'SpreadsheetEngine');
    await this.checkFrontendService('adapters/StorageAdapter.js', 'StorageAdapter');

    // Check backend services
    await this.checkBackendService('sui-service.js', 'sui-service');
    await this.checkBackendService('walrus-service.js', 'walrus-service');
    await this.checkBackendService('wallet-manager.js', 'wallet-manager');

    // Check configuration
    await this.checkConfiguration();

    // Check integration points
    await this.checkIntegrationPoints();
    await this.checkSaveFlow();
    await this.checkAutoSave();

    // Generate final report
    await this.generateReport();
  }
}

// Run diagnostics if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const diagnostics = new SaveDiagnostics();
  diagnostics.runDiagnostics().catch(error => {
    console.error('Diagnostics failed:', error);
    process.exit(1);
  });
}

export default SaveDiagnostics;
