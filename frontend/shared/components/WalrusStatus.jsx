import React, { useState, useEffect } from 'react';
import { browserWalrusService } from '@services/blockchain/walrus/BrowserWalrusService.js';

/**
 * WalrusStatus - Display current Walrus service status and operations
 */
export const WalrusStatus = ({ position = 'bottom-right', minimized = false }) => {
  const [healthStatus, setHealthStatus] = useState(null);
  const [isMinimized, setIsMinimized] = useState(minimized);
  const [recentOperations, setRecentOperations] = useState([]);
  const [showDetails, setShowDetails] = useState(false);
  const [retryQueueStatus, setRetryQueueStatus] = useState(null);

  useEffect(() => {
    // Get initial health status
    const initialStatus = browserWalrusService.getHealthStatus();
    setHealthStatus(initialStatus);
    
    // Get initial retry queue status
    const initialRetryStatus = browserWalrusService.getRetryQueueStatus();
    setRetryQueueStatus(initialRetryStatus);
    
    // Update retry queue status every 5 seconds
    const retryStatusInterval = setInterval(() => {
      const retryStatus = browserWalrusService.getRetryQueueStatus();
      setRetryQueueStatus(retryStatus);
    }, 5000);

    // Listen for health status changes
    const handleHealthChange = (event) => {
      console.log('WalrusStatus received health change:', event.detail);
      setHealthStatus(browserWalrusService.getHealthStatus());
      
      // Add to recent operations
      setRecentOperations(prev => [
        {
          type: event.detail.isHealthy ? 'health_check_passed' : 'health_check_failed',
          message: event.detail.isHealthy ? 'Health check passed' : 'Health check failed',
          timestamp: event.detail.timestamp,
          details: event.detail.details
        },
        ...prev.slice(0, 9) // Keep last 10 operations
      ]);
    };

    // Listen for Walrus operations (we'll add these in the service)
    const handleWalrusOperation = (event) => {
      setRecentOperations(prev => [
        {
          type: event.detail.type,
          message: event.detail.message,
          timestamp: event.detail.timestamp,
          success: event.detail.success,
          details: event.detail.details
        },
        ...prev.slice(0, 9) // Keep last 10 operations
      ]);
    };

    window.addEventListener('walrus-health-change', handleHealthChange);
    window.addEventListener('walrus-operation', handleWalrusOperation);

    // Cleanup
    return () => {
      window.removeEventListener('walrus-health-change', handleHealthChange);
      window.removeEventListener('walrus-operation', handleWalrusOperation);
      clearInterval(retryStatusInterval);
    };
  }, []);

  const getStatusIcon = () => {
    if (!healthStatus) return '❓';
    if (healthStatus.isHealthy) return '✅';
    if (healthStatus.consecutiveFailures >= 3) return '🔴';
    return '⚠️';
  };

  const getStatusColor = () => {
    if (!healthStatus) return '#666';
    if (healthStatus.isHealthy) return '#4CAF50';
    if (healthStatus.consecutiveFailures >= 3) return '#F44336';
    return '#FF9800';
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const handleManualHealthCheck = async () => {
    try {
      const result = await browserWalrusService.checkHealth();
      setHealthStatus(result);
    } catch (error) {
      console.error('Manual health check failed:', error);
    }
  };

  const positionStyles = {
    'top-left': { top: '20px', left: '20px' },
    'top-right': { top: '20px', right: '20px' },
    'bottom-left': { bottom: '20px', left: '20px' },
    'bottom-right': { bottom: '20px', right: '20px' }
  };

  const containerStyle = {
    position: 'fixed',
    ...positionStyles[position],
    zIndex: 1000,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    color: 'white',
    borderRadius: '8px',
    padding: isMinimized ? '8px' : '16px',
    fontFamily: 'monospace',
    fontSize: '12px',
    maxWidth: isMinimized ? 'auto' : '400px',
    backdropFilter: 'blur(10px)',
    border: `2px solid ${getStatusColor()}`,
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  };

  const minimizedStyle = {
    ...containerStyle,
    padding: '8px 12px',
    borderRadius: '20px'
  };

  if (isMinimized) {
    return (
      <div 
        style={minimizedStyle}
        onClick={() => setIsMinimized(false)}
        title={healthStatus?.summary || 'Walrus Status'}
      >
        <span style={{ marginRight: '6px' }}>{getStatusIcon()}</span>
        <span style={{ fontWeight: 'bold' }}>Walrus</span>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '12px',
        borderBottom: '1px solid rgba(255,255,255,0.2)',
        paddingBottom: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px', fontSize: '16px' }}>{getStatusIcon()}</span>
          <span style={{ fontWeight: 'bold' }}>Walrus Status</span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={handleManualHealthCheck}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: 'white',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '10px',
              cursor: 'pointer'
            }}
            title="Run health check"
          >
            🔄
          </button>
          <button
            onClick={() => setShowDetails(!showDetails)}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: 'white',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '10px',
              cursor: 'pointer'
            }}
            title="Toggle details"
          >
            {showDetails ? '📄' : '📋'}
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: 'white',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '10px',
              cursor: 'pointer'
            }}
            title="Minimize"
          >
            ➖
          </button>
        </div>
      </div>

      {/* Status Summary */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontWeight: 'bold', color: getStatusColor() }}>
          {healthStatus?.summary || 'Checking status...'}
        </div>
        {healthStatus?.lastCheck && (
          <div style={{ fontSize: '10px', opacity: 0.7 }}>
            Last checked: {formatTimestamp(healthStatus.lastCheck)}
          </div>
        )}
      </div>

      {/* Service Status */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
          <span>Publisher:</span>
          <span style={{ color: healthStatus?.publisherAvailable ? '#4CAF50' : '#F44336' }}>
            {healthStatus?.publisherAvailable ? '✅ Available' : '❌ Down'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
          <span>Aggregator:</span>
          <span style={{ color: healthStatus?.aggregatorAvailable ? '#4CAF50' : '#F44336' }}>
            {healthStatus?.aggregatorAvailable ? '✅ Available' : '❌ Down'}
          </span>
        </div>
        {healthStatus?.consecutiveFailures > 0 && (
          <div style={{ fontSize: '10px', color: '#FF9800' }}>
            Consecutive failures: {healthStatus.consecutiveFailures}
          </div>
        )}
      </div>

      {/* Retry Queue Status */}
      {retryQueueStatus && retryQueueStatus.queueSize > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ 
            fontWeight: 'bold', 
            color: '#FF9800',
            fontSize: '11px',
            marginBottom: '4px'
          }}>
            Retry Queue: {retryQueueStatus.queueSize} operations
          </div>
          <div style={{ fontSize: '10px', opacity: 0.8 }}>
            {retryQueueStatus.readyForRetry > 0 && (
              <div>Ready for retry: {retryQueueStatus.readyForRetry}</div>
            )}
            {retryQueueStatus.processingInProgress && (
              <div style={{ color: '#2196F3' }}>Processing retries...</div>
            )}
            {retryQueueStatus.nextRetryIn !== null && retryQueueStatus.nextRetryIn > 0 && (
              <div>Next retry in: {Math.round(retryQueueStatus.nextRetryIn / 1000)}s</div>
            )}
          </div>
        </div>
      )}

      {/* Recent Operations */}
      {showDetails && (
        <div>
          <div style={{ 
            fontWeight: 'bold', 
            marginBottom: '8px',
            borderTop: '1px solid rgba(255,255,255,0.2)',
            paddingTop: '8px'
          }}>
            Recent Operations
          </div>
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {recentOperations.length === 0 ? (
              <div style={{ fontSize: '10px', opacity: 0.5, fontStyle: 'italic' }}>
                No recent operations
              </div>
            ) : (
              recentOperations.map((op, index) => (
                <div 
                  key={index}
                  style={{ 
                    fontSize: '10px', 
                    marginBottom: '4px',
                    padding: '4px',
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    borderRadius: '4px',
                    borderLeft: `2px solid ${
                      op.success === false ? '#F44336' : 
                      op.type.includes('failed') ? '#F44336' :
                      '#4CAF50'
                    }`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{op.message}</span>
                    <span style={{ opacity: 0.6 }}>
                      {formatTimestamp(op.timestamp)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WalrusStatus;