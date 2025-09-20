#!/usr/bin/env node

/**
 * WalSheetz Proxy Endpoint Verification Script
 *
 * Quick verification script for Walrus proxy endpoints
 * Run with: node scripts/test-proxy.js
 */

async function testEndpoint(url, description) {
  try {
    console.log(`\n🔍 Testing ${description}...`);
    console.log(`   URL: ${url}`);

    const response = await fetch(url);
    const status = response.status;

    if (status === 200 || status === 404) {
      console.log(`   ✅ ${description} accessible (${status})`);
      return true;
    } else {
      console.log(`   ⚠️  ${description} returned unexpected status: ${status}`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ ${description} failed: ${error.message}`);
    return false;
  }
}

async function testWalrusPublisher() {
  console.log(`\n🧪 Testing Walrus Publisher with small payload...`);

  try {
    const testData = JSON.stringify({
      test: 'proxy-verification',
      timestamp: Date.now(),
      source: 'test-proxy.js'
    });

    const response = await fetch('http://localhost:3005/walrus-publisher/v1/blobs?epochs=1', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'WalSheetz-ProxyTest/1.0.0'
      },
      body: testData
    });

    if (response.ok) {
      const result = await response.json();

      if (result.newlyCreated || result.alreadyCertified) {
        console.log(`   ✅ Walrus Publisher PUT test successful`);
        console.log(`   📝 Response keys: ${Object.keys(result).join(', ')}`);

        if (result.newlyCreated) {
          console.log(`   🆔 Blob ID: ${result.newlyCreated.blobObject.blobId}`);
        }

        return true;
      } else {
        console.log(`   ⚠️  Unexpected response format`);
        console.log(`   📝 Response: ${JSON.stringify(result, null, 2)}`);
        return false;
      }
    } else {
      console.log(`   ❌ PUT test failed with status: ${response.status}`);
      const text = await response.text();
      console.log(`   📝 Response: ${text}`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ PUT test error: ${error.message}`);
    return false;
  }
}

async function checkServerRunning() {
  try {
    const response = await fetch('http://localhost:3005/', {
      method: 'HEAD',
      timeout: 5000
    });
    return true;
  } catch (error) {
    return false;
  }
}

async function main() {
  console.log('🦭 WalSheetz Proxy Endpoint Verification');
  console.log('=' .repeat(50));

  // Check if dev server is running
  const serverRunning = await checkServerRunning();
  if (!serverRunning) {
    console.log('❌ Development server is not running on localhost:3005');
    console.log('💡 Start it with: bun run dev');
    process.exit(1);
  }

  console.log('✅ Development server is running');

  // Test endpoints
  const results = [];

  results.push(await testEndpoint(
    'http://localhost:3005/walrus-publisher/v1/info',
    'Walrus Publisher /v1/info'
  ));

  results.push(await testEndpoint(
    'http://localhost:3005/walrus-aggregator/v1/info',
    'Walrus Aggregator /v1/info'
  ));

  // Test publisher functionality
  results.push(await testWalrusPublisher());

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));

  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${total - passed}/${total}`);

  if (passed === total) {
    console.log('🎉 All proxy tests passed!');
    console.log('💡 Proxy configuration is working correctly');
  } else {
    console.log('⚠️  Some tests failed');
    console.log('💡 Check proxy configuration in vite.config.js');
    console.log('💡 Verify Walrus testnet endpoints are accessible');
  }

  console.log('\n🔗 Useful Commands:');
  console.log('   bun run dev              # Start development server');
  console.log('   node scripts/diagnose-save-issues.js  # Full diagnostics');
  console.log('   node scripts/test-proxy.js            # This script');

  process.exit(passed === total ? 0 : 1);
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

export default main;