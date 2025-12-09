/**
 * Explorer Links Utility
 * Provides helpers for generating links to Walrus and Sui explorers
 */

/**
 * Get Sui Explorer URL for a transaction digest
 * @param {string} digest - Transaction digest
 * @param {string} network - Network name (testnet, mainnet, devnet)
 * @returns {string} Full URL to Sui Explorer
 */
export function getSuiExplorerUrl(digest, network = 'testnet') {
  if (!digest) return null;
  return `https://suiexplorer.com/txblock/${digest}?network=${network}`;
}

/**
 * Get Suivision URL for a transaction digest (alternative Sui explorer)
 * @param {string} digest - Transaction digest
 * @param {string} network - Network name (testnet, mainnet, devnet)
 * @returns {string} Full URL to Suivision
 */
export function getSuivisionUrl(digest, network = 'testnet') {
  if (!digest) return null;
  return `https://suivision.xyz/txblock/${digest}?network=${network}`;
}

/**
 * Get Walrus Explorer URL for a blob
 * @param {string} blobId - Blob ID
 * @param {string} network - Network name (testnet, mainnet)
 * @returns {string} Full URL to Walrus Explorer
 */
export function getWalrusExplorerUrl(blobId, network = 'testnet') {
  if (!blobId) return null;

  // Walrus testnet explorer uses specific subdomain pattern
  if (network === 'testnet') {
    return `https://walrus-explorer.testnet.walrus.space/blobs/${blobId}`;
  } else {
    // For mainnet and other networks
    return `https://walrus-explorer.walrus.space/blobs/${blobId}`;
  }
}

/**
 * Get all available explorer links for a blob and transaction
 * @param {string} blobId - Walrus blob ID
 * @param {string} transactionDigest - Sui transaction digest
 * @param {string} network - Network name (testnet, mainnet, devnet)
 * @returns {Object} Object with all available explorer links
 */
export function getAllExplorerLinks(blobId, transactionDigest, network = 'testnet') {
  return {
    walrus: getWalrusExplorerUrl(blobId, network),
    suiExplorer: getSuiExplorerUrl(transactionDigest, network),
    suivision: getSuivisionUrl(transactionDigest, network)
  };
}

/**
 * Get explorer name for a given explorer type
 * @param {string} explorerType - Type of explorer (walrus, suiExplorer, suivision)
 * @returns {string} Display name for the explorer
 */
export function getExplorerDisplayName(explorerType) {
  const names = {
    walrus: 'Walrus Explorer',
    suiExplorer: 'Sui Explorer',
    suivision: 'Suivision'
  };
  return names[explorerType] || explorerType;
}

/**
 * Get explorer icon/emoji for a given explorer type
 * @param {string} explorerType - Type of explorer (walrus, suiExplorer, suivision)
 * @returns {string} Icon or emoji for the explorer
 */
export function getExplorerIcon(explorerType) {
  const icons = {
    walrus: '🦭',
    suiExplorer: '🔗',
    suivision: '🔍'
  };
  return icons[explorerType] || '🌐';
}

export default {
  getSuiExplorerUrl,
  getSuivisionUrl,
  getWalrusExplorerUrl,
  getAllExplorerLinks,
  getExplorerDisplayName,
  getExplorerIcon
};
