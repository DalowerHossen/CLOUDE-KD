// path: lib/supabase/admin.ts
// Service-role client. Server only. It bypasses RLS, so callers must never pass a tenant id taken from client input:
// the tenant id always comes from the verified session (see lib/middleware/tenant.ts).
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getPublicEnv } from '@/lib/env/public';
import { getServerEnv } from '@/lib/env';

let client: SupabaseClient | null = null;

export function getAdminSupabase(): SupabaseClient {
  if (client) return client;
  const publicEnv = getPublicEnv();
  const serverEnv = getServerEnv();
  client = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return client;
}
