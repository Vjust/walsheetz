#!/usr/bin/env node

// Dedicated test runner for Walrus integration tests
// These tests require real network access to Walrus testnet

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🚀 Starting Walrus Integration Tests');
console.log('====================================');
console.log('');
console.log('📋 Test Configuration:');
console.log('  - Environment: Walrus Testnet');
console.log('  - Network: Real network calls enabled');
console.log('  - Timeout: Extended for network operations');
console.log('  - Features: Delta compression, redundancy, integrity');
console.log('');

// Run the tests with specific configuration for integration testing
const testProcess = spawn('npx', [
  'vitest',
  'run',
  'tests/walrus-integration.test.js',
  '--config',
  'vitest.integration.config.js',
  '--reporter=verbose'
], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    WALRUS_INTEGRATION_TEST: 'true',
    // Enable real network calls for integration tests
    VITEST_DISABLE_FETCH_MOCK: 'true'
  }
});

testProcess.on('close', (code) => {
  console.log('');
  if (code === 0) {
    console.log('✅ All Walrus integration tests passed!');
    console.log('');
    console.log('📊 Test Summary:');
    console.log('  ✅ Basic storage and retrieval');
    console.log('  ✅ Content integrity verification');
    console.log('  ✅ Delta compression optimization');
    console.log('  ✅ Multi-blob redundancy resilience');
    console.log('  ✅ Comprehensive health checks');
    console.log('  ✅ Performance benchmarks');
    console.log('');
    console.log('🎉 Your WalSheetz system is fully on-chain and enterprise-ready!');
  } else {
    console.log(`❌ Tests failed with exit code ${code}`);
    console.log('');
    console.log('🔍 Troubleshooting:');
    console.log('  1. Check network connection to Walrus testnet');
    console.log('  2. Verify blockchain/config.js has correct endpoints');
    console.log('  3. Ensure Walrus testnet is accessible');
    console.log('  4. Check console logs for specific error details');
  }
  
  process.exit(code);
});

testProcess.on('error', (error) => {
  console.error('❌ Failed to start test process:', error);
  process.exit(1);
});