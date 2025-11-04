import React, { useState, useEffect } from 'react';
import { browserSuiService } from '@services/blockchain/sui/BrowserSuiService.js';
import { browserWalrusService } from '@services/blockchain/walrus/BrowserWalrusService.js';

const RateLimiterStatus = ({ show = false, position = 'bottom-right' }) => {
  const [metrics, setMetrics] = useState({
    sui: null,
    walrusAgg: null,
    walrusPub: null
  });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!show) return;

    const updateMetrics = () => {
      const newMetrics = {};
      
      // Get Sui limiter metrics
      if (browserSuiService?.limiters?.sui) {
        newMetrics.sui = browserSuiService.limiters.sui.getMetrics();
      }
      
      // Get Walrus aggregator metrics
      if (browserWalrusService?.limiters?.walrusAgg) {
        newMetrics.walrusAgg = browserWalrusService.limiters.walrusAgg.getMetrics();
      }
      
      // Get Walrus publisher metrics
      if (browserWalrusService?.limiters?.walrusPub) {
        newMetrics.walrusPub = browserWalrusService.limiters.walrusPub.getMetrics();
      }
      
      setMetrics(newMetrics);
    };

    // Update immediately
    updateMetrics();
    
    // Update every 2 seconds
    const interval = setInterval(updateMetrics, 2000);
    
    return () => clearInterval(interval);
  }, [show]);

  if (!show) return null;

  const hasActiveBackoff = 
    metrics.sui?.backoffActive || 
    metrics.walrusAgg?.backoffActive || 
    metrics.walrusPub?.backoffActive;

  const totalQueued = 
    (metrics.sui?.currentQueueLength || 0) +
    (metrics.walrusAgg?.currentQueueLength || 0) +
    (metrics.walrusPub?.currentQueueLength || 0);

  const positionClasses = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4'
  };

  return (
    <div 
      className={`fixed ${positionClasses[position]} z-50 bg-gray-900 text-white p-2 rounded-lg shadow-lg text-xs font-mono transition-all`}
      style={{ 
        minWidth: expanded ? '300px' : '200px',
        backgroundColor: hasActiveBackoff ? 'rgba(239, 68, 68, 0.9)' : 'rgba(17, 24, 39, 0.9)'
      }}
    >
      <div 
        className="flex justify-between items-center cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="font-semibold">Rate Limiter</span>
        <div className="flex items-center gap-2">
          {hasActiveBackoff && (
            <span className="text-yellow-300 animate-pulse">⚠️ Backoff</span>
          )}
          {totalQueued > 0 && (
            <span className="bg-blue-600 px-1 rounded">{totalQueued} queued</span>
          )}
          <span>{expanded ? '▼' : '▶'}</span>
        </div>
      </div>
      
      {expanded && (
        <div className="mt-2 space-y-2 border-t border-gray-700 pt-2">
          {/* Sui Metrics */}
          {metrics.sui && (
            <div className="space-y-1">
              <div className="font-semibold text-blue-400">Sui RPC</div>
              <div className="grid grid-cols-2 gap-x-2 text-xs">
                <span>Requests/sec:</span>
                <span>{metrics.sui.requestsPerSec}</span>
                <span>Queue:</span>
                <span>{metrics.sui.currentQueueLength}</span>
                <span>Concurrent:</span>
                <span>{metrics.sui.currentConcurrent}</span>
                <span>Avg Wait:</span>
                <span>{metrics.sui.avgWaitMs}ms</span>
                <span>Success:</span>
                <span>{metrics.sui.successfulRequests}</span>
                <span>Failed:</span>
                <span className={metrics.sui.failedRequests > 0 ? 'text-red-400' : ''}>
                  {metrics.sui.failedRequests}
                </span>
                <span>Cache Hits:</span>
                <span>{metrics.sui.cacheHits}</span>
                <span>Deduped:</span>
                <span>{metrics.sui.dedupedRequests}</span>
                {metrics.sui.last429At && (
                  <>
                    <span>Last 429:</span>
                    <span className="text-yellow-400">
                      {new Date(metrics.sui.last429At).toLocaleTimeString()}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
          
          {/* Walrus Aggregator Metrics */}
          {metrics.walrusAgg && (
            <div className="space-y-1">
              <div className="font-semibold text-green-400">Walrus Read</div>
              <div className="grid grid-cols-2 gap-x-2 text-xs">
                <span>Requests/sec:</span>
                <span>{metrics.walrusAgg.requestsPerSec}</span>
                <span>Queue:</span>
                <span>{metrics.walrusAgg.currentQueueLength}</span>
                <span>Concurrent:</span>
                <span>{metrics.walrusAgg.currentConcurrent}</span>
                <span>Avg Wait:</span>
                <span>{metrics.walrusAgg.avgWaitMs}ms</span>
                <span>Cache Hits:</span>
                <span>{metrics.walrusAgg.cacheHits}</span>
                {metrics.walrusAgg.last429At && (
                  <>
                    <span>Last 429:</span>
                    <span className="text-yellow-400">
                      {new Date(metrics.walrusAgg.last429At).toLocaleTimeString()}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
          
          {/* Walrus Publisher Metrics */}
          {metrics.walrusPub && (
            <div className="space-y-1">
              <div className="font-semibold text-purple-400">Walrus Write</div>
              <div className="grid grid-cols-2 gap-x-2 text-xs">
                <span>Requests/sec:</span>
                <span>{metrics.walrusPub.requestsPerSec}</span>
                <span>Queue:</span>
                <span>{metrics.walrusPub.currentQueueLength}</span>
                <span>Concurrent:</span>
                <span>{metrics.walrusPub.currentConcurrent}</span>
                <span>Avg Wait:</span>
                <span>{metrics.walrusPub.avgWaitMs}ms</span>
                <span>Success:</span>
                <span>{metrics.walrusPub.successfulRequests}</span>
                <span>Failed:</span>
                <span className={metrics.walrusPub.failedRequests > 0 ? 'text-red-400' : ''}>
                  {metrics.walrusPub.failedRequests}
                </span>
                {metrics.walrusPub.last429At && (
                  <>
                    <span>Last 429:</span>
                    <span className="text-yellow-400">
                      {new Date(metrics.walrusPub.last429At).toLocaleTimeString()}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RateLimiterStatus;