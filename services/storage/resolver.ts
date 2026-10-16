// path: services/storage/resolver.ts
// Which provider a company's files go to: a linked, working Google Drive wins; otherwise Supabase Storage.
import 'server-only';
import type { StorageProvider } from '@/types/contracts';
import { loadConnection } from './drive-access';

export async function resolveProvider(companyId: string | null): Promise<StorageProvider> {
  if (!companyId) return 'supabase';
  const link = await loadConnection(companyId);
  return link && link.status === 'connected' ? 'google_drive' : 'supabase';
}
