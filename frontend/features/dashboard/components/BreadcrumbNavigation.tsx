import React from 'react';
import '../styles/breadcrumb-navigation.css';

export function BreadcrumbNavigation({ items = [] }) {
  if (items.length === 0) return null;

  return (
    <nav className="breadcrumb-navigation" aria-label="Breadcrumb">
      <ol className="breadcrumb-list">
        {items.map((item, index) => (
          <li key={index} className="breadcrumb-item">
            {item.current ? (
              <span className="breadcrumb-current" aria-current="page">
                {item.label}
              </span>
            ) : (
              <button
                className="breadcrumb-link"
                onClick={item.onClick}
                title={`Navigate to ${item.label}`}
              >
                {item.label}
              </button>
            )}
            {index < items.length - 1 && (
              <span className="breadcrumb-separator" aria-hidden="true">
                /
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}