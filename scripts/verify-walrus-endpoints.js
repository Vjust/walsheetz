#!/usr/bin/env node

/**
 * Walrus Endpoint Verification Script
 *
 * This script verifies that Walrus endpoints (publisher and aggregator) are:
 * 1. Reachable and responding
 * 2. Free of CORS header misconfiguration (e.g., duplicate Access-Control-Allow-Origin)
 * 3. Functional by publishing a test blob and retrieving it back
 *
 * Run this script:
 * - After updating Walrus service URLs in app-config.json or blockchain/config.js
 * - Before committing configuration changes (recommend adding to pre-commit hook)
 * - During CI/CD for configuration validation
 * - When diagnosing CORS or connectivity issues
 *
 * Usage:
 *   node scripts/verify-walrus-endpoints.js [testnet|mainnet]
 *   bun scripts/verify-walrus-endpoints.js testnet
 *
 * Examples:
 *   node scripts/verify-walrus-endpoints.js testnet
 *   bun scripts/verify-walrus-endpoints.js mainnet
 *
 * Exit codes:
 *   0 = All checks passed
 *   1 = One or more checks failed (see output for details)
 */

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

async function verifyEndpoints() {
  const networkArg = process.argv[2] || 'testnet';

  if (!['testnet', 'mainnet'].includes(networkArg)) {
    log(`Error: Network must be 'testnet' or 'mainnet', got '${networkArg}'`, 'red');
    process.exit(1);
  }

  // Blob storage endpoints (base URLs only, code appends /v1/blobs)
  // NOTE: These endpoints must match those configured in app-config.json and vite.config.js
  const config = {
    testnet: {
      publisher: 'https://publisher.walrus-testnet.walrus.space',
      aggregator: 'https://aggregator.walrus-testnet.walrus.space',
    },
    mainnet: {
      publisher: 'https://publisher.walrus-mainnet.walrus.space',
      aggregator: 'https://aggregator.walrus-mainnet.walrus.space',
    },
  };

  const endpoints = config[networkArg];

  logSection(`Walrus ${networkArg.toUpperCase()} Endpoint Verification`);

  let allPassed = true;

  // Step 1: Check publisher availability (GraphQL endpoint)
  log('Step 1: Checking Publisher Health...', 'yellow');
  const publisherHealthCheck = await checkEndpointHealth(`${endpoints.publisher}/v1/api`);
  if (publisherHealthCheck.ok) {
    log(`✓ Publisher is reachable at ${endpoints.publisher}`, 'green');
    log(`  Status: ${publisherHealthCheck.status}`, 'gray');
    log(`  ${publisherHealthCheck.corsStatus}`, publisherHealthCheck.corsIssue ? 'red' : 'gray');
    if (publisherHealthCheck.corsIssue) {
      allPassed = false;
    }
  } else {
    log(`✗ Publisher health check failed at ${endpoints.publisher}/v1/api`, 'red');
    log(`  Error: ${publisherHealthCheck.error}`, 'gray');
    if (publisherHealthCheck.corsStatus) {
      log(`  ${publisherHealthCheck.corsStatus}`, 'red');
    }
    allPassed = false;
  }

  // Step 2: Check aggregator availability (GraphQL endpoint)
  log('\nStep 2: Checking Aggregator Health...', 'yellow');
  const aggregatorHealthCheck = await checkEndpointHealth(`${endpoints.aggregator}/v1/api`);
  if (aggregatorHealthCheck.ok) {
    log(`✓ Aggregator is reachable at ${endpoints.aggregator}`, 'green');
    log(`  Status: ${aggregatorHealthCheck.status}`, 'gray');
    log(`  ${aggregatorHealthCheck.corsStatus}`, aggregatorHealthCheck.corsIssue ? 'red' : 'gray');
    if (aggregatorHealthCheck.corsIssue) {
      allPassed = false;
    }
  } else {
    log(`✗ Aggregator health check failed at ${endpoints.aggregator}/v1/api`, 'red');
    log(`  Error: ${aggregatorHealthCheck.error}`, 'gray');
    if (aggregatorHealthCheck.corsStatus) {
      log(`  ${aggregatorHealthCheck.corsStatus}`, 'red');
    }
    allPassed = false;
  }

  if (!allPassed) {
    logSection('VERIFICATION FAILED');
    log('One or more endpoints have issues.', 'red');
    log('Please check:', 'yellow');
    log('1. Network connectivity', 'gray');
    log('2. Endpoint URLs are correct', 'gray');
    log('3. CORS header configuration (check for duplicates)', 'gray');
    log('4. Firewall/proxy settings', 'gray');
    log('\nIf you see "Multiple Access-Control-Allow-Origin headers", contact the endpoint provider.', 'yellow');
    process.exit(1);
  }

  // Step 3: Attempt blob publication (if possible)
  log('\nStep 3: Publishing Test Blob...', 'yellow');
  const testBlob = {
    timestamp: new Date().toISOString(),
    network: networkArg,
    test: 'walrus-endpoint-verification',
    data: 'This is a test blob for endpoint verification',
  };

  const blobData = JSON.stringify(testBlob);
  const blobBuffer = Buffer.from(blobData);

  const publishResult = await publishBlob(
    endpoints.publisher,
    blobBuffer,
    50 // 50 epochs
  );

  if (publishResult.ok) {
    log(`✓ Test blob published successfully`, 'green');
    log(`  Blob ID: ${publishResult.blobId}`, 'gray');
    log(`  Status: ${publishResult.status}`, 'gray');
    log(`  End Epoch: ${publishResult.endEpoch}`, 'gray');

    // Step 4: Retrieve blob back
    log('\nStep 4: Retrieving Test Blob...', 'yellow');
    const retrievalResult = await retrieveBlob(
      endpoints.aggregator,
      publishResult.blobId
    );

    if (retrievalResult.ok) {
      log(`✓ Test blob retrieved successfully`, 'green');
      log(`  Size: ${retrievalResult.size} bytes`, 'gray');

      // Verify content matches
      if (retrievalResult.content === blobData) {
        log(`✓ Blob content matches (end-to-end verification passed)`, 'green');
      } else {
        log(`✗ Blob content mismatch`, 'red');
        log(`  Expected: ${blobData}`, 'gray');
        log(`  Got: ${retrievalResult.content}`, 'gray');
        allPassed = false;
      }
    } else {
      log(`✗ Failed to retrieve blob from aggregator`, 'red');
      log(`  Error: ${retrievalResult.error}`, 'gray');
      allPassed = false;
    }
  } else {
    log(`✗ Failed to publish test blob`, 'red');
    log(`  Error: ${publishResult.error}`, 'red');
    log(`  Status: ${publishResult.status}`, 'gray');
    log(`  Details: ${publishResult.details}`, 'gray');

    // This might be expected if the publisher requires authentication
    if (publishResult.status === 401 || publishResult.status === 403) {
      log('\n⚠ Note: Publisher requires authentication', 'yellow');
      log('This is expected for authenticated publishers like Staketab.', 'gray');
      log('Configure API credentials if available.', 'gray');
      // Don't fail for auth errors in this check
    } else {
      allPassed = false;
    }
  }

  logSection('VERIFICATION SUMMARY');
  if (allPassed) {
    log('✓ All checks passed! Walrus endpoints are functional.', 'green');
    process.exit(0);
  } else {
    log('✗ Some checks failed. Please review the errors above.', 'red');
    process.exit(1);
  }
}

async function checkEndpointHealth(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      timeout: 10000,
    });

    // Check for CORS header issues
    const corsHeaders = [];
    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase() === 'access-control-allow-origin') {
        corsHeaders.push(value);
      }
    }

    let corsIssueDetail = '';
    let hasCorsIssue = false;

    if (corsHeaders.length > 1) {
      corsIssueDetail = `Multiple Access-Control-Allow-Origin headers (${corsHeaders.length}) found`;
      hasCorsIssue = true;
    } else if (corsHeaders.length === 1) {
      // Check for malformed header values (e.g., "*, *" or multiple values in one header)
      const headerValue = corsHeaders[0];
      if (headerValue.includes(',')) {
        corsIssueDetail = `Malformed Access-Control-Allow-Origin header value: "${headerValue}"`;
        hasCorsIssue = true;
      } else {
        corsIssueDetail = `CORS: ${headerValue}`;
      }
    } else {
      corsIssueDetail = 'No CORS headers found';
    }

    const corsWarning = hasCorsIssue
      ? `⚠️ CORS issue detected: ${corsIssueDetail}`
      : `✓ ${corsIssueDetail}`;

    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        corsStatus: corsWarning,
        corsIssue: hasCorsIssue,
      };
    } else {
      return {
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}`,
        corsStatus: corsWarning,
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: error.message,
    };
  }
}

async function publishBlob(publisherUrl, blobData, epochs = 50) {
  try {
    // Correctly construct the blob endpoint URL
    const url = `${publisherUrl}/v1/blobs?epochs=${epochs}`;

    const response = await fetch(url, {
      method: 'PUT',
      body: blobData,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      timeout: 30000,
    });

    if (!response.ok) {
      let errorDetails = '';
      try {
        errorDetails = await response.text();
      } catch (e) {
        // Ignore read errors
      }

      return {
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}`,
        details: errorDetails,
      };
    }

    const result = await response.json();

    // Handle both response types
    if (result.newlyCreated) {
      return {
        ok: true,
        blobId: result.newlyCreated.blobObject.blobId,
        status: 'newly_created',
        endEpoch: result.newlyCreated.blobObject.storage.endEpoch,
      };
    } else if (result.alreadyCertified) {
      return {
        ok: true,
        blobId: result.alreadyCertified.blobId,
        status: 'already_certified',
        endEpoch: result.alreadyCertified.endEpoch,
      };
    } else {
      return {
        ok: false,
        error: 'Unexpected response format',
        details: JSON.stringify(result),
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: error.message,
    };
  }
}

async function retrieveBlob(aggregatorUrl, blobId) {
  try {
    // Correctly construct the retrieval URL
    const url = `${aggregatorUrl}/v1/blobs/${blobId}`;

    const response = await fetch(url, {
      method: 'GET',
      timeout: 10000,
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}`,
      };
    }

    const content = await response.text();

    return {
      ok: true,
      size: content.length,
      content: content,
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
    };
  }
}

// Run verification
verifyEndpoints().catch((error) => {
  log(`Fatal error: ${error.message}`, 'red');
  process.exit(1);
});
