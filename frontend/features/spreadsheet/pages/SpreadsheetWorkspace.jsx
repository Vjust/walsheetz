/**
 * SpreadsheetWorkspace Page
 * Main workspace with spreadsheet and formula sidebar
 */
import React, { useState, useEffect, useRef } from 'react';
import { Spreadsheet } from '@features/dashboard/components/spreadsheet';
import { WALSHEETZ_FUNCTION_METADATA } from '../../services/formulas/WalSheetzFunctions.js';
import { logger, LogComponent } from '@utils/logging/Logger.js';
import '../styles/SpreadsheetWorkspace.css';

export function SpreadsheetWorkspace() {
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [selectedFormula, setSelectedFormula] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const spreadsheetRef = useRef(null);

  // Get query params
  const urlParams = new URLSearchParams(window.location.search);
  const blobId = urlParams.get('blobId');

  useEffect(() => {
    if (blobId) {
      logger.info(LogComponent.UI, 'workspace_blob_load', 'Loading blob into workspace', {
        blobId
      });
      // Auto-load blob if specified in URL
      // This would be handled by the Spreadsheet component
    }
  }, [blobId]);

  /**
   * Get unique categories from formula metadata
   */
  const getCategories = () => {
    const categories = new Set();
    Object.values(WALSHEETZ_FUNCTION_METADATA).forEach(meta => {
      if (meta.category) categories.add(meta.category);
    });
    return ['all', ...Array.from(categories).sort()];
  };

  /**
   * Filter formulas based on search and category
   */
  const getFilteredFormulas = () => {
    let formulas = Object.entries(WALSHEETZ_FUNCTION_METADATA);

    // Filter by search term
    if (searchTerm) {
      formulas = formulas.filter(([name, meta]) =>
        name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        meta.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by category
    if (categoryFilter !== 'all') {
      formulas = formulas.filter(([_, meta]) => meta.category === categoryFilter);
    }

    return formulas;
  };

  /**
   * Insert formula at current cell
   */
  const insertFormula = (signature) => {
    if (window.luckysheet) {
      const selection = window.luckysheet.getRange();
      if (selection && selection.length > 0) {
        const { row, column } = selection[0];
        // Insert formula with = prefix
        const formula = `=${signature}`;
        window.luckysheet.setCellValue(row[0], column[0], formula);
        logger.debug(LogComponent.UI, 'formula_inserted', 'Formula inserted', {
          formula,
          row: row[0],
          col: column[0]
        });
      }
    }
  };

  /**
   * Copy formula to clipboard
   */
  const copyFormula = (signature) => {
    navigator.clipboard.writeText(`=${signature}`);
    logger.debug(LogComponent.UI, 'formula_copied', 'Formula copied to clipboard', {
      formula: signature
    });
  };

  const categories = getCategories();
  const filteredFormulas = getFilteredFormulas();

  return (
    <div className="spreadsheet-workspace">
      {/* Main Spreadsheet Area */}
      <div className={`workspace-main ${sidebarVisible ? 'with-sidebar' : ''}`}>
        <div className="workspace-header">
          <h2>Spreadsheet Workspace</h2>
          <button
            className="toggle-sidebar-btn"
            onClick={() => setSidebarVisible(!sidebarVisible)}
            title={sidebarVisible ? 'Hide Formula Sidebar' : 'Show Formula Sidebar'}
          >
            {sidebarVisible ? '▶' : '◀'} Formulas
          </button>
        </div>

        <div className="workspace-spreadsheet">
          <Spreadsheet ref={spreadsheetRef} initialBlobId={blobId} />
        </div>
      </div>

      {/* Formula Sidebar */}
      {sidebarVisible && (
        <div className="workspace-sidebar">
          <div className="sidebar-header">
            <h3>WalSheetz Formulas</h3>
            <p className="sidebar-subtitle">Click to insert or copy</p>
          </div>

          {/* Search */}
          <div className="sidebar-search">
            <input
              type="text"
              placeholder="Search formulas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Category Filter */}
          <div className="sidebar-categories">
            {categories.map(cat => (
              <button
                key={cat}
                className={`category-btn ${categoryFilter === cat ? 'active' : ''}`}
                onClick={() => setCategoryFilter(cat)}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>

          {/* Formula List */}
          <div className="sidebar-formulas">
            {filteredFormulas.length === 0 ? (
              <div className="no-formulas">
                <p>No formulas found</p>
              </div>
            ) : (
              filteredFormulas.map(([name, meta]) => (
                <div
                  key={name}
                  className={`formula-item ${selectedFormula === name ? 'selected' : ''}`}
                  onClick={() => setSelectedFormula(selectedFormula === name ? null : name)}
                >
                  <div className="formula-header">
                    <span className="formula-icon">{meta.icon || '📊'}</span>
                    <span className="formula-name">{name}</span>
                  </div>

                  {selectedFormula === name && (
                    <div className="formula-details">
                      <p className="formula-description">{meta.description}</p>

                      <div className="formula-signature">
                        <code>{meta.signature}</code>
                      </div>

                      {meta.parameters && meta.parameters.length > 0 && (
                        <div className="formula-params">
                          <p className="params-title">Parameters:</p>
                          <ul>
                            {meta.parameters.map((param, i) => (
                              <li key={i}>
                                <span className="param-name">{param.name}</span>
                                {param.optional && <span className="param-optional">optional</span>}
                                <span className="param-type">{param.type}</span>
                                <p className="param-desc">{param.description}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {meta.example && (
                        <div className="formula-example">
                          <p className="example-title">Example:</p>
                          <code>{meta.example}</code>
                        </div>
                      )}

                      <div className="formula-actions">
                        <button
                          className="insert-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            insertFormula(meta.signature.replace(/^=/, ''));
                          }}
                        >
                          Insert
                        </button>
                        <button
                          className="copy-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyFormula(meta.signature.replace(/^=/, ''));
                          }}
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SpreadsheetWorkspace;
