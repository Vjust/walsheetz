import React, { useState, useEffect } from 'react';
import { GasEstimator } from './GasEstimator.jsx';
import { logger, LogComponent } from '../../utils/Logger.js';

/**
 * Transaction Modal Component
 * Provides a comprehensive interface for transaction approval with gas estimation
 */
export function TransactionModal({
  isOpen,
  onClose,
  onConfirm,
  onReject,
  title = 'Confirm Transaction',
  description = 'Please review and confirm the transaction',
  operation = 'default',
  initialGasBudget = 10000000,
  showGasEstimator = true
}) {
  const [gasSettings, setGasSettings] = useState({
    budget: initialGasBudget,
    estimate: null,
    price: 1000
  });
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmationStep, setConfirmationStep] = useState('review'); // review, estimating, confirming

  useEffect(() => {
    if (isOpen) {
      logger.info(LogComponent.UI_COMPONENT, 'transaction_modal_opened', 'Transaction modal opened', {
        operation,
        title
      });
    }
  }, [isOpen, operation, title]);

  const handleGasChange = (newGasSettings) => {
    setGasSettings(newGasSettings);
    logger.debug(LogComponent.UI_COMPONENT, 'gas_settings_updated', 'Gas settings updated', newGasSettings);
  };

  const handleConfirm = async () => {
    if (confirmationStep === 'review') {
      setConfirmationStep('estimating');
      return;
    }

    setIsConfirming(true);
    setConfirmationStep('confirming');

    try {
      logger.startTimer('transaction_confirmation');
      logger.info(LogComponent.UI_COMPONENT, 'transaction_confirming', 'User confirmed transaction', {
        operation,
        gasBudget: gasSettings.budget,
        estimatedCost: gasSettings.estimate?.estimatedCostSUI
      });

      // Call the confirmation handler
      const result = await onConfirm({
        gasBudget: gasSettings.budget,
        gasEstimate: gasSettings.estimate,
        operation
      });

      const duration = logger.endTimer('transaction_confirmation');
      logger.info(LogComponent.UI_COMPONENT, 'transaction_confirmed', 'Transaction confirmed successfully', {
        operation,
        duration,
        result: result?.success
      });

      // Close modal on success
      if (result?.success !== false) {
        onClose();
      }

    } catch (error) {
      logger.error(LogComponent.UI_COMPONENT, 'transaction_confirmation_error', 'Transaction confirmation failed', {
        error: error.message,
        operation
      });

      // Reset to review state on error
      setConfirmationStep('review');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleReject = () => {
    logger.info(LogComponent.UI_COMPONENT, 'transaction_rejected', 'User rejected transaction', {
      operation,
      step: confirmationStep
    });
    onReject && onReject();
    onClose();
  };

  const getStepContent = () => {
    switch (confirmationStep) {
      case 'estimating':
        return (
          <div className="step-content estimating">
            <div className="loading-spinner"></div>
            <h3>Estimating Gas Cost...</h3>
            <p>Please wait while we calculate the optimal gas settings.</p>
            <GasEstimator
              onGasChange={handleGasChange}
              initialGasBudget={gasSettings.budget}
            />
            <div className="step-actions">
              <button onClick={() => setConfirmationStep('review')} className="secondary-button">
                Back
              </button>
              <button onClick={handleConfirm} className="primary-button">
                Continue with Estimate
              </button>
            </div>
          </div>
        );

      case 'confirming':
        return (
          <div className="step-content confirming">
            <div className="loading-spinner"></div>
            <h3>Processing Transaction...</h3>
            <p>Please approve the transaction in your wallet.</p>
            <div className="transaction-progress">
              <div className="progress-step active">
                <span className="step-icon">1</span>
                <span>Estimate Gas</span>
              </div>
              <div className="progress-step active">
                <span className="step-icon">2</span>
                <span>Wallet Approval</span>
              </div>
              <div className="progress-step pending">
                <span className="step-icon">3</span>
                <span>Blockchain Confirmation</span>
              </div>
            </div>
          </div>
        );

      default: // review
        return (
          <div className="step-content review">
            <div className="transaction-summary">
              <h3>{title}</h3>
              <p>{description}</p>

              <div className="operation-details">
                <div className="detail-row">
                  <span>Operation:</span>
                  <span className="operation-type">{operation}</span>
                </div>
                {gasSettings.estimate && (
                  <div className="detail-row">
                    <span>Estimated Cost:</span>
                    <span className="cost-display">
                      {gasSettings.estimate.estimatedCostSUI} SUI
                    </span>
                  </div>
                )}
              </div>
            </div>

            {showGasEstimator && (
              <div className="gas-section">
                <h4>Gas Settings</h4>
                <GasEstimator
                  onGasChange={handleGasChange}
                  initialGasBudget={gasSettings.budget}
                />
              </div>
            )}

            <div className="step-actions">
              <button onClick={handleReject} className="secondary-button" disabled={isConfirming}>
                Cancel
              </button>
              <button
                onClick={() => setConfirmationStep('estimating')}
                className="primary-button"
                disabled={isConfirming}
              >
                Estimate Gas
              </button>
            </div>
          </div>
        );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="transaction-modal-overlay">
      <div className="transaction-modal">
        <div className="modal-header">
          <h2>{title}</h2>
          <button onClick={onClose} className="close-button" disabled={isConfirming}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {getStepContent()}
        </div>

        {confirmationStep === 'review' && (
          <div className="modal-footer">
            <div className="wallet-notice">
              <small>
                ⚠️ Your wallet will prompt for approval after you confirm here
              </small>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


