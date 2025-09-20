import React, { useState, useEffect } from 'react';
import { walrusService } from '../../blockchain/walrus-service.js';
import { indexedDBCache } from '../services/IndexedDBCache.js';

// Storage Analytics and Monitoring Dashboard
export const StorageAnalyticsDashboard = ({ isOpen, onClose }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Load analytics data
  const loadStats = async () => {
    setLoading(true);
    try {
      const cacheStats = await walrusService.getCacheStats();
      const deduplicationStats = walrusService.getDeduplicationStats();
      const indexedDBStats = await indexedDBCache.getCacheStats();

      setStats({
        cache: cacheStats,
        deduplication: deduplicationStats,
        indexedDB: indexedDBStats,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Failed to load storage analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh effect
  useEffect(() => {
    if (isOpen) {
      loadStats();
    }
  }, [isOpen]);

  useEffect(() => {
    let interval;
    if (autoRefresh && isOpen) {
      interval = setInterval(loadStats, 30000); // Refresh every 30 seconds
    }
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [autoRefresh, isOpen]);

  // Clear caches
  const handleClearCaches = async () => {
    if (confirm('Are you sure you want to clear all caches? This cannot be undone.')) {
      setLoading(true);
      try {
        await walrusService.clearAllCaches();
        await loadStats();
        alert('Caches cleared successfully');
      } catch (error) {
        alert('Failed to clear caches: ' + error.message);
      } finally {
        setLoading(false);
      }
    }
  };

  // Format bytes
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format percentage
  const formatPercent = (value, total) => {
    if (total === 0) return '0%';
    return ((value / total) * 100).toFixed(1) + '%';
  };

  if (!isOpen) return null;

  return (
    <div className="storage-analytics-dashboard">
      <div className="dashboard-overlay" onClick={onClose}>
        <div className="dashboard-modal" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="dashboard-header">
            <h2>📊 Storage Analytics & Monitoring</h2>
            <div className="header-controls">
              <label className="auto-refresh-toggle">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                Auto-refresh (30s)
              </label>
              <button onClick={loadStats} disabled={loading} className="refresh-btn">
                🔄 Refresh
              </button>
              <button onClick={handleClearCaches} className="clear-btn">
                🧹 Clear Caches
              </button>
              <button onClick={onClose} className="close-btn">×</button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="tab-navigation">
            <button
              className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button
              className={`tab ${activeTab === 'cache' ? 'active' : ''}`}
              onClick={() => setActiveTab('cache')}
            >
              Cache Performance
            </button>
            <button
              className={`tab ${activeTab === 'compression' ? 'active' : ''}`}
              onClick={() => setActiveTab('compression')}
            >
              Compression
            </button>
            <button
              className={`tab ${activeTab === 'deduplication' ? 'active' : ''}`}
              onClick={() => setActiveTab('deduplication')}
            >
              Deduplication
            </button>
            <button
              className={`tab ${activeTab === 'network' ? 'active' : ''}`}
              onClick={() => setActiveTab('network')}
            >
              Network
            </button>
          </div>

          {/* Content */}
          <div className="dashboard-content">
            {loading && <div className="loading">Loading analytics...</div>}

            {stats && !loading && (
              <>
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                  <div className="overview-tab">
                    <div className="metrics-grid">
                      <div className="metric-card">
                        <h3>📦 Cache Summary</h3>
                        <div className="metric-value">
                          {stats.indexedDB?.total?.count || 0} entries
                        </div>
                        <div className="metric-detail">
                          {formatBytes(stats.indexedDB?.total?.compressedSize || 0)} total
                        </div>
                      </div>

                      <div className="metric-card">
                        <h3>🗜️ Compression Ratio</h3>
                        <div className="metric-value">
                          {stats.indexedDB?.compressionRatio?.toFixed(2) || '1.0'}x
                        </div>
                        <div className="metric-detail">
                          {formatBytes((stats.indexedDB?.total?.totalSize || 0) - (stats.indexedDB?.total?.compressedSize || 0))} saved
                        </div>
                      </div>

                      <div className="metric-card">
                        <h3>🎯 Deduplication</h3>
                        <div className="metric-value">
                          {stats.deduplication?.totalEntries || 0} hashes
                        </div>
                        <div className="metric-detail">
                          {stats.deduplication?.totalAccesses || 0} hits
                        </div>
                      </div>

                      <div className="metric-card">
                        <h3>⚡ Performance</h3>
                        <div className="metric-value">
                          {stats.cache?.performance?.retrieveStats?.averageExecutionTime?.toFixed(0) || '0'}ms
                        </div>
                        <div className="metric-detail">
                          avg retrieval time
                        </div>
                      </div>
                    </div>

                    <div className="storage-breakdown">
                      <h3>Storage Breakdown</h3>
                      <div className="breakdown-chart">
                        <div className="breakdown-item">
                          <div className="breakdown-label">Spreadsheets</div>
                          <div className="breakdown-bar">
                            <div
                              className="breakdown-fill spreadsheets"
                              style={{
                                width: formatPercent(
                                  stats.indexedDB?.spreadsheets?.compressedSize || 0,
                                  stats.indexedDB?.total?.compressedSize || 1
                                )
                              }}
                            ></div>
                          </div>
                          <div className="breakdown-value">
                            {formatBytes(stats.indexedDB?.spreadsheets?.compressedSize || 0)}
                          </div>
                        </div>
                        <div className="breakdown-item">
                          <div className="breakdown-label">Versions</div>
                          <div className="breakdown-bar">
                            <div
                              className="breakdown-fill versions"
                              style={{
                                width: formatPercent(
                                  stats.indexedDB?.versions?.compressedSize || 0,
                                  stats.indexedDB?.total?.compressedSize || 1
                                )
                              }}
                            ></div>
                          </div>
                          <div className="breakdown-value">
                            {formatBytes(stats.indexedDB?.versions?.compressedSize || 0)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Cache Performance Tab */}
                {activeTab === 'cache' && (
                  <div className="cache-tab">
                    <div className="metrics-grid">
                      <div className="metric-card">
                        <h3>📊 Hit Rate</h3>
                        <div className="metric-value">
                          {(stats.cache?.performance?.retrieveStats?.successRate * 100 || 0).toFixed(1)}%
                        </div>
                        <div className="metric-detail">cache effectiveness</div>
                      </div>

                      <div className="metric-card">
                        <h3>⏱️ Average Response</h3>
                        <div className="metric-value">
                          {stats.cache?.performance?.retrieveStats?.averageExecutionTime?.toFixed(0) || '0'}ms
                        </div>
                        <div className="metric-detail">from cache vs network</div>
                      </div>

                      <div className="metric-card">
                        <h3>💾 Cache Size</h3>
                        <div className="metric-value">
                          {formatBytes(stats.indexedDB?.total?.compressedSize || 0)}
                        </div>
                        <div className="metric-detail">
                          of {formatBytes(stats.cache?.policies?.maxCacheSize || 0)} limit
                        </div>
                      </div>

                      <div className="metric-card">
                        <h3>🔄 Auto-Cleanup</h3>
                        <div className="metric-value">
                          {formatPercent(
                            stats.indexedDB?.total?.compressedSize || 0,
                            stats.cache?.policies?.maxCacheSize || 1
                          )}
                        </div>
                        <div className="metric-detail">cache utilization</div>
                      </div>
                    </div>

                    <div className="cache-policies">
                      <h3>Cache Policies</h3>
                      <div className="policy-grid">
                        <div className="policy-item">
                          <label>Max Cache Size:</label>
                          <span>{formatBytes(stats.cache?.policies?.maxCacheSize || 0)}</span>
                        </div>
                        <div className="policy-item">
                          <label>Version Age Limit:</label>
                          <span>{((stats.cache?.policies?.maxVersionAge || 0) / (24 * 60 * 60 * 1000)).toFixed(0)} days</span>
                        </div>
                        <div className="policy-item">
                          <label>Compression Threshold:</label>
                          <span>{formatBytes(stats.cache?.policies?.compressionThreshold || 0)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Compression Tab */}
                {activeTab === 'compression' && (
                  <div className="compression-tab">
                    <div className="compression-summary">
                      <h3>Compression Effectiveness</h3>
                      <div className="compression-stats">
                        <div className="compression-stat">
                          <label>Original Size:</label>
                          <span>{formatBytes(stats.indexedDB?.total?.totalSize || 0)}</span>
                        </div>
                        <div className="compression-stat">
                          <label>Compressed Size:</label>
                          <span>{formatBytes(stats.indexedDB?.total?.compressedSize || 0)}</span>
                        </div>
                        <div className="compression-stat">
                          <label>Space Saved:</label>
                          <span>{formatBytes((stats.indexedDB?.total?.totalSize || 0) - (stats.indexedDB?.total?.compressedSize || 0))}</span>
                        </div>
                        <div className="compression-stat">
                          <label>Compression Ratio:</label>
                          <span>{stats.indexedDB?.compressionRatio?.toFixed(2) || '1.0'}x</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Deduplication Tab */}
                {activeTab === 'deduplication' && (
                  <div className="deduplication-tab">
                    <div className="metrics-grid">
                      <div className="metric-card">
                        <h3>🎯 Hash Registry</h3>
                        <div className="metric-value">
                          {stats.deduplication?.totalEntries || 0}
                        </div>
                        <div className="metric-detail">unique content hashes</div>
                      </div>

                      <div className="metric-card">
                        <h3>✨ Hits</h3>
                        <div className="metric-value">
                          {stats.deduplication?.totalAccesses || 0}
                        </div>
                        <div className="metric-detail">avoided uploads</div>
                      </div>

                      <div className="metric-card">
                        <h3>💾 Registry Size</h3>
                        <div className="metric-value">
                          {formatBytes(stats.deduplication?.registrySize || 0)}
                        </div>
                        <div className="metric-detail">metadata storage</div>
                      </div>

                      <div className="metric-card">
                        <h3>📅 Age Range</h3>
                        <div className="metric-value">
                          {stats.deduplication?.oldestEntry ?
                            Math.round((Date.now() - stats.deduplication.oldestEntry) / (24 * 60 * 60 * 1000)) :
                            0
                          }d
                        </div>
                        <div className="metric-detail">oldest entry</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Network Tab */}
                {activeTab === 'network' && (
                  <div className="network-tab">
                    <div className="metrics-grid">
                      <div className="metric-card">
                        <h3>📤 Upload Performance</h3>
                        <div className="metric-value">
                          {stats.cache?.performance?.storeStats?.averageExecutionTime?.toFixed(0) || '0'}ms
                        </div>
                        <div className="metric-detail">average upload time</div>
                      </div>

                      <div className="metric-card">
                        <h3>📥 Download Performance</h3>
                        <div className="metric-value">
                          {stats.cache?.performance?.retrieveStats?.averageExecutionTime?.toFixed(0) || '0'}ms
                        </div>
                        <div className="metric-detail">average download time</div>
                      </div>

                      <div className="metric-card">
                        <h3>✅ Success Rate</h3>
                        <div className="metric-value">
                          {(stats.cache?.performance?.storeStats?.successRate * 100 || 0).toFixed(1)}%
                        </div>
                        <div className="metric-detail">upload reliability</div>
                      </div>

                      <div className="metric-card">
                        <h3>🔄 Retry Rate</h3>
                        <div className="metric-value">
                          {(stats.cache?.performance?.storeStats?.retryRate * 100 || 0).toFixed(1)}%
                        </div>
                        <div className="metric-detail">operations retried</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="dashboard-footer">
            <div className="last-updated">
              Last updated: {stats ? new Date(stats.timestamp).toLocaleTimeString() : 'Never'}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .storage-analytics-dashboard {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 9999;
        }

        .dashboard-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
        }

        .dashboard-modal {
          background: white;
          border-radius: 12px;
          width: 90%;
          max-width: 1200px;
          height: 90%;
          max-height: 800px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid #e5e7eb;
        }

        .dashboard-header h2 {
          margin: 0;
          font-size: 1.5rem;
          color: #1f2937;
        }

        .header-controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .auto-refresh-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .refresh-btn, .clear-btn {
          padding: 8px 16px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          background: white;
          cursor: pointer;
          font-size: 0.875rem;
          transition: all 0.2s;
        }

        .refresh-btn:hover, .clear-btn:hover {
          background: #f9fafb;
          border-color: #9ca3af;
        }

        .clear-btn {
          color: #dc2626;
          border-color: #fca5a5;
        }

        .clear-btn:hover {
          background: #fef2f2;
          border-color: #dc2626;
        }

        .close-btn {
          width: 32px;
          height: 32px;
          border: none;
          background: #f3f4f6;
          border-radius: 6px;
          cursor: pointer;
          font-size: 1.25rem;
          color: #6b7280;
          transition: all 0.2s;
        }

        .close-btn:hover {
          background: #e5e7eb;
          color: #374151;
        }

        .tab-navigation {
          display: flex;
          border-bottom: 1px solid #e5e7eb;
          padding: 0 24px;
        }

        .tab {
          padding: 12px 20px;
          border: none;
          background: none;
          cursor: pointer;
          font-size: 0.875rem;
          color: #6b7280;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
        }

        .tab:hover {
          color: #374151;
          background: #f9fafb;
        }

        .tab.active {
          color: #3b82f6;
          border-bottom-color: #3b82f6;
        }

        .dashboard-content {
          flex: 1;
          padding: 24px;
          overflow-y: auto;
        }

        .loading {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 200px;
          color: #6b7280;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-bottom: 32px;
        }

        .metric-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 20px;
        }

        .metric-card h3 {
          margin: 0 0 12px 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: #64748b;
        }

        .metric-value {
          font-size: 2rem;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 4px;
        }

        .metric-detail {
          font-size: 0.75rem;
          color: #64748b;
        }

        .storage-breakdown {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 20px;
        }

        .storage-breakdown h3 {
          margin: 0 0 16px 0;
          font-size: 1rem;
          font-weight: 600;
          color: #1e293b;
        }

        .breakdown-item {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .breakdown-label {
          width: 100px;
          font-size: 0.875rem;
          color: #64748b;
        }

        .breakdown-bar {
          flex: 1;
          height: 20px;
          background: #e2e8f0;
          border-radius: 10px;
          overflow: hidden;
        }

        .breakdown-fill {
          height: 100%;
          transition: width 0.3s ease;
        }

        .breakdown-fill.spreadsheets {
          background: linear-gradient(90deg, #3b82f6, #1d4ed8);
        }

        .breakdown-fill.versions {
          background: linear-gradient(90deg, #10b981, #047857);
        }

        .breakdown-value {
          width: 80px;
          text-align: right;
          font-size: 0.875rem;
          font-weight: 600;
          color: #1e293b;
        }

        .compression-summary, .cache-policies {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
        }

        .compression-summary h3, .cache-policies h3 {
          margin: 0 0 16px 0;
          font-size: 1rem;
          font-weight: 600;
          color: #1e293b;
        }

        .compression-stats, .policy-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .compression-stat, .policy-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid #e2e8f0;
        }

        .compression-stat label, .policy-item label {
          font-size: 0.875rem;
          color: #64748b;
        }

        .compression-stat span, .policy-item span {
          font-weight: 600;
          color: #1e293b;
        }

        .dashboard-footer {
          padding: 16px 24px;
          border-top: 1px solid #e5e7eb;
          background: #f9fafb;
          border-radius: 0 0 12px 12px;
        }

        .last-updated {
          font-size: 0.75rem;
          color: #6b7280;
          text-align: center;
        }

        @media (max-width: 768px) {
          .dashboard-modal {
            width: 95%;
            height: 95%;
          }

          .header-controls {
            flex-direction: column;
            gap: 8px;
          }

          .metrics-grid {
            grid-template-columns: 1fr;
          }

          .breakdown-item {
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
          }

          .breakdown-label, .breakdown-value {
            width: auto;
            text-align: left;
          }
        }
      `}</style>
    </div>
  );
};

export default StorageAnalyticsDashboard;