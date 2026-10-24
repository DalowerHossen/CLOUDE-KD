// path: services/storage/upload-sessions.ts
// Chunked, resumable uploads (feature 3663). The browser sends 1 MB chunks; a repeated chunk replaces the earlier
// one, so a lost connection is resumed by asking which chunks the server has.
import 'server-only';
import { z } from 'zod';
import { CHUNK_BYTES, UPLOAD_SESSION_TTL_SECONDS } from '@/config/storage';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { sizeLimit } from '@/lib/storage/validate/limits';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { FileCategory } from '@/types/contracts';

export const FILE_CATEGORIES = [
  'invoice',
  'receipt',
  'contract',
  'kyc',
  'logo',
  'attachment',
  'payslip',
  'evidence',
  'export',
  'cms',
  'other',
] as const;

export const createSessionSchema = z
  .object({
    category: z.enum(FILE_CATEGORIES),
    name: z.string().trim().min(1).max(200),
    totalBytes: z
      .number()
      .int()
      .min(1)
      .max(10 * 1024 * 1024),
    declaredMime: z.string().trim().max(120).nullable().default(null),
    sha256: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/)
      .nullable()
      .default(null),
  })
  .strict();
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

const sessionRow = z
  .object({
    id: z.string().uuid(),
    company_id: z.string().uuid().nullable(),
    user_id: z.string().uuid(),
    category: z.string(),
    name: z.string(),
    declared_mime: z.string().nullable(),
    file_bytes: z.coerce.number(),
    chunk_bytes: z.number().int(),
    chunk_count: z.number().int(),
    expected_hash: z.string().nullable(),
    status: z.string(),
    expires_at: z.string(),
  })
  .strip();
export type UploadSession = z.infer<typeof sessionRow>;

export async function createSession(
  companyId: string | null,
  userId: string,
  input: CreateSessionInput,
): Promise<{ id: string; chunkBytes: number; chunkCount: number; expiresAt: string }> {
  // The largest allowed file of this category bounds the session before any chunk is accepted.
  if (
    input.totalBytes > Math.max(sizeLimit('pdf', input.category), sizeLimit('png', input.category))
  ) {
    throw new ValidationError('The file is too large.');
  }
  const chunkCount = Math.ceil(input.totalBytes / CHUNK_BYTES);
  const expiresAt = new Date(Date.now() + UPLOAD_SESSION_TTL_SECONDS * 1000).toISOString();
  const { data, error } = await getAdminSupabase()
    .from('upload_sessions')
    .insert({
      company_id: companyId,
      user_id: userId,
      category: input.category,
      name: input.name,
      declared_mime: input.declaredMime,
      file_bytes: input.totalBytes,
      chunk_bytes: CHUNK_BYTES,
      chunk_count: chunkCount,
      expected_hash: input.sha256 ? input.sha256.toLowerCase() : null,
      expires_at: expiresAt,
    })
    .select('id')
    .single();
  if (error) throw new InternalError(error);
  return { id: String(data.id), chunkBytes: CHUNK_BYTES, chunkCount, expiresAt };
}

/** The session must belong to the caller (same user and company); anything else looks like "not found". */
export async function loadSession(
  id: string,
  companyId: string | null,
  userId: string,
): Promise<UploadSession> {
  const { data, error } = await getAdminSupabase()
    .from('upload_sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const session = sessionRow.parse(data);
  if (session.company_id !== companyId) throw new NotFoundError();
  return session;
}

export async function sessionProgress(
  session: UploadSession,
): Promise<{ received: number[]; status: string }> {
  const { data, error } = await getAdminSupabase()
    .from('upload_chunks')
    .select('idx')
    .eq('session_id', session.id)
    .order('idx');
  if (error) throw new InternalError(error);
  return { received: (data ?? []).map((r) => Number(r.idx)), status: session.status };
}

export async function putChunk(
  session: UploadSession,
  index: number,
  bytes: Uint8Array,
): Promise<number> {
  if (bytes.length === 0) throw new ValidationError('The chunk is empty.');
  const { data, error } = await getAdminSupabase().rpc('kd_upload_chunk_put', {
    p_session: session.id,
    p_idx: index,
    p_data: `\\x${Buffer.from(bytes).toString('hex')}`,
  });
  if (error) {
    if (error.code === 'P0002') throw new NotFoundError();
    if (error.code === '22023') throw new ValidationError('The chunk does not fit this upload.');
    throw new InternalError(error);
  }
  return z.coerce.number().parse(data);
}

/** Locks the session for assembly and returns the whole file. Only one request can win. */
export async function takeAssembledFile(
  sessionId: string,
  userId: string,
): Promise<{ session: UploadSession; bytes: Buffer }> {
  const admin = getAdminSupabase();
  const { data, error } = await admin.rpc('kd_upload_begin_complete', {
    p_session: sessionId,
    p_user: userId,
  });
  if (error) {
    if (error.code === 'P0002') throw new NotFoundError();
    if (error.code === '22023')
      throw new ValidationError('Some parts of the file are missing. Resume the upload.');
    throw new InternalError(error);
  }
  const session = sessionRow.parse(data);
  const chunks = await admin
    .from('upload_chunks')
    .select('idx, data')
    .eq('session_id', sessionId)
    .order('idx');
  if (chunks.error) throw new InternalError(chunks.error);
  const parts = (chunks.data ?? []).map((c) =>
    Buffer.from(String(c.data).replace(/^\\x/, ''), 'hex'),
  );
  return { session, bytes: Buffer.concat(parts) };
}

export async function finishSession(
  sessionId: string,
  fileId: string | null,
  ok: boolean,
): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('upload_sessions')
    .update({ status: ok ? 'complete' : 'aborted', file_id: fileId })
    .eq('id', sessionId);
  if (error) throw new InternalError(error);
  await getAdminSupabase().from('upload_chunks').delete().eq('session_id', sessionId);
}

export async function abortSession(session: UploadSession): Promise<void> {
  await finishSession(session.id, null, false);
}

export type { FileCategory };
