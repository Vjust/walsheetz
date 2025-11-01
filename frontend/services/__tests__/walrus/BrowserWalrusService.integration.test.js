import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserWalrusService } from '../../BrowserWalrusService.js';

describe('BrowserWalrusService Integration', () => {
  let service;

  beforeEach(() => {
    service = new BrowserWalrusService();
  });

  it('should initialize with connection manager', () => {
    expect(service._connectionManager).toBeDefined();
    expect(service._retryQueue).toBeDefined();
  });

  it('should expose public API methods', () => {
    expect(typeof service.storeBlob).toBe('function');
    expect(typeof service.retrieveBlob).toBe('function');
    expect(typeof service.checkWalrusHealth).toBe('function');
    expect(typeof service.getRetryQueue).toBe('function');
    expect(typeof service.processRetryQueue).toBe('function');
  });

  it('should have backward compatibility properties', () => {
    expect(typeof service.isConnected).toBe('boolean');
    expect(typeof service.healthStatus).toBe('object');
  });
});
