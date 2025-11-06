import { describe, it, expect } from 'vitest';
import { resolveWalrusEndpoints } from '@services/walrus/config/WalrusConfigResolver.js';

describe('WalrusConfigResolver', () => {
  it('should resolve endpoints with proxy and direct URLs', () => {
    const mockConfig = {
      getWalrusServiceBase: (type) => `/api/walrus-${type}`,
      getWalrusFallback: (type) => `https://walrus-testnet.walrus.space/${type}`
    };

    const endpoints = resolveWalrusEndpoints(mockConfig);

    expect(endpoints.publisher.proxy).toBe('/api/walrus-publisher');
    expect(endpoints.publisher.direct).toBe('https://walrus-testnet.walrus.space/publisher');
    expect(endpoints.publisher.proxyEnabled).toBe(true);

    expect(endpoints.aggregator.proxy).toBe('/api/walrus-aggregator');
    expect(endpoints.aggregator.direct).toBe('https://walrus-testnet.walrus.space/aggregator');
    expect(endpoints.aggregator.proxyEnabled).toBe(true);
  });

  it('should detect when proxy is disabled (proxy === direct)', () => {
    const mockConfig = {
      getWalrusServiceBase: (type) => `https://walrus.space/${type}`,
      getWalrusFallback: (type) => `https://walrus.space/${type}`
    };

    const endpoints = resolveWalrusEndpoints(mockConfig);

    expect(endpoints.publisher.proxyEnabled).toBe(false);
    expect(endpoints.aggregator.proxyEnabled).toBe(false);
  });

  it('should throw error if config is null', () => {
    expect(() => resolveWalrusEndpoints(null)).toThrow('Config is required');
  });
});
