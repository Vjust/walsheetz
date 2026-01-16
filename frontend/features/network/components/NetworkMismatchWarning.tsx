import React, { useState, useEffect } from 'react';
import { useNetwork } from '@shared/providers/NetworkProvider';
import { getCurrentConfig } from '@dreamlit/walrus-sui-core/blockchain';
import '../styles/NetworkMismatchWarning.css';

export function NetworkMismatchWarning({ walletChain }) {
  const { network } = useNetwork();
  const [showWarning, setShowWarning] = useState(false);
  const [configuredNetwork, setConfiguredNetwork] = useState(null);

  useEffect(() => {
    // Check if configured network matches what we think it should be
    const config = getCurrentConfig();
    const configNet = config.environment;
    setConfiguredNetwork(configNet);

    // Show warning if there's a mismatch
    if (network !== configNet) {
      setShowWarning(true);
    } else {
      setShowWarning(false);
    }
  }, [network, walletChain]);

  if (!showWarning) return null;

  return (
    <div className="network-mismatch-warning">
      <div className="network-mismatch-content">
        <span className="warning-icon">!</span>
        <div className="warning-message">
          <strong>Network Configuration Mismatch</strong>
          <p>
            You selected <strong>{network}</strong> but wallet is on{' '}
            <strong>{configuredNetwork}</strong>.
          </p>
          <p>Please reload the page to apply network changes.</p>
        </div>
        <button className="reload-button" onClick={() => window.location.reload()}>
          Reload Now
        </button>
      </div>
    </div>
  );
}
