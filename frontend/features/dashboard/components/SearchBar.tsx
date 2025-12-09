import React, { useState, useEffect } from 'react';
import '../styles/search-bar.css';

export function SearchBar({ value, onChange, placeholder = "Search...", className = "" }) {
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState(value || '');

  // Sync with external value changes
  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  // Debounced search - only call onChange after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (onChange && localValue !== value) {
        onChange(localValue);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [localValue, onChange, value]);

  const handleInputChange = (e) => {
    setLocalValue(e.target.value);
  };

  const handleClear = () => {
    setLocalValue('');
    if (onChange) {
      onChange('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      handleClear();
    }
  };

  return (
    <div className={`search-bar ${isFocused ? 'focused' : ''} ${className}`}>
      <div className="search-input-container">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          value={localValue}
          onChange={handleInputChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="search-input"
        />
        {localValue && (
          <button
            className="clear-button"
            onClick={handleClear}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}