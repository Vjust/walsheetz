import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNetwork } from '../providers/NetworkProvider.jsx';
import './styles/create-document-modal.css';

export function CreateDocumentModal({ isOpen, onClose, onCreate, blockchainAdapter, storageAdapter, spreadsheetEngine }) {
  const [title, setTitle] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
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

    if (!title.trim()) return;

    try {
      // Just validate and pass to parent
      await onCreate({ title: title.trim(), template: selectedTemplate });
      // Modal will be closed by parent component on success
    } catch (error) {
      console.error('Error creating document:', error);
    }
  };

  const handleClose = () => {
    onClose();
  };

  const handleCancel = () => {
    handleClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
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
            title="Close"
          >
            ✕
          </button>
        </div>

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
                  onClick={() => setSelectedTemplate(template.id)}
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

          {/* Action Buttons */}
          <div className="modal-actions">
            <button
              type="button"
              onClick={handleClose}
              className="cancel-button"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="create-button"
              disabled={!title.trim()}
            >
              <span>➕</span>
              Create Spreadsheet
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
