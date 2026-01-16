#!/usr/bin/env node

/**
 * WalSheetz Development Environment Setup Script
 *
 * This script automates the initial setup and validation of your development environment.
 * It checks prerequisites, installs dependencies, and validates the workspace structure.
 *
 * Run with: bun run setup
 */

import { execSync } from 'child_process';
import net from 'node:net';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const logger = createLogger('Setup', { logLevel: 'INFO' });

class SetupValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.passed = [];
  }

  /**
   * Check if Bun is installed and meets minimum version
   */
  async validateBun() {
    logger.info('Validating Bun installation...');

    try {
      const version = execSync('bun --version', { encoding: 'utf8' }).trim();
      const versionNum = parseFloat(version);

      if (versionNum >= 1.0) {
        this.passed.push(`Bun ${version} detected`);
        logger.info(`Bun version ${version} detected`, { status: 'success' });
        return true;
      } else {
        this.warnings.push(`Bun version ${version} is older than recommended (1.0+)`);
        logger.warn(`Bun version ${version} is older than recommended`, {
          current: version,
          recommended: '1.0+',
        });
        return true; // Still continue, but with warning
      }
    } catch (_error) {
      this.errors.push('Bun is not installed or not in PATH');
      logger.error('Bun is not installed or not in PATH', {
        error: _error.message,
        installInstructions: 'Visit https://bun.sh to install Bun',
      });
      return false;
    }
  }

  /**
   * Check if required port is available
   */
  async validatePort(port = 3005) {
    logger.info(`Checking port ${port} availability...`);

    return new Promise((resolve) => {
      let server;
      let timeoutId;
      try {
        server = net.createServer();
      } catch (_error) {
        this.errors.push(`Unable to create port probe: ${_error.message}`);
        logger.error('Failed to create port probe', { error: _error.message });
        resolve(false);
        return;
      }

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }
        if (server) {
          server.removeAllListeners('error');
          server.removeAllListeners('listening');
          try {
            server.close();
          } catch (_) {
            // Ignore close errors - server may already be closed
          }
        }
      };

      server.once('error', (_error) => {
        cleanup();

        if (_error.code === 'EADDRINUSE') {
          this.warnings.push(`Port ${port} is already in use`);
          logger.warn(`Port ${port} is already in use`, {
            port,
            suggestion: 'Stop any running service or choose a different port',
          });
          resolve(true);
        } else {
          this.errors.push(`Unable to probe port ${port}: ${_error.message}`);
          logger.error('Port probe failed', { port, error: _error.message });
          resolve(false);
        }
      });

      server.once('listening', () => {
        cleanup();
        this.passed.push(`Port ${port} is available`);
        logger.info(`Port ${port} is available`, { status: 'success' });
        resolve(true);
      });

      server.listen({ port, host: '127.0.0.1' });

      timeoutId = setTimeout(() => {
        cleanup();
        this.warnings.push(`Port ${port} probe timed out`);
        logger.warn('Port probe timed out', { port });
        resolve(true);
      }, 3000);

      if (typeof timeoutId?.unref === 'function') {
        timeoutId.unref();
      }
    });
  }

  /**
   * Validate workspace structure
   */
  async validateWorkspace() {
    logger.info('Validating workspace structure...');

    const requiredDirs = ['packages', 'apps', 'frontend', 'scripts'];

    const requiredFiles = ['package.json', 'bun.lock', 'tsconfig.json', 'vitest.config.js'];

    let allValid = true;

    // Check directories
    for (const dir of requiredDirs) {
      const dirPath = path.join(ROOT_DIR, dir);
      if (fs.existsSync(dirPath)) {
        logger.debug(`Directory found: ${dir}`);
      } else {
        this.warnings.push(`Directory missing: ${dir}`);
        logger.warn(`Directory missing: ${dir}`, { path: dirPath });
      }
    }

    // Check files
    for (const file of requiredFiles) {
      const filePath = path.join(ROOT_DIR, file);
      if (fs.existsSync(filePath)) {
        logger.debug(`File found: ${file}`);
      } else {
        this.errors.push(`Required file missing: ${file}`);
        logger.error(`Required file missing: ${file}`, { path: filePath });
        allValid = false;
      }
    }

    // Check workspace packages
    const packagesDir = path.join(ROOT_DIR, 'packages');
    if (fs.existsSync(packagesDir)) {
      const packages = fs.readdirSync(packagesDir).filter((name) => {
        const pkgPath = path.join(packagesDir, name);
        return (
          fs.statSync(pkgPath).isDirectory() && fs.existsSync(path.join(pkgPath, 'package.json'))
        );
      });

      if (packages.length > 0) {
        this.passed.push(`Found ${packages.length} workspace packages`);
        logger.info(`Found ${packages.length} workspace packages`, {
          packages: packages.join(', '),
        });
      } else {
        this.warnings.push('No packages found in workspace');
        logger.warn('No packages found in workspace');
      }
    }

    if (allValid) {
      this.passed.push('Workspace structure is valid');
      logger.info('Workspace structure validation passed', { status: 'success' });
    }

    return allValid;
  }

  /**
   * Install dependencies
   */
  async installDependencies() {
    logger.info('Installing dependencies...');

    try {
      const startTime = Date.now();

      // Run bun install with output
      execSync('bun install', {
        cwd: ROOT_DIR,
        stdio: 'inherit',
      });

      const duration = Date.now() - startTime;
      this.passed.push(`Dependencies installed in ${(duration / 1000).toFixed(1)}s`);
      logger.info('Dependencies installed successfully', {
        duration: `${(duration / 1000).toFixed(1)}s`,
        status: 'success',
      });
      return true;
    } catch (_error) {
      this.errors.push('Failed to install dependencies');
      logger.error('Failed to install dependencies', {
        error: _error.message,
      });
      return false;
    }
  }

  /**
   * Validate configuration files
   */
  async validateConfiguration() {
    logger.info('Validating configuration...');

    const configChecks = [
      {
        path: '.env.example',
        optional: true,
        message: 'Example environment file',
      },
      {
        path: 'public/app-config.json',
        optional: false,
        message: 'App configuration',
      },
    ];

    for (const check of configChecks) {
      const fullPath = path.join(ROOT_DIR, check.path);
      if (fs.existsSync(fullPath)) {
        logger.debug(`Config found: ${check.path}`);
      } else if (!check.optional) {
        this.warnings.push(`${check.message} missing: ${check.path}`);
        logger.warn(`${check.message} missing`, { path: check.path });
      }
    }

    this.passed.push('Configuration validation complete');
    return true;
  }

  /**
   * Print setup summary and next steps
   */
  printSummary() {
    console.log('\n' + '='.repeat(60));
    logger.info('Setup Summary', { status: 'complete' });
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

    // Next steps
    if (this.errors.length === 0) {
      console.log('Setup complete. Next steps:\n');
      console.log('  bun run dev     # Start the app');
      console.log('  bun run test    # Run tests');
      console.log('  bun run health  # Run health checks\n');
    } else {
      console.log('Setup failed. Fix the errors above and try again.\n');
      process.exit(1);
    }
  }
}

// Main setup flow
async function main() {
  console.log('\nWalSheetz Development Environment Setup\n');

  const validator = new SetupValidator();
  let success = true;

  // Run validation steps
  success = (await validator.validateBun()) && success;
  success = (await validator.validateWorkspace()) && success;

  // Continue with setup if critical checks passed
  if (success) {
    await validator.validatePort(process.env.PORT || 3005);
    await validator.installDependencies();
    await validator.validateConfiguration();
  }

  // Print summary
  validator.printSummary();

  // Exit with appropriate code
  process.exit(validator.errors.length > 0 ? 1 : 0);
}

// Handle errors
process.on('uncaughtException', (_error) => {
  logger.critical('Uncaught exception during setup', {
    error: _error.message,
    stack: _error.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (_reason) => {
  logger.critical('Unhandled rejection during setup', {
    reason: _reason?.message || _reason,
  });
  process.exit(1);
});

// Run setup
main();
