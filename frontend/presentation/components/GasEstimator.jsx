import React, { useState, useEffect } from 'react';
import { logger, LogComponent } from '../../utils/Logger.js';

/**
 * Gas Estimator Component
 * Provides gas estimation and cost visibility for blockchain transactions
 */
export function GasEstimator({ onGasChange, initialGasBudget = 10000000 }) {
  const [gasEstimate, setGasEstimate] = useState(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [gasBudget, setGasBudget] = useState(initialGasBudget);
  const [estimateError, setEstimateError] = useState(null);
  const [gasPrice, setGasPrice] = useState(1000); // MIST per unit

  // Gas presets for different transaction types
  const gasPresets = {
    simple: { label: 'Simple Edit', budget: 5000000, description: 'Basic cell edit operations' },
    batch: { label: 'Batch Save', budget: 10000000, description: 'Multiple edits with batching' },
    create: { label: 'Create Spreadsheet', budget: 20000000, description: 'New spreadsheet creation' },
    complex: { label: 'Complex Operation', budget: 50000000, description: 'Version history, ownership changes' }
  };

  useEffect(() => {
    // Fetch current gas price
    fetchGasPrice();
  }, []);

  const fetchGasPrice = async () => {
    try {
      // This would typically fetch from the Sui RPC or GraphQL endpoint
      // For now, we'll use a default and simulate occasional updates
      const referencePrice = await getReferenceGasPrice();
      setGasPrice(referencePrice);
    } catch (error) {
      logger.warn(LogComponent.UI_COMPONENT, 'gas_price_fetch_failed', 'Failed to fetch gas price', {
        error: error.message
      });
    }
  };

  const getReferenceGasPrice = async () => {
    // Simulate gas price fetch - in real implementation this would call the blockchain
    return 1000; // 1000 MIST per gas unit
  };

  const estimateGas = async (operation = 'default') => {
    setIsEstimating(true);
    setEstimateError(null);

    try {
      logger.startTimer('gas_estimation');
      logger.info(LogComponent.UI_COMPONENT, 'gas_estimation_start', 'Starting gas estimation', { operation });

      // Simulate gas estimation API call
      const estimate = await simulateGasEstimation(operation);

      setGasEstimate(estimate);
      setGasBudget(estimate.recommendedBudget);

      // Notify parent component
      if (onGasChange) {
        onGasChange({
          budget: estimate.recommendedBudget,
          estimate: estimate,
          price: gasPrice
        });
      }

      const duration = logger.endTimer('gas_estimation');
      logger.info(LogComponent.UI_COMPONENT, 'gas_estimation_complete', 'Gas estimation completed', {
        operation,
        duration,
        estimatedCostSUI: estimate.estimatedCostSUI
      });

    } catch (error) {
      const errorMsg = 'Failed to estimate gas cost';
      setEstimateError(errorMsg);

      logger.error(LogComponent.UI_COMPONENT, 'gas_estimation_error', errorMsg, {
        error: error.message,
        operation
      });
    } finally {
      setIsEstimating(false);
    }
  };

  const simulateGasEstimation = async (operation) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // Base estimates for different operations
    const baseEstimates = {
      default: { computationCost: 3000000, storageCost: 2000000, storageRebate: 100000 },
      simple: { computationCost: 1000000, storageCost: 500000, storageRebate: 50000 },
      batch: { computationCost: 5000000, storageCost: 3000000, storageRebate: 200000 },
      create: { computationCost: 10000000, storageCost: 10000000, storageRebate: 500000 },
      complex: { computationCost: 20000000, storageCost: 30000000, storageRebate: 1000000 }
    };

    const base = baseEstimates[operation] || baseEstimates.default;
    const totalGasUsed = base.computationCost + base.storageCost - base.storageRebate;
    const estimatedCostSUI = (totalGasUsed / 1_000_000_000).toFixed(6);
    const recommendedBudget = Math.ceil(totalGasUsed * 1.2); // 20% buffer

    return {
      computationCost: base.computationCost,
      storageCost: base.storageCost,
      storageRebate: base.storageRebate,
      totalCost: totalGasUsed,
      totalGasUsed,
      gasPrice,
      estimatedCostSUI,
      recommendedBudget,
      isHighGas: totalGasUsed > 50000000,
      operation
    };
  };

  const handleGasBudgetChange = (newBudget) => {
    const budget = parseInt(newBudget);
    if (!isNaN(budget) && budget > 0) {
      setGasBudget(budget);
      if (onGasChange) {
        onGasChange({
          budget,
          estimate: gasEstimate,
          price: gasPrice
        });
      }
    }
  };

  const applyPreset = (presetKey) => {
    const preset = gasPresets[presetKey];
    if (preset) {
      setGasBudget(preset.budget);
      if (onGasChange) {
        onGasChange({
          budget: preset.budget,
          estimate: gasEstimate,
          price: gasPrice,
          preset: presetKey
        });
      }
    }
  };

  const formatCost = (costSUI) => {
    const num = parseFloat(costSUI);
    if (num < 0.001) {
      return `${(num * 1_000_000_000).toFixed(0)} MIST`;
    }
    return `${num.toFixed(6)} SUI`;
  };

  return (
    <div className="gas-estimator">
      <div className="gas-estimator-header">
        <h4>Gas Estimation</h4>
        <button
          onClick={() => estimateGas('default')}
          disabled={isEstimating}
          className="estimate-button"
        >
          {isEstimating ? 'Estimating...' : 'Estimate Gas'}
        </button>
      </div>

      {estimateError && (
        <div className="gas-error">
          <span className="error-icon">⚠️</span>
          {estimateError}
        </div>
      )}

      {gasEstimate && (
        <div className="gas-details">
          <div className="gas-cost-breakdown">
            <div className="cost-row">
              <span>Computation:</span>
              <span>{formatCost((gasEstimate.computationCost / 1_000_000_000).toFixed(6))}</span>
            </div>
            <div className="cost-row">
              <span>Storage:</span>
              <span>{formatCost((gasEstimate.storageCost / 1_000_000_000).toFixed(6))}</span>
            </div>
            <div className="cost-row rebate">
              <span>Storage Rebate:</span>
              <span>-{formatCost((gasEstimate.storageRebate / 1_000_000_000).toFixed(6))}</span>
            </div>
            <div className="cost-row total">
              <span>Estimated Total:</span>
              <span>{formatCost(gasEstimate.estimatedCostSUI)}</span>
            </div>
          </div>

          {gasEstimate.isHighGas && (
            <div className="high-gas-warning">
              <span className="warning-icon">⚠️</span>
              High gas cost detected. Consider batching operations.
            </div>
          )}
        </div>
      )}

      <div className="gas-budget-controls">
        <label htmlFor="gas-budget">Gas Budget:</label>
        <input
          id="gas-budget"
          type="number"
          value={gasBudget}
          onChange={(e) => handleGasBudgetChange(e.target.value)}
          min="1000000"
          step="1000000"
          className="gas-budget-input"
        />
        <span className="budget-unit">MIST</span>
      </div>

      <div className="gas-presets">
        <h5>Quick Presets:</h5>
        <div className="preset-buttons">
          {Object.entries(gasPresets).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className={`preset-button ${gasBudget === preset.budget ? 'active' : ''}`}
              title={preset.description}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="gas-info">
        <small>
          Current gas price: {(gasPrice / 1_000_000_000).toFixed(6)} SUI per unit
          <br />
          Budget includes 20% buffer for price fluctuations
        </small>
      </div>
    </div>
  );
}


