import React, { useState, useEffect, useRef } from 'react'

function App() {
  const [walletConnected, setWalletConnected] = useState(false)
  const [editCount, setEditCount] = useState(0)
  const [saveStatus, setSaveStatus] = useState('Ready')
  const luckysheetRef = useRef(null)

  const handleConnect = () => {
    setWalletConnected(!walletConnected)
    setSaveStatus(walletConnected ? 'Wallet disconnected' : 'Wallet connected')
  }

  const handleSave = () => {
    setSaveStatus('Saving...')
    setTimeout(() => {
      setSaveStatus('Saved successfully')
      setEditCount(0)
    }, 1000)
  }

  useEffect(() => {
    // Initialize Luckysheet when available
    const initLuckysheet = () => {
      if (typeof window.luckysheet !== 'undefined' && !luckysheetRef.current) {
        try {
          window.luckysheet.create({
            container: 'luckysheet',
            title: 'WalSheetz',
            lang: 'en',
            data: [{
              name: "Sheet1",
              color: "",
              index: 0,
              status: 1,
              order: 0,
              hide: 0,
              row: 100,
              column: 26,
              defaultRowHeight: 25,
              defaultColWidth: 80,
              celldata: [],
              config: {},
              scrollLeft: 0,
              scrollTop: 0,
              luckysheet_select_save: [],
              calcChain: [],
              isPivotTable: false,
              pivotTable: {},
              filter_select: {},
              filter: null,
              luckysheet_alternateformat_save: [],
              luckysheet_alternateformat_save_modelCustom: [],
              luckysheet_conditionformat_save: {},
              frozen: {},
              chart: [],
              zoomRatio: 1,
              image: [],
              showGridLines: 1,
              dataVerification: {}
            }],
            hook: {
              workbookCreateAfter: function() {
                console.log('WalSheetz spreadsheet initialized successfully')
                luckysheetRef.current = true
              },
              cellEditEnd: function(range, value) {
                setEditCount(prev => prev + 1)
                setSaveStatus('Modified')
              }
            }
          })
        } catch (error) {
          console.error('Failed to initialize Luckysheet:', error)
        }
      }
    }

    // Try to initialize, retry if not ready
    const timer = setInterval(() => {
      if (typeof window.luckysheet !== 'undefined') {
        initLuckysheet()
        clearInterval(timer)
      }
    }, 100)

    return () => clearInterval(timer)
  }, [])

  return (
    <div className="main-layout">
      <header className="header">
        <div className="header-left">
          <div className="logo-section">
            <div className="logo-icon">
              <span>🦭</span>
            </div>
            <span className="app-name">WalSheetz</span>
          </div>
        </div>
        <div className="header-right">
          <button className="save-button" onClick={handleSave}>
            💾 Save
          </button>
          <button 
            className={walletConnected ? "connected-button" : "connect-button"} 
            onClick={handleConnect}
          >
            {walletConnected ? '✅ Connected' : '🔗 Connect Wallet'}
          </button>
        </div>
      </header>
      
      <div className="spreadsheet-container">
        <div id="luckysheet" style={{ width: '100%', height: '100%' }}></div>
      </div>
      
      <div className="status-bar">
        <span>Status: {saveStatus}</span>
        <span>Edits: {editCount}</span>
        <span>Wallet: {walletConnected ? 'Connected' : 'Disconnected'}</span>
      </div>
    </div>
  )
}

export default App