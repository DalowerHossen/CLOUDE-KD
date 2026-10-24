// path: lib/supabase/server.ts
// Server client bound to the request cookies. It runs with the signed-in user's rights, so RLS applies.
import 'server-only';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getPublicEnv } from '@/lib/env/public';

export async function createServerSupabase(): Promise<SupabaseClient> {
  const env = getPublicEnv();
  const store = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => {
        try {
          for (const item of items) store.set(item.name, item.value, item.options);
        } catch {
          // Server Components cannot set cookies; the request pipeline refreshes the session instead.
        }
      },
    },
  });
}
