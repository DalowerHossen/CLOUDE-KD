// path: services/storage/signed-urls.ts
// Short-lived download links (feature 3665). The link holds a random token; only its hash is stored. A link is tied
// to the company of the file: by default the person opening it must be signed in to that company (hotlinking and
// forwarding do not work). KYC files never get a link that works without a session.
import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { SIGNED_URL_DEFAULT_SECONDS, SIGNED_URL_MAX_SECONDS } from '@/config/storage';
import { getServerEnv } from '@/lib/env';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getContext } from '@/lib/logger/correlation';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor, FileRecord } from '@/types/contracts';
import { logAccess } from './access-log';
import { assertCanAccess, currentActorOrNull, loadFile } from './files';
import { readRow } from './storage-core';

export interface SignedUrlOptions {
  /** Anyone holding the link can open it. Not allowed for KYC files. Default: a session of the company is required. */
  openToAnyone?: boolean;
  /** Show in the browser (images, PDF) instead of downloading. */
  inline?: boolean;
  maxUses?: number;
}

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export async function createSignedUrl(
  fileId: string,
  ttlSeconds: number = SIGNED_URL_DEFAULT_SECONDS,
  options: SignedUrlOptions = {},
): Promise<string> {
  const row = await loadFile(fileId);
  await assertCanAccess(row, await currentActorOrNull());
  if (options.openToAnyone && row.category === 'kyc') {
    throw new ValidationError('KYC files can only be opened by a signed-in person.');
  }
  const ttl = Math.max(30, Math.min(Math.floor(ttlSeconds), SIGNED_URL_MAX_SECONDS));
  const token = randomBytes(24).toString('base64url');
  const { error } = await getAdminSupabase()
    .from('signed_url_grants')
    .insert({
      company_id: row.company_id,
      file_id: row.id,
      token_hash: hashToken(token),
      session_required: options.openToAnyone !== true,
      inline: options.inline === true,
      max_uses: Math.max(1, Math.min(options.maxUses ?? 5, 100)),
      expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
      created_by: getContext()?.actorId ?? null,
    });
  if (error) throw new InternalError(error);
  await logAccess(row.company_id, row.id, 'signed_url', row.storage_provider);
  return `${getServerEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/storage/download/${token}`;
}

const grantRow = z
  .object({
    file_id: z.string().uuid(),
    company_id: z.string().uuid().nullable(),
    session_required: z.boolean(),
    inline: z.boolean(),
  })
  .strip();

/** Redeems a link. Anything wrong (unknown, expired, used up, other company, no session) looks like "not found". */
export async function redeemSignedUrl(
  token: string,
  actor: Actor | null,
): Promise<{ record: FileRecord; bytes: Uint8Array; inline: boolean }> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new NotFoundError();
  const { data, error } = await getAdminSupabase().rpc('kd_grant_redeem', {
    p_hash: hashToken(token),
  });
  if (error) throw new InternalError(error);
  const rows = z.array(grantRow).parse(data ?? []);
  const grant = rows[0];
  if (!grant) throw new NotFoundError();
  const row = await loadFile(grant.file_id);
  if (grant.session_required || row.category === 'kyc') {
    if (!actor) throw new NotFoundError();
    await assertCanAccess(row, actor);
  }
  const { record, bytes } = await readRow(row);
  return { record, bytes, inline: grant.inline };
}
