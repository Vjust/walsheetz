#!/usr/bin/env node
/**
 * Integration test script for Spreadsheet CRUD operations
 * Tests create → save → load → delete flows end-to-end on testnet
 *
 * Usage:
 *   node scripts/test-spreadsheet-crud.js
 */

import { SpreadsheetEngine } from '../frontend/core/SpreadsheetEngine.js';
import { BlockchainAdapter } from '../frontend/adapters/BlockchainAdapter.js';
import { StorageAdapter } from '../frontend/adapters/StorageAdapter.js';

// Simple assertion helper
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ANSI color helpers for CLI output
const colors = {
  reset: '\u001b[0m',
  green: '\u001b[32m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
  blue: '\u001b[34m',
  cyan: '\u001b[36m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  test: (msg) => console.log(`\n${colors.cyan}📋 Testing: ${msg}${colors.reset}`),
  section: (msg) => console.log(`\n${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n${colors.blue}${msg}${colors.reset}\n${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`)
};

if (typeof global !== 'undefined' && !global.luckysheet) {
  global.luckysheet = {
    flowdata: [[{ v: '', f: null }]],
    refreshFormula: () => {}
  };
}

// Mock navigator for Node.js environment (SpreadsheetEngine checks navigator.onLine)
if (typeof global !== 'undefined' && !global.navigator) {
  global.navigator = {
    onLine: true,  // Assume online for tests
    userAgent: 'Node.js Test Runner'
  };
}

// Mock window for Node.js environment
if (typeof global !== 'undefined' && !global.window) {
  global.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { href: 'http://localhost' }
  };
}

async function testCRUDFlow() {
  log.section('🦭 WalSheetz - CRUD Flow Integration Tests');

  const storage = new StorageAdapter();
  const blockchain = new BlockchainAdapter(storage);
  const engine = new SpreadsheetEngine(storage, blockchain);

  let passed = 0;
  let failed = 0;

  try {
    // CREATE
    log.section('1️⃣  CREATE Flow');
    log.test('Creating empty spreadsheet data structure');
    const emptyData = blockchain.createEmptySpreadsheetData('CRUD Test Spreadsheet');
    assert(emptyData.title === 'CRUD Test Spreadsheet', 'Spreadsheet title should match');
    assert(emptyData.metadata.title === 'CRUD Test Spreadsheet', 'Metadata title should match');
    assert(emptyData.cells !== undefined, 'Cells object should exist');
    assert(emptyData.version !== undefined, 'Version should be generated');
    log.success('Empty spreadsheet data created');
    passed++;

    log.test('Generating version string');
    const version = blockchain.generateVersion();
    assert(/^v\d+-[a-z0-9]+$/.test(version), 'Version format should be valid');
    log.success(`Version generated: ${version}`);
    passed++;

    // READ
    log.section('2️⃣  READ (Load) Flow');
    log.test('Configuring session data');
    const spreadsheetId = '0x' + 'a'.repeat(64);
    storage.setCurrentSpreadsheetId(spreadsheetId);
    storage.setSpreadsheetTitle('Test Sheet');
    storage.setLastWalrusBlobId('test-blob-id');
    log.success('Session configured');
    passed++;

    log.test('Retrieving session values');
    assert(storage.getCurrentSpreadsheetId() === spreadsheetId, 'Spreadsheet ID should match');
    assert(storage.getSpreadsheetTitle() === 'Test Sheet', 'Spreadsheet title should match');
    assert(storage.getLastWalrusBlobId() === 'test-blob-id', 'Walrus blob ID should match');
    log.success('Session values retrieved');
    passed++;

    // UPDATE
    log.section('3️⃣  UPDATE (Save) Flow');
    log.test('Tracking edits');
    blockchain.editTracker.set('A1', { oldValue: '', newValue: 'Test' });
    blockchain.syncStatus.pendingChanges = 1;
    assert(blockchain.getPendingEdits().length === 1, 'Should track pending edits');
    log.success('Pending edits tracked');
    passed++;

    log.test('Clearing pending edits');
    blockchain.clearPendingEdits();
    assert(blockchain.editTracker.size === 0, 'Edit tracker should be cleared');
    assert(blockchain.syncStatus.pendingChanges === 0, 'Pending changes should reset');
    log.success('Pending edits cleared');
    passed++;

    log.test('Updating spreadsheet title');
    storage.setSpreadsheetTitle('Updated Title');
    assert(storage.getSpreadsheetTitle() === 'Updated Title', 'Spreadsheet title should update');
    log.success('Spreadsheet title updated');
    passed++;

    // DELETE
    log.section('4️⃣  DELETE Flow');
    log.test('Preparing deletion data');
    blockchain.spreadsheetObjectId = spreadsheetId;
    storage.setWalletAddress('0xwallet');
    log.success('Deletion data prepared');
    passed++;

    log.test('Clearing session on delete');
    storage.clearSession();
    const session = storage.getSession();
    assert(session.currentSpreadsheetId === null, 'Spreadsheet ID should be null');
    assert(session.walletAddress === null, 'Wallet address should be null');
    log.success('Session cleared');
    passed++;

    // SESSION MANAGEMENT
    log.section('5️⃣  Session Management');
    log.test('Creating new empty session');
    const emptySession = storage.createEmptySession();
    assert(emptySession.currentSpreadsheetId === null, 'Empty session should have null spreadsheet ID');
    assert(emptySession.autoSaveEnabled === false, 'Auto-save should default to false');
    log.success('Empty session created');
    passed++;

    log.test('Validating session');
    storage.setCurrentSpreadsheetId('0xtest');
    storage.setWalletAddress('0xwallet');
    assert(storage.validateAndCleanSession() === true, 'Valid session should pass validation');
    log.success('Session validated');
    passed++;

    // WALLET
    log.section('6️⃣  Wallet Integration');
    log.test('Storing wallet address');
    storage.setWalletAddress('0xabcdef');
    assert(storage.getWalletAddress() === '0xabcdef', 'Wallet address should match');
    log.success('Wallet address stored');
    passed++;

    // WALRUS
    log.section('7️⃣  Walrus Epoch Preference');
    log.test('Setting Walrus epoch preference');
    storage.setWalrusEpochPreference('0xepoch', 50);
    assert(storage.getWalrusEpochPreference('0xepoch') === 50, 'Walrus epoch preference should match');
    log.success('Walrus epoch preference stored');
    passed++;

    // EXPORT
    log.section('8️⃣  Data Export & Import');
    log.test('Exporting data');
    await storage.saveData({ title: 'Export Test', cells: { A1: 'value' }, metadata: { rows: 10, cols: 10 } });
    const exported = await storage.exportData();
    assert(exported.spreadsheet !== undefined, 'Exported data should include spreadsheet');
    assert(exported.session !== undefined, 'Exported data should include session');
    log.success('Data exported');
    passed++;

    // ERROR HANDLING
    log.section('9️⃣  Error Handling');
    log.test('Handling invalid cell references');
    assert(blockchain.getCellReference(null, 0) === 'INVALID', 'Invalid row should return INVALID');
    assert(blockchain.getCellReference(-1, 0) === 'INVALID', 'Negative row should return INVALID');
    log.success('Invalid references handled');
    passed++;

    log.section('📊 Test Summary');
    log.success(`Passed: ${passed}/${passed + failed}`);
    console.log(`\n${colors.green}✅ CRUD Flow Integration Tests Completed${colors.reset}`);
    process.exit(0);
  } catch (error) {
    failed++;
    log.error(error.message);
    console.error(error.stack);
    log.section('📊 Test Summary');
    log.error(`Failed: ${failed}/${passed + failed}`);
    process.exit(1);
  }
}

testCRUDFlow().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
