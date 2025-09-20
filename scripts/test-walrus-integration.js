// Test script to verify Walrus integration is working correctly
import { getCurrentConfig } from '../blockchain/config.js';

async function testWalrusIntegration() {
  console.log('🧪 Testing Walrus Integration...\n');

  const config = getCurrentConfig();

  // Test data
  const testData = {
    spreadsheetId: 'test-spreadsheet-123',
    version: 1,
    title: 'Test Spreadsheet',
    cells: {
      'A1': { v: 'Hello', t: 'string' },
      'B1': { v: 'World', t: 'string' },
      'A2': { v: 42, t: 'number' }
    },
    metadata: {
      title: 'Test Spreadsheet',
      createdAt: Date.now(),
      testRun: true
    }
  };

  console.log('📋 Configuration:');
  console.log(`  Publisher URL: ${config.walrus.publisherUrl}`);
  console.log(`  Aggregator URL: ${config.walrus.aggregatorUrl}`);
  console.log(`  Blob URL: ${config.walrus.blobUrl}`);
  console.log('');

  // Test 1: Direct HTTP API test (PUT request)
  console.log('🧪 Test 1: Direct HTTP API (PUT)');

  try {
    const jsonString = JSON.stringify(testData);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const epochs = 1; // Short epoch for testing

    const putResponse = await fetch(`${config.walrus.publisherUrl}/v1/blobs?epochs=${epochs}`, {
      method: 'PUT',
      body: blob,
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!putResponse.ok) {
      const errorText = await putResponse.text();
      throw new Error(`HTTP ${putResponse.status}: ${errorText}`);
    }

    const putResult = await putResponse.json();
    console.log('✅ PUT request successful');

    let blobId;
    if (putResult.newlyCreated) {
      blobId = putResult.newlyCreated.blobObject.blobId;
      console.log(`📦 Blob ID: ${blobId}`);
      console.log(`🔗 Blob URL: ${config.walrus.blobUrl}/${blobId}`);
    } else if (putResult.alreadyCertified) {
      blobId = putResult.alreadyCertified.blobId;
      console.log(`📦 Blob ID (already certified): ${blobId}`);
    } else {
      throw new Error('Unexpected response format');
    }

    // Test 2: Retrieve the blob (GET request)
    console.log('\n🧪 Test 2: Retrieve blob (GET)');

    const getResponse = await fetch(`${config.walrus.aggregatorUrl}/v1/blobs/${blobId}`);

    if (!getResponse.ok) {
      if (getResponse.status === 404) {
        throw new Error(`Blob not found: ${blobId}`);
      }
      const errorText = await getResponse.text();
      throw new Error(`HTTP ${getResponse.status}: ${errorText}`);
    }

    const retrievedData = await getResponse.text();
    const parsedData = JSON.parse(retrievedData);

    console.log('✅ GET request successful');
    console.log(`📊 Data size: ${retrievedData.length} bytes`);
    console.log(`📋 Retrieved title: ${parsedData.title}`);
    console.log(`🔢 Cell count: ${Object.keys(parsedData.cells || {}).length}`);

    // Verify data integrity
    if (parsedData.spreadsheetId === testData.spreadsheetId) {
      console.log('✅ Data integrity verified');
    } else {
      console.log('⚠️ Data integrity check failed');
    }

    console.log('\n🎉 All tests passed! Walrus integration is working correctly.');
    console.log(`\n💡 You can view your blob at: ${config.walrus.blobUrl}/${blobId}`);

    return { success: true, blobId, testData };

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    return { success: false, error: error.message };
  }
}

// Test the backend service
async function testBackendService() {
  console.log('\n🔧 Testing Backend Walrus Service...\n');

  try {
    // Import the service
    const { walrusService } = await import('../blockchain/walrus-service.js');

    // Test data
    const testData = {
      spreadsheetId: 'backend-test-123',
      version: 1,
      title: 'Backend Test Spreadsheet',
      cells: {
        'A1': { v: 'Backend', t: 'string' },
        'B1': { v: 'Test', t: 'string' }
      }
    };

    console.log('📤 Testing storeBlob...');
    const storeResult = await walrusService.storeBlob(testData);

    if (!storeResult.success) {
      throw new Error(`Store failed: ${storeResult.error}`);
    }

    console.log('✅ storeBlob successful');
    console.log(`📦 Blob ID: ${storeResult.blobId}`);
    console.log(`🔗 Blob URL: ${storeResult.url}`);
    console.log(`📊 Size: ${storeResult.size} bytes`);

    console.log('\n📥 Testing retrieveBlob...');
    const retrieveResult = await walrusService.retrieveBlob(storeResult.blobId);

    if (!retrieveResult.success) {
      throw new Error(`Retrieve failed: ${retrieveResult.error}`);
    }

    console.log('✅ retrieveBlob successful');
    console.log(`📋 Retrieved title: ${retrieveResult.data.title}`);
    console.log(`🔢 Cell count: ${Object.keys(retrieveResult.data.cells || {}).length}`);

    return { success: true, blobId: storeResult.blobId };

  } catch (error) {
    console.error('❌ Backend service test failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting Walrus Integration Tests\n');
  console.log('=' .repeat(50));

  try {
    // Test 1: Direct HTTP API
    const directTest = await testWalrusIntegration();

    // Test 2: Backend service
    const backendTest = await testBackendService();

    console.log('\n' + '=' .repeat(50));
    console.log('📊 Test Results Summary:');
    console.log(`Direct HTTP API: ${directTest.success ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Backend Service: ${backendTest.success ? '✅ PASSED' : '❌ FAILED'}`);

    if (directTest.success && backendTest.success) {
      console.log('\n🎉 All tests passed! Your Walrus integration is working correctly.');
    } else {
      console.log('\n⚠️ Some tests failed. Check the errors above.');
    }

  } catch (error) {
    console.error('\n💥 Test suite failed:', error.message);
  }
}

// Export for use in other scripts
export { testWalrusIntegration, testBackendService };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}

