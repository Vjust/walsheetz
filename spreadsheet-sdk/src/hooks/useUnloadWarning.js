import { useEffect } from 'react';
import { logger, LogComponent } from '@dreamlit/walrus';

/**
 * useUnloadWarning Hook
 *
 * Shows a browser warning when user tries to leave the page with unsaved changes.
 * Use this hook when you have pending edits that haven't been saved to blockchain.
 *
 * @param {boolean} shouldWarn - Whether to show the warning (e.g., pendingEdits.size > 0)
 * @param {string} message - Custom warning message (optional)
 */
export function useUnloadWarning(shouldWarn = false, message = null) {
  const defaultMessage = 'You have unsaved changes. Are you sure you want to leave?';
  const warningMessage = message || defaultMessage;

  useEffect(() => {
    if (!shouldWarn) {
      return;
    }

    logger.debug(LogComponent.UI_COMPONENT, 'unload_warning_active', 'Unload warning activated');

    const handleBeforeUnload = (event) => {
      // Set the return value to show browser confirmation dialog
      event.preventDefault();
      event.returnValue = warningMessage;
      return warningMessage;
    };

    // Add the beforeunload listener
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup on unmount or when shouldWarn becomes false
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      logger.debug(LogComponent.UI_COMPONENT, 'unload_warning_removed', 'Unload warning removed');
    };
  }, [shouldWarn, warningMessage]);
}

export default useUnloadWarning;
