// path: lib/supabase/browser.ts
// Browser client. Uses only the public anon key; row access is decided by RLS policies.
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPublicEnv } from '@/lib/env/public';

let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (client) return client;
  const env = getPublicEnv();
  client = createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return client;
}
