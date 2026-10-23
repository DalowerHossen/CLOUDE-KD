// path: services/base/lock-service.ts
// Implements the locks contract. Leases use the admin client (the lease table is service-role only);
// the versioned update uses the user-bound client so RLS limits which rows can be changed.
import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { LockService } from '@/types/contracts';
import { withAdvisoryLock, withRowLock } from './advisory-lock';
import { updateWithVersion } from './optimistic-lock';

export function createLockService(): LockService {
  return {
    withAdvisoryLock: (key, fn) => withAdvisoryLock(getAdminSupabase(), key, fn),
    withRowLock: (table, id, fn) => withRowLock(getAdminSupabase(), table, id, fn),
    updateWithVersion: async (table, id, expectedVersion, patch) =>
      updateWithVersion(await createServerSupabase(), table, id, expectedVersion, patch),
  };
}
