# 🦭 WalSheetz - Arctic Collaborative Spreadsheets

Navigate your data like a walrus on ice! A powerful spreadsheet application with **Sui blockchain integration** and **Walrus permanent storage** built with Vite and Bun.

## 🌊 Blockchain Features

- **Sui Wallet Integration**: Connect with Sui Wallet, Suiet, or other compatible wallets
- **Automatic Saving**: Data saved to Walrus every 5 seconds or after 3+ edits
- **Version Control**: Cell-level versioning with permanent blockchain storage
- **Walrus Quilt**: Efficient batch storage for small file optimization
- **Testnet Ready**: Full support for Sui testnet with easy mainnet migration

## 🚀 Quick Start

### Prerequisites
- [Bun](https://bun.sh) v1.0+ 
- Modern browser with ES2020 support
- **Sui Wallet** (for blockchain features) - Install from [Chrome Web Store](https://chrome.google.com/webstore/detail/sui-wallet/opcgpfmipidbgpenhmajoajpbobppdil)
- **Sui testnet tokens** (get from [Sui Faucet](https://faucet.testnet.sui.io/))

### Installation

```bash
# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Clone the repository
git clone [your-repo-url]
cd fortunesheet

# Install dependencies with Bun
bun install
```

### Development

```bash
# Start development server with HMR
bun run dev

# Or use the shorthand
bun dev
```

The application will open at `http://localhost:3000`

### Build for Production

```bash
# Create optimized production build
bun run build

# Preview production build
bun run preview
```

## 🛠️ Tech Stack

- **Runtime:** Bun
- **Build Tool:** Vite
- **Spreadsheet Engine:** Luckysheet
- **Styling:** Arctic Theme CSS

## 📝 Scripts

- `bun dev` - Start development server
- `bun build` - Build for production
- `bun preview` - Preview production build
- `bun serve` - Alias for dev server

## 🎨 Features

- ❄️ Arctic-themed UI
- 🦭 Walrus-strong performance
- 🌊 Ocean of data handling
- 🏔️ Tundra-tough reliability

## 🧊 Developer Tools

Open the browser console and use:

```javascript
// Traditional tools
devTools.forceSave()    // Force save current edits
devTools.inspectRAM()   // View RAM storage contents
devTools.listBlobs()    // List all saved blobs
devTools.reset()        // Clear all storage
devTools.getStatus()    // Get current system status
devTools.toggleArctic() // Toggle arctic theme

// Blockchain tools
devTools.connectWallet()          // Connect Sui wallet
devTools.getWalletInfo()          // Get wallet connection info
devTools.forceBlockchainSave()    // Force save to blockchain
devTools.getVersionStats()        // Get version control stats
devTools.getBatchStatus()         // Get Walrus batch status
devTools.inspectVersions(row, col) // Get cell version history
devTools.simulateEdits(count)     // Simulate edits for testing
devTools.testWalletConnection()   // Test wallet functionality
```

## 📦 Project Structure

```
fortunesheet/
├── blockchain/         # Blockchain integration
│   ├── config.js       # Network configuration (testnet/mainnet)
│   ├── wallet-manager.js # Sui wallet connection
│   ├── sui-service.js  # Sui blockchain operations
│   ├── walrus-service.js # Walrus storage operations
│   └── version-control.js # Cell-level versioning
├── frontend/
│   ├── app.js          # Main application
│   ├── storage.js      # Enhanced storage with blockchain
│   ├── sync-engine.js  # Auto-save and edit tracking
│   ├── ui-handlers.js  # UI with wallet integration
│   ├── utils.js        # Utility functions
│   ├── homepage.html   # Landing page
│   └── arctic-theme.css # Arctic styling
├── index.html          # Spreadsheet page
├── vite.config.js      # Vite configuration
├── bunfig.toml         # Bun configuration
└── package.json        # Dependencies
```

## 🏗️ Building with Bun

Bun provides ultra-fast installation and execution:

```bash
# Install specific package
bun add [package-name]

# Install dev dependency
bun add -d [package-name]

# Update all dependencies
bun update
```

## 🚢 Deployment

Build files are output to the `dist/` directory:

```bash
bun run build
# Deploy contents of dist/ to your hosting service
```

## ⚙️ Blockchain Configuration

### Testnet Setup (Default)
1. Install Sui Wallet browser extension
2. Create a new wallet or import existing
3. Switch to Sui Testnet in wallet settings
4. Get test tokens from [Sui Faucet](https://faucet.testnet.sui.io/)
5. Open WalSheetz and click "Connect Wallet"

### Environment Configuration
Edit `blockchain/config.js` to switch networks:

```javascript
// Current environment - change to 'mainnet' for production
environment: 'testnet' // or 'mainnet'
```

### Auto-Save Settings
Customize auto-save behavior in `blockchain/config.js`:

```javascript
storage: {
  autoSaveInterval: 5000, // 5 seconds
  editThreshold: 3,       // Save after 3 edits
  maxVersionHistory: 100, // Keep last 100 versions per cell
  batchSize: 50          // Max changes per Walrus blob
}
```

## 🔧 Troubleshooting

### Wallet Connection Issues
- Ensure Sui Wallet is installed and unlocked
- Check network selection (testnet vs mainnet)
- Verify sufficient SUI tokens for gas fees
- Refresh page and try reconnecting

### Save Failures
- Check wallet connection status
- Verify network connectivity
- Ensure sufficient SUI balance for transactions
- Check browser console for detailed error messages

### Development
- Use `devTools.getStatus()` to check system status
- Use `devTools.testWalletConnection()` to test wallet
- Check Network tab for failed API calls
- Monitor console for blockchain service errors

---

Built with ❄️ by the WalSheetz team - Now with permanent blockchain storage! 🦭⛓️