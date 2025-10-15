/**
 * WalrusSiteViewer Component
 * Display Walrus Site information and assets
 */
import React, { useState, useEffect } from 'react';
import { suiGraphQLService } from '../../../blockchain/sui-graphql-service.js';
import { browserWalrusService } from '../../services/BrowserWalrusService.js';
import { logger, LogComponent } from '../../utils/Logger.js';
import '../styles/WalrusSiteViewer.css';

export function WalrusSiteViewer({ siteId, onBlobClick }) {
  const [siteInfo, setSiteInfo] = useState(null);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);

  useEffect(() => {
    if (siteId) {
      loadSiteInfo();
    }
  }, [siteId]);

  const loadSiteInfo = async () => {
    setLoading(true);
    setError(null);

    try {
      logger.debug(LogComponent.UI, 'site_info_load', 'Loading Walrus site info', {
        siteId
      });

      const result = await suiGraphQLService.getWalrusSiteAssets(siteId);

      if (result.error) {
        throw new Error(result.error.message || 'Failed to load site info');
      }

      // IGraphQLResponse structure: assets in result.items, site info in result.metadata.site
      const siteData = result.metadata?.site || { siteId };
      setSiteInfo(siteData);

      // Assets are directly in result.items (already includes blobId, size, contentType, path)
      const siteAssets = result.items || [];

      // Fetch PoA status for each asset
      const assetsWithPoA = await Promise.all(
        siteAssets.map(async (asset) => {
          // Skip PoA fetch if blobId is missing
          if (!asset.blobId) {
            logger.warn(LogComponent.UI, 'site_asset_missing_blob_id', 'Asset missing blobId', {
              path: asset.path
            });
            return { ...asset, poaStatus: 'unknown' };
          }

          try {
            const poaResult = await browserWalrusService.getPoACertificate(asset.blobId);
            return {
              ...asset,
              poaStatus: poaResult.success ? poaResult.poaStatus : 'unknown'
            };
          } catch (error) {
            logger.warn(LogComponent.UI, 'site_asset_poa_error', 'Failed to fetch PoA', {
              blobId: asset.blobId,
              error: error.message
            });
            return { ...asset, poaStatus: 'unknown' };
          }
        })
      );

      setAssets(assetsWithPoA);

      logger.info(LogComponent.UI, 'site_info_loaded', 'Walrus site info loaded', {
        assetCount: assetsWithPoA.length
      });
    } catch (error) {
      logger.error(LogComponent.UI, 'site_info_error', 'Failed to load site info', {
        error: error.message
      });
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getPoAStatusColor = (status) => {
    switch (status) {
      case 'certified':
        return 'success';
      case 'pending':
        return 'info';
      case 'expired':
      case 'invalid':
        return 'error';
      default:
        return 'neutral';
    }
  };

  if (loading) {
    return (
      <div className="walrus-site-viewer loading">
        <div className="spinner"></div>
        <p>Loading site...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="walrus-site-viewer error">
        <p>Error loading site: {error}</p>
        <button onClick={loadSiteInfo}>Retry</button>
      </div>
    );
  }

  if (!siteInfo) {
    return (
      <div className="walrus-site-viewer empty">
        <p>No site information available</p>
      </div>
    );
  }

  return (
    <div className="walrus-site-viewer">
      {/* Site Header */}
      <div className="site-header">
        <h2>{siteInfo.name || 'Walrus Site'}</h2>
        <p className="site-id">Site ID: {siteId}</p>
        {siteInfo.url && (
          <a href={siteInfo.url} target="_blank" rel="noopener noreferrer" className="site-url">
            {siteInfo.url}
          </a>
        )}
      </div>

      {/* Site Stats */}
      <div className="site-stats">
        <div className="stat">
          <span className="stat-label">Assets</span>
          <span className="stat-value">{assets.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Total Size</span>
          <span className="stat-value">
            {formatSize(assets.reduce((sum, a) => sum + (a.size || 0), 0))}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Certified</span>
          <span className="stat-value">
            {assets.filter(a => a.poaStatus === 'certified').length}
          </span>
        </div>
      </div>

      {/* Asset List */}
      <div className="site-assets">
        <h3>Site Assets</h3>

        {assets.length === 0 ? (
          <div className="empty-state">
            <p>No assets found</p>
          </div>
        ) : (
          <div className="asset-grid">
            {assets.map(asset => (
              <div
                key={asset.blobId}
                className={`asset-card ${selectedAsset === asset.blobId ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedAsset(asset.blobId);
                  onBlobClick?.(asset);
                }}
              >
                <div className="asset-card-header">
                  <span className="asset-path">{asset.path || 'index.html'}</span>
                  <span className={`poa-badge poa-${getPoAStatusColor(asset.poaStatus)}`}>
                    {asset.poaStatus}
                  </span>
                </div>

                <div className="asset-card-body">
                  <div className="asset-info">
                    <span className="label">Blob ID:</span>
                    <code className="value">{asset.blobId?.substring(0, 20)}...</code>
                  </div>

                  <div className="asset-info">
                    <span className="label">Size:</span>
                    <span className="value">{formatSize(asset.size)}</span>
                  </div>

                  {asset.contentType && (
                    <div className="asset-info">
                      <span className="label">Type:</span>
                      <span className="value">{asset.contentType}</span>
                    </div>
                  )}
                </div>

                <div className="asset-card-footer">
                  <button
                    className="view-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onBlobClick?.(asset);
                    }}
                  >
                    View Blob
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default WalrusSiteViewer;
