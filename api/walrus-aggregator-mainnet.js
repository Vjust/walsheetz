import { createProxyHandler } from './_utils/proxy.js';

export const config = { runtime: 'edge' };

export default createProxyHandler({
  targetBase: 'https://wal-aggregator-mainnet.staketab.org',
  basePath: '/api/walrus-aggregator-mainnet',
});
