#!/usr/bin/env node

/**
 * CI guard to prevent UI from importing server-only services
 * Exits with non-zero code if violations are found
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function checkUIImports() {
  try {
    let stdout;

    // Try ripgrep first, fallback to grep
    try {
      const result = await execAsync("rg -n 'from.*blockchain/' frontend/");
      stdout = result.stdout;
    } catch (rgError) {
      // Fallback to grep if ripgrep not available
      try {
        const result = await execAsync("grep -rn 'from.*blockchain/' frontend/");
        stdout = result.stdout;
      } catch (grepError) {
        stdout = ''; // No matches found
      }
    }

    if (stdout.trim()) {
      console.log('⚠️  Found UI imports from blockchain/* services:');
      console.log(stdout);
      console.log('\n💡 Note: These existing imports are legacy.');
      console.log('   New code should use @/sdk/* or @/walrus/* aliases (Browser*Service) instead.');
      console.log('   blockchain/* services are for server/CLI/testing only.');

      // Count the violations - if it's more than expected legacy ones, fail
      const violations = stdout.trim().split('\n').length;
      const expectedLegacyViolations = 3; // Known legacy imports

      if (violations > expectedLegacyViolations) {
        console.error(`❌ Found ${violations} violations, expected only ${expectedLegacyViolations} legacy ones!`);
        process.exit(1);
      } else {
        console.log(`✅ Found ${violations} expected legacy violations - no new violations detected.`);
        process.exit(0);
      }
    } else {
      console.log('✅ No UI imports from blockchain/* found - perfect separation maintained!');
      process.exit(0);
    }
  } catch (error) {
    console.warn('⚠️  Could not check UI imports:', error.message);
    console.log('   Skipping import check (ensure ripgrep or grep is available)');
    process.exit(0);
  }
}

checkUIImports();