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
        <span className="search-icon" aria-hidden="true">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14Z"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M20 20l-3.5-3.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
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
            x
          </button>
        )}
      </div>
    </div>
  );
}
