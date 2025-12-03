import React, { useState, useEffect } from 'react';
import { logger, LogComponent } from '../../../packages/shared/src/utils/Logger.js';

export function LogViewer() {
  const [isVisible, setIsVisible] = useState(false);
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState({
    component: '',
    level: '',
    action: '',
    since: ''
  });
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    const updateLogs = () => {
      const exportedData = logger.exportLogs(filter);
      setLogs(exportedData.logs);
      setMetrics(exportedData.metrics);
    };

    updateLogs();
    
    // Update logs every 2 seconds when viewer is visible
    let interval;
    if (isVisible) {
      interval = setInterval(updateLogs, 2000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isVisible, filter]);

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
    if (!isVisible) {
      logger.logUserAction('log_viewer_opened');
    } else {
      logger.logUserAction('log_viewer_closed');
    }
  };

  const clearLogs = () => {
    logger.clearLogs();
    logger.logUserAction('logs_cleared');
    setLogs([]);
    setMetrics(null);
  };

  const exportLogs = () => {
    const exportData = logger.exportLogs(filter);
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `walsheetz-logs-${new Date().toISOString().slice(0, 19)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    logger.logUserAction('logs_exported', {
      logCount: exportData.logs.length,
      filter
    });
  };

  const toggleDebugMode = () => {
    const newDebugMode = !logger.debugMode;
    logger.setDebugMode(newDebugMode);
    logger.logUserAction('debug_mode_toggle', {
      debugMode: newDebugMode
    });
  };

  const getLevelColor = (level) => {
    switch (level) {
      case 'DEBUG': return '#6c757d';
      case 'INFO': return '#007bff';
      case 'WARN': return '#ffc107';
      case 'ERROR': return '#dc3545';
      case 'CRITICAL': return '#6f42c1';
      default: return '#000';
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  if (!isVisible) {
    return (
      <div className="log-viewer-toggle">
        <button
          onClick={toggleVisibility}
          className="debug-button"
          title="Open Debug Log Viewer"
        >
          🔍 Debug Logs
        </button>
      </div>
    );
  }

  return (
    <div className="log-viewer">
      <div className="log-viewer-header">
        <h3>🔧 Debug Log Viewer</h3>
        <div className="log-viewer-controls">
          <button onClick={toggleDebugMode} className={`debug-mode-btn ${logger.debugMode ? 'active' : ''}`}>
            Debug Mode: {logger.debugMode ? 'ON' : 'OFF'}
          </button>
          <button onClick={clearLogs} className="clear-btn">
            Clear Logs
          </button>
          <button onClick={exportLogs} className="export-btn">
            Export
          </button>
          <button onClick={toggleVisibility} className="close-btn">
            ✕
          </button>
        </div>
      </div>

      <div className="log-viewer-filters">
        <select 
          value={filter.component} 
          onChange={(e) => setFilter({...filter, component: e.target.value})}
          className="filter-select"
        >
          <option value="">All Components</option>
          {Object.values(LogComponent).map(comp => (
            <option key={comp} value={comp}>{comp}</option>
          ))}
        </select>

        <select 
          value={filter.level} 
          onChange={(e) => setFilter({...filter, level: e.target.value})}
          className="filter-select"
        >
          <option value="">All Levels</option>
          <option value="DEBUG">DEBUG</option>
          <option value="INFO">INFO</option>
          <option value="WARN">WARN</option>
          <option value="ERROR">ERROR</option>
          <option value="CRITICAL">CRITICAL</option>
        </select>

        <input
          type="text"
          placeholder="Filter by action..."
          value={filter.action}
          onChange={(e) => setFilter({...filter, action: e.target.value})}
          className="filter-input"
        />
      </div>

      {metrics && (
        <div className="log-viewer-metrics">
          <div className="metric">
            <strong>Session:</strong> {metrics.sessionId?.slice(-8)}
          </div>
          <div className="metric">
            <strong>Total Logs:</strong> {metrics.totalLogs}
          </div>
          <div className="metric">
            <strong>Errors:</strong> {Object.values(metrics.errorCounts).reduce((a, b) => a + b, 0)}
          </div>
          <div className="metric">
            <strong>User Actions:</strong> {Object.values(metrics.userActions).reduce((a, b) => a + b, 0)}
          </div>
        </div>
      )}

      <div className="log-viewer-content">
        {logs.length === 0 ? (
          <div className="no-logs">No logs match the current filter</div>
        ) : (
          logs.slice(-100).map((log, index) => (
            <div key={index} className={`log-entry log-${log.level.toLowerCase()}`}>
              <div className="log-header">
                <span className="log-timestamp">{formatTimestamp(log.timestamp)}</span>
                <span 
                  className="log-level" 
                  style={{color: getLevelColor(log.level)}}
                >
                  {log.level}
                </span>
                <span className="log-component">{log.component}</span>
                <span className="log-action">{log.action}</span>
              </div>
              <div className="log-message">{log.message}</div>
              {Object.keys(log.metadata).length > 3 && (
                <details className="log-metadata">
                  <summary>Metadata</summary>
                  <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
                </details>
              )}
            </div>
          ))
        )}
      </div>

      <style jsx>{`
        .log-viewer {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 600px;
          height: 500px;
          background: rgba(0, 0, 0, 0.9);
          color: white;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          z-index: 10000;
          font-family: 'Monaco', 'Consolas', monospace;
          font-size: 12px;
        }

        .log-viewer-toggle {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 9999;
        }

        .debug-button {
          background: #007bff;
          color: white;
          border: none;
          padding: 10px 15px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 12px;
        }

        .debug-button:hover {
          background: #0056b3;
        }

        .log-viewer-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px;
          background: #1a1a1a;
          border-radius: 8px 8px 0 0;
        }

        .log-viewer-header h3 {
          margin: 0;
          font-size: 14px;
        }

        .log-viewer-controls {
          display: flex;
          gap: 5px;
        }

        .log-viewer-controls button {
          background: #333;
          color: white;
          border: none;
          padding: 5px 10px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 11px;
        }

        .debug-mode-btn.active {
          background: #28a745;
        }

        .clear-btn:hover {
          background: #dc3545;
        }

        .export-btn:hover {
          background: #17a2b8;
        }

        .close-btn:hover {
          background: #6c757d;
        }

        .log-viewer-filters {
          display: flex;
          gap: 10px;
          padding: 10px;
          background: #2a2a2a;
        }

        .filter-select, .filter-input {
          background: #333;
          color: white;
          border: 1px solid #555;
          padding: 5px;
          border-radius: 3px;
          font-size: 11px;
        }

        .log-viewer-metrics {
          display: flex;
          gap: 15px;
          padding: 10px;
          background: #1e1e1e;
          font-size: 11px;
        }

        .log-viewer-content {
          flex: 1;
          overflow-y: auto;
          padding: 5px;
        }

        .no-logs {
          text-align: center;
          color: #666;
          padding: 50px;
        }

        .log-entry {
          margin-bottom: 8px;
          padding: 8px;
          background: #2a2a2a;
          border-radius: 4px;
          border-left: 3px solid #555;
        }

        .log-entry.log-info {
          border-left-color: #007bff;
        }

        .log-entry.log-warn {
          border-left-color: #ffc107;
        }

        .log-entry.log-error, .log-entry.log-critical {
          border-left-color: #dc3545;
        }

        .log-header {
          display: flex;
          gap: 10px;
          margin-bottom: 4px;
          font-size: 10px;
        }

        .log-timestamp {
          color: #888;
        }

        .log-level {
          font-weight: bold;
          min-width: 60px;
        }

        .log-component {
          color: #17a2b8;
          min-width: 120px;
        }

        .log-action {
          color: #28a745;
        }

        .log-message {
          color: #fff;
          margin-bottom: 4px;
        }

        .log-metadata {
          font-size: 10px;
        }

        .log-metadata summary {
          color: #ffc107;
          cursor: pointer;
        }

        .log-metadata pre {
          color: #ddd;
          background: #1a1a1a;
          padding: 5px;
          border-radius: 3px;
          overflow: auto;
          max-height: 200px;
        }
      `}</style>
    </div>
  );
}