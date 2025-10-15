/**
 * BlobCatalog Page
 * Browse Walrus blobs with infinite scroll, filters, and PoA status
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { suiGraphQLService } from '../../../blockchain/sui-graphql-service.js';
import { browserWalrusService } from '../../services/BrowserWalrusService.js';
import { IPoAStatus } from '../../interfaces/graphql/IPoAStatus.js';
import { logger, LogComponent } from '../../utils/Logger.js';
import '../styles/BlobCatalog.css';

export function BlobCatalog() {
  const [blobs, setBlobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState(null);
  const [filter, setFilter] = useState({
    owner: '',
    poaStatus: 'all', // all, certified, uncertified
    sortBy: 'createdAt', // createdAt, size, blobId
    sortOrder: 'desc' // asc, desc
  });
  const [error, setError] = useState(null);
  const observerRef = useRef(null);
  const lastBlobRef = useCallback((node) => {
    if (loading) return;
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore) {
        loadMore();
      }
    });

    if (node) observerRef.current.observe(node);
  }, [loading, hasMore]);

  // Load initial blobs
  useEffect(() => {
    loadBlobs(true);
  }, [filter]);

  /**
   * Load blobs from GraphQL
   * @param {boolean} reset - Reset the list
   */
  const loadBlobs = async (reset = false) => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      logger.debug(LogComponent.UI, 'blob_catalog_load', 'Loading blobs', {
        reset,
        cursor,
        filter
      });

      const currentCursor = reset ? null : cursor;
      const result = filter.owner
        ? await suiGraphQLService.getBlobsByOwner(filter.owner, {
            first: 20,
            after: currentCursor
          })
        : await suiGraphQLService.executeQuery(
            `query ListBlobs($first: Int, $after: String) {
              blobs(first: $first, after: $after) {
                nodes {
                  blobId
                  objectId
                  owner
                  size
                  contentType
                  createdAt
                  updatedAt
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
                totalCount
              }
            }`,
            { first: 20, after: currentCursor }
          );

      // IGraphQLResponse structure: result.items, result.pageInfo, result.error
      if (result.error) {
        throw new Error(result.error.message || 'Failed to load blobs');
      }

      const newBlobs = result.items || [];
      const pageInfo = result.pageInfo || { hasNextPage: false, endCursor: null };

      // Fetch PoA status for each blob in parallel
      const blobsWithPoA = await Promise.all(
        newBlobs.map(async (blob) => {
          try {
            const poaResult = await browserWalrusService.getPoACertificate(blob.blobId);
            return {
              ...blob,
              poaStatus: poaResult.success ? poaResult.poaStatus : 'unknown',
              certificate: poaResult.certificate || null
            };
          } catch (error) {
            logger.warn(LogComponent.UI, 'blob_poa_fetch_error', 'Failed to fetch PoA', {
              blobId: blob.blobId,
              error: error.message
            });
            return { ...blob, poaStatus: 'unknown', certificate: null };
          }
        })
      );

      // Apply filters
      let filteredBlobs = blobsWithPoA;
      if (filter.poaStatus !== 'all') {
        filteredBlobs = filteredBlobs.filter(b => b.poaStatus === filter.poaStatus);
      }

      // Apply sorting
      filteredBlobs.sort((a, b) => {
        let comparison = 0;
        switch (filter.sortBy) {
          case 'size':
            comparison = a.size - b.size;
            break;
          case 'blobId':
            comparison = a.blobId.localeCompare(b.blobId);
            break;
          case 'createdAt':
          default:
            comparison = new Date(a.createdAt) - new Date(b.createdAt);
            break;
        }
        return filter.sortOrder === 'asc' ? comparison : -comparison;
      });

      setBlobs(reset ? filteredBlobs : [...blobs, ...filteredBlobs]);
      setHasMore(pageInfo.hasNextPage);
      setCursor(pageInfo.endCursor);

      logger.info(LogComponent.UI, 'blob_catalog_loaded', 'Blobs loaded successfully', {
        count: filteredBlobs.length,
        hasMore: pageInfo.hasNextPage
      });
    } catch (error) {
      logger.error(LogComponent.UI, 'blob_catalog_error', 'Failed to load blobs', {
        error: error.message
      });
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Load more blobs (infinite scroll)
   */
  const loadMore = () => {
    if (!loading && hasMore) {
      loadBlobs(false);
    }
  };

  /**
   * Handle filter changes
   */
  const handleFilterChange = (key, value) => {
    setFilter({ ...filter, [key]: value });
  };

  /**
   * Format blob size
   */
  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  /**
   * Get PoA status badge color
   */
  const getPoAStatusColor = (status) => {
    const poaStatus = new IPoAStatus({ status });
    return poaStatus.getStatusColor();
  };

  /**
   * Handle blob click - navigate to spreadsheet workspace
   */
  const handleBlobClick = (blob) => {
    // Navigate to spreadsheet workspace with blob
    const url = `/workspace?blobId=${blob.blobId}`;
    window.location.href = url;
  };

  return (
    <div className="blob-catalog">
      <div className="blob-catalog-header">
        <h1>Walrus Blob Catalog</h1>
        <p>Browse and explore Walrus blobs with PoA certificates</p>
      </div>

      {/* Filters */}
      <div className="blob-catalog-filters">
        <div className="filter-group">
          <label htmlFor="owner-filter">Owner Address</label>
          <input
            id="owner-filter"
            type="text"
            placeholder="0x..."
            value={filter.owner}
            onChange={(e) => handleFilterChange('owner', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="poa-filter">PoA Status</label>
          <select
            id="poa-filter"
            value={filter.poaStatus}
            onChange={(e) => handleFilterChange('poaStatus', e.target.value)}
          >
            <option value="all">All</option>
            <option value="certified">Certified</option>
            <option value="uncertified">Uncertified</option>
            <option value="pending">Pending</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="sort-filter">Sort By</label>
          <select
            id="sort-filter"
            value={filter.sortBy}
            onChange={(e) => handleFilterChange('sortBy', e.target.value)}
          >
            <option value="createdAt">Created Date</option>
            <option value="size">Size</option>
            <option value="blobId">Blob ID</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="order-filter">Order</label>
          <select
            id="order-filter"
            value={filter.sortOrder}
            onChange={(e) => handleFilterChange('sortOrder', e.target.value)}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="blob-catalog-error">
          <p>Error loading blobs: {error}</p>
          <button onClick={() => loadBlobs(true)}>Retry</button>
        </div>
      )}

      {/* Blob List */}
      <div className="blob-catalog-list">
        {blobs.map((blob, index) => {
          const isLast = index === blobs.length - 1;
          return (
            <div
              key={blob.blobId}
              ref={isLast ? lastBlobRef : null}
              className="blob-card"
              onClick={() => handleBlobClick(blob)}
            >
              <div className="blob-card-header">
                <h3 className="blob-id">{blob.blobId.substring(0, 16)}...</h3>
                <span className={`poa-badge poa-${getPoAStatusColor(blob.poaStatus)}`}>
                  {blob.poaStatus}
                </span>
              </div>

              <div className="blob-card-body">
                <div className="blob-info-row">
                  <span className="label">Owner:</span>
                  <span className="value">{blob.owner?.substring(0, 16)}...</span>
                </div>

                <div className="blob-info-row">
                  <span className="label">Size:</span>
                  <span className="value">{formatSize(blob.size)}</span>
                </div>

                <div className="blob-info-row">
                  <span className="label">Type:</span>
                  <span className="value">{blob.contentType || 'Unknown'}</span>
                </div>

                {blob.createdAt && (
                  <div className="blob-info-row">
                    <span className="label">Created:</span>
                    <span className="value">
                      {new Date(blob.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="blob-card-footer">
                <button className="blob-action-btn" onClick={(e) => {
                  e.stopPropagation();
                  handleBlobClick(blob);
                }}>
                  Open in Workspace
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Loading indicator */}
      {loading && (
        <div className="blob-catalog-loading">
          <div className="spinner"></div>
          <p>Loading blobs...</p>
        </div>
      )}

      {/* End of list */}
      {!loading && !hasMore && blobs.length > 0 && (
        <div className="blob-catalog-end">
          <p>No more blobs to load</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && blobs.length === 0 && (
        <div className="blob-catalog-empty">
          <p>No blobs found</p>
          <p className="empty-hint">Try adjusting your filters</p>
        </div>
      )}
    </div>
  );
}

export default BlobCatalog;
