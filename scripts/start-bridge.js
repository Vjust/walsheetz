#!/usr/bin/env node

// Start the WebSocket-gRPC bridge for WalSheetz
// This script launches the bridge server that handles real-time collaboration
// and routes messages between frontend WebSocket clients and blockchain gRPC services

import { wsGrpcBridge } from '../blockchain/websocket-grpc-bridge.js';
import { getCurrentConfig } from '../blockchain/config.js';

const config = getCurrentConfig();
const PORT = process.env.BRIDGE_PORT || config.websocket.port;
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.BRIDGE_LOG_LEVEL || 'INFO';

// Enhanced startup logging
console.log('🌉 Starting WalSheetz WebSocket-gRPC Bridge...');
console.log(`📊 Bridge Configuration:`);
console.log(`   Environment: ${NODE_ENV}`);
console.log(`   Port: ${PORT}`);
console.log(`   Log Level: ${LOG_LEVEL}`);
console.log(`   Max Clients: ${config.websocket.maxClients}`);
console.log(`   Health Checks: ${config.websocket.healthCheck.enabled ? 'Enabled' : 'Disabled'}`);
console.log(`   Metrics: ${config.websocket.enableMetrics ? 'Enabled' : 'Disabled'}`);
console.log(`   Sui Network: ${config.sui.rpcUrl}`);
console.log(`   Walrus Storage: ${config.walrus.publisherUrl}`);

const startTime = Date.now();

try {
  console.log('🔧 Initializing bridge components...');
  
  // Initialize and start the bridge
  wsGrpcBridge.port = PORT;
  
  console.log('🚀 Starting bridge server...');
  wsGrpcBridge.start();
  
  // Start cleanup timer for expired locks
  console.log('🧹 Starting cleanup timer for expired locks...');
  wsGrpcBridge.startCleanupTimer();
  
  const startupDuration = Date.now() - startTime;
  console.log('✅ Bridge started successfully');
  console.log(`⏱️  Startup completed in ${startupDuration}ms`);
  console.log('📡 Ready for WebSocket connections');
  console.log('🔗 Ready for gRPC blockchain calls');
  console.log('🔍 Health check available at: http://localhost:' + PORT + '/health');
  console.log('📈 Metrics available at: http://localhost:' + PORT + '/metrics');
  console.log('📊 Status dashboard at: http://localhost:' + PORT + '/status');
  
  // Log memory usage
  const memUsage = process.memoryUsage();
  console.log('💾 Memory Usage:');
  console.log(`   RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB`);
  console.log(`   Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
  console.log(`   Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
  
  // Periodic status logging
  setInterval(() => {
    const uptimeMs = Date.now() - startTime;
    const uptimeHours = Math.floor(uptimeMs / 3600000);
    const uptimeMinutes = Math.floor((uptimeMs % 3600000) / 60000);
    const uptimeSeconds = Math.floor((uptimeMs % 60000) / 1000);
    
    console.log(`📊 Bridge Status - Uptime: ${uptimeHours}h ${uptimeMinutes}m ${uptimeSeconds}s, Active Connections: ${wsGrpcBridge.clients.size}`);
    
    // Log memory usage periodically
    const currentMem = process.memoryUsage();
    if (currentMem.heapUsed > memUsage.heapUsed * 1.5) {
      console.log(`⚠️  Memory usage increased significantly: ${Math.round(currentMem.heapUsed / 1024 / 1024)}MB`);
    }
  }, 300000); // Every 5 minutes
  
  // Graceful shutdown handling
  process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down bridge gracefully...');
    const shutdownStart = Date.now();
    
    // Stop accepting new connections
    wsGrpcBridge.stop();
    
    const shutdownDuration = Date.now() - shutdownStart;
    console.log(`✅ Bridge shutdown completed in ${shutdownDuration}ms`);
    console.log('👋 Goodbye!');
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down bridge gracefully...');
    const shutdownStart = Date.now();
    
    // Stop accepting new connections
    wsGrpcBridge.stop();
    
    const shutdownDuration = Date.now() - shutdownStart;
    console.log(`✅ Bridge shutdown completed in ${shutdownDuration}ms`);
    console.log('👋 Goodbye!');
    process.exit(0);
  });
  
  process.on('uncaughtException', (error) => {
    console.error('🚨 Uncaught Exception:', error);
    console.error('Stack:', error.stack);
    console.log('🛑 Shutting down due to uncaught exception...');
    wsGrpcBridge.stop();
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Promise Rejection at:', promise);
    console.error('Reason:', reason);
    // Don't exit on unhandled rejection, but log it for debugging
  });
  
} catch (error) {
  const startupDuration = Date.now() - startTime;
  console.error(`❌ Failed to start bridge after ${startupDuration}ms:`, error);
  console.error('Stack:', error.stack);
  console.log('💡 Troubleshooting:');
  console.log('   - Check if port ' + PORT + ' is already in use');
  console.log('   - Verify gRPC connectivity to Sui network');
  console.log('   - Check environment variables and configuration');
  process.exit(1);
}