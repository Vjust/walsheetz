#!/usr/bin/env node

/**
 * Test script to validate TypeScript setup
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

async function runCommand(command, args, cwd = projectRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'pipe',
      shell: true
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function main() {
  console.log('🔍 Testing TypeScript setup...\n');

  try {
    // Test 1: TypeScript compilation
    console.log('1. Testing TypeScript compilation...');
    const tscResult = await runCommand('bun', ['run', 'typecheck']);

    if (tscResult.code === 0) {
      console.log('   ✅ TypeScript compilation passed');
    } else {
      console.log('   ❌ TypeScript compilation failed');
      console.log('   Error:', tscResult.stderr);
      process.exit(1);
    }

    // Test 2: Check critical type files exist
    console.log('2. Checking TypeScript type definitions...');
    const typeFiles = [
      'frontend/types/wallet.d.ts',
      'frontend/types/spreadsheet.d.ts',
      'frontend/types/blockchain.d.ts',
      'frontend/types/abi.d.ts'
    ];

    const fs = await import('fs');
    for (const file of typeFiles) {
      const fullPath = join(projectRoot, file);
      if (fs.existsSync(fullPath)) {
        console.log(`   ✅ ${file} exists`);
      } else {
        console.log(`   ❌ ${file} missing`);
        process.exit(1);
      }
    }

    // Test 3: Check converted TypeScript files
    console.log('3. Checking converted TypeScript files...');
    const tsFiles = [
      'frontend/hooks/useWalletConnection.ts'
    ];

    for (const file of tsFiles) {
      const fullPath = join(projectRoot, file);
      if (fs.existsSync(fullPath)) {
        console.log(`   ✅ ${file} converted to TypeScript`);
      } else {
        console.log(`   ❌ ${file} not converted`);
        process.exit(1);
      }
    }

    // Test 4: Check tsconfig.json
    console.log('4. Checking tsconfig.json...');
    const tsconfigPath = join(projectRoot, 'tsconfig.json');
    if (fs.existsSync(tsconfigPath)) {
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));

      // Check strict mode is enabled
      if (tsconfig.compilerOptions?.strict === true) {
        console.log('   ✅ Strict mode enabled');
      } else {
        console.log('   ❌ Strict mode not enabled');
        process.exit(1);
      }

      // Check path aliases are configured
      if (tsconfig.compilerOptions?.paths) {
        console.log('   ✅ Path aliases configured');
      } else {
        console.log('   ❌ Path aliases missing');
        process.exit(1);
      }
    } else {
      console.log('   ❌ tsconfig.json not found');
      process.exit(1);
    }

    console.log('\n🎉 All TypeScript setup tests passed!');
    console.log('\n📊 Summary:');
    console.log('   - TypeScript compilation: ✅ Working');
    console.log('   - Type definitions: ✅ Created');
    console.log('   - File conversions: ✅ Started');
    console.log('   - Strict configuration: ✅ Enabled');
    console.log('\n✨ TypeScript setup is ready for development!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);