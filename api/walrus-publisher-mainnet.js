import { createProxyHandler } from './_utils/proxy.js';

export const config = { runtime: 'edge' };

export default createProxyHandler({
  targetBase: 'https://walrus-mainnet-publisher-1.staketab.org',
  basePath: '/api/walrus-publisher-mainnet',
});
