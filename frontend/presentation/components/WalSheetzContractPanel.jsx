// WalSheetz Contract Panel UI Component
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpreadsheetContext } from './SpreadsheetProvider.jsx';

const WalSheetzContractPanel = ({ isOpen, onClose, walletConnection }) => {
  // Get spreadsheet context for cell insertion
  const { handleFormulaChange, currentCell } = useSpreadsheetContext();
  const [contracts, setContracts] = useState([]);
  const [selectedContract, setSelectedContract] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [methodArgs, setMethodArgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Load available contracts when panel opens
  useEffect(() => {
    if (isOpen) {
      loadContracts();
    }
  }, [isOpen]);

  const loadContracts = async () => {
    try {
      setLoading(true);
      // Import contract registry dynamically
      const { contractRegistry } = await import('../../../blockchain/sui-contract-registry.js');
      await contractRegistry.initialize();
      const contractList = contractRegistry.listAdapters();
      setContracts(contractList);
    } catch (error) {
      console.error('[WalSheetzPanel] Failed to load contracts:', error);
      setError('Failed to load contracts: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleContractSelect = (contract) => {
    setSelectedContract(contract);
    setSelectedMethod(null);
    setMethodArgs([]);
    setResult(null);
    setError(null);
  };

  const handleMethodSelect = (method) => {
    setSelectedMethod(method);
    // Initialize args array based on method parameters
    const args = method.parameters?.map(() => '') || [];
    setMethodArgs(args);
    setResult(null);
    setError(null);
  };

  const handleArgChange = (index, value) => {
    const newArgs = [...methodArgs];
    newArgs[index] = value;
    setMethodArgs(newArgs);
  };

  const generateFormulaString = () => {
    if (!selectedContract || !selectedMethod) return '';

    const contractId = selectedContract.id;
    const methodName = selectedMethod.name;
    const args = methodArgs.map(arg => `"${arg}"`).join(', ');

    if (selectedMethod.type === 'read') {
      return `=WZ.CONTRACT.CALL("${contractId}", "${methodName}"${args ? ', ' + args : ''})`;
    } else {
      return `=WZ.CONTRACT.EXEC("${contractId}", "${methodName}"${args ? ', ' + args : ''})`;
    }
  };

  const executeMethod = async () => {
    if (!selectedContract || !selectedMethod) return;

    try {
      setLoading(true);
      setError(null);

      const { browserWalletManager } = await import('../../services/BrowserWalletManager.js');

      if (selectedMethod.type === 'read') {
        // Execute read operation
        const { contractRegistry } = await import('../../../blockchain/sui-contract-registry.js');
        const result = await contractRegistry.buildReadCall(
          selectedContract.id,
          selectedMethod.name,
          methodArgs
        );
        setResult({ type: 'read', data: result });
      } else {
        // Execute write operation - requires wallet
        if (!walletConnection?.isConnected) {
          throw new Error('Wallet not connected. Please connect your wallet to execute transactions.');
        }

        const result = await browserWalletManager.executeContractMethod(
          selectedContract.id,
          selectedMethod.name,
          methodArgs
        );
        setResult({ type: 'write', data: result });
      }
    } catch (error) {
      console.error('[WalSheetzPanel] Method execution failed:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const copyFormula = () => {
    const formula = generateFormulaString();
    navigator.clipboard.writeText(formula).then(() => {
      // Could show a toast notification here
      console.log('Formula copied to clipboard:', formula);
    });
  };

  const insertFormulaIntoCell = () => {
    const formula = generateFormulaString();
    if (handleFormulaChange) {
      handleFormulaChange(formula);
      console.log(`Formula inserted into cell ${currentCell}:`, formula);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">WalSheetz DeFi Contracts</h2>
              <button
                onClick={onClose}
                className="text-white hover:text-gray-200 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex h-[calc(90vh-80px)]">
            {/* Sidebar - Contract List */}
            <div className="w-1/3 border-r border-gray-200 overflow-y-auto">
              <div className="p-4">
                <h3 className="font-semibold mb-3">Available Protocols</h3>
                {loading && contracts.length === 0 ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-gray-500 mt-2">Loading contracts...</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {contracts.map((contract) => (
                      <button
                        key={contract.id}
                        onClick={() => handleContractSelect(contract)}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                          selectedContract?.id === contract.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="font-medium">{contract.name}</div>
                        <div className="text-sm text-gray-500 mt-1">{contract.description}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          {contract.methodCount} methods • v{contract.version}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Main Panel */}
            <div className="flex-1 flex flex-col">
              {!selectedContract ? (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p>Select a protocol to view its methods</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col">
                  {/* Method Selection */}
                  <div className="p-4 border-b border-gray-200">
                    <h4 className="font-semibold mb-3">{selectedContract.name} Methods</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedContract.methods?.map((method) => (
                        <button
                          key={method.name}
                          onClick={() => handleMethodSelect(method)}
                          className={`text-left p-3 rounded-lg border transition-colors ${
                            selectedMethod?.name === method.name
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              method.type === 'read'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-orange-100 text-orange-800'
                            }`}>
                              {method.type}
                            </span>
                            <span className="font-medium">{method.name}</span>
                          </div>
                          <div className="text-sm text-gray-500 mt-1">{method.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Method Parameters */}
                  {selectedMethod && (
                    <div className="p-4 border-b border-gray-200">
                      <h5 className="font-semibold mb-3">Parameters</h5>
                      {selectedMethod.parameters?.length > 0 ? (
                        <div className="space-y-3">
                          {selectedMethod.parameters.map((param, index) => (
                            <div key={index}>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {param} *
                              </label>
                              <input
                                type="text"
                                value={methodArgs[index] || ''}
                                onChange={(e) => handleArgChange(index, e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder={`Enter ${param}`}
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500 italic">No parameters required</p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  {selectedMethod && (
                    <div className="p-4 border-b border-gray-200">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={executeMethod}
                          disabled={loading}
                          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                        >
                          {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                          Execute Method
                        </button>
                        <button
                          onClick={insertFormulaIntoCell}
                          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
                          title={`Insert formula into cell ${currentCell}`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                          Insert into {currentCell}
                        </button>
                        <button
                          onClick={copyFormula}
                          className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy Formula
                        </button>
                      </div>

                      {/* Formula Preview */}
                      <div className="mt-3 p-2 bg-gray-50 rounded border">
                        <div className="text-xs text-gray-500 mb-1">Formula:</div>
                        <code className="text-sm font-mono text-gray-800">{generateFormulaString()}</code>
                      </div>
                    </div>
                  )}

                  {/* Results */}
                  <div className="flex-1 p-4 overflow-y-auto">
                    {error && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                        <div className="flex items-start">
                          <svg className="w-5 h-5 text-red-500 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div>
                            <h6 className="font-medium text-red-800">Execution Error</h6>
                            <p className="text-red-700 text-sm mt-1">{error}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {result && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div className="flex items-start">
                          <svg className="w-5 h-5 text-green-500 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div className="flex-1">
                            <h6 className="font-medium text-green-800">
                              {result.type === 'read' ? 'Read Result' : 'Transaction Executed'}
                            </h6>
                            <div className="mt-2">
                              <pre className="text-sm bg-white border rounded p-2 overflow-x-auto">
                                {JSON.stringify(result.data, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {!result && !error && selectedMethod && (
                      <div className="text-center text-gray-500 py-8">
                        <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <p>Click "Execute Method" to run the contract method</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default WalSheetzContractPanel;