// path: services/storage/storage-core.ts
// put, get, remove and restore of files. Plaintext never leaves this module: bytes are validated, encrypted with
// AES-256-GCM (key purpose files or kyc, scope = company) and only then handed to a provider adapter.
import 'server-only';
import { createHash } from 'node:crypto';
import { RETENTION_YEARS } from '@/config/storage';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getContext } from '@/lib/logger/correlation';
import { watermarkPdf } from '@/lib/storage/watermark';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { uuidv7 } from '@/lib/utils/uuid';
import type { FileRecord } from '@/types/contracts';
import { logAccess } from './access-log';
import {
  assertCanAccess,
  currentActorOrNull,
  cryptoFor,
  findDuplicate,
  fileRow,
  loadFile,
  toRecord,
} from './files';
import { prepareUpload } from './prepare';
import { getAdapter } from './providers';
import { assertWithinQuota, recordMonthlyUsage } from './quota';
import { resolveProvider } from './resolver';
import type { FileCategory } from '@/types/contracts';

const log = createLogger({ component: 'storage' });

export interface PutInput {
  companyId: string | null;
  category: FileCategory;
  name: string;
  bytes: Uint8Array;
  mimeType: string;
  /** SHA-256 (hex) the browser computed; a difference means the bytes were damaged on the way. */
  clientHash?: string | null;
}

function retentionUntil(category: FileCategory): string | null {
  const years = RETENTION_YEARS[category];
  if (!years) return null;
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString();
}

export async function putFile(input: PutInput): Promise<FileRecord> {
  const context = getContext();
  const actor = await currentActorOrNull();
  // A request that runs for one company cannot write files for another.
  if (context?.companyId && input.companyId !== context.companyId) throw new NotFoundError();
  if (input.category === 'kyc' && !input.companyId)
    throw new ValidationError('KYC files belong to a company.');

  const prepared = await prepareUpload({
    companyId: input.companyId,
    userId: actor?.userId ?? null,
    category: input.category,
    name: input.name,
    bytes: input.bytes,
    declaredMime: input.mimeType,
    clientHash: input.clientHash ?? null,
  });
  let { file } = prepared;

  const duplicate = await findDuplicate(input.companyId, input.category, file.contentHash);
  if (duplicate) {
    await logAccess(input.companyId, duplicate.id, 'duplicate', duplicate.storage_provider);
    return toRecord(duplicate);
  }

  if (input.companyId) await assertWithinQuota(input.companyId, file.sizeBytes);

  let bytes: Uint8Array = file.bytes;
  if (input.category === 'export' && file.kind === 'pdf') {
    bytes = await watermarkPdf(
      bytes,
      `KD SOLUTION IT | ${(input.companyId ?? 'platform').slice(0, 8)} | ${new Date().toISOString().slice(0, 10)}`,
    );
    file = {
      ...file,
      bytes,
      sizeBytes: bytes.length,
      contentHash: createHash('sha256').update(bytes).digest('hex'),
    };
  }
  if (input.companyId) await recordMonthlyUsage(input.companyId, file.sizeBytes);

  const fileId = uuidv7();
  const { purpose, scope } = cryptoFor({ category: input.category, company_id: input.companyId });
  const sealed = await getService('encryption').encrypt(purpose, file.bytes, scope);
  const provider = await resolveProvider(input.companyId);
  const stored = await getAdapter(provider).put({
    companyId: input.companyId,
    category: input.category,
    fileId,
    bytes: Buffer.from(sealed.ciphertext, 'base64'),
  });

  const { data, error } = await getAdminSupabase()
    .from('files')
    .insert({
      id: fileId,
      company_id: input.companyId,
      category: input.category,
      name: file.name,
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes,
      content_hash: file.contentHash,
      storage_provider: provider,
      storage_ref: stored.ref,
      key_version: sealed.keyVersion,
      enc_iv: sealed.iv,
      enc_tag: sealed.tag,
      scan_status: prepared.scanStatus,
      uploaded_by: actor?.userId ?? null,
      retention_until: retentionUntil(input.category),
    })
    .select('*')
    .single();
  if (error) {
    // The record could not be saved: take the stored object away again so no orphan stays behind.
    await getAdapter(provider)
      .remove(stored.ref, input.companyId)
      .catch((e: unknown) => log.error('orphan object remains', { e }));
    throw new InternalError(error);
  }
  const row = fileRow.parse(data);
  await logAccess(input.companyId, fileId, 'upload', provider);
  await getService('audit').record({
    action: 'file.uploaded',
    resourceType: 'file',
    resourceId: fileId,
    companyId: input.companyId,
    metadata: { category: input.category, provider, size: file.sizeBytes, notes: file.notes },
  });
  return toRecord(row);
}

export async function getFile(fileId: string): Promise<{ record: FileRecord; bytes: Uint8Array }> {
  const row = await loadFile(fileId);
  await assertCanAccess(row, await currentActorOrNull());
  return readRow(row);
}

/** Reads, decrypts and verifies a file whose access was already checked. */
export async function readRow(
  row: ReturnType<typeof fileRow.parse>,
): Promise<{ record: FileRecord; bytes: Uint8Array }> {
  const sealed = await getAdapter(row.storage_provider).get(row.storage_ref, row.company_id);
  const { purpose, scope } = cryptoFor(row);
  const plain = await getService('encryption').decrypt(
    purpose,
    {
      ciphertext: Buffer.from(sealed).toString('base64'),
      iv: row.enc_iv,
      tag: row.enc_tag,
      keyVersion: row.key_version,
    },
    scope,
  );
  // Integrity check (feature 3453): the bytes must still hash to the value stored at upload time.
  if (createHash('sha256').update(plain).digest('hex') !== row.content_hash) {
    throw new InternalError(new Error(`Integrity check failed for file ${row.id}`));
  }
  await logAccess(row.company_id, row.id, 'download', row.storage_provider);
  return { record: toRecord(row), bytes: plain };
}

/** Moves a file to the trash. It stays restorable for 30 days; the retention job removes it for good afterwards. */
export async function removeFile(fileId: string): Promise<void> {
  const row = await loadFile(fileId);
  await assertCanAccess(row, await currentActorOrNull());
  const { error } = await getAdminSupabase()
    .from('files')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', fileId)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  await logAccess(row.company_id, fileId, 'delete', row.storage_provider);
  await getService('audit').record({
    action: 'file.deleted',
    resourceType: 'file',
    resourceId: fileId,
    companyId: row.company_id,
    metadata: { category: row.category },
  });
}

export async function restoreFile(fileId: string): Promise<FileRecord> {
  const row = await loadFile(fileId, { includeDeleted: true });
  await assertCanAccess(row, await currentActorOrNull());
  if (!row.deleted_at || row.purged_at) throw new NotFoundError();
  if (Date.now() - Date.parse(row.deleted_at) > 30 * 86_400_000)
    throw new ValidationError('The 30 day restore period has passed.');
  const { data, error } = await getAdminSupabase()
    .from('files')
    .update({ deleted_at: null })
    .eq('id', fileId)
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505')
      throw new ValidationError('The same file was uploaded again; restore is not needed.');
    throw new InternalError(error);
  }
  await logAccess(row.company_id, fileId, 'restore', row.storage_provider);
  await getService('audit').record({
    action: 'file.restored',
    resourceType: 'file',
    resourceId: fileId,
    companyId: row.company_id,
    metadata: {},
  });
  return toRecord(fileRow.parse(data));
}
