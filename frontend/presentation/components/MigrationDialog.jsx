import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { SpreadsheetMigrator } from '../../services/SpreadsheetMigrator.js'
import { useNetwork } from '../../providers/NetworkProvider.jsx'
import './styles/MigrationDialog.css'

const MIGRATION_STORAGE_KEY = 'walsheetz_pending_migration'

export function MigrationDialog({ 
  isOpen, 
  onClose, 
  spreadsheet, 
  blockchainAdapter, 
  storageAdapter,
  spreadsheetEngine,
  onMigrationComplete
}) {
  const { isMainnet, switchNetwork } = useNetwork()
  const [step, setStep] = useState('confirm') // confirm, estimating, migrating, success, error
  const [costEstimate, setCostEstimate] = useState(null)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [newTitle, setNewTitle] = useState('')

  // Check for pending migration when dialog opens on mainnet
  useEffect(() => {
    const checkPendingMigration = async () => {
      // Only check if we're open, on mainnet, and have the spreadsheet
      if (!isOpen || !isMainnet || !spreadsheet) return;
      
      const pendingMigration = localStorage.getItem(MIGRATION_STORAGE_KEY)
      if (pendingMigration) {
        try {
          const migrationData = JSON.parse(pendingMigration)
          
          // Verify this is the same spreadsheet
          if (migrationData.spreadsheetId === spreadsheet.objectId) {
            console.log('[MigrationDialog] Resuming pending migration:', migrationData)
            
            // Clear the pending migration
            localStorage.removeItem(MIGRATION_STORAGE_KEY)
            
            // Trigger the actual migration
            setNewTitle(migrationData.newTitle)
            setStep('migrating')
            
            const migrator = new SpreadsheetMigrator(blockchainAdapter, storageAdapter, spreadsheetEngine)
            
            const result = await migrator.migrateToMainnet(migrationData.spreadsheetId, {
              newTitle: migrationData.newTitle,
              onProgress: (progressData) => {
                setProgress(progressData)
              }
            })

            if (result.success) {
              setResult(result)
              setStep('success')
              if (onMigrationComplete) {
                onMigrationComplete(result)
              }
            } else {
              throw new Error(result.error)
            }
          }
        } catch (err) {
          console.error('[MigrationDialog] Failed to resume migration:', err)
          setError(err.message || 'Migration failed after network switch')
          setStep('error')
          localStorage.removeItem(MIGRATION_STORAGE_KEY)
        }
      }
    }

    checkPendingMigration()
  }, [isOpen, isMainnet, spreadsheet, blockchainAdapter, storageAdapter, spreadsheetEngine, onMigrationComplete])

  useEffect(() => {
    if (isOpen && spreadsheet) {
      setNewTitle(`${spreadsheet.title} (Mainnet)`)
      setStep('confirm')
      setProgress(null)
      setResult(null)
      setError(null)
    }
  }, [isOpen, spreadsheet])

  const handleEstimateCost = async () => {
    setStep('estimating')
    try {
      const migrator = new SpreadsheetMigrator(blockchainAdapter, storageAdapter, spreadsheetEngine)
      
      // Load the spreadsheet data for estimation
      const loadResult = await blockchainAdapter.loadSpreadsheet(spreadsheet.objectId)
      if (!loadResult.success) {
        throw new Error('Failed to load spreadsheet for estimation')
      }

      const estimate = await migrator.estimateMigrationCost(loadResult.data)
      if (estimate.success) {
        setCostEstimate(estimate)
        setStep('ready')
      } else {
        throw new Error(estimate.error)
      }
    } catch (err) {
      setError(err.message || 'Failed to estimate cost')
      setStep('error')
    }
  }

  const handleStartMigration = async () => {
    setStep('migrating')
    setError(null)

    try {
      // If not on mainnet, save migration intent and switch
      if (!isMainnet) {
        setProgress({
          step: 0,
          totalSteps: 5,
          message: 'Switching to mainnet...',
          status: 'loading'
        })
        
        // Save migration state to localStorage
        const migrationData = {
          spreadsheetId: spreadsheet.objectId,
          spreadsheetTitle: spreadsheet.title,
          newTitle: newTitle,
          timestamp: Date.now()
        }
        localStorage.setItem(MIGRATION_STORAGE_KEY, JSON.stringify(migrationData))
        console.log('[MigrationDialog] Saved migration state before network switch:', migrationData)
        
        // Switch network without confirmation dialog (skip=true for programmatic switch)
        // This will trigger a page reload
        switchNetwork('mainnet', true)
        
        // After reload, the useEffect above will check for pending migration
        return
      }

      const migrator = new SpreadsheetMigrator(blockchainAdapter, storageAdapter, spreadsheetEngine)
      
      const result = await migrator.migrateToMainnet(spreadsheet.objectId, {
        newTitle,
        onProgress: (progressData) => {
          setProgress(progressData)
        }
      })

      if (result.success) {
        setResult(result)
        setStep('success')
        
        // Clear any pending migration state
        localStorage.removeItem(MIGRATION_STORAGE_KEY)
        
        if (onMigrationComplete) {
          onMigrationComplete(result)
        }
      } else {
        throw new Error(result.error)
      }
    } catch (err) {
      setError(err.message || 'Migration failed')
      setStep('error')
      localStorage.removeItem(MIGRATION_STORAGE_KEY)
    }
  }

  if (!isOpen || !spreadsheet) return null

  return createPortal(
    <div className="migration-overlay" onClick={onClose}>
      <div className="migration-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="migration-header">
          <h3>🚀 Migrate to Mainnet</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="migration-body">
          {step === 'confirm' && (
            <>
              <div className="migration-info">
                <p>
                  <strong>{spreadsheet.title}</strong> is currently on <span className="testnet-label">🧪 Testnet</span>
                </p>
                <p>
                  Migrate it to <span className="mainnet-label">💎 Mainnet</span> to use with real funds.
                </p>
              </div>

              <div className="migration-details">
                <h4>What happens:</h4>
                <ul>
                  <li>✅ A new spreadsheet will be created on mainnet</li>
                  <li>✅ All data and cells will be copied</li>
                  <li>✅ Original testnet spreadsheet remains unchanged</li>
                  <li>⚠️ Real SUI and WAL tokens will be used</li>
                </ul>
              </div>

              <div className="title-input-group">
                <label>Mainnet Spreadsheet Title:</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Enter new title..."
                  maxLength={100}
                />
              </div>

              <button
                className="estimate-button"
                onClick={handleEstimateCost}
                disabled={!newTitle.trim()}
              >
                Estimate Migration Cost
              </button>
            </>
          )}

          {step === 'estimating' && (
            <div className="migration-loading">
              <div className="spinner"></div>
              <p>Estimating migration cost...</p>
            </div>
          )}

          {step === 'ready' && costEstimate && (
            <>
              <div className="cost-estimate">
                <h4>📊 Cost Estimate:</h4>
                <div className="cost-item">
                  <span>Data Size:</span>
                  <strong>{costEstimate.walrus.sizeFormatted}</strong>
                </div>
                <div className="cost-item">
                  <span>Storage Duration:</span>
                  <strong>{costEstimate.walrus.epochs} epochs</strong>
                </div>
                <div className="cost-item">
                  <span>Gas Fees (SUI):</span>
                  <strong>{costEstimate.sui.gasFee}</strong>
                </div>
                <div className="cost-item">
                  <span>Storage (WAL):</span>
                  <strong>{costEstimate.walrus.storage}</strong>
                </div>
                <div className="cost-item total">
                  <span>Total Estimate:</span>
                  <strong>{costEstimate.totalEstimate}</strong>
                </div>
                <div className="estimate-note">
                  * Costs queried from blockchain in real-time
                </div>
              </div>

              {costEstimate.warnings && (
                <div className="migration-warnings">
                  {costEstimate.warnings.map((warning, i) => (
                    <div key={i} className="warning-item">
                      ⚠️ {warning}
                    </div>
                  ))}
                </div>
              )}

              {!isMainnet && (
                <div className="network-notice">
                  <p>📡 You're currently on testnet. The app will switch to mainnet automatically.</p>
                </div>
              )}

              <button
                className="migrate-button"
                onClick={handleStartMigration}
              >
                Start Migration
              </button>
            </>
          )}

          {step === 'migrating' && (
            <div className="migration-progress">
              <div className="progress-header">
                <h4>Migrating to Mainnet...</h4>
              </div>
              {progress && (
                <div className="progress-details">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${(progress.step / progress.totalSteps) * 100}%` }}
                    />
                  </div>
                  <p className="progress-message">
                    Step {progress.step}/{progress.totalSteps}: {progress.message}
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 'success' && result && (
            <div className="migration-success">
              <div className="success-icon">✅</div>
              <h4>Migration Complete!</h4>
              <p>Your spreadsheet is now on mainnet.</p>
              <div className="result-details">
                <div className="result-item">
                  <span>New Spreadsheet ID:</span>
                  <code>{result.mainnetSpreadsheetId?.slice(0, 20)}...</code>
                </div>
                <div className="result-item">
                  <span>Transaction:</span>
                  <code>{result.transactionHash?.slice(0, 20)}...</code>
                </div>
              </div>
              <button className="done-button" onClick={onClose}>
                Done
              </button>
            </div>
          )}

          {step === 'error' && (
            <div className="migration-error">
              <div className="error-icon">❌</div>
              <h4>Migration Failed</h4>
              <p className="error-message">{error}</p>
              <button className="retry-button" onClick={() => setStep('confirm')}>
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

