import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SpreadsheetCreationService } from '../services/SpreadsheetCreationService.js';
import { ProgressIndicator } from './ProgressIndicator.jsx';
import { useNetwork } from '../providers/NetworkProvider.jsx';
import './styles/create-document-modal.css';

export function CreateDocumentModal({ isOpen, onClose, onCreate, blockchainAdapter, storageAdapter, spreadsheetEngine }) {
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [creationState, setCreationState] = useState(null);
  const [error, setError] = useState(null);
  const [showProgress, setShowProgress] = useState(false);
  const { switchNetwork, isTestnet } = useNetwork();

  // Template options
  const templates = [
    {
      id: 'blank',
      name: 'Blank Spreadsheet',
      description: 'Start with an empty spreadsheet',
      icon: '📄'
    },
    {
      id: 'budget',
      name: 'Personal Budget',
      description: 'Track your income and expenses',
      icon: '💰'
    },
    {
      id: 'project',
      name: 'Project Tracker',
      description: 'Manage tasks and deadlines',
      icon: '📋'
    },
    {
      id: 'inventory',
      name: 'Inventory List',
      description: 'Track items and quantities',
      icon: '📦'
    },
    {
      id: 'schedule',
      name: 'Schedule Planner',
      description: 'Organize your time and events',
      icon: '📅'
    },
    {
      id: 'contacts',
      name: 'Contact List',
      description: 'Manage your contacts and information',
      icon: '👥'
    }
  ];

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setSelectedTemplate('blank');
      setIsLoading(false);
      setCreationState(null);
      setError(null);
      setShowProgress(false);
    }
  }, [isOpen]);

  // Focus title input when modal opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        const input = document.querySelector('.create-modal .title-input');
        if (input) {
          input.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!title.trim() || isLoading) return;

    setIsLoading(true);
    setShowProgress(true);
    setError(null);

    try {
      const creationService = new SpreadsheetCreationService(blockchainAdapter, storageAdapter, spreadsheetEngine);

      // Create creation request with template support
      const creationRequest = {
        title: title.trim(),
        template: selectedTemplate,
        walletAddress: window.walletAddress || null, // Get from global state
        timestamp: Date.now()
      };

      // Seed initial progress state so the UI can display estimates immediately
      const initialSteps = creationService.getCreationSteps(creationRequest).map((step) => ({
        ...step,
        estimatedDuration: step.estimatedDuration ? Math.ceil(step.estimatedDuration / 1000) : null
      }));
      const estimatedTotalSeconds = Math.ceil(creationService.estimateCreationTime(creationRequest) / 1000);

      setCreationState({
        status: 'loading',
        currentStep: 0,
        steps: initialSteps,
        estimatedTime: estimatedTotalSeconds || null,
        estimatedTimeRemaining: estimatedTotalSeconds || null
      });

      // Execute creation with the new service
      const result = await creationService.createSpreadsheet({
        ...creationRequest,
        onProgress: (state) => {
          setCreationState({ ...state });
        }
      });

      // Call the original onCreate with the result
      await onCreate(result.title, result);

      // Modal will be closed by parent component on success
    } catch (error) {
      console.error('Error creating document:', error);

      // Check if this is a WAL coin error and provide better UX
      const errorMsg = error.message || 'Failed to create spreadsheet';
      const isWalCoinError = errorMsg.toLowerCase().includes('wal') &&
                            (errorMsg.toLowerCase().includes('coin') ||
                             errorMsg.toLowerCase().includes('balance'));

      if (isWalCoinError) {
        setError({
          isWalCoinError: true,
          isTestnet,
          message: errorMsg,
          detail: isTestnet
            ? 'The testnet Walrus publisher is temporarily out of funds. Switch to Mainnet for production-ready storage with permanent data.'
            : 'The Walrus publisher is temporarily out of funds. Please try again later.',
          switchNetwork: isTestnet ? switchNetwork : null
        });
      } else {
        setError({
          isWalCoinError: false,
          message: errorMsg,
          detail: null
        });
      }

      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
    }
  };

  const handleCancel = () => {
    if (isLoading && creationState?.id) {
      // Cancel the creation process if possible
      setIsLoading(false);
      setShowProgress(false);
      setCreationState(null);
    }
    handleClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && !isLoading) {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay" onClick={handleClose} onKeyDown={handleKeyDown}>
      <div className="create-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Spreadsheet</h2>
          <button
            className="close-button"
            onClick={handleClose}
            disabled={isLoading}
            title="Close"
          >
            ✕
          </button>
        </div>

        {!showProgress ? (
          <form onSubmit={handleSubmit} className="modal-content">
            {/* Document Title */}
            <div className="form-section">
              <label htmlFor="document-title" className="form-label">
                Document Title
              </label>
              <input
                id="document-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter spreadsheet title..."
                className="title-input"
                maxLength={100}
                disabled={isLoading}
                autoComplete="off"
              />
            </div>

            {/* Template Selection */}
            <div className="form-section">
              <label className="form-label">Choose Template</label>
              <div className="templates-grid">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className={`template-card ${selectedTemplate === template.id ? 'selected' : ''}`}
                    onClick={() => !isLoading && setSelectedTemplate(template.id)}
                  >
                    <div className="template-icon">{template.icon}</div>
                    <div className="template-info">
                      <h4 className="template-name">{template.name}</h4>
                      <p className="template-description">{template.description}</p>
                    </div>
                    {selectedTemplate === template.id && (
                      <div className="selected-indicator">✓</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div>
                {error.isWalCoinError && error.isTestnet && error.switchNetwork ? (
                  <div className="testnet-warning-box">
                    <div className="warning-header">
                      <span className="warning-icon">⏳</span>
                      <div>
                        <h4>Testnet Publisher Temporarily Unavailable</h4>
                        <p className="warning-message">{error.message}</p>
                      </div>
                    </div>

                    <div className="testnet-limitations">
                      <h5>📋 Testnet Limitations:</h5>
                      <ul className="limitations-list">
                        <li>Limited resources - publishers may run out of WAL coins</li>
                        <li>Data stored on testnet is not permanent</li>
                        <li>Best for testing and development only</li>
                      </ul>
                    </div>

                    <div className="mainnet-suggestion">
                      <h5>💡 For Production Use:</h5>
                      <p>Switch to Mainnet to save your data permanently with reliable resources and real cost efficiency.</p>
                      <p className="reload-notice">Note: The app will reload when you switch networks.</p>
                    </div>

                    <div className="testnet-warning-actions">
                      <button
                        type="button"
                        onClick={() => setError(null)}
                        className="retry-later-btn"
                      >
                        Try Again Later
                      </button>
                      <button
                        type="button"
                        onClick={() => error.switchNetwork('mainnet')}
                        className="mainnet-switch-btn"
                      >
                        🌐 Switch to Mainnet →
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`error-message ${error.isWalCoinError ? 'error-message-walcoin' : ''}`}>
                    <span className="error-icon">
                      {error.isWalCoinError ? '⏳' : '⚠️'}
                    </span>
                    <div className="error-content">
                      <span className="error-title">{error.message}</span>
                      {error.detail && (
                        <span className="error-detail">{error.detail}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="modal-actions">
              <button
                type="button"
                onClick={handleClose}
                className="cancel-button"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="create-button"
                disabled={!title.trim() || isLoading}
              >
                {isLoading ? (
                  <>
                    <div className="spinner-small"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <span>➕</span>
                    Create Spreadsheet
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          /* Progress View */
          <div className="modal-content progress-view">
            <ProgressIndicator
              steps={creationState?.steps || []}
              currentStep={creationState?.currentStep || 0}
              status={creationState?.status || 'loading'}
              estimatedTime={creationState?.estimatedTime}
              showDetails={true}
              onCancel={isLoading ? handleCancel : null}
            />

            {/* Progress Actions */}
            <div className="modal-actions">
              {creationState?.status === 'error' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setShowProgress(false);
                      setIsLoading(false);
                      setCreationState(null);
                    }}
                    className="cancel-button"
                  >
                    Back to Form
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="retry-button"
                  >
                    <span>🔄</span>
                    Try Again
                  </button>
                </>
              )}
              {creationState?.status === 'success' && (
                <button
                  type="button"
                  onClick={handleClose}
                  className="success-button"
                >
                  <span>✓</span>
                  Done
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
