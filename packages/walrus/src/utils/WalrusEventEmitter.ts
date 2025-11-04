// Event emission utilities for Walrus operations
// Emits custom events for UI integration

/**
 * Emit an operation event (store, retrieve success/failure)
 * Emits a generic 'walrus-operation' event with type in detail for backward compatibility
 * @param {string} type - Event type: 'store-success', 'store-failure', 'retrieve-success', 'retrieve-failure'
 * @param {Object} detail - Event details (blobId, error, duration, etc.)
 */
export function emitOperationEvent(type, detail = {}) {
  if (typeof window === 'undefined') return;

  // Determine success based on type
  const success = !type.includes('failure');

  // Generate human-readable message
  const messages = {
    'store-success': 'Data stored successfully',
    'store-failure': 'Failed to store data',
    'retrieve-success': 'Data retrieved successfully',
    'retrieve-failure': 'Failed to retrieve data'
  };

  // Emit generic 'walrus-operation' event with type in detail
  // This matches the expected format in WalrusStatus.jsx
  window.dispatchEvent(
    new CustomEvent('walrus-operation', {
      detail: {
        type,
        message: messages[type] || `Operation: ${type}`,
        success,
        timestamp: Date.now(),
        details: detail
      }
    })
  );
}

/**
 * Emit a health status change event
 * @param {Object} status - Health status object
 */
export function emitHealthStatusChange(status) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent('walrus-health-change', {
      detail: { ...status, timestamp: Date.now() }
    })
  );
}

/**
 * Emit a connection status event
 * @param {boolean} connected - Connection status
 */
export function emitConnectionChange(connected) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent('walrus-connection-change', {
      detail: { connected, timestamp: Date.now() }
    })
  );
}
