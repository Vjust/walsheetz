import React, { useState, useEffect } from 'react';
import { collaborationService } from '../../services/CollaborationService.js';
import '../styles/collaboration.css';

/**
 * Collaboration component for real-time user presence and cell highlighting via gRPC
 */
export function Collaboration({ blockchainAdapter, isWalletConnected, onConnectWallet }) {
  const [users, setUsers] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lockedCells, setLockedCells] = useState(new Set());
  const [currentUser, setCurrentUser] = useState(null);
  const [showConflictNotification, setShowConflictNotification] = useState(false);
  const [conflictCell, setConflictCell] = useState('');
  const [networkStatus, setNetworkStatus] = useState(null);

  useEffect(() => {
    if (!blockchainAdapter) return;

    // Set up event listeners for gRPC-based collaboration
    const handleCollaborationUpdate = () => {
      const state = blockchainAdapter.getCollaborationState();
      
      if (state.enabled) {
        setConnectionStatus('connected');
        setUsers(state.activeUsers || []);
        setCurrentUser(state.currentUser);
        
        // Update locked cells
        const lockedCellsSet = new Set();
        Object.keys(state.lockedCells || {}).forEach(cellRef => {
          lockedCellsSet.add(cellRef);
        });
        setLockedCells(lockedCellsSet);
      } else {
        setConnectionStatus('disconnected');
        setUsers([]);
        setCurrentUser(null);
        setLockedCells(new Set());
      }
    };

    // Listen to collaboration service events
    const handleCellLocked = (data) => {
      setLockedCells(prev => new Set([...prev, data.cellRef]));
      console.log(`Cell ${data.cellRef} locked by ${data.userId}`);
    };

    const handleCellUnlocked = (data) => {
      setLockedCells(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.cellRef);
        return newSet;
      });
      console.log(`Cell ${data.cellRef} unlocked`);
    };

    const handleUserJoined = (data) => {
      console.log(`${data.userName} joined the collaboration`);
      handleCollaborationUpdate();
    };

    const handleUserLeft = (data) => {
      console.log(`${data.userName} left the collaboration`);
      handleCollaborationUpdate();
    };

    const handleNetworkUpdate = (data) => {
      setNetworkStatus(data);
    };

    const handleError = (error) => {
      console.error('Collaboration error:', error);
      if (error.type === 'streamError') {
        setConnectionStatus('error');
      }
    };

    const handleReconnected = (data) => {
      console.log('Collaboration stream reconnected');
      setConnectionStatus('connected');
    };

    // Attach event listeners to collaboration service
    collaborationService.on('cellLocked', handleCellLocked);
    collaborationService.on('cellUnlocked', handleCellUnlocked);
    collaborationService.on('userJoined', handleUserJoined);
    collaborationService.on('userLeft', handleUserLeft);
    collaborationService.on('networkUpdate', handleNetworkUpdate);
    collaborationService.on('error', handleError);
    collaborationService.on('reconnected', handleReconnected);

    // Initial state update
    handleCollaborationUpdate();

    // Subscribe to real-time blockchain events instead of polling
    let eventSubscription;
    if (collaborationService.subscribeToBlockchainEvents) {
      eventSubscription = collaborationService.subscribeToBlockchainEvents(spreadsheetId, {
        onCellEvent: handleCollaborationUpdate,
        onUserEvent: handleCollaborationUpdate,
        onVersionUpdate: handleCollaborationUpdate
      });
    } else {
      // Fallback to periodic updates only if event subscription not available
      console.warn('[Collaboration] Event subscription not available, falling back to periodic updates');
      var fallbackInterval = setInterval(handleCollaborationUpdate, 30000); // Reduced from 5s to 30s
    }

    // Cleanup
    return () => {
      collaborationService.off('cellLocked', handleCellLocked);
      collaborationService.off('cellUnlocked', handleCellUnlocked);
      collaborationService.off('userJoined', handleUserJoined);
      collaborationService.off('userLeft', handleUserLeft);
      collaborationService.off('networkUpdate', handleNetworkUpdate);
      collaborationService.off('error', handleError);
      collaborationService.off('reconnected', handleReconnected);
      
      // Unsubscribe from blockchain events
      if (eventSubscription && typeof eventSubscription === 'function') {
        eventSubscription(); // Call unsubscribe function
      }
      
      // Clear fallback interval if it exists
      if (typeof fallbackInterval !== 'undefined') {
        clearInterval(fallbackInterval);
      }
    };
  }, [blockchainAdapter]);

  // Handle wallet connection for collaboration
  const handleConnectWallet = async () => {
    try {
      await onConnectWallet();
      // Collaboration will auto-connect when wallet connects
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  };

  // Get user avatar initials
  const getUserInitials = (userName) => {
    return userName
      .split(' ')
      .map(name => name.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Get user color class
  const getUserColorClass = (index) => {
    const colors = ['#FF6B6B', '#4ECDC4', '#FFCE54', '#AC7BFF', '#FF9AA2'];
    return colors[index % colors.length];
  };

  // Format cell reference for display
  const formatCellRef = (cellRef) => {
    return cellRef || 'Not editing';
  };

  // Get connection status text
  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return networkStatus ? 
          `Connected • Checkpoint ${networkStatus.checkpoint}` : 
          'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Connection Error';
      case 'disconnected':
      default:
        return 'Disconnected';
    }
  };

  return (
    <>
      {/* Wallet Connection Prompt */}
      {!isWalletConnected && (
        <div className="wallet-connection-prompt">
          <span>💰</span>
          <span>Connect your wallet for real-time collaboration and blockchain saves</span>
          <button onClick={handleConnectWallet}>
            Connect Wallet
          </button>
        </div>
      )}

      {/* User Presence Panel - Temporarily removed, will add collaboration later */}
      {/* <div className="collaboration-users">
        <h4>👥 Active Users ({users.length + 1})</h4>
        <div className="user-list">
          {currentUser && (
            <div className="user-item">
              <div 
                className="user-avatar" 
                style={{ backgroundColor: currentUser.color }}
              >
                {getUserInitials(currentUser.userName)}
              </div>
              <div className="user-info">
                <p className="user-name">{currentUser.userName} (You)</p>
                <p className="user-status">
                  <span className="user-active-cell">
                    Active
                  </span>
                </p>
              </div>
            </div>
          )}
          
          {users.map((user, index) => (
            <div key={user.userId} className="user-item">
              <div 
                className="user-avatar" 
                style={{ backgroundColor: getUserColorClass(index) }}
              >
                {getUserInitials(user.userName)}
              </div>
              <div className="user-info">
                <p className="user-name">{user.userName}</p>
                <p className="user-status">
                  {user.activeCell ? (
                    <span className="user-active-cell">
                      {formatCellRef(user.activeCell)}
                    </span>
                  ) : (
                    'Viewing'
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div> */}

      {/* Connection Status */}
      <div className={`connection-status ${connectionStatus}`}>
        <div className={`status-dot ${connectionStatus}`}></div>
        <span>{getConnectionStatusText()}</span>
        {connectionStatus === 'connected' && (
          <span>• gRPC streaming active</span>
        )}
        {connectionStatus === 'error' && (
          <span>• Attempting reconnection...</span>
        )}
      </div>

      {/* Cell Conflict Notification */}
      {showConflictNotification && (
        <div className="cell-conflict-notification">
          <h3>⚠️ Cell Locked</h3>
          <p>
            Cell {conflictCell} is currently being edited by another user. 
            Please wait or select a different cell.
          </p>
          <button onClick={() => setShowConflictNotification(false)}>
            OK
          </button>
        </div>
      )}
    </>
  );
}

export default Collaboration;