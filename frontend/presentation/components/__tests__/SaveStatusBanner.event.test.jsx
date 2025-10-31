/// <reference types="vitest" />
/// <reference types="@vitest/environment-happy-dom" />
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { SaveStatusBanner } from '../spreadsheet/SaveStatusBanner.jsx';

/**
 * SaveStatusBanner Event Handling Tests
 *
 * Tests that SaveStatusBanner correctly:
 * 1. Listens to fallback, retry success/failure, and startup retry events
 * 2. Shows/hides UI based on events
 * 3. Displays appropriate messages
 */

describe('SaveStatusBanner Event Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('save:fallback event', () => {
    it('should render banner when save:fallback event fired', async () => {
      render(<SaveStatusBanner />);

      // Initially no banner
      expect(screen.queryByText(/Network disconnected/)).toBeNull();

      // Fire fallback event wrapped in act
      act(() => {
        window.dispatchEvent(new CustomEvent('save:fallback', {
          detail: {
            message: 'Network disconnected - changes saved locally',
            warning: 'Data will sync to blockchain when connection is restored',
            localKey: 'walsheetz_fallback_123',
            timestamp: Date.now()
          }
        }));
      });

      // Banner should appear
      await waitFor(() => {
        expect(screen.getByText('Network disconnected - changes saved locally')).toBeInTheDocument();
      });
    });

    it('should avoid duplicate fallback notifications', async () => {
      render(<SaveStatusBanner />);

      // Fire same event twice
      const detail = {
        message: 'Network disconnected',
        localKey: 'walsheetz_fallback_123',
        timestamp: Date.now()
      };

      act(() => {
        window.dispatchEvent(new CustomEvent('save:fallback', { detail }));
        window.dispatchEvent(new CustomEvent('save:fallback', { detail }));
      });

      await waitFor(() => {
        const banners = screen.getAllByText('Network disconnected');
        // Should only render once (or state should deduplicate)
        expect(banners.length).toBeLessThanOrEqual(1);
      });
    });

    it('should show multiple fallbacks with count', async () => {
      render(<SaveStatusBanner />);

      // Fire two separate fallback events
      act(() => {
        window.dispatchEvent(new CustomEvent('save:fallback', {
          detail: {
            message: 'First save',
            localKey: 'walsheetz_fallback_111',
            timestamp: Date.now()
          }
        }));

        window.dispatchEvent(new CustomEvent('save:fallback', {
          detail: {
            message: 'Second save',
            localKey: 'walsheetz_fallback_222',
            timestamp: Date.now()
          }
        }));
      });

      await waitFor(() => {
        // Should show count of additional unsaved changes
        expect(screen.getByText(/\+1 more unsaved change/)).toBeInTheDocument();
      });
    });
  });

  describe('save:retry-success event', () => {
    it('should remove fallback from list on success', async () => {
      render(<SaveStatusBanner />);

      // Add fallback
      act(() => {
        window.dispatchEvent(new CustomEvent('save:fallback', {
          detail: {
            message: 'Saved locally',
            localKey: 'walsheetz_fallback_success',
            timestamp: Date.now()
          }
        }));
      });

      await waitFor(() => {
        expect(screen.getByText('Saved locally')).toBeInTheDocument();
      });

      // Fire retry success
      act(() => {
        window.dispatchEvent(new CustomEvent('save:retry-success', {
          detail: {
            localKey: 'walsheetz_fallback_success',
            timestamp: Date.now()
          }
        }));
      });

      // Should be removed from banner
      await waitFor(() => {
        expect(screen.queryByText('Saved locally')).toBeNull();
      });
    });

    it('should show success confirmation message', async () => {
      render(<SaveStatusBanner />);

      // Add TWO fallbacks so the banner stays visible after one is marked as success
      // (retryMessage is nested inside banner which returns null if no fallbacks exist)
      act(() => {
        window.dispatchEvent(new CustomEvent('save:fallback', {
          detail: {
            message: 'Test data 1',
            localKey: 'walsheetz_fallback_test_1',
            timestamp: Date.now()
          }
        }));
        window.dispatchEvent(new CustomEvent('save:fallback', {
          detail: {
            message: 'Test data 2',
            localKey: 'walsheetz_fallback_test_2',
            timestamp: Date.now()
          }
        }));
      });

      await waitFor(
        () => {
          expect(screen.getByText('Test data 1')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Now trigger success on first one, which will show the success message
      // Banner stays visible because second fallback still exists
      act(() => {
        window.dispatchEvent(new CustomEvent('save:retry-success', {
          detail: {
            localKey: 'walsheetz_fallback_test_1',
            timestamp: Date.now()
          }
        }));
      });

      await waitFor(
        () => {
          expect(screen.getByText(/✅ Save synced to blockchain/)).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });
  });

  describe('save:retry-failed event', () => {
    it('should show failure message when retry fails', async () => {
      render(<SaveStatusBanner />);

      // Add fallback
      act(() => {
        window.dispatchEvent(new CustomEvent('save:fallback', {
          detail: {
            message: 'Saved locally',
            localKey: 'walsheetz_fallback_fail_test',
            timestamp: Date.now()
          }
        }));
      });

      // Fire retry failure
      act(() => {
        window.dispatchEvent(new CustomEvent('save:retry-failed', {
          detail: {
            localKey: 'walsheetz_fallback_fail_test',
            error: 'Wallet disconnected',
            timestamp: Date.now()
          }
        }));
      });

      await waitFor(() => {
        expect(screen.getByText(/Retry attempt failed/)).toBeInTheDocument();
      });
    });

    it('should keep fallback in list on failure', async () => {
      render(<SaveStatusBanner />);

      act(() => {
        window.dispatchEvent(new CustomEvent('save:fallback', {
          detail: {
            message: 'Saved locally for retry',
            localKey: 'walsheetz_fallback_keep',
            timestamp: Date.now()
          }
        }));
      });

      await waitFor(() => {
        expect(screen.getByText('Saved locally for retry')).toBeInTheDocument();
      });

      // Fire failure
      act(() => {
        window.dispatchEvent(new CustomEvent('save:retry-failed', {
          detail: {
            localKey: 'walsheetz_fallback_keep',
            error: 'Network error',
            timestamp: Date.now()
          }
        }));
      });

      // Should still be visible after failure
      await waitFor(() => {
        expect(screen.getByText('Saved locally for retry')).toBeInTheDocument();
      });
    });
  });

  describe('save:startup-retry-complete event', () => {
    it('should show summary of startup retry results', async () => {
      render(<SaveStatusBanner />);

      // First add a fallback so the banner is visible
      act(() => {
        window.dispatchEvent(new CustomEvent('save:fallback', {
          detail: {
            message: 'Startup test',
            localKey: 'walsheetz_startup_test_1',
            timestamp: Date.now()
          }
        }));
      });

      await waitFor(() => {
        expect(screen.getByText('Startup test')).toBeInTheDocument();
      });

      // Now trigger startup retry complete
      act(() => {
        window.dispatchEvent(new CustomEvent('save:startup-retry-complete', {
          detail: {
            successCount: 3,
            failureCount: 1,
            total: 4,
            timestamp: Date.now()
          }
        }));
      });

      await waitFor(() => {
        expect(screen.getByText(/✅ 3 of 4 saves synced/)).toBeInTheDocument();
      });
    });

    it('should show pending saves if some failed', async () => {
      render(<SaveStatusBanner />);

      // First add a fallback so the banner is visible
      act(() => {
        window.dispatchEvent(new CustomEvent('save:fallback', {
          detail: {
            message: 'Pending test',
            localKey: 'walsheetz_startup_test_2',
            timestamp: Date.now()
          }
        }));
      });

      await waitFor(() => {
        expect(screen.getByText('Pending test')).toBeInTheDocument();
      });

      // Now trigger startup retry complete with failures
      act(() => {
        window.dispatchEvent(new CustomEvent('save:startup-retry-complete', {
          detail: {
            successCount: 2,
            failureCount: 2,
            total: 4,
            timestamp: Date.now()
          }
        }));
      });

      await waitFor(() => {
        // Component renders concatenated message: "✅ 2 of 4 saves synced during startup; 2 still pending"
        expect(screen.getByText(/2 still pending/)).toBeInTheDocument();
      });
    });
  });

  describe('Retry button functionality', () => {
    it('should emit save:retry-fallbacks event on button click', async () => {
      render(<SaveStatusBanner />);

      // CRITICAL: Add fallback BOTH to component state AND to localStorage
      // Component shows banner from state, but handleRetryAllSaves looks in localStorage
      localStorage.setItem('walsheetz_fallback_btn_test', JSON.stringify({ data: 'test' }));

      act(() => {
        window.dispatchEvent(new CustomEvent('save:fallback', {
          detail: {
            message: 'Test fallback',
            localKey: 'walsheetz_fallback_btn_test',
            timestamp: Date.now()
          }
        }));
      });

      await waitFor(() => {
        expect(screen.getByText('Test fallback')).toBeInTheDocument();
      });

      // Setup listener for retry event
      const retryListener = vi.fn();
      window.addEventListener('save:retry-fallbacks', retryListener);

      // Click retry button
      const retryButton = screen.getByText(/Retry Save/);
      act(() => {
        retryButton.click();
      });

      // Should emit event with fallback key
      await waitFor(() => {
        expect(retryListener).toHaveBeenCalled();
        const event = retryListener.mock.calls[0][0];
        expect(event.detail.fallbackKeys).toContain('walsheetz_fallback_btn_test');
      });

      window.removeEventListener('save:retry-fallbacks', retryListener);
    });
  });

  describe('Auto-dismiss behavior', () => {
    it('should auto-dismiss success message after 2 seconds', async () => {
      render(<SaveStatusBanner />);

      // Add TWO fallbacks so the banner stays visible for dismissing the success message
      act(() => {
        window.dispatchEvent(new CustomEvent('save:fallback', {
          detail: {
            message: 'Saved locally 1',
            localKey: 'walsheetz_fallback_dismiss_test_1',
            timestamp: Date.now()
          }
        }));
        window.dispatchEvent(new CustomEvent('save:fallback', {
          detail: {
            message: 'Saved locally 2',
            localKey: 'walsheetz_fallback_dismiss_test_2',
            timestamp: Date.now()
          }
        }));
      });

      await waitFor(
        () => {
          expect(screen.getByText('Saved locally 1')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Now trigger success which will show the success message
      act(() => {
        window.dispatchEvent(new CustomEvent('save:retry-success', {
          detail: {
            localKey: 'walsheetz_fallback_dismiss_test_1',
            timestamp: Date.now()
          }
        }));
      });

      await waitFor(
        () => {
          expect(screen.getByText(/✅ Save synced to blockchain/)).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Wait for auto-dismiss with a reasonable timeout
      await waitFor(
        () => {
          expect(screen.queryByText(/✅ Save synced to blockchain/)).toBeNull();
        },
        { timeout: 3000 }
      );
    });

    it('should auto-dismiss error message after 5 seconds', async () => {
      render(<SaveStatusBanner />);

      // First add a fallback so the banner is visible
      await act(async () => {
        window.dispatchEvent(new CustomEvent('save:fallback', {
          detail: {
            message: 'Error test data',
            localKey: 'walsheetz_fallback_error_dismiss',
            timestamp: Date.now()
          }
        }));
      });

      await waitFor(() => {
        expect(screen.getByText('Error test data')).toBeInTheDocument();
      });

      // Now trigger failure which will show the error message
      await act(async () => {
        window.dispatchEvent(new CustomEvent('save:retry-failed', {
          detail: {
            localKey: 'walsheetz_fallback_error_dismiss',
            error: 'Test error',
            timestamp: Date.now()
          }
        }));
      });

      await waitFor(() => {
        expect(screen.getByText(/Retry attempt failed/)).toBeInTheDocument();
      });

      // Wait for auto-dismiss with a reasonable timeout
      await waitFor(() => {
        expect(screen.queryByText(/Retry attempt failed/)).toBeNull();
      }, { timeout: 6000 });
    });
  });
});
