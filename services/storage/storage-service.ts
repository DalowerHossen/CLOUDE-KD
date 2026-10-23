// path: services/storage/storage-service.ts
// The `storage` contract.
import 'server-only';
import { SIGNED_URL_DEFAULT_SECONDS } from '@/config/storage';
import type { StorageService } from '@/types/contracts';
import { migrateFile } from './migrate';
import { resolveProvider } from './resolver';
import { createSignedUrl } from './signed-urls';
import { getFile, putFile, removeFile } from './storage-core';

export function createStorageService(): StorageService {
  return {
    put: (input) => putFile(input),
    get: async (fileId) => getFile(fileId),
    signedUrl: (fileId, ttlSeconds = SIGNED_URL_DEFAULT_SECONDS) =>
      createSignedUrl(fileId, ttlSeconds),
    remove: (fileId) => removeFile(fileId),
    resolveProvider: (companyId) => resolveProvider(companyId),
    migrate: (fileId, target) => migrateFile(fileId, target),
  };
}
