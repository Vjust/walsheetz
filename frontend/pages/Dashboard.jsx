import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSpreadsheetContext } from '../presentation/components/SpreadsheetProvider.jsx';
import { DocumentCard } from '../components/DocumentCard.jsx';
import { SearchBar } from '../components/SearchBar.jsx';
import { CreateDocumentModal } from '../components/CreateDocumentModal.jsx';
import { LoadingOverlay } from '../presentation/components/LoadingOverlay.jsx';
import { logger, LogComponent } from '../utils/Logger.js';
import UnicornStudioHero from '../presentation/components/UnicornStudioHero.jsx';
import BlizzardParticles from '../components/effects/BlizzardParticles.jsx';
import './styles/dashboard.css';

export function Dashboard() {
  const navigate = useNavigate();
  const [spreadsheets, setSpreadsheets] = useState([]);
  const [filteredSpreadsheets, setFilteredSpreadsheets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('lastModified'); // 'lastModified', 'title', 'created'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc' or 'desc'
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [recentSpreadsheets, setRecentSpreadsheets] = useState([]);
  const [connectingWallet, setConnectingWallet] = useState(false);
  const [disconnectingWallet, setDisconnectingWallet] = useState(false);

  const {
    walletConnected,
    walletAutoConnecting,
    walletAddress,
    connectWallet,
    disconnectWallet,
    getUserSpreadsheets,
    createNewSpreadsheet,
    renameSpreadsheet,
    makeSpreadsheetPublic,
    makeSpreadsheetPrivate,
    transferOwnership,
    pruneOldVersions,
    deleteSpreadsheet
  } = useSpreadsheetContext();

  // Load spreadsheets when component mounts or wallet connects
  useEffect(() => {
    // Only load spreadsheets when wallet is fully connected and auto-connect is complete
    if (walletConnected && !walletAutoConnecting) {
      logger.info(LogComponent.UI_COMPONENT, 'dashboard_load_trigger', 'Loading spreadsheets after wallet connection');
      loadSpreadsheets();
    } else if (!walletConnected && !walletAutoConnecting) {
      // Clear spreadsheets only when definitively not connected (not during auto-connect)
      setSpreadsheets([]);
      setFilteredSpreadsheets([]);
    }
  }, [walletConnected, walletAutoConnecting]);

  // Update recent spreadsheets when spreadsheets change
  useEffect(() => {
    const recent = [...spreadsheets]
      .filter(sheet => sheet.last_modified)
      .sort((a, b) => new Date(b.last_modified) - new Date(a.last_modified))
      .slice(0, 5);
    setRecentSpreadsheets(recent);
  }, [spreadsheets]);

  // Filter and sort spreadsheets when search or sort changes
  useEffect(() => {
    let filtered = [...spreadsheets];

    // Apply search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter(sheet =>
        sheet.title && sheet.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let valueA, valueB;

      switch (sortBy) {
        case 'title':
          valueA = (a.title || '').toLowerCase();
          valueB = (b.title || '').toLowerCase();
          break;
        case 'created':
          valueA = new Date(a.created_at || 0);
          valueB = new Date(b.created_at || 0);
          break;
        case 'lastModified':
        default:
          valueA = new Date(a.last_modified || 0);
          valueB = new Date(b.last_modified || 0);
          break;
      }

      if (sortOrder === 'asc') {
        return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
      } else {
        return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
      }
    });

    setFilteredSpreadsheets(filtered);

  }, [spreadsheets, searchQuery, sortBy, sortOrder]);

  const loadSpreadsheets = async () => {
    if (!getUserSpreadsheets) return;

    setLoading(true);
    setError(null);

    try {
      logger.info(LogComponent.UI_COMPONENT, 'dashboard_load_start', 'Loading spreadsheets for dashboard');

      const result = await getUserSpreadsheets();

      if (result.success) {
        setSpreadsheets(result.spreadsheets);
        logger.info(LogComponent.UI_COMPONENT, 'dashboard_load_success', 'Spreadsheets loaded successfully', {
          count: result.spreadsheets.length
        });
      } else {
        setError(result.error || 'Failed to load spreadsheets');
        logger.error(LogComponent.UI_COMPONENT, 'dashboard_load_error', 'Failed to load spreadsheets', {
          error: result.error
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to load spreadsheets');
      logger.error(LogComponent.UI_COMPONENT, 'dashboard_load_exception', 'Exception loading spreadsheets', {
        error: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSpreadsheet = (spreadsheetId) => {
    logger.logUserAction('dashboard_open_spreadsheet', { spreadsheetId });
    navigate(`/spreadsheet/${spreadsheetId}`);
  };

  const handleCreateNew = async (title) => {
    if (!createNewSpreadsheet) return;

    try {
      setShowCreateModal(false);
      logger.logUserAction('dashboard_create_new', { title });

      const result = await createNewSpreadsheet(title);

      if (result.success) {
        logger.info(LogComponent.UI_COMPONENT, 'dashboard_create_success', 'New spreadsheet created', {
          spreadsheetId: result.spreadsheetId,
          title
        });

        // Navigate to the new spreadsheet
        navigate(`/spreadsheet/${result.spreadsheetId}`);
      } else {
        setError(`Failed to create spreadsheet: ${result.error}`);
        logger.error(LogComponent.UI_COMPONENT, 'dashboard_create_error', 'Failed to create spreadsheet', {
          error: result.error
        });
      }
    } catch (error) {
      setError(`Error creating spreadsheet: ${error.message}`);
      logger.error(LogComponent.UI_COMPONENT, 'dashboard_create_exception', 'Exception creating spreadsheet', {
        error: error.message
      });
    }
  };

  const handleRename = async (spreadsheetId, newTitle) => {
    if (!renameSpreadsheet) return;

    const result = await renameSpreadsheet(spreadsheetId, newTitle);
    if (result.success) {
      loadSpreadsheets(); // Refresh list
    } else {
      setError(`Failed to rename: ${result.error}`);
    }
    return result;
  };

  const handleMakePublic = async (spreadsheetId) => {
    if (!makeSpreadsheetPublic) return;

    const result = await makeSpreadsheetPublic(spreadsheetId);
    if (result.success) {
      loadSpreadsheets(); // Refresh list
    } else {
      setError(`Failed to make public: ${result.error}`);
    }
    return result;
  };

  const handleMakePrivate = async (spreadsheetId) => {
    if (!makeSpreadsheetPrivate) return;

    const result = await makeSpreadsheetPrivate(spreadsheetId);
    if (result.success) {
      loadSpreadsheets(); // Refresh list
    } else {
      setError(`Failed to make private: ${result.error}`);
    }
    return result;
  };

  const handleTransfer = async (spreadsheetId, newOwnerAddress) => {
    if (!transferOwnership) return;

    const result = await transferOwnership(spreadsheetId, newOwnerAddress);
    if (result.success) {
      loadSpreadsheets(); // Refresh list
    } else {
      setError(`Failed to transfer: ${result.error}`);
    }
    return result;
  };

  const handlePrune = async (spreadsheetId) => {
    if (!pruneOldVersions) return;

    const result = await pruneOldVersions(spreadsheetId);
    if (result.success) {
      loadSpreadsheets(); // Refresh list
    } else {
      setError(`Failed to prune versions: ${result.error}`);
    }
    return result;
  };

  const handleDelete = async (spreadsheetId, title) => {
    if (!deleteSpreadsheet) return;

    const result = await deleteSpreadsheet(spreadsheetId, title);
    if (result.success) {
      loadSpreadsheets(); // Refresh list
    } else {
      setError(`Failed to delete: ${result.error}`);
    }
    return result;
  };

  const handleConnectWallet = async () => {
    try {
      setConnectingWallet(true);
      setError(null);
      logger.logUserAction('dashboard_wallet_connect_attempt');

      const result = await connectWallet();

      if (result.success) {
        logger.info(LogComponent.UI_COMPONENT, 'dashboard_wallet_connect_success', 'Wallet connected from dashboard', {
          walletAddress: result.wallet?.address
        });
        // Error will be cleared automatically since walletConnected will become true
      } else {
        setError(`Failed to connect wallet: ${result.error}`);
        logger.error(LogComponent.UI_COMPONENT, 'dashboard_wallet_connect_error', 'Failed to connect wallet from dashboard', {
          error: result.error
        });
      }
    } catch (error) {
      setError(`Error connecting wallet: ${error.message}`);
      logger.error(LogComponent.UI_COMPONENT, 'dashboard_wallet_connect_exception', 'Exception connecting wallet from dashboard', {
        error: error.message
      });
    } finally {
      setConnectingWallet(false);
    }
  };

  const handleDisconnectWallet = async () => {
    if (!disconnectWallet) return;

    try {
      setDisconnectingWallet(true);
      setError(null);
      logger.logUserAction('dashboard_wallet_disconnect_attempt');
      await disconnectWallet();
      logger.info(LogComponent.UI_COMPONENT, 'dashboard_wallet_disconnect_success', 'Wallet disconnected from dashboard');
    } catch (error) {
      setError(`Failed to disconnect wallet: ${error.message || error}`);
      logger.error(LogComponent.UI_COMPONENT, 'dashboard_wallet_disconnect_error', 'Failed to disconnect wallet from dashboard', {
        error: error?.message || error
      });
    } finally {
      setDisconnectingWallet(false);
    }
  };

  const formatWalletAddress = (address) => {
    if (!address || address.length < 10) {
      return address || '';
    }
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Show loading state during auto-connect
  if (walletAutoConnecting) {
    return (
      <div className="dashboard-loading-screen">
        <div className="dashboard-loading-content">
          <div className="logo-icon ice-glow-animate" style={{ fontSize: '64px', marginBottom: '24px' }}>
            <span>🦭</span>
          </div>
          <h2 style={{ color: '#B3E5FC', marginBottom: '16px' }}>Connecting wallet...</h2>
          <div className="spinner" style={{ margin: '0 auto' }}></div>
          <p style={{ color: '#999', marginTop: '16px', fontSize: '14px' }}>
            Please wait while we restore your session
          </p>
        </div>
      </div>
    );
  }

  // Show welcome screen if wallet is not connected (and auto-connect has completed)
  if (!walletConnected) {
    return (
      <UnicornStudioHero
        onConnectWallet={handleConnectWallet}
        connectingWallet={connectingWallet}
        error={error}
      />
    );
  }

  return (
    <div className="dashboard">
      {/* Blizzard particles background */}
      <BlizzardParticles quantity={150} color="#B3E5FC" className="dashboard-blizzard" />

      <div className="dashboard-header">
        <div className="brand-section">
          <div className="logo-icon ice-glow-animate">
            <span>🦭</span>
          </div>
          <h1>WalSheetz</h1>
        </div>

        <div className="header-actions">
          <button
            className={`wallet-button ${walletConnected ? 'connected' : 'primary'} ${disconnectingWallet ? 'loading' : ''}`}
            onClick={walletConnected ? handleDisconnectWallet : handleConnectWallet}
            disabled={connectingWallet || disconnectingWallet}
          >
            {walletConnected ? (
              disconnectingWallet ? 'Disconnecting...' : `👛 ${formatWalletAddress(walletAddress)}`
            ) : (
              connectingWallet ? '⏳ Connecting...' : '🦭 Connect Wallet'
            )}
          </button>
          <button
            className="create-button primary"
            onClick={() => setShowCreateModal(true)}
          >
            <span>➕</span>
            Create New
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        {/* Recent Documents Section */}
        {recentSpreadsheets.length > 0 && (
          <section className="recent-section">
            <h2>Recent</h2>
            <div className="recent-grid">
              {recentSpreadsheets.map((sheet) => (
                <DocumentCard
                  key={`recent-${sheet.objectId}`}
                  spreadsheet={sheet}
                  compact={true}
                  onOpen={handleOpenSpreadsheet}
                  onRename={handleRename}
                  onMakePublic={handleMakePublic}
                  onMakePrivate={handleMakePrivate}
                  onTransfer={handleTransfer}
                  onPrune={handlePrune}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </section>
        )}

        {/* All Documents Section */}
        <section className="documents-section">
          <div className="section-header">
            <h2>My Spreadsheets</h2>
            <div className="section-controls">
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search spreadsheets..."
              />

              <div className="sort-controls">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="sort-select"
                >
                  <option value="lastModified">Last Modified</option>
                  <option value="title">Title</option>
                  <option value="created">Created</option>
                </select>

                <button
                  className={`sort-order-btn ${sortOrder}`}
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                >
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </button>
              </div>

              <div className="view-controls">
                <button
                  className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => setViewMode('grid')}
                  title="Grid View"
                >
                  ⊞
                </button>
                <button
                  className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => setViewMode('list')}
                  title="List View"
                >
                  ☰
                </button>
              </div>

              <button
                className="refresh-btn"
                onClick={loadSpreadsheets}
                title="Refresh"
              >
                🔄
              </button>
            </div>
          </div>

          {loading && (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading your spreadsheets...</p>
            </div>
          )}

          {error && (
            <div className="error-state">
              <p>❌ {error}</p>
              <button onClick={loadSpreadsheets} className="retry-button">
                🔄 Retry
              </button>
            </div>
          )}

          {!loading && !error && filteredSpreadsheets.length === 0 && (
            <div className="empty-state">
              {searchQuery ? (
                <>
                  <p>📄 No spreadsheets match your search</p>
                  <p className="empty-subtitle">Try adjusting your search terms</p>
                </>
              ) : (
                <>
                  <p>📄 No spreadsheets found</p>
                  <p className="empty-subtitle">Create your first spreadsheet to get started!</p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="create-new-button"
                  >
                    ➕ Create New Spreadsheet
                  </button>
                </>
              )}
            </div>
          )}

          {!loading && !error && filteredSpreadsheets.length > 0 && (
            <div className={`documents-grid ${viewMode}`}>
              {filteredSpreadsheets.map((sheet) => (
                <DocumentCard
                  key={sheet.objectId}
                  spreadsheet={sheet}
                  compact={viewMode === 'list'}
                  onOpen={handleOpenSpreadsheet}
                  onRename={handleRename}
                  onMakePublic={handleMakePublic}
                  onMakePrivate={handleMakePrivate}
                  onTransfer={handleTransfer}
                  onPrune={handlePrune}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Create Document Modal */}
      <CreateDocumentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateNew}
      />

      {/* Loading Overlay for operations */}
      <LoadingOverlay
        isVisible={loading}
        message="Loading spreadsheets..."
        type="storage"
      />
    </div>
  );
}
