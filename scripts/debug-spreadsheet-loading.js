#!/usr/bin/env node

/**
 * Spreadsheet Loading Debug Script
 *
 * This script helps debug spreadsheet loading issues by:
 * 1. Checking browser console logs
 * 2. Testing the loading flow step by step
 * 3. Providing actionable debugging steps
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class LoadingDebugger {
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

  async checkLuckysheetIntegration() {
    const spreadsheetJsxPath = path.join(__dirname, '..', 'frontend', 'presentation', 'components', 'Spreadsheet.jsx');

    if (!await this.checkFileExists(spreadsheetJsxPath, 'Spreadsheet component')) {
      return false;
    }

    try {
      const content = fs.readFileSync(spreadsheetJsxPath, 'utf8');

      // Check for Luckysheet initialization
      const checks = [
        { pattern: 'window.luckysheet', description: 'Luckysheet global object usage' },
        { pattern: 'luckysheet.create', description: 'Luckysheet create method' },
        { pattern: 'convertToLuckysheetData', description: 'Data conversion function' },
        { pattern: 'handleCellEdit', description: 'Cell edit handling' },
        { pattern: 'cellEditBefore', description: 'Cell edit before hook' },
        { pattern: 'cellEditEnd', description: 'Cell edit end hook' }
      ];

      let score = 0;
      for (const check of checks) {
        if (content.includes(check.pattern)) {
          score++;
          this.log(`${check.description} found`, 'success');
        } else {
          this.log(`${check.description} missing`, 'warning');
        }
      }

      if (score === checks.length) {
        this.log('Luckysheet integration is complete', 'success');
      } else {
        this.log(`Luckysheet integration incomplete: ${score}/${checks.length} checks passed`, 'warning');
      }

      return true;
    } catch (error) {
      this.log(`Error checking Luckysheet integration: ${error.message}`, 'error');
      return false;
    }
  }

  async checkDataFlow() {
    const useSpreadsheetPath = path.join(__dirname, '..', 'frontend', 'business', 'useSpreadsheet.js');

    if (!await this.checkFileExists(useSpreadsheetPath, 'useSpreadsheet hook')) {
      return false;
    }

    try {
      const content = fs.readFileSync(useSpreadsheetPath, 'utf8');

      // Check data flow components
      const flowChecks = [
        { pattern: 'loadSpreadsheet', description: 'Load spreadsheet function' },
        { pattern: 'blockchainRef.current.loadSpreadsheet', description: 'Blockchain adapter load call' },
        { pattern: 'engineRef.current.loadData', description: 'Engine load data call' },
        { pattern: 'setSpreadsheetData', description: 'State update for spreadsheet data' },
        { pattern: 'spreadsheetData', description: 'Spreadsheet data state' }
      ];

      let score = 0;
      for (const check of flowChecks) {
        if (content.includes(check.pattern)) {
          score++;
          this.log(`${check.description} found`, 'success');
        } else {
          this.log(`${check.description} missing`, 'warning');
        }
      }

      if (score === flowChecks.length) {
        this.log('Data flow integration is complete', 'success');
      } else {
        this.log(`Data flow incomplete: ${score}/${flowChecks.length} checks passed`, 'warning');
      }

      return true;
    } catch (error) {
      this.log(`Error checking data flow: ${error.message}`, 'error');
      return false;
    }
  }

  async checkBlockchainAdapter() {
    const adapterPath = path.join(__dirname, '..', 'frontend', 'adapters', 'BlockchainAdapter.js');

    if (!await this.checkFileExists(adapterPath, 'BlockchainAdapter')) {
      return false;
    }

    try {
      const content = fs.readFileSync(adapterPath, 'utf8');

      // Check for loadSpreadsheet method
      const loadMethodChecks = [
        { pattern: 'async loadSpreadsheet', description: 'loadSpreadsheet method' },
        { pattern: 'this.suiService.getSpreadsheetData', description: 'Sui service call' },
        { pattern: 'this.walrusService.retrieveBlob', description: 'Walrus service call' },
        { pattern: 'onProgress', description: 'Progress callback support' },
        { pattern: 'this.spreadsheetObjectId = spreadsheetId', description: 'Object ID setting' }
      ];

      let score = 0;
      for (const check of loadMethodChecks) {
        if (content.includes(check.pattern)) {
          score++;
          this.log(`${check.description} found`, 'success');
        } else {
          this.log(`${check.description} missing`, 'warning');
        }
      }

      if (score === loadMethodChecks.length) {
        this.log('BlockchainAdapter loadSpreadsheet method is complete', 'success');
      } else {
        this.log(`BlockchainAdapter load method incomplete: ${score}/${loadMethodChecks.length} checks passed`, 'warning');
      }

      return true;
    } catch (error) {
      this.log(`Error checking BlockchainAdapter: ${error.message}`, 'error');
      return false;
    }
  }

  async checkBrowserServices() {
    const servicesPath = path.join(__dirname, '..', 'frontend', 'services');

    if (!await this.checkFileExists(servicesPath, 'Services directory', true)) {
      return false;
    }

    const requiredServices = [
      'BrowserSuiService.js',
      'BrowserWalrusService.js'
    ];

    let allServicesExist = true;
    for (const service of requiredServices) {
      const servicePath = path.join(servicesPath, service);
      if (!await this.checkFileExists(servicePath, `${service} service`)) {
        allServicesExist = false;
      }
    }

    if (allServicesExist) {
      this.log('All required browser services exist', 'success');
    } else {
      this.log('Some browser services are missing', 'error');
    }

    return allServicesExist;
  }

  async checkFileExists(filePath, description, isDirectory = false) {
    try {
      const stats = fs.statSync(filePath);
      if (isDirectory && !stats.isDirectory()) {
        this.log(`${description} is not a directory: ${filePath}`, 'error');
        return false;
      }
      if (!isDirectory && !stats.isFile()) {
        this.log(`${description} is not a file: ${filePath}`, 'error');
        return false;
      }
      this.log(`${description} exists: ${filePath}`, 'success');
      return true;
    } catch (error) {
      this.log(`${description} missing: ${filePath}`, 'error');
      return false;
    }
  }

  generateDebuggingGuide() {
    console.log('\n🔧 Spreadsheet Loading Debug Guide');
    console.log('='.repeat(50));
    console.log('');

    console.log('1. Open your browser to: http://localhost:3000');
    console.log('2. Open Developer Tools (F12) and go to Console tab');
    console.log('3. Connect your wallet (Slush wallet)');
    console.log('4. Try to load a spreadsheet and watch for errors');
    console.log('');

    console.log('COMMON ISSUES TO CHECK:');
    console.log('');

    if (this.issues.includes('BlockchainAdapter service missing')) {
      console.log('❌ BlockchainAdapter Missing:');
      console.log('   - Check if frontend/adapters/BlockchainAdapter.js exists');
      console.log('   - Verify imports in useSpreadsheet.js are correct');
      console.log('   - Look for "BlockchainAdapter is not defined" errors');
      console.log('');
    }

    if (this.issues.includes('BrowserSuiService service missing')) {
      console.log('❌ BrowserSuiService Missing:');
      console.log('   - Check if frontend/services/BrowserSuiService.js exists');
      console.log('   - Verify the file is being imported correctly');
      console.log('   - Look for Sui-related errors in console');
      console.log('');
    }

    if (this.issues.includes('BrowserWalrusService service missing')) {
      console.log('❌ BrowserWalrusService Missing:');
      console.log('   - Check if frontend/services/BrowserWalrusService.js exists');
      console.log('   - Verify Walrus connectivity errors');
      console.log('   - Check for blob retrieval errors');
      console.log('');
    }

    console.log('DEBUGGING STEPS:');
    console.log('');
    console.log('Step 1: Check Browser Console');
    console.log('   - Open DevTools → Console tab');
    console.log('   - Look for JavaScript errors (red text)');
    console.log('   - Check for network errors (failed requests)');
    console.log('');

    console.log('Step 2: Test Wallet Connection');
    console.log('   - Click "Connect Slush" button');
    console.log('   - Approve connection in wallet');
    console.log('   - Check if wallet status shows as connected');
    console.log('');

    console.log('Step 3: Test Spreadsheet Loading');
    console.log('   - Click "📊 My Spreadsheets" dropdown');
    console.log('   - Click "📂 Load" on any spreadsheet');
    console.log('   - Watch console for loading progress/errors');
    console.log('');

    console.log('Step 4: Check Network Requests');
    console.log('   - Open DevTools → Network tab');
    console.log('   - Try loading a spreadsheet');
    console.log('   - Look for failed requests to:');
    console.log('     * https://fullnode.testnet.sui.io');
    console.log('     * https://publisher.walrus-testnet.walrus.space');
    console.log('     * https://aggregator.walrus-testnet.walrus.space');
    console.log('');

    console.log('EXPECTED SUCCESS FLOW:');
    console.log('   1. Wallet connects successfully');
    console.log('   2. Spreadsheet list loads from blockchain');
    console.log('   3. Clicking "Load" shows loading spinner');
    console.log('   4. Console shows: "Loading spreadsheet from Walrus"');
    console.log('   5. Spreadsheet data appears in the grid');
    console.log('');

    console.log('TROUBLESHOOTING:');
    console.log('');
    console.log('If you see "Failed to load spreadsheet":');
    console.log('   - Check if wallet is connected');
    console.log('   - Verify Sui testnet connectivity');
    console.log('   - Check if spreadsheet has saved data');
    console.log('');

    console.log('If you see network errors:');
    console.log('   - Check internet connectivity');
    console.log('   - Verify testnet endpoints are accessible');
    console.log('   - Try refreshing the page');
    console.log('');

    console.log('If spreadsheet loads but shows empty:');
    console.log('   - Check if spreadsheet was saved with data');
    console.log('   - Verify Walrus blob exists and is accessible');
    console.log('   - Check browser console for data parsing errors');
    console.log('');

    console.log('='.repeat(50));
  }

  async runDebugAnalysis() {
    console.log('🔍 Spreadsheet Loading Debug Analysis');
    console.log('=====================================');
    console.log('');

    // Check file structure
    await this.checkLuckysheetIntegration();
    await this.checkDataFlow();
    await this.checkBlockchainAdapter();
    await this.checkBrowserServices();

    // Generate debugging guide
    this.generateDebuggingGuide();

    // Summary
    console.log('\n📊 SUMMARY');
    console.log('='.repeat(50));

    const totalChecks = this.passed.length + this.warnings.length + this.issues.length;

    if (this.issues.length === 0) {
      console.log('✅ No critical issues found - loading should work');
      console.log('   If you\'re still having issues, check the debugging guide above');
    } else {
      console.log(`❌ ${this.issues.length} critical issues found`);
      console.log('   Fix these issues before testing spreadsheet loading');
    }

    if (this.warnings.length > 0) {
      console.log(`⚠️  ${this.warnings.length} warnings - may cause intermittent issues`);
    }

    console.log(`✅ ${this.passed.length} checks passed`);

    console.log('\n🎯 NEXT STEPS:');
    console.log('1. Open http://localhost:3000 in your browser');
    console.log('2. Open Developer Tools (F12)');
    console.log('3. Follow the debugging guide above');
    console.log('4. Report any specific errors you encounter');

    console.log('\n' + '='.repeat(50));
  }
}

// Run debug analysis if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const debugTool = new LoadingDebugger();
  debugTool.runDebugAnalysis().catch(error => {
    console.error('Debug analysis failed:', error);
    process.exit(1);
  });
}

export default LoadingDebugger;
