#!/usr/bin/env node

// Start the WebSocket-gRPC bridge for WalSheetz
// This script launches the bridge server that handles real-time collaboration
// and routes messages between frontend WebSocket clients and blockchain gRPC services
//
// ⚠️ NOTE: This bridge is NOT USED in the single-user MVP deployment.
// For the single-user MVP, the application uses direct Sui RPC connections.
// This script is available for Phase 2 multi-user collaboration deployment.

import { wsGrpcBridge } from '../blockchain/websocket-grpc-bridge.js';
import { getCurrentConfig } from '../blockchain/config.js';
import { createLogger } from './utils/logger.js';

const config = getCurrentConfig();

// Check if bridge is enabled via feature flag
if (!config.collaboration.bridgeEnabled) {
  console.log('Bridge disabled. Set ENABLE_BRIDGE=true to enable.');
  process.exit(0);
}

const PORT = process.env.BRIDGE_PORT || config.websocket.port;
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.BRIDGE_LOG_LEVEL || 'INFO';

const logger = createLogger('BridgeStartup', { logLevel: LOG_LEVEL });

// Concise startup summary
logger.info('Starting WalSheetz WebSocket-gRPC Bridge', {
  environment: NODE_ENV,
  port: PORT,
  logLevel: LOG_LEVEL,
  maxClients: config.websocket.maxClients,
  healthChecks: config.websocket.healthCheck.enabled,
  metrics: config.websocket.enableMetrics
});

const startTime = Date.now();

try {
  // Initialize and start the bridge
  wsGrpcBridge.port = PORT;
  wsGrpcBridge.start();

  // Start cleanup timer for expired locks
  wsGrpcBridge.startCleanupTimer();

  const startupDuration = Date.now() - startTime;
  logger.info(`Bridge started successfully in ${startupDuration}ms`, {
    startupDuration,
    endpoints: {
      health: `http://localhost:${PORT}/health`,
      metrics: `http://localhost:${PORT}/metrics`,
      status: `http://localhost:${PORT}/status`
    }
  });

  // Log memory usage at debug level (only in Node environment)
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const memUsage = process.memoryUsage()
    logger.debug('Memory usage snapshot', {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
    })
  }
  
  // Periodic status logging (throttled, only when there's activity)
  setInterval(() => {
    if (wsGrpcBridge.clients.size > 0 || LOG_LEVEL === 'DEBUG') {
      const uptimeMs = Date.now() - startTime;
      const uptimeHours = Math.floor(uptimeMs / 3600000);
      const uptimeMinutes = Math.floor((uptimeMs % 3600000) / 60000);
      const uptimeSeconds = Math.floor((uptimeMs % 60000) / 1000);

      logger.info('Bridge status', {
        uptime: `${uptimeHours}h ${uptimeMinutes}m ${uptimeSeconds}s`,
        activeConnections: wsGrpcBridge.clients.size
      });

      // Log memory usage if significantly increased
      const currentMem = process.memoryUsage();
      if (currentMem.heapUsed > memUsage.heapUsed * 1.5) {
        logger.warn('Memory usage increased significantly', {
          heapUsed: `${Math.round(currentMem.heapUsed / 1024 / 1024)}MB`,
          increase: `${Math.round(((currentMem.heapUsed / memUsage.heapUsed) - 1) * 100)}%`
        });
      }
    }
  }, 300000); // Every 5 minutes
  
  // Graceful shutdown handling
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully');
    const shutdownStart = Date.now();

    wsGrpcBridge.stop();

    const shutdownDuration = Date.now() - shutdownStart;
    logger.info(`Bridge shutdown completed in ${shutdownDuration}ms`);
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    const shutdownStart = Date.now();

    wsGrpcBridge.stop();

    const shutdownDuration = Date.now() - shutdownStart;
    logger.info(`Bridge shutdown completed in ${shutdownDuration}ms`);
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    logger.critical('Uncaught exception, shutting down', {
      error: error.message,
      stack: error.stack
    });
    wsGrpcBridge.stop();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection', {
      reason: reason?.message || reason,
      promise: promise?.toString()
    });
    // Don't exit on unhandled rejection, but log it for debugging
  });

} catch (error) {
  const startupDuration = Date.now() - startTime;
  logger.critical(`Failed to start bridge after ${startupDuration}ms`, {
    error: error.message,
    stack: error.stack,
    troubleshooting: [
      `Check if port ${PORT} is already in use`,
      'Verify gRPC connectivity to Sui network',
      'Check environment variables and configuration'
    ]
  });
  process.exit(1);
}