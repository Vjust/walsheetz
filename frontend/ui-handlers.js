// Enhanced UI handlers with blockchain integration
import { blockchainStorage, connectToWallet, saveToBlockchain, getStorageStatus } from './storage.js';
import { depositPanel } from './components/deposit-panel.js';
import { depositManager, getDepositStatus } from '../blockchain/deposit-manager.js';
import { sponsorService } from '../blockchain/sponsor-service.js';
import { walletManager } from '../blockchain/wallet-manager.js';

class WalSheetzUI {
  constructor() {
    this.isInitialized = false;
    this.editCounter = 0;
    this.saveTimer = null;
    this.lastSaveTime = null;
    
    // Initialize UI when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initialize());
    } else {
      this.initialize();
    }
  }

  // Initialize UI components
  initialize() {
    try {
      this.setupWalletUI();
      this.setupSaveStatus();
      this.setupEditCounter();
      this.setupNotifications();
      this.setupDevTools();
      this.setupHomeButton();
      
      // Update UI every second
      setInterval(() => this.updateUI(), 1000);
      
      this.isInitialized = true;
      console.log('WalSheetz UI initialized');
    } catch (error) {
      console.error('Failed to initialize UI:', error);
    }
  }

  // Setup wallet connection UI
  setupWalletUI() {
    // Create wallet connection panel
    const walletPanel = document.createElement('div');
    walletPanel.id = 'wallet-panel';
    walletPanel.className = 'wallet-panel';
    walletPanel.innerHTML = `
      <div class="wallet-content">
        <div class="wallet-status">
          <span id="wallet-status-icon">🦭</span>
          <span id="wallet-status-text">Not Connected</span>
        </div>
        <button id="wallet-connect-btn" class="btn btn-primary">Connect Wallet</button>
        <div id="wallet-info" class="wallet-info" style="display: none;">
          <div class="wallet-address" id="wallet-address"></div>
          <div class="wallet-balance-info" id="wallet-balance-info">
            <span class="balance-label">Balance:</span>
            <span class="balance-amount" id="wallet-balance">0.000 SUI</span>
          </div>
          <button id="wallet-deposit-btn" class="wallet-deposit-btn">💰 Deposit</button>
          <button id="wallet-disconnect-btn" class="btn btn-secondary">Disconnect</button>
        </div>
      </div>
    `;

    // Add to page (try multiple locations)
    const toolbar = document.querySelector('.luckysheet-toolbar') || 
                   document.querySelector('.toolbar') || 
                   document.body;
    
    if (toolbar) {
      toolbar.appendChild(walletPanel);
    }

    // Setup event listeners
    const connectBtn = document.getElementById('wallet-connect-btn');
    const disconnectBtn = document.getElementById('wallet-disconnect-btn');
    const depositBtn = document.getElementById('wallet-deposit-btn');

    if (connectBtn) {
      connectBtn.addEventListener('click', () => this.handleWalletConnect());
    }

    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', () => this.handleWalletDisconnect());
    }

    if (depositBtn) {
      depositBtn.addEventListener('click', () => this.handleDepositOpen());
    }

    // Make wallet UI update function global
    window.updateWalletUI = (data) => this.updateWalletUI(data);
  }

  // Setup save status indicator
  setupSaveStatus() {
    const saveStatus = document.createElement('div');
    saveStatus.id = 'save-status';
    saveStatus.className = 'save-status';
    saveStatus.innerHTML = `
      <div class="save-content">
        <span id="save-icon">💾</span>
        <span id="save-text">Ready</span>
        <span id="save-timer"></span>
      </div>
    `;

    // Add to page
    const toolbar = document.querySelector('.luckysheet-toolbar') || 
                   document.querySelector('.toolbar') || 
                   document.body;
    
    if (toolbar) {
      toolbar.appendChild(saveStatus);
    }

    // Setup manual save button
    const manualSaveBtn = document.createElement('button');
    manualSaveBtn.id = 'manual-save-btn';
    manualSaveBtn.className = 'btn btn-success';
    manualSaveBtn.textContent = 'Save Now';
    manualSaveBtn.addEventListener('click', () => this.handleManualSave());
    
    if (toolbar) {
      toolbar.appendChild(manualSaveBtn);
    }

    // Make save status update function global
    window.updateSaveStatus = (status, data) => this.updateSaveStatus(status, data);
  }

  // Setup edit counter
  setupEditCounter() {
    const editCounter = document.createElement('div');
    editCounter.id = 'edit-counter';
    editCounter.className = 'edit-counter';
    editCounter.innerHTML = `
      <div class="edit-content">
        <span id="edit-icon">✏️</span>
        <span id="edit-count">0</span>
        <span class="edit-label">edits</span>
      </div>
    `;

    // Add to page
    const toolbar = document.querySelector('.luckysheet-toolbar') || 
                   document.querySelector('.toolbar') || 
                   document.body;
    
    if (toolbar) {
      toolbar.appendChild(editCounter);
    }

    // Make edit counter update function global
    window.updateEditCounter = (count) => this.updateEditCounter(count);
  }

  // Setup notifications
  setupNotifications() {
    const notificationContainer = document.createElement('div');
    notificationContainer.id = 'notification-container';
    notificationContainer.className = 'notification-container';
    document.body.appendChild(notificationContainer);

    // Make notification function global
    window.showNotification = (message, type) => this.showNotification(message, type);
  }

  // Setup developer tools
  setupDevTools() {
    // Enhanced dev tools with blockchain features
    window.devTools = {
      // Existing functions
      forceSave: () => this.handleManualSave(),
      inspectRAM: () => localStorage,
      listBlobs: () => this.listStoredVersions(),
      reset: () => this.resetStorage(),
      getStatus: () => getStorageStatus(),
      toggleArctic: () => this.toggleTheme(),
      
      // New blockchain functions
      connectWallet: (walletName) => connectToWallet(walletName),
      getWalletInfo: () => blockchainStorage.getWalletInfo(),
      getVersionStats: () => blockchainStorage.getVersionStats(),
      getBatchStatus: () => blockchainStorage.getBatchStatus(),
      forceBlockchainSave: () => saveToBlockchain(),
      inspectVersions: (row, col) => blockchainStorage.getCellHistory(row, col),
      
      // Testing functions
      simulateEdits: (count = 5) => this.simulateEdits(count),
      testWalletConnection: () => this.testWalletConnection()
    };

    console.log('🦭 WalSheetz Developer Tools Available:');
    console.log('devTools.forceSave() - Manual save');
    console.log('devTools.connectWallet() - Connect wallet');
    console.log('devTools.getStatus() - Get system status');
    console.log('devTools.inspectVersions(row, col) - Get cell history');
    console.log('devTools.simulateEdits(count) - Simulate cell edits');
  }

  // Setup home button (preserve existing functionality)
  setupHomeButton() {
    const homeBtn = document.getElementById('home-btn');
    if (homeBtn) {
      homeBtn.addEventListener('click', () => {
        // Redirect to the app's homepage
        window.location.href = './homepage.html';
      });
    }
  }

  // Handle wallet connection
  async handleWalletConnect() {
    try {
      const connectBtn = document.getElementById('wallet-connect-btn');
      if (connectBtn) {
        connectBtn.disabled = true;
        connectBtn.textContent = 'Connecting...';
      }

      const result = await connectToWallet();
      
      if (!result.success) {
        this.showNotification('Failed to connect wallet: ' + result.error, 'error');
      }
    } catch (error) {
      console.error('Wallet connection error:', error);
      this.showNotification('Wallet connection failed', 'error');
    } finally {
      const connectBtn = document.getElementById('wallet-connect-btn');
      if (connectBtn) {
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect Wallet';
      }
    }
  }

  // Handle wallet disconnection
  async handleWalletDisconnect() {
    try {
      await blockchainStorage.disconnectWallet();
    } catch (error) {
      console.error('Wallet disconnection error:', error);
      this.showNotification('Failed to disconnect wallet', 'error');
    }
  }

  // Handle deposit panel opening
  handleDepositOpen() {
    try {
      // Check if wallet is connected
      const walletInfo = walletManager.getWalletInfo();
      if (!walletInfo.isConnected) {
        this.showNotification('Please connect your wallet first', 'warning');
        return;
      }

      // Show deposit panel
      depositPanel.show();
    } catch (error) {
      console.error('Failed to open deposit panel:', error);
      this.showNotification('Failed to open deposit panel', 'error');
    }
  }

  // Handle manual save
  async handleManualSave() {
    try {
      const saveBtn = document.getElementById('manual-save-btn');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }

      const result = await saveToBlockchain();
      
      if (result.success) {
        this.showNotification('Saved to blockchain successfully!', 'success');
      }
    } catch (error) {
      console.error('Manual save error:', error);
      this.showNotification('Save failed: ' + error.message, 'error');
    } finally {
      const saveBtn = document.getElementById('manual-save-btn');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Now';
      }
    }
  }

  // Update wallet UI
  updateWalletUI(walletData) {
    const statusIcon = document.getElementById('wallet-status-icon');
    const statusText = document.getElementById('wallet-status-text');
    const connectBtn = document.getElementById('wallet-connect-btn');
    const walletInfo = document.getElementById('wallet-info');
    const walletAddress = document.getElementById('wallet-address');
    const walletBalance = document.getElementById('wallet-balance');

    if (walletData && walletData.address) {
      // Connected state
      if (statusIcon) statusIcon.textContent = '🔗';
      if (statusText) statusText.textContent = 'Connected';
      if (connectBtn) connectBtn.style.display = 'none';
      if (walletInfo) walletInfo.style.display = 'block';
      if (walletAddress) {
        walletAddress.textContent = `${walletData.address.slice(0, 6)}...${walletData.address.slice(-4)}`;
        walletAddress.title = walletData.address;
      }

      // Update deposit balance
      if (walletBalance) {
        try {
          const depositStatus = getDepositStatus();
          if (depositStatus.connected) {
            walletBalance.textContent = `${depositStatus.balance.toFixed(3)} SUI`;
            walletBalance.style.color = depositStatus.needsTopUp ? '#d93025' : '#137333';
          } else {
            walletBalance.textContent = '0.000 SUI';
            walletBalance.style.color = '#666';
          }
        } catch (error) {
          walletBalance.textContent = '0.000 SUI';
          walletBalance.style.color = '#666';
        }
      }
    } else {
      // Disconnected state
      if (statusIcon) statusIcon.textContent = '🦭';
      if (statusText) statusText.textContent = 'Not Connected';
      if (connectBtn) connectBtn.style.display = 'block';
      if (walletInfo) walletInfo.style.display = 'none';
    }
  }

  // Update save status
  updateSaveStatus(status, data = {}) {
    const saveIcon = document.getElementById('save-icon');
    const saveText = document.getElementById('save-text');
    const saveTimer = document.getElementById('save-timer');

    switch (status) {
      case 'saving':
        if (saveIcon) saveIcon.textContent = '🔄';
        if (saveText) saveText.textContent = 'Saving...';
        break;
      case 'saved':
        if (saveIcon) saveIcon.textContent = '✅';
        if (saveText) saveText.textContent = 'Saved';
        this.lastSaveTime = Date.now();
        if (data.changeCount) {
          if (saveText) saveText.textContent = `Saved ${data.changeCount} changes`;
        }
        break;
      case 'error':
        if (saveIcon) saveIcon.textContent = '❌';
        if (saveText) saveText.textContent = 'Save Failed';
        break;
      default:
        if (saveIcon) saveIcon.textContent = '💾';
        if (saveText) saveText.textContent = 'Ready';
    }
  }

  // Update edit counter
  updateEditCounter(count) {
    this.editCounter = count;
    const editCount = document.getElementById('edit-count');
    if (editCount) {
      editCount.textContent = count;
      
      // Highlight when approaching save threshold
      if (count >= 3) {
        editCount.style.color = '#ff6b6b';
        editCount.style.fontWeight = 'bold';
      } else {
        editCount.style.color = '';
        editCount.style.fontWeight = '';
      }
    }
  }

  // Update UI periodically
  updateUI() {
    // Update save timer
    const saveTimer = document.getElementById('save-timer');
    if (saveTimer && this.lastSaveTime) {
      const timeSince = Math.floor((Date.now() - this.lastSaveTime) / 1000);
      saveTimer.textContent = `(${timeSince}s ago)`;
    }

    // Update status from blockchain storage
    try {
      const status = getStorageStatus();
      
      // Update wallet UI if needed
      if (status.wallet) {
        this.updateWalletUI(status.wallet.connected ? status.wallet : null);
      }
    } catch (error) {
      // Ignore errors during periodic updates
    }
  }

  // Show notification
  showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
      <span class="notification-message">${message}</span>
      <button class="notification-close">×</button>
    `;

    container.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);

    // Manual close
    const closeBtn = notification.querySelector('.notification-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      });
    }
  }

  // Helper functions for dev tools
  listStoredVersions() {
    const status = getStorageStatus();
    return status.versions;
  }

  resetStorage() {
    if (confirm('Are you sure you want to reset all storage? This will clear local backups.')) {
      localStorage.clear();
      location.reload();
    }
  }

  toggleTheme() {
    document.body.classList.toggle('arctic-theme');
  }

  // Testing functions
  simulateEdits(count = 5) {
    console.log(`Simulating ${count} cell edits...`);
    
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const row = Math.floor(Math.random() * 10);
        const col = Math.floor(Math.random() * 10);
        const value = `Test${i + 1}`;
        
        blockchainStorage.trackCellEdit(row, col, null, value, {
          timestamp: Date.now(),
          test: true
        });
        
        console.log(`Edit ${i + 1}: Cell ${row},${col} = ${value}`);
      }, i * 100);
    }
  }

  async testWalletConnection() {
    try {
      console.log('Testing wallet connection...');
      const result = await connectToWallet();
      console.log('Connection result:', result);
      return result;
    } catch (error) {
      console.error('Wallet test failed:', error);
      return { success: false, error: error.message };
    }
  }
}

// Initialize UI
const walSheetzUI = new WalSheetzUI();

// Export for external use
export { walSheetzUI };
