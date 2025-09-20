#!/usr/bin/env node

// Test script to verify object ID extraction logic
const packageId = '0xe7f62142b48f1b1746bd7dd7b695f0e2e5952879662ab7d755fdd9081b189fa7';
const packageIdNormalized = packageId.startsWith('0x') ? packageId.slice(2) : packageId;

// Simulate different objectType formats we might encounter
const testCases = [
  {
    name: 'Full package ID format',
    objectType: `${packageIdNormalized}::spreadsheet::Spreadsheet`,
    shouldMatch: true
  },
  {
    name: 'With 0x prefix',
    objectType: `${packageId}::spreadsheet::Spreadsheet`,
    shouldMatch: false // Won't match with normalized ID
  },
  {
    name: 'Module and type only',
    objectType: '::spreadsheet::Spreadsheet',
    shouldMatch: true // Should match fallback
  },
  {
    name: 'Just type name',
    objectType: 'Spreadsheet',
    shouldMatch: true // Should match fallback
  },
  {
    name: 'Different module',
    objectType: `${packageIdNormalized}::other::Something`,
    shouldMatch: false
  }
];

console.log('Testing object ID extraction patterns...\n');
console.log('Package ID (normalized):', packageIdNormalized);
console.log('---');

testCases.forEach(test => {
  // Primary pattern (with package ID)
  const primaryMatch = test.objectType?.includes(`${packageIdNormalized}::spreadsheet::Spreadsheet`);
  
  // Fallback patterns
  const fallbackMatch = test.objectType?.includes('::spreadsheet::Spreadsheet') || 
                       test.objectType?.includes('Spreadsheet');
  
  const matches = primaryMatch || fallbackMatch;
  const result = matches === test.shouldMatch ? '✅ PASS' : '❌ FAIL';
  
  console.log(`\n${result} - ${test.name}`);
  console.log(`  ObjectType: ${test.objectType}`);
  console.log(`  Primary match: ${primaryMatch}`);
  console.log(`  Fallback match: ${fallbackMatch}`);
  console.log(`  Expected: ${test.shouldMatch}, Got: ${matches}`);
});

console.log('\n✅ Test script completed');