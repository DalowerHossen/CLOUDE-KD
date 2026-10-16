// path: services/storage/files.ts
// File record rows: parsing, lookup, tenant and permission checks.
import 'server-only';
import { z } from 'zod';
import { getService, tryGetService } from '@/lib/container';
import { ForbiddenError, InternalError, NotFoundError } from '@/lib/errors';
import { getContext } from '@/lib/logger/correlation';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, FileCategory, FileRecord, StorageProvider } from '@/types/contracts';
import { FILE_CATEGORIES } from './upload-sessions';

export const fileRow = z
  .object({
    id: z.string().uuid(),
    company_id: z.string().uuid().nullable(),
    category: z.enum(FILE_CATEGORIES),
    name: z.string(),
    mime_type: z.string(),
    size_bytes: z.coerce.number(),
    content_hash: z.string(),
    storage_provider: z.enum(['google_drive', 'supabase']),
    storage_ref: z.string(),
    key_version: z.number().int(),
    enc_iv: z.string(),
    enc_tag: z.string(),
    scan_status: z.string(),
    uploaded_by: z.string().uuid().nullable(),
    retention_until: z.string().nullable(),
    created_at: z.string(),
    deleted_at: z.string().nullable(),
    purged_at: z.string().nullable(),
  })
  .strip();
export type FileRow = z.infer<typeof fileRow>;

export function toRecord(row: FileRow): FileRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    category: row.category,
    name: row.name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    contentHash: row.content_hash,
    storageProvider: row.storage_provider,
    keyVersion: row.key_version,
    createdAt: row.created_at,
  };
}

export async function loadFile(
  id: string,
  options: { includeDeleted?: boolean } = {},
): Promise<FileRow> {
  let query = getAdminSupabase().from('files').select('*').eq('id', id);
  if (!options.includeDeleted) query = query.is('deleted_at', null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return fileRow.parse(data);
}

export async function findDuplicate(
  companyId: string | null,
  category: FileCategory,
  contentHash: string,
): Promise<FileRow | null> {
  let query = getAdminSupabase()
    .from('files')
    .select('*')
    .eq('category', category)
    .eq('content_hash', contentHash)
    .is('deleted_at', null);
  query = companyId ? query.eq('company_id', companyId) : query.is('company_id', null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new InternalError(error);
  return data ? fileRow.parse(data) : null;
}

/** Key purpose and scope used to encrypt a file: KYC has its own purpose; the scope is the company. */
export function cryptoFor(row: { category: string; company_id: string | null }): {
  purpose: 'kyc' | 'files';
  scope: string;
} {
  return { purpose: row.category === 'kyc' ? 'kyc' : 'files', scope: row.company_id ?? 'platform' };
}

/**
 * Tenant rule (Z2): a request that runs for a company can only see that company's files; a file of another
 * company looks like "not found". Requests without a company (platform staff, jobs) pass.
 * KYC files need the permission `kyc.file.read` whenever a person is behind the request.
 */
export async function assertCanAccess(
  row: { company_id: string | null; category: string },
  actor: Actor | null,
): Promise<void> {
  const context = getContext();
  const requestCompany = actor ? actor.companyId : (context?.companyId ?? null);
  if (requestCompany && row.company_id !== requestCompany) throw new NotFoundError();
  if (row.category === 'kyc' && actor) {
    const permissions = tryGetService('permissions');
    if (!permissions) throw new ForbiddenError();
    if (!(await permissions.can(actor, 'kyc.file.read', { type: 'file', id: null })))
      throw new ForbiddenError();
  }
}

export async function currentActorOrNull(): Promise<Actor | null> {
  const context = getContext();
  if (!context?.actorId) return null;
  try {
    return await getService('auth').getActor();
  } catch {
    return null;
  }
}

export type { StorageProvider };
