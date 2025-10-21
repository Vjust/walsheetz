#!/usr/bin/env node

/**
 * Production Build Verification
 *
 * Verifies that:
 * 1. app-config.json was included in the production build
 * 2. Config uses walrus.space endpoints (not staketab.org)
 * 3. Build is safe to deploy
 *
 * Run this after bun run build
 *
 * Usage:
 *   bun scripts/verify-production-build.js
 *   node scripts/verify-production-build.js
 *   npm run build:verify  (includes build step)
 *
 * Exit codes:
 *   0 = Build is safe to deploy
 *   1 = Critical issues found - do not deploy
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log(`\n${colors.blue}${'='.repeat(60)}${colors.reset}`);
  log(`  ${title}`, 'blue');
  console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}\n`);
}

async function verifyProductionBuild() {
  logSection('Production Build Verification');

  let passed = 0;
  let failed = 0;

  // Check 1: app-config.json exists in dist/
  const distConfigPath = path.join(projectRoot, 'dist', 'app-config.json');
  log('Check 1: Verifying app-config.json in dist/', 'yellow');

  if (!fs.existsSync(distConfigPath)) {
    log(`  ❌ CRITICAL: app-config.json missing from dist/`, 'red');
    log(`     Expected: ${distConfigPath}`, 'gray');
    log(`     Production builds will fall back to hardcoded config with CORS issues`, 'red');
    failed++;
  } else {
    log(`  ✓ app-config.json found in dist/`, 'green');
    passed++;
  }

  // Check 2: Verify config content (if it exists)
  if (fs.existsSync(distConfigPath)) {
    log('\nCheck 2: Verifying config endpoints', 'yellow');

    try {
      const configContent = fs.readFileSync(distConfigPath, 'utf8');
      const config = JSON.parse(configContent);

      let configOk = true;

      // Check testnet
      const testnetPublisher = config.networks?.testnet?.walrus?.publisherUrl || '';
      const testnetAggregator = config.networks?.testnet?.walrus?.aggregatorUrl || '';

      if (testnetPublisher.includes('staketab')) {
        log(`  ❌ Testnet publisher still uses staketab: ${testnetPublisher}`, 'red');
        configOk = false;
        failed++;
      } else if (testnetPublisher.includes('walrus.space')) {
        log(`  ✓ Testnet publisher: ${testnetPublisher}`, 'green');
        passed++;
      } else {
        log(`  ⚠ Testnet publisher not recognized: ${testnetPublisher}`, 'yellow');
      }

      if (testnetAggregator.includes('staketab')) {
        log(`  ❌ Testnet aggregator still uses staketab: ${testnetAggregator}`, 'red');
        configOk = false;
        failed++;
      } else if (testnetAggregator.includes('walrus.space')) {
        log(`  ✓ Testnet aggregator: ${testnetAggregator}`, 'green');
        passed++;
      } else {
        log(`  ⚠ Testnet aggregator not recognized: ${testnetAggregator}`, 'yellow');
      }

      // Check mainnet
      const mainnetPublisher = config.networks?.mainnet?.walrus?.publisherUrl || '';
      const mainnetAggregator = config.networks?.mainnet?.walrus?.aggregatorUrl || '';

      if (mainnetPublisher.includes('staketab')) {
        log(`  ❌ Mainnet publisher still uses staketab: ${mainnetPublisher}`, 'red');
        configOk = false;
        failed++;
      } else if (mainnetPublisher.includes('walrus.space')) {
        log(`  ✓ Mainnet publisher: ${mainnetPublisher}`, 'green');
        passed++;
      } else {
        log(`  ⚠ Mainnet publisher not recognized: ${mainnetPublisher}`, 'yellow');
      }

      if (mainnetAggregator.includes('staketab')) {
        log(`  ❌ Mainnet aggregator still uses staketab: ${mainnetAggregator}`, 'red');
        configOk = false;
        failed++;
      } else if (mainnetAggregator.includes('walrus.space')) {
        log(`  ✓ Mainnet aggregator: ${mainnetAggregator}`, 'green');
        passed++;
      } else {
        log(`  ⚠ Mainnet aggregator not recognized: ${mainnetAggregator}`, 'yellow');
      }
    } catch (error) {
      log(`  ❌ Failed to parse app-config.json: ${error.message}`, 'red');
      failed++;
    }
  }

  // Report results
  logSection('VERIFICATION RESULT');

  if (failed === 0 && passed > 0) {
    log(`✅ Production build is safe to deploy`, 'green');
    log(`   ${passed} checks passed, 0 critical issues`, 'green');
    process.exit(0);
  } else {
    log(`❌ Production build has critical issues - DO NOT DEPLOY`, 'red');
    log(`   ${passed} checks passed, ${failed} checks failed`, 'red');
    log(`\nFix before deployment:`, 'yellow');
    log(`  1. Ensure public/app-config.json has walrus.space endpoints`, 'gray');
    log(`  2. Verify vite.config.js has publicDir: 'public'`, 'gray');
    log(`  3. Run: bun run build:verify`, 'gray');
    process.exit(1);
  }
}

verifyProductionBuild().catch((error) => {
  log(`Unexpected error: ${error.message}`, 'red');
  process.exit(1);
});
