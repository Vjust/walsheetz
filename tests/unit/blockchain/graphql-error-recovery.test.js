// Unit test for GraphQL error recovery and backoff behavior
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GraphQLEventSubscriber } from '@blockchain/graphql-event-subscriber.js';

describe('GraphQL Error Recovery', () => {
  let subscriber;
  let originalFetch;

  beforeEach(() => {
    // Mock fetch globally
    originalFetch = global.fetch;
    global.fetch = vi.fn();

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Create subscriber with test config
    subscriber = new GraphQLEventSubscriber();
    subscriber.config = {
      sui: {
        graphqlUrl: 'http://test-graphql.example.com',
        packageId: 'test-package-id'
      }
    };
    subscriber.pollIntervalMs = 50; // Very fast polling for tests
  });

  afterEach(() => {
    subscriber.stop();
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('should increase backoff multiplier on errors', () => {
    expect(subscriber.backoffMultiplier).toBe(1);

    // Simulate first error
    subscriber.handleError(new Error('Test error'));
    expect(subscriber.backoffMultiplier).toBe(2);

    // Simulate second error
    subscriber.handleError(new Error('Test error'));
    expect(subscriber.backoffMultiplier).toBe(4);

    // Simulate third error
    subscriber.handleError(new Error('Test error'));
    expect(subscriber.backoffMultiplier).toBe(8); // Max backoff
  });

  it('should preserve backoff state across start/stop cycles', () => {
    subscriber.backoffMultiplier = 4;

    subscriber.start();
    expect(subscriber.backoffMultiplier).toBe(4);

    subscriber.stop();
    expect(subscriber.backoffMultiplier).toBe(4);
  });

  it('should reset backoff multiplier only on successful operations', () => {
    subscriber.backoffMultiplier = 4;

    // Test resetBackoffMultiplier directly
    subscriber.resetBackoffMultiplier();
    expect(subscriber.backoffMultiplier).toBe(1);
  });

  it('should handle restart flag correctly', () => {
    subscriber.start();
    expect(subscriber.isActive).toBe(true);
    expect(subscriber.shouldRestart).toBe(undefined);

    // Simulate error that triggers restart
    const wasActive = subscriber.isActive;
    subscriber.stop();
    subscriber.shouldRestart = true;

    expect(subscriber.isActive).toBe(false);
    expect(subscriber.shouldRestart).toBe(true);

    // Manual stop should cancel restart
    subscriber.stop();
    expect(subscriber.shouldRestart).toBe(false);
  });

  it('should preserve interval calculation with backoff', () => {
    subscriber.backoffMultiplier = 4;
    subscriber.pollIntervalMs = 100;

    subscriber.start();

    // Check that the correct interval is logged
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('400ms interval')
    );
  });

  it('should handle error during active polling', async () => {
    let errorCount = 0;

    // Mock fetch to fail once then succeed
    global.fetch.mockImplementation(() => {
      errorCount++;
      if (errorCount === 1) {
        throw new Error('Network error');
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          data: { events: { nodes: [] }, checkpoints: { nodes: [] } }
        })
      });
    });

    subscriber.start();

    // Wait for initial poll to trigger error
    await new Promise(resolve => setTimeout(resolve, 100));

    // After error, backoff should be increased
    expect(subscriber.backoffMultiplier).toBe(2);
  });
});