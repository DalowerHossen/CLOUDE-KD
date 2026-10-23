// path: scripts/verify/step10-flow-setup.ts
// Must be imported first by step10-flow.ts: it replaces the Supabase client and the environment readers with test
// doubles before any service module loads. Run: npx tsx --conditions=react-server scripts/verify/step10-flow.ts
import path from 'node:path';
import { FakeDb } from './step10-fake-db';

export const db = new FakeDb();

function replace(file: string, exports: Record<string, unknown>): void {
  const abs = path.resolve(file);
  const cache = require.cache as Record<string, unknown>;
  cache[abs] = { id: abs, filename: abs, loaded: true, exports, children: [], paths: [] };
}

replace('lib/supabase/admin.ts', { getAdminSupabase: () => db });
replace('lib/env/public.ts', {
  getPublicEnv: () => ({
    NEXT_PUBLIC_APP_URL: 'https://app.example.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
  }),
});
replace('lib/env/index.ts', {
  getServerEnv: () => ({ CARD_IDENTITY_HMAC_KEY: 'k'.repeat(48) }),
});
