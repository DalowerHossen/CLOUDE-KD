// path: services/storage/providers.ts
// The two storage adapters, created once per process.
import 'server-only';
import { SUPABASE_BUCKET } from '@/config/storage';
import type { StorageAdapter } from '@/lib/storage/adapters/base';
import { createDriveAdapter } from '@/lib/storage/adapters/google-drive';
import { createSupabaseAdapter } from '@/lib/storage/adapters/supabase';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { StorageProvider } from '@/types/contracts';
import { driveAccess } from './drive-access';

const adapters: Partial<Record<StorageProvider, StorageAdapter>> = {};
const overrides: Partial<Record<StorageProvider, StorageAdapter>> = {};

export function getAdapter(provider: StorageProvider): StorageAdapter {
  const forced = overrides[provider];
  if (forced) return forced;
  const existing = adapters[provider];
  if (existing) return existing;
  const created =
    provider === 'supabase'
      ? createSupabaseAdapter(getAdminSupabase, SUPABASE_BUCKET)
      : createDriveAdapter(driveAccess);
  adapters[provider] = created;
  return created;
}

/** Replaces an adapter (checks and tests). Pass null to restore the real one. */
export function setAdapterOverride(
  provider: StorageProvider,
  adapter: StorageAdapter | null,
): void {
  if (adapter) overrides[provider] = adapter;
  else delete overrides[provider];
}
