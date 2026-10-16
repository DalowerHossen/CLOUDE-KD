// path: lib/storage/adapters/supabase.ts
// Supabase Storage: one private bucket, one folder per company. Holds encrypted bytes only.
import type { SupabaseClient } from '@supabase/supabase-js';
import { ProviderUnavailableError, objectPath, type StorageAdapter } from './base';

export function createSupabaseAdapter(
  client: () => SupabaseClient,
  bucket: string,
): StorageAdapter {
  let ensured = false;
  async function ensureBucket(): Promise<void> {
    if (ensured) return;
    const { error } = await client().storage.createBucket(bucket, { public: false });
    // "already exists" is the normal case after the first call.
    if (error && !/already exists|duplicate/i.test(error.message)) {
      throw new ProviderUnavailableError('supabase', 'The storage bucket is not available.');
    }
    ensured = true;
  }
  return {
    provider: 'supabase',
    async put(input) {
      await ensureBucket();
      const path = objectPath(input.companyId, input.category, input.fileId);
      const { error } = await client().storage.from(bucket).upload(path, Buffer.from(input.bytes), {
        contentType: 'application/octet-stream',
        upsert: false,
      });
      if (error) throw new ProviderUnavailableError('supabase', 'The file could not be stored.');
      return { ref: path };
    },
    async get(ref) {
      const { data, error } = await client().storage.from(bucket).download(ref);
      if (error || !data)
        throw new ProviderUnavailableError('supabase', 'The file could not be read.');
      return new Uint8Array(await data.arrayBuffer());
    },
    async remove(ref) {
      const { error } = await client().storage.from(bucket).remove([ref]);
      if (error) throw new ProviderUnavailableError('supabase', 'The file could not be removed.');
    },
    async health() {
      try {
        await ensureBucket();
        const { error } = await client().storage.from(bucket).list('tenants', { limit: 1 });
        return error ? { ok: false, message: 'The bucket cannot be listed.' } : { ok: true };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : 'unavailable' };
      }
    },
  };
}
