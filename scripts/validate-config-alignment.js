#!/usr/bin/env node

/**
 * Configuration Alignment Validator
 *
 * Ensures that app-config.json and blockchain/config.js have aligned Walrus endpoints.
 * This prevents configuration drift between browser runtime config and Node.js bridge config.
 *
 * Run this script:
 * - After updating Walrus endpoints in either config file
 * - As part of pre-commit hooks
 * - During CI/CD pipeline
 *
 * Usage:
 *   bun scripts/validate-config-alignment.js
 *   node scripts/validate-config-alignment.js
 *
 * Exit codes:
 *   0 = Configs are aligned, no issues
 *   1 = Alignment mismatch found (see output for details)
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

async function validateAlignment() {
  logSection('Configuration Alignment Check');

  // Read app-config.json
  let appConfig;
  try {
    const appConfigPath = path.join(projectRoot, 'public', 'app-config.json');
    const appConfigContent = fs.readFileSync(appConfigPath, 'utf8');
    appConfig = JSON.parse(appConfigContent);
    log(`✓ Loaded app-config.json`, 'green');
  } catch (error) {
    log(`✗ Failed to load app-config.json: ${error.message}`, 'red');
    process.exit(1);
  }

  // Import blockchain config
  let blockchainConfig;
  try {
    const blockchainConfigModule = await import(
      path.join(projectRoot, 'blockchain', 'config.js')
    );
    blockchainConfig = blockchainConfigModule.config;
    log(`✓ Loaded blockchain/config.js`, 'green');
  } catch (error) {
    log(`✗ Failed to load blockchain/config.js: ${error.message}`, 'red');
    process.exit(1);
  }

  let mismatches = [];

  // Helper to format endpoint URLs for comparison (strip trailing slashes)
  const normalize = (url) => (url || '').replace(/\/$/, '');

  // Check testnet alignment
  log('\nValidating TESTNET endpoints:', 'yellow');

  const testnetPublisherApp = normalize(appConfig.networks.testnet.walrus.publisherUrl);
  const testnetPublisherBlockchain = normalize(blockchainConfig.walrus.testnet.publisherUrl);

  if (testnetPublisherApp === testnetPublisherBlockchain) {
    log(`  ✓ Publisher: ${testnetPublisherApp}`, 'green');
  } else {
    log(
      `  ✗ Publisher mismatch:\n    app-config:     ${testnetPublisherApp}\n    blockchain:     ${testnetPublisherBlockchain}`,
      'red'
    );
    mismatches.push('testnet_publisher');
  }

  const testnetAggregatorApp = normalize(appConfig.networks.testnet.walrus.aggregatorUrl);
  const testnetAggregatorBlockchain = normalize(blockchainConfig.walrus.testnet.aggregatorUrl);

  if (testnetAggregatorApp === testnetAggregatorBlockchain) {
    log(`  ✓ Aggregator: ${testnetAggregatorApp}`, 'green');
  } else {
    log(
      `  ✗ Aggregator mismatch:\n    app-config:     ${testnetAggregatorApp}\n    blockchain:     ${testnetAggregatorBlockchain}`,
      'red'
    );
    mismatches.push('testnet_aggregator');
  }

  // Check mainnet alignment
  log('\nValidating MAINNET endpoints:', 'yellow');

  const mainnetPublisherApp = normalize(appConfig.networks.mainnet.walrus.publisherUrl);
  const mainnetPublisherBlockchain = normalize(blockchainConfig.walrus.mainnet.publisherUrl);

  if (mainnetPublisherApp === mainnetPublisherBlockchain) {
    log(`  ✓ Publisher: ${mainnetPublisherApp}`, 'green');
  } else {
    log(
      `  ✗ Publisher mismatch:\n    app-config:     ${mainnetPublisherApp}\n    blockchain:     ${mainnetPublisherBlockchain}`,
      'red'
    );
    mismatches.push('mainnet_publisher');
  }

  const mainnetAggregatorApp = normalize(appConfig.networks.mainnet.walrus.aggregatorUrl);
  const mainnetAggregatorBlockchain = normalize(blockchainConfig.walrus.mainnet.aggregatorUrl);

  if (mainnetAggregatorApp === mainnetAggregatorBlockchain) {
    log(`  ✓ Aggregator: ${mainnetAggregatorApp}`, 'green');
  } else {
    log(
      `  ✗ Aggregator mismatch:\n    app-config:     ${mainnetAggregatorApp}\n    blockchain:     ${mainnetAggregatorBlockchain}`,
      'red'
    );
    mismatches.push('mainnet_aggregator');
  }

  // Report results
  logSection('ALIGNMENT CHECK RESULT');

  if (mismatches.length === 0) {
    log('✓ All configs are aligned!', 'green');
    log('app-config.json and blockchain/config.js have matching Walrus endpoints.', 'gray');
    process.exit(0);
  } else {
    log('✗ Configuration alignment FAILED', 'red');
    log(`${mismatches.length} endpoint(s) have mismatches:\n`, 'yellow');
    mismatches.forEach((mismatch) => {
      log(`  - ${mismatch.replace(/_/g, ' (').toUpperCase()})`);
    });

    log('\nHow to fix:', 'yellow');
    log('1. Edit public/app-config.json and blockchain/config.js', 'gray');
    log('2. Ensure both files use the same Walrus endpoints for each network', 'gray');
    log('3. Use walrus.space official endpoints (they have clean CORS headers)', 'gray');
    log('4. Run this script again to verify alignment', 'gray');

    process.exit(1);
  }
}

validateAlignment().catch((error) => {
  log(`Unexpected error: ${error.message}`, 'red');
  process.exit(1);
});
