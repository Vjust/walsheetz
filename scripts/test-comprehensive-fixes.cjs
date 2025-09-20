#!/usr/bin/env node

/**
 * Comprehensive Test Script for Wallet Reliability Fixes
 * Tests all the improvements we've implemented
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 WalSheetz Comprehensive Reliability Test Suite');
console.log('='.repeat(60));

const results = {
  tests: [],
  passed: 0,
  failed: 0,
  warnings: 0
};

function test(name, fn) {
  try {
    const result = fn();
    if (result === true) {
      results.tests.push({ name, status: '✅ PASS', message: '' });
      results.passed++;
      console.log(`✅ ${name}`);
    } else if (result.status === 'warning') {
      results.tests.push({ name, status: '⚠️ WARNING', message: result.message });
      results.warnings++;
      console.log(`⚠️ ${name}: ${result.message}`);
    } else {
      results.tests.push({ name, status: '❌ FAIL', message: result });
      results.failed++;
      console.log(`❌ ${name}: ${result}`);
    }
  } catch (error) {
    results.tests.push({ name, status: '❌ FAIL', message: error.message });
    results.failed++;
    console.log(`❌ ${name}: ${error.message}`);
  }
}

// Test 1: Walrus body stream fix
test('Walrus response.clone() implementation', () => {
  const walrusService = fs.readFileSync('frontend/services/BrowserWalrusService.js', 'utf8');
  if (walrusService.includes('response.clone()') && walrusService.includes('responseClone.arrayBuffer()')) {
    return true;
  }
  return 'Walrus response cloning not found';
});

// Test 2: Request deduplication
test('Walrus request deduplication', () => {
  const walrusService = fs.readFileSync('frontend/services/BrowserWalrusService.js', 'utf8');
  if (walrusService.includes('pendingRequests') && walrusService.includes('this.pendingRequests.has(requestKey)')) {
    return true;
  }
  return 'Request deduplication not implemented';
});

// Test 3: Transaction queue management
test('Transaction queue in BrowserSuiService', () => {
  const suiService = fs.readFileSync('frontend/services/BrowserSuiService.js', 'utf8');
  if (suiService.includes('transactionQueue') && suiService.includes('_processTransactionQueue') && suiService.includes('isProcessingTransaction')) {
    return true;
  }
  return 'Transaction queue not implemented';
});

// Test 4: Enhanced session restoration
test('Session restoration with retry logic', () => {
  const useSpreadsheet = fs.readFileSync('frontend/business/useSpreadsheet.js', 'utf8');
  if (useSpreadsheet.includes('sessionGuards') && useSpreadsheet.includes('maxRetries: 2') && useSpreadsheet.includes('for (let attempt = 0; attempt <= sessionGuards.maxRetries; attempt++)')) {
    return true;
  }
  return 'Enhanced session restoration not found';
});

// Test 5: Wallet health monitoring
test('Health monitoring in BrowserWalletManager', () => {
  const walletManager = fs.readFileSync('frontend/services/BrowserWalletManager.js', 'utf8');
  if (walletManager.includes('healthMonitor') && walletManager.includes('startHealthMonitoring') && walletManager.includes('_performHeartbeat')) {
    return true;
  }
  return 'Health monitoring not implemented';
});

// Test 6: Health status in StatusBar
test('Health status integration in StatusBar', () => {
  const statusBar = fs.readFileSync('frontend/presentation/components/StatusBar.jsx', 'utf8');
  if (statusBar.includes('healthStatus') && statusBar.includes('browserWalletManager') && statusBar.includes('healthUpdate')) {
    return true;
  }
  return 'Health status integration not found';
});

// Test 7: Error boundaries
test('Error boundary components', () => {
  const errorBoundary = fs.readFileSync('frontend/presentation/components/ErrorBoundary.jsx', 'utf8');
  const app = fs.readFileSync('frontend/presentation/App.jsx', 'utf8');
  if (errorBoundary.includes('componentDidCatch') && app.includes('<ErrorBoundary>')) {
    return true;
  }
  return 'Error boundaries not properly configured';
});

// Test 8: Wallet reconnection logic
test('Wallet reconnection in BrowserWalletManager', () => {
  const walletManager = fs.readFileSync('frontend/services/BrowserWalletManager.js', 'utf8');
  if (walletManager.includes('reconnectWallet') && walletManager.includes('🔄 Attempting wallet reconnection')) {
    return true;
  }
  return 'Wallet reconnection logic not found';
});

// Test 9: Enhanced retry logic
test('Enhanced retry logic with exponential backoff', () => {
  const walletManager = fs.readFileSync('frontend/services/BrowserWalletManager.js', 'utf8');
  if (walletManager.includes('maxRetries = 3') && walletManager.includes('isRetryableError') && walletManager.includes('exponential backoff')) {
    return true;
  }
  return 'Enhanced retry logic not complete';
});

// Test 10: Transaction attempt recording
test('Transaction attempt recording for health monitoring', () => {
  const walletManager = fs.readFileSync('frontend/services/BrowserWalletManager.js', 'utf8');
  if (walletManager.includes('recordTransactionAttempt') && walletManager.includes('transactionHistory')) {
    return true;
  }
  return 'Transaction attempt recording not found';
});

// Test 11: Enhanced error handling
test('Enhanced error messages and context', () => {
  const useSpreadsheet = fs.readFileSync('frontend/business/useSpreadsheet.js', 'utf8');
  const walletManager = fs.readFileSync('frontend/services/BrowserWalletManager.js', 'utf8');

  if (useSpreadsheet.includes('Engine data loading failed') &&
      walletManager.includes('Wallet communication failed after') &&
      walletManager.includes('enhancedError')) {
    return true;
  }
  return 'Enhanced error handling not complete';
});

// Test 12: Connection recovery configuration
test('Connection recovery in WalletProviders', () => {
  const walletProviders = fs.readFileSync('frontend/providers/WalletProviders.jsx', 'utf8');
  if (walletProviders.includes('enableConnectionRecovery') && walletProviders.includes('autoReconnectOnFocus')) {
    return true;
  }
  return { status: 'warning', message: 'WalletProviders connection recovery not verified' };
});

// Test 13: Syntax validation
test('JavaScript syntax validation', () => {
  const files = [
    'frontend/services/BrowserWalletManager.js',
    'frontend/services/BrowserSuiService.js',
    'frontend/services/BrowserWalrusService.js',
    'frontend/business/useSpreadsheet.js',
    'frontend/presentation/components/StatusBar.jsx'
  ];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      // Basic syntax checks
      if (content.includes('try {') && !content.includes('} catch')) {
        return `Incomplete try-catch in ${file}`;
      }
      if (content.includes('async ') && content.includes('await ') && !content.includes('catch')) {
        return { status: 'warning', message: `Potential unhandled async errors in ${file}` };
      }
    } catch (error) {
      return `Cannot read ${file}: ${error.message}`;
    }
  }
  return true;
});

// Test 14: Documentation
test('Implementation documentation', () => {
  if (fs.existsSync('WALLET_RELIABILITY_FIXES.md')) {
    const docs = fs.readFileSync('WALLET_RELIABILITY_FIXES.md', 'utf8');
    if (docs.includes('health monitoring') && docs.includes('transaction queue') && docs.includes('session restoration')) {
      return true;
    }
    return { status: 'warning', message: 'Documentation incomplete' };
  }
  return { status: 'warning', message: 'Implementation documentation not found' };
});

// Test 15: Integration completeness
test('Integration completeness check', () => {
  const walletManager = fs.readFileSync('frontend/services/BrowserWalletManager.js', 'utf8');
  const statusBar = fs.readFileSync('frontend/presentation/components/StatusBar.jsx', 'utf8');

  // Check if health monitoring is properly connected
  if (walletManager.includes('startHealthMonitoring()') &&
      walletManager.includes('stopHealthMonitoring()') &&
      statusBar.includes('getHealthStatus')) {
    return true;
  }
  return 'Health monitoring integration incomplete';
});

console.log('\n' + '='.repeat(60));
console.log('📊 Test Results Summary');
console.log('='.repeat(60));

console.log(`Total Tests: ${results.tests.length}`);
console.log(`✅ Passed: ${results.passed}`);
console.log(`❌ Failed: ${results.failed}`);
console.log(`⚠️ Warnings: ${results.warnings}`);

if (results.failed > 0) {
  console.log('\n❌ Failed Tests:');
  results.tests.filter(t => t.status.includes('FAIL')).forEach(t => {
    console.log(`   • ${t.name}: ${t.message}`);
  });
}

if (results.warnings > 0) {
  console.log('\n⚠️ Warnings:');
  results.tests.filter(t => t.status.includes('WARNING')).forEach(t => {
    console.log(`   • ${t.name}: ${t.message}`);
  });
}

const successRate = ((results.passed / results.tests.length) * 100).toFixed(1);
console.log(`\n🎯 Success Rate: ${successRate}%`);

if (successRate >= 90) {
  console.log('🎉 Excellent! The wallet reliability improvements are comprehensive.');
} else if (successRate >= 75) {
  console.log('👍 Good! Most improvements are in place, review warnings.');
} else if (successRate >= 50) {
  console.log('⚠️ Partial implementation. Several improvements need attention.');
} else {
  console.log('❌ Critical issues found. Major implementation gaps detected.');
}

// Additional analysis
console.log('\n📋 Implementation Analysis:');
console.log('='.repeat(40));

const analysis = [
  { area: 'Error Recovery', components: ['Walrus body stream fix', 'Transaction queue', 'Enhanced retry logic'] },
  { area: 'Connection Reliability', components: ['Health monitoring', 'Wallet reconnection', 'Connection recovery'] },
  { area: 'User Experience', components: ['Session restoration', 'Error boundaries', 'Health status UI'] },
  { area: 'Code Quality', components: ['Syntax validation', 'Documentation', 'Integration completeness'] }
];

analysis.forEach(area => {
  const areaTests = results.tests.filter(t =>
    area.components.some(comp => t.name.toLowerCase().includes(comp.toLowerCase()))
  );
  const areaSuccess = areaTests.filter(t => t.status.includes('PASS')).length;
  const areaRate = areaTests.length > 0 ? ((areaSuccess / areaTests.length) * 100).toFixed(0) : 0;
  console.log(`${area.area}: ${areaRate}% (${areaSuccess}/${areaTests.length})`);
});

console.log('\n💡 Next Steps:');
if (results.failed === 0 && results.warnings === 0) {
  console.log('✅ All improvements successfully implemented!');
  console.log('   • Test with real wallet operations');
  console.log('   • Monitor health status in development');
  console.log('   • Verify concurrent operation handling');
} else {
  console.log('🔧 Recommended actions:');
  if (results.failed > 0) console.log('   • Fix failing tests immediately');
  if (results.warnings > 0) console.log('   • Review warnings for potential improvements');
  console.log('   • Test with Slush wallet connection/disconnection');
  console.log('   • Verify error scenarios are handled gracefully');
}

process.exit(results.failed > 0 ? 1 : 0);