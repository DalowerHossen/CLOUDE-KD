// path: services/base/optimistic-lock.ts
// UPDATE ... WHERE id = ? AND version = ? through the database function, so the check and the write are one statement.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ConflictError, InternalError, NotFoundError } from '@/lib/errors';

const TABLE_RE = /^[a-z][a-z0-9_]{0,62}$/;
const versionSchema = z.number().int().min(1);

export interface VersionedUpdateResult {
  version: number;
}

/** Maps a PostgREST error to a domain error. Code 40001 is a version mismatch. */
export function mapVersionError(error: { code?: string; message?: string }): never {
  if (error.code === '40001') throw new ConflictError();
  throw new InternalError();
}

export async function updateWithVersion(
  client: SupabaseClient,
  table: string,
  id: string,
  expectedVersion: number,
  patch: Record<string, unknown>,
): Promise<VersionedUpdateResult> {
  if (!TABLE_RE.test(table)) throw new InternalError();
  z.string().uuid().parse(id);
  versionSchema.parse(expectedVersion);
  if (Object.keys(patch).length === 0) throw new NotFoundError();
  const { data, error } = await client.rpc('kd_update_with_version', {
    p_table: table,
    p_id: id,
    p_expected: expectedVersion,
    p_patch: patch,
  });
  if (error) mapVersionError(error);
  const version = versionSchema.parse(data);
  return { version };
}
