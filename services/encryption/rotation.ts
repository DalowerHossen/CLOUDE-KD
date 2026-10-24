// path: services/encryption/rotation.ts
// Zero-downtime re-encryption of one column to the active key version. Old versions stay readable meanwhile.
import 'server-only';
import { z } from 'zod';
import { decryptBytes, encryptBytes } from '@/lib/encryption/aead';
import { InternalError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { EncryptionPurpose } from '@/types/contracts';
import { activeKeyVersion, rootKeys } from './keys';

const IDENT = /^[a-z][a-z0-9_]*$/;
const payloadSchema = z
  .object({ ciphertext: z.string(), iv: z.string(), tag: z.string(), keyVersion: z.number().int() })
  .strict();

export const rotationSchema = z
  .object({
    table: z.string().regex(IDENT),
    column: z.string().regex(IDENT),
    purpose: z.enum(['files', 'processor-credentials', 'oauth-tokens', 'kyc', 'pii']),
    /** Column that holds the scope given at encryption time (company id, user id), or null when none was used. */
    scopeColumn: z.string().regex(IDENT).nullable(),
    batchSize: z.number().int().min(1).max(500).default(100),
  })
  .strict();
export type RotationInput = z.infer<typeof rotationSchema>;

/** Re-encrypts up to `batchSize` rows that still use an older key version. Returns how many were changed. */
export async function rotateBatch(input: RotationInput): Promise<number> {
  const target = activeKeyVersion();
  if (target < 2)
    throw new ValidationError('Set ENCRYPTION_ACTIVE_KEY_VERSION above 1 before rotating.');
  const admin = getAdminSupabase();
  const select = ['id', input.column, ...(input.scopeColumn ? [input.scopeColumn] : [])].join(', ');
  const { data, error } = await admin
    .from(input.table)
    .select(select)
    .lt(`${input.column}->>keyVersion`, String(target))
    .not(input.column, 'is', null)
    .limit(input.batchSize);
  if (error) throw new InternalError(error);
  const roots = rootKeys();
  let changed = 0;
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const payload = payloadSchema.parse(row[input.column]);
    const scopeValue = input.scopeColumn ? row[input.scopeColumn] : '';
    const scope = typeof scopeValue === 'string' ? scopeValue : '';
    const plain = decryptBytes(roots, input.purpose as EncryptionPurpose, payload, scope);
    const next = encryptBytes(roots, target, input.purpose as EncryptionPurpose, plain, scope);
    const res = await admin
      .from(input.table)
      .update({ [input.column]: next })
      .eq('id', String(row.id))
      .eq(`${input.column}->>keyVersion`, String(payload.keyVersion))
      .select('id');
    if (res.error) throw new InternalError(res.error);
    changed += res.data?.length ?? 0;
  }
  if (changed > 0) {
    await admin.from('secret_access_log').insert({
      purpose: input.purpose,
      operation: 'rotate',
      key_version: target,
    });
  }
  return changed;
}
