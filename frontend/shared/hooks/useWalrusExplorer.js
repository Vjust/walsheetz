/**
 * useWalrusExplorer Hook
 * Domain hook for Walrus blob exploration and management
 */
import { useState, useEffect, useCallback } from 'react';
import { suiGraphQLService } from '../../../blockchain/sui-graphql-service.js';
import { browserWalrusService } from '@services/blockchain/walrus/BrowserWalrusService.js';
import { logger, LogComponent } from '@utils/logging/Logger.js';

/**
 * Hook for exploring Walrus blobs with GraphQL and PoA status
 * @param {Object} options - Hook options
 * @param {string} options.owner - Filter by owner address
 * @param {boolean} options.autoLoad - Auto-load on mount
 * @returns {Object} Explorer state and methods
 */
export function useWalrusExplorer(options = {}) {
  const { owner = null, autoLoad = true } = options;

  const [blobs, setBlobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    certified: 0,
    uncertified: 0,
    pending: 0
  });

  /**
   * Load blobs from GraphQL with PoA status
   */
  const loadBlobs = useCallback(async (reset = false) => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      logger.debug(LogComponent.UI, 'explorer_load_blobs', 'Loading blobs', {
        reset,
        owner,
        cursor
      });

      const currentCursor = reset ? null : cursor;
      const result = owner
        ? await suiGraphQLService.getBlobsByOwner(owner, {
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
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
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

      // Fetch PoA status for each blob
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
            logger.warn(LogComponent.UI, 'explorer_poa_error', 'Failed to fetch PoA', {
              blobId: blob.blobId,
              error: error.message
            });
            return { ...blob, poaStatus: 'unknown', certificate: null };
          }
        })
      );

      // Update stats
      const newStats = blobsWithPoA.reduce(
        (acc, blob) => {
          acc.total++;
          if (blob.poaStatus === 'certified') acc.certified++;
          else if (blob.poaStatus === 'uncertified') acc.uncertified++;
          else if (blob.poaStatus === 'pending') acc.pending++;
          return acc;
        },
        { total: 0, certified: 0, uncertified: 0, pending: 0 }
      );

      setBlobs(reset ? blobsWithPoA : [...blobs, ...blobsWithPoA]);
      setHasMore(pageInfo.hasNextPage);
      setCursor(pageInfo.endCursor);
      setStats(reset ? newStats : {
        total: stats.total + newStats.total,
        certified: stats.certified + newStats.certified,
        uncertified: stats.uncertified + newStats.uncertified,
        pending: stats.pending + newStats.pending
      });

      logger.info(LogComponent.UI, 'explorer_load_success', 'Blobs loaded', {
        count: blobsWithPoA.length,
        hasMore: pageInfo.hasNextPage
      });
    } catch (error) {
      logger.error(LogComponent.UI, 'explorer_load_error', 'Failed to load blobs', {
        error: error.message
      });
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [owner, cursor, loading, blobs, stats]);

  /**
   * Load more blobs (infinite scroll)
   */
  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      loadBlobs(false);
    }
  }, [loading, hasMore, loadBlobs]);

  /**
   * Refresh blob list
   */
  const refresh = useCallback(() => {
    setBlobs([]);
    setCursor(null);
    setStats({ total: 0, certified: 0, uncertified: 0, pending: 0 });
    loadBlobs(true);
  }, [loadBlobs]);

  /**
   * Get blob metadata
   */
  const getBlobMetadata = useCallback(async (blobId) => {
    try {
      logger.debug(LogComponent.UI, 'explorer_get_metadata', 'Getting blob metadata', {
        blobId
      });

      const result = await browserWalrusService.getBlobMetadata(blobId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to get blob metadata');
      }

      return result;
    } catch (error) {
      logger.error(LogComponent.UI, 'explorer_metadata_error', 'Failed to get metadata', {
        blobId,
        error: error.message
      });
      throw error;
    }
  }, []);

  /**
   * Download blob content
   */
  const downloadBlob = useCallback(async (blobId) => {
    try {
      logger.debug(LogComponent.UI, 'explorer_download', 'Downloading blob', { blobId });

      const result = await browserWalrusService.retrieveBlob(blobId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to download blob');
      }

      return result.data;
    } catch (error) {
      logger.error(LogComponent.UI, 'explorer_download_error', 'Failed to download blob', {
        blobId,
        error: error.message
      });
      throw error;
    }
  }, []);

  // Auto-load on mount
  useEffect(() => {
    if (autoLoad && blobs.length === 0) {
      loadBlobs(true);
    }
  }, [autoLoad]);

  return {
    // State
    blobs,
    loading,
    error,
    hasMore,
    stats,

    // Methods
    loadBlobs,
    loadMore,
    refresh,
    getBlobMetadata,
    downloadBlob
  };
}

export default useWalrusExplorer;
