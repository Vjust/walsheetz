import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error details
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // You can also log the error to an error reporting service here
    if (typeof window !== 'undefined' && window.devTools && typeof window.devTools.logError === 'function') {
      window.devTools.logError('React Error Boundary', {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack
      });
    }
  }

  handleRetry = () => {
    // Clear the error state to retry rendering
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // Render fallback UI
      return (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: '8px',
          margin: '1rem',
          fontFamily: 'system-ui, sans-serif'
        }}>
          <h2 style={{ color: '#c33', marginBottom: '1rem' }}>
            🚨 Something went wrong
          </h2>
          
          <p style={{ marginBottom: '1rem', color: '#666' }}>
            WalSheetz encountered an unexpected error. This might be due to a temporary issue.
          </p>
          
          <div style={{ marginBottom: '1.5rem' }}>
            <button
              onClick={this.handleRetry}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                marginRight: '0.5rem'
              }}
            >
              🔄 Try Again
            </button>
            
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              ♻️ Reload Page
            </button>
          </div>
          
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details style={{
              textAlign: 'left',
              backgroundColor: '#f8f9fa',
              padding: '1rem',
              borderRadius: '4px',
              border: '1px solid #dee2e6'
            }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                🐛 Debug Information
              </summary>
              
              <div style={{ marginTop: '1rem' }}>
                <h4>Error Message:</h4>
                <pre style={{ 
                  backgroundColor: '#fff', 
                  padding: '0.5rem', 
                  fontSize: '0.85rem',
                  overflow: 'auto'
                }}>
                  {this.state.error.message}
                </pre>
                
                <h4>Stack Trace:</h4>
                <pre style={{ 
                  backgroundColor: '#fff', 
                  padding: '0.5rem', 
                  fontSize: '0.75rem',
                  overflow: 'auto',
                  maxHeight: '200px'
                }}>
                  {this.state.error.stack}
                </pre>
                
                {this.state.errorInfo?.componentStack && (
                  <>
                    <h4>Component Stack:</h4>
                    <pre style={{ 
                      backgroundColor: '#fff', 
                      padding: '0.5rem', 
                      fontSize: '0.75rem',
                      overflow: 'auto',
                      maxHeight: '200px'
                    }}>
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </>
                )}
              </div>
            </details>
          )}
          
          <p style={{ 
            marginTop: '1rem', 
            fontSize: '0.9rem', 
            color: '#999' 
          }}>
            If the problem persists, please refresh the page or check the browser console for more details.
          </p>
        </div>
      );
    }

    // Render children normally when there's no error
    return this.props.children;
  }
}

// Higher-order component wrapper for functional components
export function withErrorBoundary(Component, fallbackComponent = null) {
  return function WithErrorBoundaryComponent(props) {
    return (
      <ErrorBoundary>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

export default ErrorBoundary;