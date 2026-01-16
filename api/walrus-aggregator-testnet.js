import { createProxyHandler } from './_utils/proxy.js';

export const config = { runtime: 'edge' };

export default createProxyHandler({
  targetBase: 'https://aggregator.walrus-testnet.walrus.space',
  basePath: '/api/walrus-aggregator-testnet',
});
