import React from 'react'
import { useSpreadsheetContext } from './SpreadsheetProvider.jsx'

export function FormulaBar() {
  const { currentCell, formulaValue, handleFormulaChange } = useSpreadsheetContext()

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
      <div className="formula-input-container">
        <span className="formula-prefix">fx</span>
        <input
          type="text"
          value={formulaValue}
          onChange={(e) => handleFormulaChange(e.target.value)}
          className="formula-input"
          placeholder="Enter formula or value..."
        />
      </div>
    </div>
  )
}