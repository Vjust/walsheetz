import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import '../styles/spreadsheet-selector.css';

export function SpreadsheetSelector({ 
  onLoadSpreadsheet, 
  onCreateNew, 
  getUserSpreadsheets, 
  walletConnected, 
  onRenameSpreadsheet,
  onMakePublic,
  onMakePrivate,
  onTransferOwnership,
  onPruneVersions,
  onDeleteSpreadsheet
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [spreadsheets, setSpreadsheets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingSpreadsheet, setLoadingSpreadsheet] = useState(null); // Track which spreadsheet is loading
  const [error, setError] = useState(null);
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState(null);
  const [showManageMenu, setShowManageMenu] = useState(null);
  const [showRenameDialog, setShowRenameDialog] = useState(null);
  const [showTransferDialog, setShowTransferDialog] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [transferAddress, setTransferAddress] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [manageMenuPosition, setManageMenuPosition] = useState(null);
  const manageButtonRefs = useRef({});

  // Check if any dialog is active
  const hasActiveDialog = showRenameDialog || showTransferDialog || showDeleteDialog;

  // Load spreadsheets when wallet connects
  useEffect(() => {
    if (walletConnected && isOpen) {
      loadSpreadsheets();
    }
  }, [walletConnected, isOpen]);

  // Cleanup dialogs when selector closes
  useEffect(() => {
    if (!isOpen) {
      // Reset all dialog states when selector is closed
      setShowManageMenu(null);
      setManageMenuPosition(null);
      setShowRenameDialog(null);
      setShowTransferDialog(null);
      setShowDeleteDialog(null);
      setNewTitle('');
      setTransferAddress('');
      setDeleteConfirmation('');
      setError(null);
    }
  }, [isOpen]);

  // Close manage menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showManageMenu && !e.target.closest('.manage-menu-portal') && !e.target.closest('.manage-button')) {
        setShowManageMenu(null);
        setManageMenuPosition(null);
      }
    };

    if (showManageMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showManageMenu]);

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (hasActiveDialog) {
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [hasActiveDialog]);

  const loadSpreadsheets = async () => {
    if (!getUserSpreadsheets) return;

    setLoading(true);
    setError(null);
    
    try {
      const result = await getUserSpreadsheets();
      
      if (result.success) {
        setSpreadsheets(result.spreadsheets);
        if (result.spreadsheets.length > 0) {
          setSelectedSpreadsheet(result.spreadsheets[0]);
        }
      } else {
        setError(result.error || 'Failed to load spreadsheets');
      }
    } catch (err) {
      setError(err.message || 'Failed to load spreadsheets');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSpreadsheet = async (spreadsheet) => {
    if (onLoadSpreadsheet) {
      try {
        setLoadingSpreadsheet(spreadsheet.objectId);
        setError(null);
        
        await onLoadSpreadsheet(spreadsheet.objectId);
        setIsOpen(false);
      } catch (error) {
        setError(`Failed to load spreadsheet: ${error.message}`);
      } finally {
        setLoadingSpreadsheet(null);
      }
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTitle = (title) => {
    if (title.length > 30) {
      return title.substring(0, 27) + '...';
    }
    return title;
  };

  const handleRename = async (spreadsheet) => {
    if (!onRenameSpreadsheet) return;
    
    const result = await onRenameSpreadsheet(spreadsheet.objectId, newTitle);
    if (result.success) {
      setShowRenameDialog(null);
      setNewTitle('');
      loadSpreadsheets(); // Refresh list
    } else {
      setError(`Failed to rename: ${result.error}`);
    }
  };

  const handleMakePublic = async (spreadsheet) => {
    if (!onMakePublic) return;
    
    const result = await onMakePublic(spreadsheet.objectId);
    if (result.success) {
      setShowManageMenu(null);
      loadSpreadsheets(); // Refresh list
    } else {
      setError(`Failed to make public: ${result.error}`);
    }
  };

  const handleMakePrivate = async (spreadsheet) => {
    if (!onMakePrivate) return;
    
    const result = await onMakePrivate(spreadsheet.objectId);
    if (result.success) {
      setShowManageMenu(null);
      loadSpreadsheets(); // Refresh list
    } else {
      setError(`Failed to make private: ${result.error}`);
    }
  };

  const handleTransferOwnership = async (spreadsheet) => {
    if (!onTransferOwnership) return;
    
    const result = await onTransferOwnership(spreadsheet.objectId, transferAddress);
    if (result.success) {
      setShowTransferDialog(null);
      setTransferAddress('');
      loadSpreadsheets(); // Refresh list
    } else {
      setError(`Failed to transfer: ${result.error}`);
    }
  };

  const handlePruneVersions = async (spreadsheet) => {
    if (!onPruneVersions) return;
    
    const result = await onPruneVersions(spreadsheet.objectId, 10);
    if (result.success) {
      setShowManageMenu(null);
      loadSpreadsheets(); // Refresh list
    } else {
      setError(`Failed to prune versions: ${result.error}`);
    }
  };

  const handleDeleteSpreadsheet = async (spreadsheet) => {
    if (!onDeleteSpreadsheet || isDeleting) return;
    
    // Verify user typed the exact title
    if (deleteConfirmation !== spreadsheet.title) {
      setError('Confirmation text must match the spreadsheet title exactly');
      return;
    }
    
    try {
      setIsDeleting(true);
      setError(null); // Clear any previous errors
      
      const result = await onDeleteSpreadsheet(spreadsheet.objectId, spreadsheet.title);
      
      if (result.success) {
        // Close all dialogs and clear states
        setShowDeleteDialog(null);
        setDeleteConfirmation('');
        setShowManageMenu(null);
        
        // Clear selection if deleted spreadsheet was selected
        if (selectedSpreadsheet?.objectId === spreadsheet.objectId) {
          setSelectedSpreadsheet(null);
        }
        
        // Refresh the spreadsheet list
        setTimeout(() => {
          loadSpreadsheets();
        }, 100); // Small delay to ensure state is clean
        
      } else {
        setError(`Failed to delete spreadsheet: ${result.error}`);
      }
    } catch (error) {
      setError(`Error during deletion: ${error.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!walletConnected) {
    return null;
  }

  return (
    <div className={`spreadsheet-selector ${hasActiveDialog ? 'dialog-active' : ''}`}>
      <button 
        className="selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
        title="My Spreadsheets"
      >
        📊 My Spreadsheets
        <span className="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="selector-dropdown">
          <div className="dropdown-header">
            <h3>Your Spreadsheets</h3>
            <button 
              className="close-button"
              onClick={() => setIsOpen(false)}
            >
              ✕
            </button>
          </div>

          <div className="dropdown-content">
            {loading && (
              <div className="loading-state">
                <div className="spinner"></div>
                Loading your spreadsheets...
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

            {!loading && !error && spreadsheets.length === 0 && (
              <div className="empty-state">
                <p>📄 No spreadsheets found</p>
                <p className="empty-subtitle">Create your first spreadsheet to get started!</p>
                <button 
                  onClick={() => {
                    setIsOpen(false);
                    if (onCreateNew) onCreateNew();
                  }}
                  className="create-new-button"
                >
                  ➕ Create New Spreadsheet
                </button>
              </div>
            )}

            {!loading && !error && spreadsheets.length > 0 && (
              <>
                <div className="actions">
                  <button 
                    onClick={() => {
                      setIsOpen(false);
                      if (onCreateNew) onCreateNew();
                    }}
                    className="create-new-button"
                  >
                    ➕ Create New
                  </button>
                  <button onClick={loadSpreadsheets} className="refresh-button">
                    🔄 Refresh
                  </button>
                </div>

                <div className="spreadsheet-list">
                  {spreadsheets.map((sheet, index) => (
                    <div 
                      key={sheet.objectId}
                      className={`spreadsheet-item ${selectedSpreadsheet?.objectId === sheet.objectId ? 'selected' : ''}`}
                      onClick={() => setSelectedSpreadsheet(sheet)}
                    >
                      <div className="spreadsheet-info">
                        <div className="spreadsheet-title">
                          {formatTitle(sheet.title)}
                        </div>
                        <div className="spreadsheet-meta">
                          <span className="version-count">
                            📄 {sheet.version_count} version{sheet.version_count !== 1 ? 's' : ''}
                          </span>
                          <span className="last-modified">
                            🕒 {formatDate(sheet.last_modified)}
                          </span>
                        </div>
                        {sheet.is_public && (
                          <div className="public-badge">🌐 Public</div>
                        )}
                      </div>
                      
                      <div className="spreadsheet-actions">
                        <button 
                          className={`load-button ${loadingSpreadsheet === sheet.objectId ? 'loading' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLoadSpreadsheet(sheet);
                          }}
                          disabled={loadingSpreadsheet === sheet.objectId || loadingSpreadsheet !== null}
                        >
                          {loadingSpreadsheet === sheet.objectId ? (
                            <>
                              <div className="spinner-small"></div>
                              Loading...
                            </>
                          ) : (
                            <>📂 Load</>
                          )}
                        </button>
                        
                        <button 
                          ref={el => manageButtonRefs.current[sheet.objectId] = el}
                          className="manage-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (showManageMenu === sheet.objectId) {
                              setShowManageMenu(null);
                              setManageMenuPosition(null);
                            } else {
                              const rect = e.target.getBoundingClientRect();
                              setManageMenuPosition({
                                top: rect.bottom + 4,
                                left: rect.left - 120 // Adjust to align menu properly
                              });
                              setShowManageMenu(sheet.objectId);
                            }
                          }}
                        >
                          ⚙️
                        </button>
                        
                      </div>
                    </div>
                  ))}
                </div>

                {selectedSpreadsheet && (
                  <div className="selected-info">
                    <h4>Selected: {selectedSpreadsheet.title}</h4>
                    <button 
                      className="load-selected-button"
                      onClick={() => handleLoadSpreadsheet(selectedSpreadsheet)}
                    >
                      📂 Load "{formatTitle(selectedSpreadsheet.title)}"
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Rename Dialog Portal */}
      {showRenameDialog && createPortal(
        <div className="dialog-overlay" onClick={() => setShowRenameDialog(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Rename Spreadsheet</h3>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Enter new title"
              className="dialog-input"
            />
            <div className="dialog-actions">
              <button 
                onClick={() => setShowRenameDialog(null)}
                className="cancel-button"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleRename({ objectId: showRenameDialog })}
                className="confirm-button"
                disabled={!newTitle.trim()}
              >
                Rename
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Transfer Dialog Portal */}
      {showTransferDialog && createPortal(
        <div className="dialog-overlay" onClick={() => setShowTransferDialog(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Transfer Ownership</h3>
            <input
              type="text"
              value={transferAddress}
              onChange={(e) => setTransferAddress(e.target.value)}
              placeholder="Enter new owner's address (0x...)"
              className="dialog-input"
            />
            <div className="dialog-actions">
              <button 
                onClick={() => setShowTransferDialog(null)}
                className="cancel-button"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleTransferOwnership({ objectId: showTransferDialog })}
                className="confirm-button"
                disabled={!transferAddress.trim() || !transferAddress.startsWith('0x')}
              >
                Transfer
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Dialog Portal */}
      {showDeleteDialog && createPortal(
        <div className="dialog-overlay" onClick={() => {
          if (!isDeleting) {
            setShowDeleteDialog(null);
            setDeleteConfirmation('');
          }
        }}>
          <div className="dialog delete-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>⚠️ Delete Spreadsheet</h3>
            <div className="delete-warning">
              <p>
                <strong>This action cannot be undone!</strong>
              </p>
              <p>
                You are about to permanently delete this spreadsheet and all its versions. 
                This will remove all data from the blockchain and cannot be recovered.
              </p>
              <p>
                To confirm deletion, please type the exact spreadsheet title below:
              </p>
              <div className="title-to-confirm">
                "{spreadsheets.find(s => s.objectId === showDeleteDialog)?.title}"
              </div>
            </div>
            <input
              type="text"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder="Type the spreadsheet title exactly"
              className="dialog-input delete-confirmation-input"
            />
            <div className="dialog-actions">
              <button 
                onClick={() => {
                  setShowDeleteDialog(null);
                  setDeleteConfirmation('');
                }}
                className="cancel-button"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  const spreadsheet = spreadsheets.find(s => s.objectId === showDeleteDialog);
                  if (spreadsheet) handleDeleteSpreadsheet(spreadsheet);
                }}
                className="danger-button"
                disabled={isDeleting || !deleteConfirmation.trim() || deleteConfirmation !== spreadsheets.find(s => s.objectId === showDeleteDialog)?.title}
              >
                {isDeleting ? (
                  <>
                    <div className="spinner-small"></div>
                    Deleting...
                  </>
                ) : (
                  <>🗑️ Delete Forever</>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Manage Menu Portal */}
      {showManageMenu && manageMenuPosition && createPortal(
        <div 
          className="manage-menu-portal"
          style={{
            position: 'fixed',
            top: `${manageMenuPosition.top}px`,
            left: `${manageMenuPosition.left}px`,
            zIndex: 10000
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="manage-menu">
            {(() => {
              const sheet = spreadsheets.find(s => s.objectId === showManageMenu);
              if (!sheet) return null;
              
              return (
                <>
                  <button 
                    onClick={() => {
                      setNewTitle(sheet.title);
                      setShowRenameDialog(sheet.objectId);
                      setShowManageMenu(null);
                      setManageMenuPosition(null);
                    }}
                  >
                    ✏️ Rename
                  </button>
                  
                  {sheet.is_public ? (
                    <button onClick={() => {
                      handleMakePrivate(sheet);
                      setShowManageMenu(null);
                      setManageMenuPosition(null);
                    }}>
                      🔒 Make Private
                    </button>
                  ) : (
                    <button onClick={() => {
                      handleMakePublic(sheet);
                      setShowManageMenu(null);
                      setManageMenuPosition(null);
                    }}>
                      🌐 Make Public
                    </button>
                  )}
                  
                  <button 
                    onClick={() => {
                      setShowTransferDialog(sheet.objectId);
                      setShowManageMenu(null);
                      setManageMenuPosition(null);
                    }}
                  >
                    👤 Transfer
                  </button>
                  
                  <button onClick={() => {
                    handlePruneVersions(sheet);
                    setShowManageMenu(null);
                    setManageMenuPosition(null);
                  }}>
                    🗑️ Clean Old Versions
                  </button>
                  
                  <button 
                    className="delete-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      
                      // Close all other dialogs first
                      setShowRenameDialog(null);
                      setShowTransferDialog(null);
                      setShowManageMenu(null);
                      setManageMenuPosition(null);
                      setError(null);
                      setDeleteConfirmation('');
                      
                      // Slight delay to ensure state is clean before opening dialog
                      setTimeout(() => {
                        setShowDeleteDialog(sheet.objectId);
                      }, 0);
                    }}
                  >
                    🗑️ Delete Permanently
                  </button>
                </>
              );
            })()} 
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}