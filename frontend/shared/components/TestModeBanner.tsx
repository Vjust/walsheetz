/**
 * Test Mode Banner Component
 *
 * Displays a banner when test mode is active (VITE_TEST_AUTH_BYPASS=true)
 * Shows warning and provides button to clear test data
 */

import React, { useState } from 'react';
import { isAuthBypassed } from '@lib/spreadsheet/utils/testMode';

export function TestModeBanner() {
  const [showDetails, setShowDetails] = useState(false);

  // Don't render if not in test mode
  if (!isAuthBypassed()) {
    return null;
  }

  const handleClearData = () => {
    if (confirm('Clear all test data? This will delete all test spreadsheets from localStorage.')) {
      const testKey = 'walsheetz_test_spreadsheets';
      localStorage.removeItem(testKey);
      console.log('Test data cleared');
      alert('Test data cleared successfully!');
      window.location.reload();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: '#ff9800',
        color: 'white',
        padding: '8px 16px',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        fontSize: '14px',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '12px', fontWeight: 700 }}>TEST</span>
        <div>
          <strong>Test Mode Active</strong>
          <span style={{ marginLeft: '12px', opacity: 0.9 }}>
            Wallet & Blockchain Bypassed
          </span>
          {showDetails && (
            <div style={{ marginTop: '4px', fontSize: '12px', opacity: 0.9 }}>
              Data is stored in localStorage only. Blockchain and Walrus features are disabled.
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button
          onClick={() => setShowDetails(!showDetails)}
          style={{
            backgroundColor: 'rgba(255,255,255,0.2)',
            border: '1px solid rgba(255,255,255,0.3)',
            color: 'white',
            padding: '4px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500'
          }}
        >
          {showDetails ? 'Hide' : 'Info'}
        </button>
        <button
          onClick={handleClearData}
          style={{
            backgroundColor: 'rgba(255,255,255,0.2)',
            border: '1px solid rgba(255,255,255,0.3)',
            color: 'white',
            padding: '4px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500'
          }}
        >
          Clear Test Data
        </button>
      </div>
    </div>
  );
}
