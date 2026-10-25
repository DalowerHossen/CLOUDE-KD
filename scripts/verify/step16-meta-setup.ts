// path: scripts/verify/step16-meta-setup.ts
// Imported right after step10-flow-setup by step16-meta-connect.ts: gives the environment reader the Meta app of the platform.
import './step10-flow-setup';
import path from 'node:path';

const abs = path.resolve('lib/env/index.ts');
const cache = require.cache as Record<string, unknown>;
cache[abs] = {
  id: abs,
  filename: abs,
  loaded: true,
  exports: {
    getServerEnv: () => ({
      CARD_IDENTITY_HMAC_KEY: 'k'.repeat(48),
      META_APP_ID: '1234567890',
      META_APP_SECRET: 'S'.repeat(32),
    }),
  },
  children: [],
  paths: [],
};
