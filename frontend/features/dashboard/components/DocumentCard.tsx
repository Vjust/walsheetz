import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNetwork } from '@shared/providers/NetworkProvider';
import '../styles/document-card.css';

export function DocumentCard({
  spreadsheet,
  compact = false,
  onOpen,
  onRename,
  onMakePublic,
  onMakePrivate,
  onTransfer,
  onPrune,
  onDelete,
  onMigrate,
}) {
  const [showManageMenu, setShowManageMenu] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [transferAddress, setTransferAddress] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { isTestnet } = useNetwork();

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays - 1} days ago`;

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTitle = (title) => {
    const maxLength = compact ? 25 : 35;
    if (title.length > maxLength) {
      return title.substring(0, maxLength - 3) + '...';
    }
    return title;
  };

  const handleOpen = () => {
    if (onOpen && !isLoading) {
      onOpen(spreadsheet.objectId);
    }
  };

  const handleManageClick = (e) => {
    e.stopPropagation();
    setShowManageMenu(!showManageMenu);
  };

  const handleRename = async () => {
    if (!onRename || !newTitle.trim()) return;

    setIsLoading(true);
    try {
      await onRename(spreadsheet.objectId, newTitle.trim());
      setShowRenameDialog(false);
      setNewTitle('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMakePublic = async () => {
    if (!onMakePublic) return;

    setIsLoading(true);
    try {
      await onMakePublic(spreadsheet.objectId);
      setShowManageMenu(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMakePrivate = async () => {
    if (!onMakePrivate) return;

    setIsLoading(true);
    try {
      await onMakePrivate(spreadsheet.objectId);
      setShowManageMenu(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!onTransfer || !transferAddress.trim()) return;

    setIsLoading(true);
    try {
      await onTransfer(spreadsheet.objectId, transferAddress.trim());
      setShowTransferDialog(false);
      setTransferAddress('');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrune = async () => {
    if (!onPrune) return;

    setIsLoading(true);
    try {
      await onPrune(spreadsheet.objectId);
      setShowManageMenu(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || deleteConfirmation !== spreadsheet.title) return;

    setIsLoading(true);
    try {
      await onDelete(spreadsheet.objectId, spreadsheet.title);
      setShowDeleteDialog(false);
      setDeleteConfirmation('');
    } finally {
      setIsLoading(false);
    }
  };

  const cardContent = (
    <div
      className={`document-card ${compact ? 'compact' : ''} ${isLoading ? 'loading' : ''} ${showManageMenu ? 'menu-open' : ''}`}
      onClick={handleOpen}
    >
      <div className="card-header">
        <div className="document-icon">
          <span>Doc</span>
        </div>
        <div className="document-info">
          <h3 className="document-title" title={spreadsheet.title}>
            {formatTitle(spreadsheet.title)}
          </h3>
          {!compact && (
            <div className="document-meta">
              <span className="version-count">
                {spreadsheet.version_count} version{spreadsheet.version_count !== 1 ? 's' : ''}
              </span>
              {spreadsheet.is_public && <span className="public-badge">Public</span>}
            </div>
          )}
        </div>
        <button className="manage-button" onClick={handleManageClick} title="Manage document">
          Manage
        </button>
      </div>

      <div className="card-footer">
        <span className="last-modified">{formatDate(spreadsheet.last_modified)}</span>
        {compact && spreadsheet.is_public && <span className="public-badge-compact">Public</span>}
      </div>

      {/* Manage Menu */}
      {showManageMenu && (
        <div className="manage-menu" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              setNewTitle(spreadsheet.title);
              setShowRenameDialog(true);
              setShowManageMenu(false);
            }}
          >
            Rename
          </button>

          {spreadsheet.is_public ? (
            <button onClick={handleMakePrivate}>Make Private</button>
          ) : (
            <button onClick={handleMakePublic}>Make Public</button>
          )}

          <button
            onClick={() => {
              setShowTransferDialog(true);
              setShowManageMenu(false);
            }}
          >
            Transfer
          </button>

          <button onClick={handlePrune}>Clean Old Versions</button>

          {/* Show migrate button when on testnet (includes legacy spreadsheets without network metadata) */}
          {isTestnet && onMigrate && (
            <button
              className="migrate-button"
              onClick={() => {
                onMigrate(spreadsheet);
                setShowManageMenu(false);
              }}
            >
              Migrate to Mainnet
            </button>
          )}

          <button
            className="delete-button"
            onClick={() => {
              setShowDeleteDialog(true);
              setShowManageMenu(false);
            }}
          >
            Delete Permanently
          </button>
        </div>
      )}

      {isLoading && (
        <div className="card-loading-overlay">
          <div className="spinner"></div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {cardContent}

      {/* Rename Dialog */}
      {showRenameDialog &&
        createPortal(
          <div className="dialog-overlay" onClick={() => setShowRenameDialog(false)}>
            <div className="dialog" onClick={(e) => e.stopPropagation()}>
              <h3>Rename Spreadsheet</h3>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Enter new title"
                className="dialog-input"
                autoFocus
              />
              <div className="dialog-actions">
                <button
                  onClick={() => setShowRenameDialog(false)}
                  className="cancel-button"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleRename}
                  className="confirm-button"
                  disabled={!newTitle.trim() || isLoading}
                >
                  {isLoading ? 'Renaming...' : 'Rename'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Transfer Dialog */}
      {showTransferDialog &&
        createPortal(
          <div className="dialog-overlay" onClick={() => setShowTransferDialog(false)}>
            <div className="dialog" onClick={(e) => e.stopPropagation()}>
              <h3>Transfer Ownership</h3>
              <input
                type="text"
                value={transferAddress}
                onChange={(e) => setTransferAddress(e.target.value)}
                placeholder="Enter new owner's address (0x...)"
                className="dialog-input"
                autoFocus
              />
              <div className="dialog-actions">
                <button
                  onClick={() => setShowTransferDialog(false)}
                  className="cancel-button"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleTransfer}
                  className="confirm-button"
                  disabled={
                    !transferAddress.trim() || !transferAddress.startsWith('0x') || isLoading
                  }
                >
                  {isLoading ? 'Transferring...' : 'Transfer'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Delete Dialog */}
      {showDeleteDialog &&
        createPortal(
          <div className="dialog-overlay" onClick={() => setShowDeleteDialog(false)}>
            <div className="dialog delete-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>Delete Spreadsheet</h3>
              <div className="delete-warning">
                <p>
                  <strong>This action cannot be undone!</strong>
                </p>
                <p>
                  You are about to permanently delete this spreadsheet and all its versions. This
                  will remove all data from the blockchain and cannot be recovered.
                </p>
                <p>To confirm deletion, please type the exact spreadsheet title below:</p>
                <div className="title-to-confirm">"{spreadsheet.title}"</div>
              </div>
              <input
                type="text"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder="Type the spreadsheet title exactly"
                className="dialog-input delete-confirmation-input"
                autoFocus
              />
              <div className="dialog-actions">
                <button
                  onClick={() => setShowDeleteDialog(false)}
                  className="cancel-button"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="danger-button"
                  disabled={deleteConfirmation !== spreadsheet.title || isLoading}
                >
                  {isLoading ? 'Deleting...' : 'Delete Forever'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
