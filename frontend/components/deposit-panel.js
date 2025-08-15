// Deposit panel component for WalSheetz
import { depositManager, getDepositStatus } from '../../blockchain/deposit-manager.js';
import { gasEstimator, getCurrentGasPrice, getEstimatedOperations } from '../../blockchain/gas-estimator.js';
import { walletManager } from '../../blockchain/wallet-manager.js';

class DepositPanel {
  constructor() {
    this.isVisible = false;
    this.currentGasPrice = null;
    this.estimatedOperations = null;
    this.panel = null;
    
    // Initialize UI
    this.createPanel();
    this.setupEventListeners();
    
    // Update gas price periodically
    this.updateGasPrice();
    setInterval(() => this.updateGasPrice(), 30000); // Every 30 seconds
  }

  // Create the deposit panel UI
  createPanel() {
    this.panel = document.createElement('div');
    this.panel.id = 'deposit-panel';
    this.panel.className = 'deposit-panel';
    this.panel.style.display = 'none';
    
    this.panel.innerHTML = `
      <div class="deposit-content">
        <div class="deposit-header">
          <h3>💰 Deposit SUI for Gas</h3>
          <button class="deposit-close" id="deposit-close">×</button>
        </div>
        
        <div class="deposit-body">
          <!-- Current Balance -->
          <div class="balance-section">
            <div class="balance-display">
              <span class="balance-label">Current Balance:</span>
              <span class="balance-amount" id="current-balance">0.000 SUI</span>
            </div>
            <div class="balance-mist" id="current-balance-mist">0 MIST</div>
          </div>
          
          <!-- Gas Price Info -->
          <div class="gas-info-section">
            <div class="gas-price">
              <span class="gas-label">Current Gas Price:</span>
              <span class="gas-amount" id="current-gas-price">Loading...</span>
            </div>
            <div class="gas-epoch" id="gas-epoch-info">Epoch: Loading...</div>
          </div>
          
          <!-- Estimated Operations -->
          <div class="operations-section">
            <h4>Estimated Operations</h4>
            <div class="operations-grid">
              <div class="operation-item">
                <span class="operation-name">Single Edits:</span>
                <span class="operation-count" id="op-single-edit">~0</span>
              </div>
              <div class="operation-item">
                <span class="operation-name">Batch Saves:</span>
                <span class="operation-count" id="op-batch-save">~0</span>
              </div>
              <div class="operation-item">
                <span class="operation-name">Version Restores:</span>
                <span class="operation-count" id="op-version-restore">~0</span>
              </div>
              <div class="operation-item">
                <span class="operation-name">Walrus Storage:</span>
                <span class="operation-count" id="op-walrus-storage">~0</span>
              </div>
            </div>
          </div>
          
          <!-- Deposit Form -->
          <div class="deposit-form">
            <h4>Add Funds</h4>
            <div class="deposit-input-group">
              <input 
                type="number" 
                id="deposit-amount" 
                class="deposit-input" 
                placeholder="0.1" 
                min="0.002" 
                step="0.001"
              >
              <span class="input-suffix">SUI</span>
            </div>
            
            <!-- Quick Deposit Buttons -->
            <div class="quick-deposit">
              <button class="quick-btn" data-amount="0.01">0.01 SUI</button>
              <button class="quick-btn" data-amount="0.05">0.05 SUI</button>
              <button class="quick-btn" data-amount="0.1">0.1 SUI</button>
              <button class="quick-btn" data-amount="0.5">0.5 SUI</button>
            </div>
            
            <!-- Cost Preview -->
            <div class="cost-preview" id="cost-preview" style="display: none;">
              <div class="preview-item">
                <span>Amount:</span>
                <span id="preview-amount">0 SUI</span>
              </div>
              <div class="preview-item">
                <span>Est. Operations:</span>
                <span id="preview-operations">~0 edits</span>
              </div>
              <div class="preview-item">
                <span>New Balance:</span>
                <span id="preview-new-balance">0 SUI</span>
              </div>
            </div>
            
            <!-- Action Buttons -->
            <div class="deposit-actions">
              <button class="btn btn-primary" id="deposit-btn" disabled>
                Deposit SUI
              </button>
              <button class="btn btn-secondary" id="withdraw-toggle-btn">
                Withdraw
              </button>
            </div>
          </div>

          <!-- Withdrawal Form (Hidden by default) -->
          <div class="withdraw-form" id="withdraw-form" style="display: none;">
            <h4>💸 Withdraw SUI</h4>
            <div class="deposit-input-group">
              <input 
                type="number" 
                id="withdraw-amount" 
                class="deposit-input" 
                placeholder="0.05" 
                min="0.001" 
                step="0.001"
              >
              <span class="input-suffix">SUI</span>
            </div>
            
            <!-- Withdraw Preview -->
            <div class="cost-preview" id="withdraw-preview" style="display: none;">
              <div class="preview-item">
                <span>Withdraw Amount:</span>
                <span id="withdraw-preview-amount">0 SUI</span>
              </div>
              <div class="preview-item">
                <span>Remaining Balance:</span>
                <span id="withdraw-preview-balance">0 SUI</span>
              </div>
            </div>
            
            <!-- Withdraw Actions -->
            <div class="deposit-actions">
              <button class="btn btn-primary" id="withdraw-confirm-btn" disabled>
                Confirm Withdrawal
              </button>
              <button class="btn btn-secondary" id="withdraw-cancel-btn">
                Cancel
              </button>
            </div>
          </div>
          
          <!-- Suggestions -->
          <div class="suggestions-section" id="suggestions-section" style="display: none;">
            <h4>💡 Suggested Amounts</h4>
            <div class="suggestions-grid" id="suggestions-grid">
              <!-- Will be populated dynamically -->
            </div>
          </div>
          
          <!-- Transaction History -->
          <div class="history-section">
            <h4>Recent Activity</h4>
            <div class="history-list" id="deposit-history">
              <div class="history-empty">No recent activity</div>
            </div>
          </div>
        </div>
        
        <div class="deposit-footer">
          <div class="footer-note">
            💡 Pre-deposit SUI to avoid wallet popups for each edit
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.panel);
  }

  // Setup event listeners
  setupEventListeners() {
    // Close button
    this.panel.querySelector('#deposit-close').addEventListener('click', () => {
      this.hide();
    });

    // Click outside to close
    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) {
        this.hide();
      }
    });

    // Deposit amount input
    const depositInput = this.panel.querySelector('#deposit-amount');
    depositInput.addEventListener('input', () => {
      this.updatePreview();
      this.validateDeposit();
    });

    // Quick deposit buttons
    this.panel.querySelectorAll('.quick-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const amount = parseFloat(e.target.dataset.amount);
        depositInput.value = amount;
        this.updatePreview();
        this.validateDeposit();
      });
    });

    // Deposit button
    this.panel.querySelector('#deposit-btn').addEventListener('click', () => {
      this.handleDeposit();
    });

    // Withdraw toggle button
    this.panel.querySelector('#withdraw-toggle-btn').addEventListener('click', () => {
      this.toggleWithdrawForm();
    });

    // Withdraw amount input
    const withdrawInput = this.panel.querySelector('#withdraw-amount');
    withdrawInput.addEventListener('input', () => {
      this.updateWithdrawPreview();
      this.validateWithdraw();
    });

    // Withdraw confirm button
    this.panel.querySelector('#withdraw-confirm-btn').addEventListener('click', () => {
      this.handleWithdraw();
    });

    // Withdraw cancel button
    this.panel.querySelector('#withdraw-cancel-btn').addEventListener('click', () => {
      this.hideWithdrawForm();
    });

    // Listen for deposit events
    depositManager.on('deposit', (data) => {
      this.onDepositSuccess(data);
    });

    depositManager.on('withdrawal', (data) => {
      this.onWithdrawalSuccess(data);
    });

    depositManager.on('lowBalance', (data) => {
      this.onLowBalance(data);
    });
  }

  // Show the deposit panel
  async show() {
    this.isVisible = true;
    this.panel.style.display = 'flex';
    
    // Update all data
    await this.updateBalance();
    await this.updateGasPrice();
    await this.updateSuggestions();
    this.updateHistory();
    
    // Focus on input
    setTimeout(() => {
      this.panel.querySelector('#deposit-amount').focus();
    }, 100);
  }

  // Hide the deposit panel
  hide() {
    this.isVisible = false;
    this.panel.style.display = 'none';
  }

  // Toggle panel visibility
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  // Update current balance display
  async updateBalance() {
    try {
      const status = getDepositStatus();
      
      if (status.connected) {
        this.panel.querySelector('#current-balance').textContent = 
          `${status.balance.toFixed(6)} SUI`;
        this.panel.querySelector('#current-balance-mist').textContent = 
          `${status.mistBalance.toLocaleString()} MIST`;
          
        // Update estimated operations based on current balance
        if (status.balance > 0) {
          const operations = await getEstimatedOperations(status.balance);
          if (operations.success) {
            this.updateOperationsDisplay(operations.operations);
          }
        }
      } else {
        this.panel.querySelector('#current-balance').textContent = 'Not Connected';
        this.panel.querySelector('#current-balance-mist').textContent = '0 MIST';
      }
    } catch (error) {
      console.error('Failed to update balance:', error);
    }
  }

  // Update gas price display
  async updateGasPrice() {
    try {
      const gasInfo = await getCurrentGasPrice();
      this.currentGasPrice = gasInfo;
      
      this.panel.querySelector('#current-gas-price').textContent = 
        `${gasInfo.gasPrice.toLocaleString()} MIST`;
      
      if (gasInfo.epochInfo) {
        this.panel.querySelector('#gas-epoch-info').textContent = 
          `Epoch ${gasInfo.epochInfo.epochId}`;
      }
    } catch (error) {
      console.error('Failed to update gas price:', error);
      this.panel.querySelector('#current-gas-price').textContent = 'Error loading';
    }
  }

  // Update operations display
  updateOperationsDisplay(operations) {
    this.panel.querySelector('#op-single-edit').textContent = 
      `~${operations.singleEdit?.toLocaleString() || 0}`;
    this.panel.querySelector('#op-batch-save').textContent = 
      `~${operations.batchSave?.toLocaleString() || 0}`;
    this.panel.querySelector('#op-version-restore').textContent = 
      `~${operations.versionRestore?.toLocaleString() || 0}`;
    this.panel.querySelector('#op-walrus-storage').textContent = 
      `~${operations.walrusStorage?.toLocaleString() || 0}`;
  }

  // Update deposit preview
  async updatePreview() {
    const amountInput = this.panel.querySelector('#deposit-amount');
    const preview = this.panel.querySelector('#cost-preview');
    const amount = parseFloat(amountInput.value);
    
    if (amount && amount > 0) {
      preview.style.display = 'block';
      
      // Update preview values
      this.panel.querySelector('#preview-amount').textContent = `${amount} SUI`;
      
      // Calculate estimated operations
      const operations = await getEstimatedOperations(amount);
      if (operations.success) {
        this.panel.querySelector('#preview-operations').textContent = 
          `~${operations.operations.singleEdit} edits`;
      }
      
      // Calculate new balance
      const currentStatus = getDepositStatus();
      const newBalance = currentStatus.balance + amount;
      this.panel.querySelector('#preview-new-balance').textContent = 
        `${newBalance.toFixed(6)} SUI`;
    } else {
      preview.style.display = 'none';
    }
  }

  // Validate deposit amount
  validateDeposit() {
    const amountInput = this.panel.querySelector('#deposit-amount');
    const depositBtn = this.panel.querySelector('#deposit-btn');
    const amount = parseFloat(amountInput.value);
    
    const isValid = amount && amount >= 0.002; // Minimum deposit
    depositBtn.disabled = !isValid;
    
    if (amount && amount < 0.002) {
      amountInput.setCustomValidity('Minimum deposit is 0.002 SUI');
    } else {
      amountInput.setCustomValidity('');
    }
  }

  // Handle deposit
  async handleDeposit() {
    try {
      const amountInput = this.panel.querySelector('#deposit-amount');
      const depositBtn = this.panel.querySelector('#deposit-btn');
      const amount = parseFloat(amountInput.value);
      
      if (!amount || amount < 0.002) {
        throw new Error('Invalid deposit amount');
      }

      const walletInfo = walletManager.getWalletInfo();
      if (!walletInfo.isConnected) {
        throw new Error('Wallet not connected');
      }

      // Disable button and show loading
      depositBtn.disabled = true;
      depositBtn.textContent = 'Processing...';

      // For now, we'll simulate the deposit since we need actual SUI transactions
      // In production, this would create a real transaction to transfer SUI
      console.log('Simulating deposit of', amount, 'SUI for', walletInfo.address);
      
      const result = await depositManager.deposit(walletInfo.address, amount);
      
      if (result.success) {
        amountInput.value = '';
        this.updatePreview();
        this.showNotification(`Successfully deposited ${amount} SUI`, 'success');
      }
    } catch (error) {
      console.error('Deposit failed:', error);
      this.showNotification(`Deposit failed: ${error.message}`, 'error');
    } finally {
      const depositBtn = this.panel.querySelector('#deposit-btn');
      depositBtn.disabled = false;
      depositBtn.textContent = 'Deposit SUI';
    }
  }

  // Toggle withdrawal form visibility
  toggleWithdrawForm() {
    const withdrawForm = this.panel.querySelector('#withdraw-form');
    const depositForm = this.panel.querySelector('.deposit-form');
    
    if (withdrawForm.style.display === 'none') {
      this.showWithdrawForm();
    } else {
      this.hideWithdrawForm();
    }
  }

  // Show withdrawal form
  showWithdrawForm() {
    const withdrawForm = this.panel.querySelector('#withdraw-form');
    const depositForm = this.panel.querySelector('.deposit-form');
    
    withdrawForm.style.display = 'block';
    depositForm.style.display = 'none';
    
    // Focus on withdraw input
    setTimeout(() => {
      this.panel.querySelector('#withdraw-amount').focus();
    }, 100);
  }

  // Hide withdrawal form
  hideWithdrawForm() {
    const withdrawForm = this.panel.querySelector('#withdraw-form');
    const depositForm = this.panel.querySelector('.deposit-form');
    
    withdrawForm.style.display = 'none';
    depositForm.style.display = 'block';
    
    // Clear form
    this.panel.querySelector('#withdraw-amount').value = '';
    this.updateWithdrawPreview();
  }

  // Update withdrawal preview
  updateWithdrawPreview() {
    const amountInput = this.panel.querySelector('#withdraw-amount');
    const preview = this.panel.querySelector('#withdraw-preview');
    const amount = parseFloat(amountInput.value);
    
    if (amount && amount > 0) {
      preview.style.display = 'block';
      
      // Update preview values
      this.panel.querySelector('#withdraw-preview-amount').textContent = `${amount} SUI`;
      
      // Calculate remaining balance
      const currentStatus = getDepositStatus();
      const remainingBalance = Math.max(0, currentStatus.balance - amount);
      this.panel.querySelector('#withdraw-preview-balance').textContent = 
        `${remainingBalance.toFixed(6)} SUI`;
    } else {
      preview.style.display = 'none';
    }
  }

  // Validate withdrawal amount
  validateWithdraw() {
    const amountInput = this.panel.querySelector('#withdraw-amount');
    const confirmBtn = this.panel.querySelector('#withdraw-confirm-btn');
    const amount = parseFloat(amountInput.value);
    
    const currentStatus = getDepositStatus();
    const isValid = amount && amount > 0 && amount <= currentStatus.balance;
    confirmBtn.disabled = !isValid;
    
    if (amount && amount > currentStatus.balance) {
      amountInput.setCustomValidity('Insufficient balance');
    } else if (amount && amount <= 0) {
      amountInput.setCustomValidity('Amount must be positive');
    } else {
      amountInput.setCustomValidity('');
    }
  }

  // Handle withdrawal
  async handleWithdraw() {
    try {
      const amountInput = this.panel.querySelector('#withdraw-amount');
      const confirmBtn = this.panel.querySelector('#withdraw-confirm-btn');
      const amount = parseFloat(amountInput.value);
      
      if (!amount || amount <= 0) {
        throw new Error('Invalid withdrawal amount');
      }

      const walletInfo = walletManager.getWalletInfo();
      if (!walletInfo.isConnected) {
        throw new Error('Wallet not connected');
      }

      // Disable button and show loading
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Processing...';

      // For now, this simulates the withdrawal since we need actual SUI transactions
      console.log('Simulating withdrawal of', amount, 'SUI for', walletInfo.address);
      
      const result = await depositManager.withdraw(walletInfo.address, amount);
      
      if (result.success) {
        this.hideWithdrawForm();
        this.showNotification(`Successfully withdrew ${amount} SUI`, 'success');
      }
    } catch (error) {
      console.error('Withdrawal failed:', error);
      this.showNotification(`Withdrawal failed: ${error.message}`, 'error');
    } finally {
      const confirmBtn = this.panel.querySelector('#withdraw-confirm-btn');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm Withdrawal';
    }
  }

  // Update suggestions based on usage
  async updateSuggestions() {
    try {
      const walletInfo = walletManager.getWalletInfo();
      if (!walletInfo.isConnected) return;

      const suggestions = await depositManager.suggestDepositAmount(walletInfo.address);
      const suggestionsSection = this.panel.querySelector('#suggestions-section');
      const suggestionsGrid = this.panel.querySelector('#suggestions-grid');
      
      if (suggestions.basedOnTransactions > 0) {
        suggestionsSection.style.display = 'block';
        
        suggestionsGrid.innerHTML = `
          <div class="suggestion-item" data-amount="${suggestions.suggestions.light}">
            <div class="suggestion-label">Light Usage</div>
            <div class="suggestion-amount">${suggestions.suggestions.light.toFixed(3)} SUI</div>
            <div class="suggestion-desc">~3 days</div>
          </div>
          <div class="suggestion-item" data-amount="${suggestions.suggestions.moderate}">
            <div class="suggestion-label">Moderate Usage</div>
            <div class="suggestion-amount">${suggestions.suggestions.moderate.toFixed(3)} SUI</div>
            <div class="suggestion-desc">~1 week</div>
          </div>
          <div class="suggestion-item" data-amount="${suggestions.suggestions.heavy}">
            <div class="suggestion-label">Heavy Usage</div>
            <div class="suggestion-amount">${suggestions.suggestions.heavy.toFixed(3)} SUI</div>
            <div class="suggestion-desc">~1 month</div>
          </div>
        `;

        // Add click handlers for suggestions
        suggestionsGrid.querySelectorAll('.suggestion-item').forEach(item => {
          item.addEventListener('click', () => {
            const amount = parseFloat(item.dataset.amount);
            this.panel.querySelector('#deposit-amount').value = amount;
            this.updatePreview();
            this.validateDeposit();
          });
        });
      } else {
        suggestionsSection.style.display = 'none';
      }
    } catch (error) {
      console.error('Failed to update suggestions:', error);
    }
  }

  // Update transaction history
  updateHistory() {
    try {
      const walletInfo = walletManager.getWalletInfo();
      if (!walletInfo.isConnected) return;

      const history = depositManager.getTransactionHistory(walletInfo.address, 5);
      const historyList = this.panel.querySelector('#deposit-history');
      
      if (history.length === 0) {
        historyList.innerHTML = '<div class="history-empty">No recent activity</div>';
        return;
      }

      historyList.innerHTML = history.map(tx => `
        <div class="history-item">
          <div class="history-type">${this.formatTransactionType(tx.type)}</div>
          <div class="history-amount">${this.formatAmount(tx.amount || tx.suiAmount)}</div>
          <div class="history-time">${this.formatTime(tx.timestamp)}</div>
        </div>
      `).join('');
    } catch (error) {
      console.error('Failed to update history:', error);
    }
  }

  // Format transaction type for display
  formatTransactionType(type) {
    const types = {
      'deposit': '💰 Deposit',
      'withdrawal': '💸 Withdrawal',
      'gas_usage': '⛽ Gas Used'
    };
    return types[type] || type;
  }

  // Format amount for display
  formatAmount(amount) {
    if (typeof amount === 'number') {
      return amount >= 1000000000 
        ? `${(amount / 1000000000).toFixed(6)} SUI`
        : `${amount.toLocaleString()} MIST`;
    }
    return `${amount}`;
  }

  // Format timestamp for display
  formatTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  // Event handlers
  onDepositSuccess(data) {
    this.updateBalance();
    this.updateHistory();
  }

  onWithdrawalSuccess(data) {
    this.updateBalance();
    this.updateHistory();
  }

  onLowBalance(data) {
    this.showNotification(
      `Low balance warning: ${data.currentBalance.toFixed(6)} SUI remaining`, 
      'warning'
    );
  }

  // Show notification
  showNotification(message, type = 'info') {
    if (typeof window !== 'undefined' && window.showNotification) {
      window.showNotification(message, type);
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }
}

// Create singleton instance
export const depositPanel = new DepositPanel();

// Make globally available
if (typeof window !== 'undefined') {
  window.depositPanel = depositPanel;
}