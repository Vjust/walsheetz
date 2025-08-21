import React from 'react'
import { useSpreadsheetContext } from './SpreadsheetProvider.jsx'

export function Toolbar() {
  const { saveToBlockchain } = useSpreadsheetContext()

  const handleSave = async () => {
    try {
      await saveToBlockchain()
    } catch (error) {
      console.error('Save error:', error)
    }
  }

  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <button className="toolbar-button" onClick={handleSave}>
          💾
        </button>
        <button className="toolbar-button">↶</button>
        <button className="toolbar-button">↷</button>
      </div>
      
      <div className="toolbar-section">
        <button className="toolbar-button">B</button>
        <button className="toolbar-button">I</button>
        <button className="toolbar-button">U</button>
      </div>
      
      <div className="toolbar-section">
        <select className="toolbar-select">
          <option>Arial</option>
          <option>Helvetica</option>
          <option>Times</option>
        </select>
        <select className="toolbar-select">
          <option>10</option>
          <option>12</option>
          <option>14</option>
          <option>16</option>
        </select>
      </div>
    </div>
  )
}