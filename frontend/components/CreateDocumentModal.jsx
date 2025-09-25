import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SpreadsheetCreationService } from '../services/SpreadsheetCreationService.js';
import { ProgressIndicator } from './ProgressIndicator.jsx';
import './styles/create-document-modal.css';

export function CreateDocumentModal({ isOpen, onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [creationState, setCreationState] = useState(null);
  const [error, setError] = useState(null);
  const [showProgress, setShowProgress] = useState(false);

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
      const creationService = new SpreadsheetCreationService();

      // Create creation request with template support
      const creationRequest = {
        title: title.trim(),
        template: selectedTemplate,
        walletAddress: window.walletAddress || null, // Get from global state
        timestamp: Date.now()
      };

      // Set up progress tracking
      creationService.onProgress = (state) => {
        setCreationState({ ...state });
      };

      // Execute creation with the new service
      const result = await creationService.createSpreadsheet(creationRequest);

      // Call the original onCreate with the result
      await onCreate(result.title, result);

      // Modal will be closed by parent component on success
    } catch (error) {
      console.error('Error creating document:', error);
      setError(error.message || 'Failed to create spreadsheet');
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
              <div className="error-message">
                <span className="error-icon">⚠️</span>
                <span>{error}</span>
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

        {/* Loading Overlay */}
        {isLoading && <div className="modal-loading-overlay" />}
      </div>
    </div>,
    document.body
  );
}