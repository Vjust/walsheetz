#!/usr/bin/env node

/**
 * Cleanup script to kill processes using required ports and clean up stale files
 */

import { execSync, spawn } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Required ports for the application
const REQUIRED_PORTS = [
  3005, // Vite dev server
  8081  // WebSocket-gRPC bridge
];
const STALE_FILES = ['.vite_pid', '.vite_pid_poll'];

console.log('🧹 Starting cleanup process...');

/**
 * Kill processes using specified ports
 */
function killPortProcesses() {
  console.log('🔍 Checking for processes using required ports...');

  REQUIRED_PORTS.forEach(port => {
    try {
      // Find processes using the port
      const pids = execSync(`lsof -ti:${port}`, { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(pid => pid.trim());

      if (pids.length > 0 && pids[0]) {
        console.log(`⚠️  Found ${pids.length} process(es) using port ${port}: ${pids.join(', ')}`);
        console.log(`🛑 Killing process(es) on port ${port}...`);

        try {
          execSync(`kill -9 ${pids.join(' ')}`, { stdio: 'pipe' });
          console.log(`✅ Successfully killed process(es) on port ${port}`);
        } catch (killError) {
          console.warn(`⚠️  Failed to kill some processes on port ${port}: ${killError.message}`);
        }
      } else {
        console.log(`✅ Port ${port} is free`);
      }
    } catch (error) {
      // lsof command failed, likely because no processes are using the port
      if (error.status === 1 && error.stdout.trim() === '') {
        console.log(`✅ Port ${port} is free`);
      } else {
        console.warn(`⚠️  Error checking port ${port}: ${error.message}`);
      }
    }
  });
}

/**
 * Clean up stale PID files
 */
function cleanupStaleFiles() {
  console.log('🗂️  Cleaning up stale files...');

  STALE_FILES.forEach(file => {
    const filePath = join(__dirname, '..', file);

    if (existsSync(filePath)) {
      try {
        unlinkSync(filePath);
        console.log(`🗑️  Removed stale file: ${file}`);
      } catch (error) {
        console.warn(`⚠️  Failed to remove stale file ${file}: ${error.message}`);
      }
    } else {
      console.log(`✅ File ${file} not found, no cleanup needed`);
    }
  });
}

/**
 * Check if ports are available after cleanup
 */
function verifyPortsAvailable() {
  console.log('🔍 Verifying ports are available...');

  let allPortsFree = true;

  REQUIRED_PORTS.forEach(port => {
    try {
      const pids = execSync(`lsof -ti:${port}`, { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(pid => pid.trim());

      if (pids.length > 0 && pids[0]) {
        console.warn(`⚠️  Port ${port} is still in use by process(es): ${pids.join(', ')}`);
        allPortsFree = false;
      } else {
        console.log(`✅ Port ${port} is free`);
      }
    } catch (error) {
      console.log(`✅ Port ${port} is free`);
    }
  });

  return allPortsFree;
}

// Main cleanup process
try {
  console.log('🚀 Starting port cleanup...');

  // Kill processes using required ports
  killPortProcesses();

  // Clean up stale files
  cleanupStaleFiles();

  // Verify cleanup was successful
  const portsFree = verifyPortsAvailable();

  if (portsFree) {
    console.log('🎉 Cleanup completed successfully! All required ports are free.');
    console.log('✅ Ready to start development servers.');
  } else {
    console.log('⚠️  Some ports are still in use. You may need to manually kill the processes or use a different port.');
    process.exit(1);
  }

} catch (error) {
  console.error('❌ Cleanup failed:', error.message);
  process.exit(1);
}
