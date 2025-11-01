// Event emission utilities for Walrus operations
// Emits custom events for UI integration

/**
 * Emit an operation event (store, retrieve success/failure)
 * @param {string} type - Event type: 'store-success', 'store-failure', 'retrieve-success', 'retrieve-failure'
 * @param {Object} detail - Event details (blobId, error, duration, etc.)
 */
export function emitOperationEvent(type, detail = {}) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent(`walrus-${type}`, {
      detail: { ...detail, timestamp: Date.now() }
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
