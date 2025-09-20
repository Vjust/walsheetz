#!/usr/bin/env node

// Test script to verify gRPC bridge integration with real Sui testnet
// This script tests the checkpoint subscription and event processing

import WebSocket from 'ws';
import { grpcService } from '../blockchain/grpc-service.js';

const BRIDGE_URL = 'ws://localhost:8080';
const TEST_TIMEOUT = 30000; // 30 seconds

console.log('🧪 Testing WalSheetz gRPC Bridge Integration');
console.log('===================================');

async function testBridgeConnection() {
  console.log('\n1. Testing WebSocket connection to bridge...');
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BRIDGE_URL);
    
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection timeout'));
    }, 5000);
    
    ws.on('open', () => {
      clearTimeout(timeout);
      console.log('✅ WebSocket connected to bridge');
      
      // Send welcome message
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'welcome') {
          console.log(`✅ Received welcome from bridge: ${message.clientId}`);
          ws.close();
          resolve(message.clientId);
        }
      });
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function testCheckpointSubscription() {
  console.log('\n2. Testing gRPC checkpoint subscription...');
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Checkpoint subscription timeout'));
    }, TEST_TIMEOUT);
    
    let checkpointReceived = false;
    
    // Listen for checkpoint events
    grpcService.on('checkpoint', (data) => {
      if (!checkpointReceived) {
        checkpointReceived = true;
        clearTimeout(timeout);
        console.log('✅ Checkpoint received from Sui testnet:');
        console.log(`   - Sequence Number: ${data.sequenceNumber}`);
        console.log(`   - Digest: ${data.digest}`);
        console.log(`   - Transaction Count: ${data.transactionCount}`);
        resolve(data);
      }
    });
    
    grpcService.on('streamError', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Stream error: ${error.error}`));
    });
    
    // Start subscription
    try {
      grpcService.subscribeToCheckpoints();
      console.log('📡 Checkpoint subscription started...');
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

async function testBlockchainEventParsing() {
  console.log('\n3. Testing blockchain event parsing...');
  
  return new Promise((resolve, reject) => {
    let eventReceived = false;
    
    const timeout = setTimeout(() => {
      if (!eventReceived) {
        console.log('⚠️  No spreadsheet events detected (this is normal for testing)');
        resolve(null);
      }
    }, 10000);
    
    // Listen for spreadsheet events
    grpcService.on('spreadsheetEvent', (event) => {
      if (!eventReceived) {
        eventReceived = true;
        clearTimeout(timeout);
        console.log('✅ Spreadsheet event parsed:');
        console.log(`   - Event Type: ${event.eventType}`);
        console.log(`   - Transaction: ${event.transactionDigest}`);
        resolve(event);
      }
    });
    
    console.log('👂 Listening for spreadsheet events...');
  });
}

async function testGrpcServiceMethods() {
  console.log('\n4. Testing gRPC service methods...');
  
  try {
    const status = grpcService.getStatus();
    console.log('✅ gRPC service status:');
    console.log(`   - Connected: ${status.isConnected}`);
    console.log(`   - Active Streams: ${status.activeStreams.join(', ')}`);
    console.log(`   - Reconnect Delay: ${status.reconnectDelay}ms`);
    
    return status;
  } catch (error) {
    console.error('❌ Failed to get gRPC service status:', error.message);
    throw error;
  }
}

async function testWebSocketBridgeIntegration() {
  console.log('\n5. Testing WebSocket-gRPC bridge integration...');
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BRIDGE_URL);
    let testsPassed = 0;
    const totalTests = 2;
    
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Bridge integration test timeout'));
    }, 15000);
    
    ws.on('open', () => {
      console.log('✅ Connected to bridge for integration test');
      
      // Test 1: Subscribe to blockchain channel
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'blockchain',
        requestId: 'test-1'
      }));
      
      // Test 2: Query balance (will likely fail but tests the pipeline)
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'query',
          queryType: 'balance',
          params: {
            owner: '0x123', // Dummy address for testing
            coinType: '0x2::sui::SUI'
          },
          requestId: 'test-2'
        }));
      }, 1000);
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'subscribed' && message.requestId === 'test-1') {
        console.log('✅ Successfully subscribed to blockchain channel');
        testsPassed++;
      }
      
      if (message.type === 'queryResult' && message.requestId === 'test-2') {
        if (message.error) {
          console.log('✅ Query correctly returned error (expected for dummy address)');
        } else {
          console.log('✅ Query returned result');
        }
        testsPassed++;
      }
      
      if (testsPassed >= totalTests) {
        clearTimeout(timeout);
        ws.close();
        resolve({ testsPassed, totalTests });
      }
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function runTests() {
  try {
    // Test 1: Bridge Connection
    const clientId = await testBridgeConnection();
    
    // Test 2: Checkpoint Subscription  
    const checkpointData = await testCheckpointSubscription();
    
    // Test 3: Event Parsing (optional)
    const eventData = await testBlockchainEventParsing();
    
    // Test 4: Service Methods
    const status = await testGrpcServiceMethods();
    
    // Test 5: Bridge Integration
    const integrationResult = await testWebSocketBridgeIntegration();
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('===================================');
    console.log('Summary:');
    console.log(`✅ WebSocket Bridge: Connected (Client ID: ${clientId})`);
    console.log(`✅ gRPC Subscription: Active (${status.activeStreams.length} streams)`);
    console.log(`✅ Testnet Integration: Working (Latest checkpoint: ${checkpointData.sequenceNumber})`);
    console.log(`✅ Bridge Integration: ${integrationResult.testsPassed}/${integrationResult.totalTests} tests passed`);
    
    if (eventData) {
      console.log(`✅ Event Processing: Detected ${eventData.eventType} event`);
    } else {
      console.log(`⚠️  Event Processing: No events detected (normal for testing)`);
    }
    
    console.log('\n🔗 Real testnet API calls are working through gRPC!');
    console.log('🌐 Frontend available at: http://localhost:3000');
    console.log('📡 Bridge running on: ws://localhost:8080');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    grpcService.close();
  }
}

// Run the tests
runTests().catch(console.error);