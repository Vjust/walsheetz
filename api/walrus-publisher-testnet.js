import { createProxyHandler } from './_utils/proxy.js';

export const config = { runtime: 'edge' };

export default createProxyHandler({
  targetBase: 'https://publisher.walrus-testnet.walrus.space',
  basePath: '/api/walrus-publisher-testnet',
});
