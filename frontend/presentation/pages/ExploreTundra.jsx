import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useSpreadsheetContext } from '../components/SpreadsheetProvider.jsx'
import ArcticSprite from '../components/ArcticSprite.jsx'
import '../styles/ExploreTundra.css'

export function ExploreTundra() {
  const navigate = useNavigate()
  const { connectWallet, walletConnected } = useSpreadsheetContext()
  const [connectingWallet, setConnectingWallet] = React.useState(false)
  const [error, setError] = React.useState(null)

  const handleConnectWallet = async () => {
    try {
      setConnectingWallet(true)
      setError(null)
      const result = await connectWallet()
      if (!result.success) {
        setError(result.error || 'Failed to connect wallet')
      } else {
        // Navigate to home after successful connection
        navigate('/')
      }
    } catch (err) {
      setError(err.message || 'Error connecting wallet')
    } finally {
      setConnectingWallet(false)
    }
  }

  const handleViewDashboard = () => {
    navigate('/')
  }

  return (
    <div className="explore-tundra">
      {/* Arctic Walrus Sprite */}
      <ArcticSprite type="walrus" />

      {/* Background Effects */}
      <div className="explore-tundra__stars"></div>
      <div className="explore-tundra__aurora"></div>

      {/* Header */}
      <header className="explore-tundra__header">
        <div className="explore-tundra__header-content">
          <button
            className="explore-tundra__back-button"
            onClick={() => navigate('/')}
          >
            ← BACK
          </button>
          <div className="explore-tundra__brand">
            <span className="explore-tundra__brand-logo">WALSHEETZ</span>
            <span className="explore-tundra__brand-divider"></span>
            <span className="explore-tundra__brand-tagline">Decentralized Spreadsheets</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="explore-tundra__content">
        {/* Hero Section */}
        <section className="explore-tundra__hero glass-container">
          <h1 className="explore-tundra__title">
            <span className="explore-tundra__title-accent">∞</span>
            What is WalSheetz?
            <span className="explore-tundra__title-accent">∞</span>
          </h1>
          <p className="explore-tundra__subtitle">
            Navigate the frozen frontier of <strong>fully decentralized spreadsheets</strong>. Built entirely on
            Sui blockchain and Walrus decentralized storage, your data flows through the ice like ancient
            glaciers—immutable, transparent, unstoppable. No central servers. No corporate control.
            Just you, your data, and the blockchain.
          </p>
          <div className="explore-tundra__hero-stats">
            <div className="explore-tundra__stat">
              <div className="explore-tundra__stat-value">100%</div>
              <div className="explore-tundra__stat-label">Decentralized</div>
            </div>
            <div className="explore-tundra__stat">
              <div className="explore-tundra__stat-value">∞</div>
              <div className="explore-tundra__stat-label">Decentralized Storage</div>
            </div>
            <div className="explore-tundra__stat">
              <div className="explore-tundra__stat-value">0</div>
              <div className="explore-tundra__stat-label">Central Servers</div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="explore-tundra__features">
          <div className="explore-tundra__feature glass-container ice-glow">
            <div className="explore-tundra__feature-icon">⛓️</div>
            <h3 className="explore-tundra__feature-title">Sui Blockchain Integration</h3>
            <p className="explore-tundra__feature-description">
              Built on Sui's high-performance blockchain with native Move smart contracts. All spreadsheet
              metadata, ownership, and version references are stored on-chain, ensuring complete
              transparency and immutability. Sui's parallel execution enables instant transaction
              finality and low gas costs, making blockchain spreadsheets practical for everyday use.
            </p>
            <ul className="explore-tundra__feature-list">
              <li>• Sub-second transaction finality</li>
              <li>• On-chain ownership verification</li>
              <li>• Smart contract-based access control</li>
              <li>• Native wallet integration (Sui Wallet, Suiet)</li>
            </ul>
          </div>

          <div className="explore-tundra__feature glass-container ice-glow">
            <div className="explore-tundra__feature-icon">💾</div>
            <h3 className="explore-tundra__feature-title">Walrus Decentralized Storage</h3>
            <p className="explore-tundra__feature-description">
              Decentralized blob storage powered by Walrus. Your spreadsheet data is stored
              across a distributed network with cryptographic integrity proofs. Every cell, formula, and
              format is preserved with content-addressed storage—no central servers. Data persists as long
              as storage is maintained. Smart compression (16KB+ threshold) and delta chains (up to 5 changes
              before full snapshot) optimize storage while maintaining complete version history.
            </p>
            <ul className="explore-tundra__feature-list">
              <li>• Decentralized blob storage across distributed network</li>
              <li>• Content-addressed blobs with cryptographic hashes</li>
              <li>• Automatic gzip compression for spreadsheets >16KB</li>
              <li>• Delta chain optimization (up to 5 deltas before full snapshot)</li>
            </ul>
          </div>

          <div className="explore-tundra__feature glass-container ice-glow">
            <div className="explore-tundra__feature-icon">⚙️</div>
            <h3 className="explore-tundra__feature-title">User-Controlled Saving</h3>
            <p className="explore-tundra__feature-description">
              You control when your data is saved to the blockchain—no forced auto-save. Configure your
              own save preferences or save manually whenever you're ready. WalSheetz prompts you every
              5 minutes as a reminder, but the decision is always yours. Your keys, your data, your choice.
            </p>
            <ul className="explore-tundra__feature-list">
              <li>• Manual save control with blockchain confirmation</li>
              <li>• Optional 5-minute save reminders (configurable)</li>
              <li>• Custom save preferences per spreadsheet</li>
              <li>• Gas estimation before each save</li>
            </ul>
          </div>

          <div className="explore-tundra__feature glass-container ice-glow">
            <div className="explore-tundra__feature-icon">🗂️</div>
            <h3 className="explore-tundra__feature-title">Complete Spreadsheet Management</h3>
            <p className="explore-tundra__feature-description">
              Full control over your spreadsheet portfolio. Create unlimited spreadsheets, load them from
              anywhere, manage permissions, and even transfer ownership—all backed by blockchain smart
              contracts. Your spreadsheets are truly yours to manage as you see fit.
            </p>
            <ul className="explore-tundra__feature-list">
              <li>• Create, load, delete, and rename spreadsheets</li>
              <li>• Make spreadsheets public or private with on-chain access control</li>
              <li>• Transfer ownership to another wallet address</li>
              <li>• Auto-discover all spreadsheets owned by your wallet</li>
            </ul>
          </div>

          <div className="explore-tundra__feature glass-container ice-glow">
            <div className="explore-tundra__feature-icon">📊</div>
            <h3 className="explore-tundra__feature-title">Full Excel-Like Functionality</h3>
            <p className="explore-tundra__feature-description">
              Powered by Luckysheet's battle-tested spreadsheet engine. Work with familiar Excel-like
              features you already know—formulas, charts, formatting, pivot tables, and data validation.
              Create complex spreadsheets with the full power of traditional tools, but with blockchain
              storage and true ownership.
            </p>
            <ul className="explore-tundra__feature-list">
              <li>• 400+ built-in Excel-compatible formulas (SUM, VLOOKUP, IF, etc.)</li>
              <li>• Charts and visualizations (bar, line, pie, scatter)</li>
              <li>• Conditional formatting and cell styling</li>
              <li>• Data validation, filtering, sorting, and pivot tables</li>
            </ul>
          </div>

          <div className="explore-tundra__feature glass-container ice-glow">
            <div className="explore-tundra__feature-icon">🔐</div>
            <h3 className="explore-tundra__feature-title">True Data Sovereignty</h3>
            <p className="explore-tundra__feature-description">
              Your identity = your data ownership. Sign in with Google, Apple, or any Sui-compatible wallet through Sui's zkLogin.
              You immediately own every spreadsheet you create. Transfer
              ownership, share publicly, or keep private—all controlled by blockchain smart contracts,
              not corporate policies.
            </p>
            <ul className="explore-tundra__feature-list">
              <li>• Flexible authentication (Google, Apple, or traditional wallet via Sui zkLogin)</li>
              <li>• Ownership transfers via blockchain transactions</li>
              <li>• Public/private access control on-chain</li>
              <li>• Export anytime, no vendor lock-in</li>
            </ul>
          </div>

          <div className="explore-tundra__feature glass-container ice-glow">
            <div className="explore-tundra__feature-icon">🌐</div>
            <h3 className="explore-tundra__feature-title">Fully Decentralized</h3>
            <p className="explore-tundra__feature-description">
              Zero central servers. Zero corporate intermediaries. WalSheetz runs entirely on Sui blockchain
              and Walrus storage network. The frontend is served from decentralized hosting, and all data
              operations happen directly between your browser and the blockchain. Unstoppable and uncensorable.
            </p>
            <ul className="explore-tundra__feature-list">
              <li>• No central databases or servers</li>
              <li>• Browser connects directly to Sui nodes</li>
              <li>• Decentralized frontend hosting</li>
              <li>• Resistant to censorship and takedowns</li>
            </ul>
          </div>
        </section>

        {/* What You Can Do Today */}
        <section className="explore-tundra__use-cases glass-container">
          <h2 className="explore-tundra__section-title">
            <span className="explore-tundra__title-line"></span>
            What You Can Do Today
            <span className="explore-tundra__title-line"></span>
          </h2>
          <p className="explore-tundra__use-cases-intro">
            WalSheetz is ready to use right now. Here's what you can do with your decentralized spreadsheets:
          </p>
          <div className="explore-tundra__use-cases-grid">
            <div className="explore-tundra__use-case">
              <h4 className="explore-tundra__use-case-title">📊 Personal Finance Tracking</h4>
              <p>Create budgets, track expenses, and manage your portfolio with tamper-proof records on the blockchain.
              Store your financial data on-chain with full control and ownership.</p>
            </div>
            <div className="explore-tundra__use-case">
              <h4 className="explore-tundra__use-case-title">📈 Data Analysis & Reporting</h4>
              <p>Build complex spreadsheets with formulas, charts, and pivot tables. Share public reports with
              verifiable data integrity—perfect for transparent research or community analytics.</p>
            </div>
            <div className="explore-tundra__use-case">
              <h4 className="explore-tundra__use-case-title">🗃️ Long-Term Record Keeping</h4>
              <p>Store important records, inventory lists, or project data on decentralized storage.
              No corporate shutdowns can erase your data—your records persist on the blockchain as long as storage is maintained.</p>
            </div>
            <div className="explore-tundra__use-case">
              <h4 className="explore-tundra__use-case-title">🤝 Shared Documents</h4>
              <p>Create public spreadsheets for community use or make private sheets for your personal work.
              Transfer ownership to collaborators or keep full control—you decide.</p>
            </div>
            <div className="explore-tundra__use-case">
              <h4 className="explore-tundra__use-case-title">💾 Backup & Export</h4>
              <p>Export your spreadsheets anytime to standard formats. Use WalSheetz as a decentralized backup
              for critical data—redundant storage across multiple nodes ensures availability.</p>
            </div>
            <div className="explore-tundra__use-case">
              <h4 className="explore-tundra__use-case-title">🧮 Complex Calculations</h4>
              <p>Leverage 400+ Excel-compatible formulas for statistical analysis, financial modeling,
              data validation, and more—all with blockchain storage and decentralized infrastructure.</p>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="explore-tundra__how-it-works glass-container">
          <h2 className="explore-tundra__section-title">
            <span className="explore-tundra__title-line"></span>
            How It Works
            <span className="explore-tundra__title-line"></span>
          </h2>
          <p className="explore-tundra__how-intro">
            WalSheetz combines Sui blockchain's smart contracts with Walrus's decentralized storage
            to create a completely trustless spreadsheet system. Here's the full technical flow:
          </p>
          <div className="explore-tundra__steps">
            <div className="explore-tundra__step">
              <div className="explore-tundra__step-number">1</div>
              <h4 className="explore-tundra__step-title">Sign In</h4>
              <p className="explore-tundra__step-description">
                Sign in with your Google or Apple account through Sui's zkLogin, or connect a traditional Sui wallet (Sui Wallet, Suiet, Ethos).
                Sui's authentication system gives you flexible options while maintaining blockchain ownership.
                Whether you use social login or a wallet, your identity is secured on-chain.
              </p>
            </div>
            <div className="explore-tundra__step-arrow">→</div>
            <div className="explore-tundra__step">
              <div className="explore-tundra__step-number">2</div>
              <h4 className="explore-tundra__step-title">Create or Load Spreadsheet</h4>
              <p className="explore-tundra__step-description">
                Create a new spreadsheet (triggers on-chain transaction creating a Sui object) or
                load existing spreadsheets you own. All metadata lives on-chain: title, owner,
                permissions, and blob references.
              </p>
            </div>
            <div className="explore-tundra__step-arrow">→</div>
            <div className="explore-tundra__step">
              <div className="explore-tundra__step-number">3</div>
              <h4 className="explore-tundra__step-title">Edit Locally</h4>
              <p className="explore-tundra__step-description">
                Work with your spreadsheet using the Luckysheet engine running in your browser.
                All edits happen locally—fast and responsive. No data sent to any server until
                you explicitly save to the blockchain.
              </p>
            </div>
            <div className="explore-tundra__step-arrow">→</div>
            <div className="explore-tundra__step">
              <div className="explore-tundra__step-number">4</div>
              <h4 className="explore-tundra__step-title">Save to Blockchain</h4>
              <p className="explore-tundra__step-description">
                When ready (or reminded every 5 minutes), click save. Your spreadsheet data is
                compressed, stored on Walrus (decentralized storage network), and the blob ID
                is recorded on-chain via Sui transaction. You control the timing.
              </p>
            </div>
            <div className="explore-tundra__step-arrow">→</div>
            <div className="explore-tundra__step">
              <div className="explore-tundra__step-number">5</div>
              <h4 className="explore-tundra__step-title">Stored & Verifiable</h4>
              <p className="explore-tundra__step-description">
                Your data is now stored on Walrus with cryptographic proof. The
                on-chain record proves ownership and points to the exact blob. Anyone can verify
                the data integrity—fully transparent, fully decentralized. Data persists as long as storage is maintained.
              </p>
            </div>
          </div>
        </section>

        {/* Why WalSheetz Section */}
        <section className="explore-tundra__theme glass-container frost-effect">
          <h2 className="explore-tundra__section-title">
            <span className="explore-tundra__title-line"></span>
            Why WalSheetz?
            <span className="explore-tundra__title-line"></span>
          </h2>
          <div className="explore-tundra__theme-content">
            <p>
              <strong>True Ownership & No Vendor Lock-In.</strong> With centralized spreadsheet solutions, you don't truly own your data—you're
              renting access to it. Companies control your files, can change terms of service, suspend accounts, or shut down
              entirely. WalSheetz is different: your wallet is your ownership. No corporate gatekeepers. You can never be locked
              out, suspended, or have your data deleted by company policy. Your keys, your data, your control.
            </p>
            <p>
              <strong>Privacy-First & Decentralized.</strong> Centralized spreadsheet platforms monitor your activity, scan your content,
              and monetize your data through targeted ads and analytics. They know what you're working on, who you're collaborating with,
              and how you use their service. WalSheetz operates on decentralized infrastructure—no central authority watching your work.
              Your spreadsheet data isn't scanned, tracked, or sold. True privacy through decentralization.
            </p>
            <p>
              <strong>Decentralized & Censorship Resistant.</strong> Centralized providers can shut down, go bankrupt, face government
              censorship, or experience catastrophic server failures. Your data is at their mercy. WalSheetz stores your spreadsheets
              on the Sui blockchain and Walrus network—decentralized infrastructure that can't be shut down. Your data persists on the
              blockchain as long as storage is maintained. No company controls it. No government can censor it. It's truly unstoppable.
            </p>
          </div>
        </section>

        {/* CTA Section */}
        <section className="explore-tundra__cta">
          {error && (
            <div className="explore-tundra__error">
              ❌ {error}
            </div>
          )}
          <div className="explore-tundra__cta-buttons">
            {walletConnected ? (
              <button
                className="explore-tundra__cta-button explore-tundra__cta-button--primary"
                onClick={handleViewDashboard}
              >
                <span className="explore-tundra__button-corner explore-tundra__button-corner--tl"></span>
                <span className="explore-tundra__button-corner explore-tundra__button-corner--br"></span>
                📊 VIEW DASHBOARD
              </button>
            ) : (
              <button
                className="explore-tundra__cta-button explore-tundra__cta-button--primary"
                onClick={handleConnectWallet}
                disabled={connectingWallet}
              >
                <span className="explore-tundra__button-corner explore-tundra__button-corner--tl"></span>
                <span className="explore-tundra__button-corner explore-tundra__button-corner--br"></span>
                {connectingWallet ? '⏳ CONNECTING...' : '🦭 GET STARTED'}
              </button>
            )}
            <button
              className="explore-tundra__cta-button explore-tundra__cta-button--secondary"
              onClick={() => navigate('/')}
            >
              ← BACK TO HOME
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="explore-tundra__footer">
        <div className="explore-tundra__footer-content">
          <div className="explore-tundra__footer-left">
            <span>SYSTEM.ACTIVE</span>
            <span className="explore-tundra__footer-divider">|</span>
            <span>V1.0.0</span>
          </div>
          <div className="explore-tundra__footer-right">
            <a
              href="https://x.com/dreamlit_sui"
              target="_blank"
              rel="noopener noreferrer"
              className="explore-tundra__footer-link"
            >
              𝕏 @dreamlit_sui
            </a>
            <span className="explore-tundra__footer-divider">|</span>
            <span>Made by Dreamlit Apps</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default ExploreTundra
