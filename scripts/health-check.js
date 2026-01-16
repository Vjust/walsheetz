#!/usr/bin/env node

/**
 * WalSheetz System Health Check Script
 *
 * Validates the health of all services, endpoints, and configuration.
 * Run with: bun run health
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const logger = createLogger('HealthCheck', { logLevel: 'INFO' });

class HealthChecker {
  constructor() {
    this.passed = [];
    this.warnings = [];
    this.errors = [];
  }

  /**
   * Check if frontend dev server is running
   */
  async checkFrontendServer() {
    logger.info('Checking frontend server...');

    const port = 3005;

    try {
      const response = await fetch(`http://localhost:${port}`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      }).catch(() => null);

      if (response && response.ok) {
        this.passed.push(`Frontend server healthy on port ${port}`);
        logger.info('Frontend server is healthy', { port });
        return true;
      } else {
        this.warnings.push(`Frontend server not responding on port ${port}`);
        logger.warn('Frontend server not responding', {
          port,
          suggestion: 'Start with: bun run dev',
        });
        return false;
      }
    } catch (_error) {
      this.warnings.push(`Frontend server not running on port ${port}`);
      logger.warn('Frontend server not running', {
        port,
        suggestion: 'Start with: bun run dev',
      });
      return false;
    }
  }

  /**
   * Check Walrus publisher endpoint
   */
  async checkWalrusPublisher() {
    logger.info('Checking Walrus publisher...');

    const publisherUrl =
      process.env.WALRUS_PUBLISHER_URL || 'https://publisher.walrus-testnet.walrus.space';

    try {
      const response = await fetch(`${publisherUrl}/v1/api`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);

      if (response && response.ok) {
        this.passed.push('Walrus publisher is accessible');
        logger.info('Walrus publisher is accessible', { url: publisherUrl });
        return true;
      } else {
        this.warnings.push('Walrus publisher not responding');
        logger.warn('Walrus publisher not responding', {
          url: publisherUrl,
          suggestion: 'Check network connection or try alternative endpoints',
        });
        return false;
      }
    } catch (_error) {
      this.warnings.push('Cannot reach Walrus publisher');
      logger.warn('Cannot reach Walrus publisher', {
        url: publisherUrl,
        error: _error.message,
      });
      return false;
    }
  }

  /**
   * Validate workspace structure
   */
  checkWorkspaceStructure() {
    logger.info('Validating workspace structure...');

    const requiredDirs = ['packages', 'frontend', 'scripts'];

    const requiredFiles = ['package.json', 'bun.lock', 'vite.config.js'];

    let allValid = true;

    for (const dir of requiredDirs) {
      const dirPath = path.join(ROOT_DIR, dir);
      if (!fs.existsSync(dirPath)) {
        this.errors.push(`Required directory missing: ${dir}`);
        logger.error(`Required directory missing: ${dir}`);
        allValid = false;
      }
    }

    for (const file of requiredFiles) {
      const filePath = path.join(ROOT_DIR, file);
      if (!fs.existsSync(filePath)) {
        this.errors.push(`Required file missing: ${file}`);
        logger.error(`Required file missing: ${file}`);
        allValid = false;
      }
    }

    if (allValid) {
      this.passed.push('Workspace structure is valid');
      logger.info('Workspace structure is valid');
    }

    return allValid;
  }

  /**
   * Check package build status
   */
  checkPackageBuilds() {
    logger.info('Checking package builds...');

    const packagesDir = path.join(ROOT_DIR, 'packages');
    if (!fs.existsSync(packagesDir)) {
      this.warnings.push('packages directory is missing');
      logger.warn('Packages directory missing', {
        suggestion: 'Verify workspace configuration includes packages/*',
      });
      return false;
    }

    let packages;
    try {
      packages = fs.readdirSync(packagesDir).filter((name) => {
        const pkgPath = path.join(packagesDir, name);
        try {
          return (
            fs.statSync(pkgPath).isDirectory() && fs.existsSync(path.join(pkgPath, 'package.json'))
          );
        } catch (_error) {
          logger.warn('Skipping package during build check', {
            package: name,
            error: _error.message,
          });
          return false;
        }
      });
    } catch (_error) {
      this.errors.push(`Unable to read packages directory: ${_error.message}`);
      logger.error('Failed to read packages directory', { error: _error.message });
      return false;
    }

    let allBuilt = true;

    for (const pkg of packages) {
      const distPath = path.join(packagesDir, pkg, 'dist');
      if (fs.existsSync(distPath)) {
        const files = fs.readdirSync(distPath);
        if (files.length > 0) {
          logger.debug(`Package ${pkg} is built`, { fileCount: files.length });
        } else {
          this.warnings.push(`Package ${pkg} dist directory is empty`);
          logger.warn(`Package ${pkg} dist directory is empty`);
          allBuilt = false;
        }
      } else {
        this.warnings.push(`Package ${pkg} not built (missing dist/)`);
        logger.warn(`Package ${pkg} not built`, {
          suggestion: 'Run: bun run build',
        });
        allBuilt = false;
      }
    }

    if (allBuilt) {
      this.passed.push(`All ${packages.length} packages are built`);
      logger.info('All packages are built', { count: packages.length });
    }

    return allBuilt;
  }

  /**
   * Check dependencies are installed
   */
  checkDependencies() {
    logger.info('Checking dependencies...');

    const nodeModulesPath = path.join(ROOT_DIR, 'node_modules');

    if (!fs.existsSync(nodeModulesPath)) {
      this.errors.push('Dependencies not installed (node_modules missing)');
      logger.error('Dependencies not installed', {
        suggestion: 'Run: bun install',
      });
      return false;
    }

    // Check critical dependencies
    const criticalDeps = ['react', 'vite', 'vitest', '@mysten/sui', '@mysten/walrus'];

    let allInstalled = true;

    for (const dep of criticalDeps) {
      const depPath = path.join(nodeModulesPath, dep);
      if (!fs.existsSync(depPath)) {
        this.warnings.push(`Critical dependency missing: ${dep}`);
        logger.warn(`Critical dependency missing: ${dep}`);
        allInstalled = false;
      }
    }

    if (allInstalled) {
      this.passed.push('All critical dependencies are installed');
      logger.info('All critical dependencies are installed');
    }

    return allInstalled;
  }

  /**
   * Check environment configuration
   */
  checkEnvironmentConfig() {
    logger.info('Checking environment configuration...');

    const envVars = [
      { name: 'SUI_NETWORK', default: 'testnet', required: false },
      { name: 'PORT', default: '3005', required: false },
      {
        name: 'WALRUS_PUBLISHER_URL',
        default: 'https://publisher.walrus-testnet.walrus.space',
        required: false,
      },
    ];

    for (const envVar of envVars) {
      const value = process.env[envVar.name];
      if (!value && envVar.required) {
        this.warnings.push(`Environment variable not set: ${envVar.name}`);
        logger.warn(`Environment variable not set: ${envVar.name}`, {
          suggestion: `Set ${envVar.name}=${envVar.default || '<value>'}`,
        });
      } else if (!value) {
        logger.debug(`Using default for ${envVar.name}: ${envVar.default}`);
      } else {
        logger.debug(`${envVar.name} is set: ${value}`);
      }
    }

    this.passed.push('Environment configuration checked');
    return true;
  }

  /**
   * Check Git status
   */
  checkGitStatus() {
    logger.info('Checking Git status...');

    try {
      const status = execSync('git status --porcelain', {
        cwd: ROOT_DIR,
        encoding: 'utf8',
      });

      if (status.trim()) {
        const lines = status.trim().split('\n');
        this.warnings.push(`${lines.length} uncommitted changes in Git`);
        logger.warn('Uncommitted changes detected', {
          count: lines.length,
          suggestion: 'Review with: git status',
        });
      } else {
        this.passed.push('Git working tree is clean');
        logger.info('Git working tree is clean');
      }

      return true;
    } catch (_error) {
      this.warnings.push('Not a Git repository or Git not available');
      logger.warn('Git check failed', { error: _error.message });
      return false;
    }
  }

  /**
   * Print health check summary
   */
  printSummary() {
    console.log('\n' + '='.repeat(60));
    logger.info('Health Check Summary');
    console.log('='.repeat(60) + '\n');

    if (this.passed.length > 0) {
      console.log('Passed Checks:');
      this.passed.forEach((msg) => console.log(`   - ${msg}`));
      console.log('');
    }

    if (this.warnings.length > 0) {
      console.log('Warnings:');
      this.warnings.forEach((msg) => console.log(`   - ${msg}`));
      console.log('');
    }

    if (this.errors.length > 0) {
      console.log('Errors:');
      this.errors.forEach((msg) => console.log(`   - ${msg}`));
      console.log('');
    }

    // Overall health status
    const totalChecks = this.passed.length + this.warnings.length + this.errors.length;
    const healthScore = Math.round((this.passed.length / totalChecks) * 100);

    console.log(`Overall Health: ${healthScore}%\n`);

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('All systems operational.\n');
    } else if (this.errors.length === 0) {
      console.log('System is functional with minor warnings.\n');
    } else {
      console.log('System has critical errors that need attention.\n');
    }

    // Quick actions
    if (this.warnings.length > 0 || this.errors.length > 0) {
      console.log('Quick Actions:');
      if (this.warnings.some((w) => w.includes('not built'))) {
        console.log('  → bun run build          # Build all packages');
      }
      if (this.warnings.some((w) => w.includes('Frontend server'))) {
        console.log('  → bun run dev            # Start frontend server');
      }
      if (this.errors.some((e) => e.includes('Dependencies'))) {
        console.log('  → bun install            # Install dependencies');
      }
      console.log('');
    }
  }
}

// Main health check flow
async function main() {
  console.log('\nWalSheetz System Health Check\n');

  const checker = new HealthChecker();

  // Run all checks
  checker.checkWorkspaceStructure();
  checker.checkDependencies();
  checker.checkPackageBuilds();
  checker.checkEnvironmentConfig();
  checker.checkGitStatus();

  // Async checks
  await checker.checkFrontendServer();
  await checker.checkWalrusPublisher();

  // Print summary
  checker.printSummary();

  // Exit with appropriate code
  process.exit(checker.errors.length > 0 ? 1 : 0);
}

// Handle errors
process.on('uncaughtException', (_error) => {
  logger.critical('Uncaught exception during health check', {
    error: _error.message,
    stack: _error.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (_reason) => {
  logger.critical('Unhandled rejection during health check', {
    reason: _reason?.message || _reason,
  });
  process.exit(1);
});

// Run health check
main();
