import React, { useState, useRef, useEffect } from 'react'
import { useSpreadsheetContext } from './SpreadsheetProvider.jsx'
import { WALSHEETZ_FUNCTION_METADATA } from '../../services/formulas/WalSheetzFunctions.js'

export function FormulaBar() {
  const { currentCell, formulaValue, handleFormulaChange, openWalSheetzPanel } = useSpreadsheetContext()
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [filteredFunctions, setFilteredFunctions] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const autocompleteRef = useRef(null)

  // Check if we should show WZ autocomplete
  useEffect(() => {
    const value = formulaValue || ''
    const upperValue = value.toUpperCase()

    // Show autocomplete when typing WZ. or =WZ.
    if (upperValue.includes('WZ.') || upperValue.includes('=WZ.')) {
      const wzPattern = /(?:^=?.*)(WZ\.[\w.]*)/i
      const match = value.match(wzPattern)

      if (match) {
        const wzText = match[1].toUpperCase()
        const filtered = Object.entries(WALSHEETZ_FUNCTION_METADATA)
          .filter(([name]) => name.startsWith(wzText))
          .map(([name, metadata]) => ({ name, ...metadata }))

        setFilteredFunctions(filtered)
        setShowAutocomplete(filtered.length > 0)
        setSelectedIndex(0)
      } else {
        setShowAutocomplete(false)
      }
    } else {
      setShowAutocomplete(false)
    }
  }, [formulaValue])

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!showAutocomplete) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, filteredFunctions.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
        break
      case 'Tab':
      case 'Enter':
        e.preventDefault()
        if (filteredFunctions[selectedIndex]) {
          insertFunction(filteredFunctions[selectedIndex])
        }
        break
      case 'Escape':
        setShowAutocomplete(false)
        break
    }
  }

  // Insert selected function
  const insertFunction = (func) => {
    const currentValue = formulaValue || ''
    const wzPattern = /(?:^=?.*)(WZ\.[\w.]*)/i
    const match = currentValue.match(wzPattern)

    if (match) {
      const beforeWz = currentValue.substring(0, match.index + match[0].indexOf(match[1]))
      const afterWz = currentValue.substring(match.index + match[0].length)
      let newValue = beforeWz + func.signature + afterWz

      // Ensure the formula starts with = if it doesn't already
      if (!newValue.startsWith('=')) {
        newValue = '=' + newValue
      }

      handleFormulaChange(newValue)
      setShowAutocomplete(false)

      // Focus back to input
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          // Position cursor after the function (accounting for the = prefix)
          const equalOffset = newValue.startsWith('=') && !currentValue.startsWith('=') ? 1 : 0
          const cursorPos = beforeWz.length + func.signature.length + equalOffset
          inputRef.current.setSelectionRange(cursorPos, cursorPos)
        }
      }, 0)
    }
  }

  // Handle clicking outside autocomplete
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(event.target)) {
        setShowAutocomplete(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="formula-bar">
      <div className="cell-reference">
        <input
          type="text"
          value={currentCell}
          readOnly
          className="cell-name-input"
        />
      </div>
      <div className="formula-input-container" style={{ position: 'relative' }}>
        <span className="formula-prefix">fx</span>
        <input
          ref={inputRef}
          type="text"
          value={formulaValue}
          onChange={(e) => handleFormulaChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="formula-input"
          placeholder="Enter formula or value... (try typing WZ.)"
        />

        {/* WZ Functions Quick Access Button */}
        <button
          className="wz-quick-access-btn"
          onClick={() => openWalSheetzPanel && openWalSheetzPanel()}
          title="Open WalSheetz DeFi Functions Panel"
        >
          WZ
        </button>

        {/* Autocomplete Dropdown */}
        {showAutocomplete && (
          <div ref={autocompleteRef} className="wz-autocomplete-dropdown">
            <div className="autocomplete-header">
              <span className="autocomplete-title">📊 WalSheetz Functions</span>
              <small className="autocomplete-hint">Use ↑↓ to navigate, Tab/Enter to select</small>
            </div>
            <div className="autocomplete-list">
              {filteredFunctions.map((func, index) => (
                <div
                  key={func.name}
                  className={`autocomplete-item ${index === selectedIndex ? 'selected' : ''}`}
                  onClick={() => insertFunction(func)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="func-header">
                    <span className="func-icon">{func.icon}</span>
                    <span className="func-name">{func.name}</span>
                    <span className={`func-category category-${func.category}`}>
                      {func.category}
                    </span>
                  </div>
                  <div className="func-signature">{func.signature}</div>
                  <div className="func-description">{func.description}</div>
                  <div className="func-example">
                    <small>Example: <code>{func.example}</code></small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}