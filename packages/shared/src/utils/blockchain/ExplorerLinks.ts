/**
 * Explorer Links Utility
 * Provides helpers for generating links to Walrus and Sui explorers
 */

type ExplorerType = 'walrus' | 'suiExplorer' | 'suivision';

export function getSuiExplorerUrl(digest: string, network = 'testnet'): string | null {
  if (!digest) return null;
  return `https://suiexplorer.com/txblock/${digest}?network=${network}`;
}

export function getSuivisionUrl(digest: string, network = 'testnet'): string | null {
  if (!digest) return null;
  return `https://suivision.xyz/txblock/${digest}?network=${network}`;
}

export function getWalrusExplorerUrl(blobId: string, network = 'testnet'): string | null {
  if (!blobId) return null;

  if (network === 'testnet') {
    return `https://walrus-explorer.testnet.walrus.space/blobs/${blobId}`;
  } else {
    return `https://walrus-explorer.walrus.space/blobs/${blobId}`;
  }
}

export function getAllExplorerLinks(blobId: string, transactionDigest: string, network = 'testnet') {
  return {
    walrus: getWalrusExplorerUrl(blobId, network),
    suiExplorer: getSuiExplorerUrl(transactionDigest, network),
    suivision: getSuivisionUrl(transactionDigest, network)
  };
}

export function getExplorerDisplayName(explorerType: ExplorerType): string {
  const names: Record<ExplorerType, string> = {
    walrus: 'Walrus Explorer',
    suiExplorer: 'Sui Explorer',
    suivision: 'Suivision'
  };
  return names[explorerType] || explorerType;
}

export function getExplorerIcon(explorerType: ExplorerType): string {
  const icons: Record<ExplorerType, string> = {
    walrus: 'W',
    suiExplorer: 'S',
    suivision: 'V'
  };
  return icons[explorerType] || '';
}

export default {
  getSuiExplorerUrl,
  getSuivisionUrl,
  getWalrusExplorerUrl,
  getAllExplorerLinks,
  getExplorerDisplayName,
  getExplorerIcon
};
