// path: services/storage/resolver.ts
// Which provider a company's files go to (REQ-STORAGE): a linked, working Google Drive wins; otherwise Supabase
// Storage. When the chosen provider fails, the file goes to the other one, the event is audited and the company is told.
import 'server-only';
import { getService, tryGetService } from '@/lib/container';
import { createLogger } from '@/lib/logger';
import { ProviderUnavailableError, type AdapterPutInput } from '@/lib/storage/adapters/base';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { StorageProvider } from '@/types/contracts';
import { loadConnection } from './drive-access';
import { getAdapter } from './providers';

const log = createLogger({ component: 'storage-resolver' });

/** Primary choice first, then the other provider when it is usable for this company. */
export async function providerChain(companyId: string | null): Promise<StorageProvider[]> {
  if (!companyId) return ['supabase'];
  const link = await loadConnection(companyId);
  return link && link.status === 'connected' ? ['google_drive', 'supabase'] : ['supabase'];
}

export async function resolveProvider(companyId: string | null): Promise<StorageProvider> {
  return (await providerChain(companyId))[0] ?? 'supabase';
}

async function announceFallback(
  companyId: string,
  from: StorageProvider,
  to: StorageProvider,
  reason: string,
): Promise<void> {
  try {
    await getService('audit').record({
      action: 'storage.fallback',
      resourceType: 'storage_provider',
      resourceId: null,
      companyId,
      metadata: { from, to, reason: reason.slice(0, 200) },
    });
    const { data, error } = await getAdminSupabase().rpc('kd_drive_claim_fallback_notice', {
      p_company: companyId,
    });
    if (error) throw error;
    if (data === true) {
      await tryGetService('notification')?.notify({
        companyId,
        type: 'storage.fallback',
        title: 'Files were saved to platform storage',
        body: 'Your Google Drive could not be reached, so new files were saved to the encrypted platform storage instead. You can move them to Drive later in the storage settings.',
        href: '/settings/storage',
      });
    }
  } catch (error) {
    log.error('fallback could not be announced', { error });
  }
}

export interface StoredObject {
  provider: StorageProvider;
  ref: string;
}

/** Stores the encrypted bytes with the first provider of the chain that works. */
export async function putWithFallback(input: AdapterPutInput): Promise<StoredObject> {
  const chain = await providerChain(input.companyId);
  let lastError: unknown;
  for (let i = 0; i < chain.length; i++) {
    const provider = chain[i];
    if (!provider) continue;
    try {
      const { ref } = await getAdapter(provider).put(input);
      if (i > 0 && input.companyId)
        await announceFallback(
          input.companyId,
          chain[0] ?? provider,
          provider,
          String(lastError instanceof Error ? lastError.message : 'unavailable'),
        );
      return { provider, ref };
    } catch (error) {
      lastError = error;
      if (!(error instanceof ProviderUnavailableError)) throw error;
      log.warn('storage provider failed', { provider, message: error.message });
    }
  }
  throw lastError instanceof Error ? lastError : new Error('No storage provider is available.');
}

export interface ProviderHealth {
  provider: StorageProvider;
  ok: boolean;
  message?: string;
}

/** Health of the platform storage and, for a company, of its Drive link. Updates the stored link state. */
export async function checkHealth(companyId: string | null): Promise<ProviderHealth[]> {
  const results: ProviderHealth[] = [];
  const platform = await getAdapter('supabase').health(null);
  results.push({ provider: 'supabase', ...platform });
  if (companyId) {
    const link = await loadConnection(companyId);
    if (link && link.status !== 'revoked') {
      const health = await getAdapter('google_drive').health(companyId);
      await getAdminSupabase()
        .from('drive_connections')
        .update({
          status: health.ok ? 'connected' : 'error',
          last_error: health.ok
            ? null
            : (health.message ?? 'Google Drive is not reachable.').slice(0, 300),
          last_health_at: new Date().toISOString(),
        })
        .eq('company_id', companyId)
        .is('deleted_at', null);
      results.push({ provider: 'google_drive', ...health });
    }
  }
  return results;
}
