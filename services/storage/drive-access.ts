// path: services/storage/drive-access.ts
// Access tokens for the company's Google Drive link. The refresh token and the short-lived access token are stored
// encrypted (purpose oauth-tokens, scope = company id); a refresh that Google rejects marks the link as revoked.
import 'server-only';
import { z } from 'zod';
import { getService } from '@/lib/container';
import { getServerEnv } from '@/lib/env';
import { InternalError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { ProviderUnavailableError } from '@/lib/storage/adapters/base';
import type { DriveAccess } from '@/lib/storage/adapters/google-drive';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { EncryptedPayload } from '@/types/contracts';

const log = createLogger({ component: 'drive-access' });
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const payload = z
  .object({ ciphertext: z.string(), iv: z.string(), tag: z.string(), keyVersion: z.number().int() })
  .strict();
const connection = z
  .object({
    id: z.string().uuid(),
    company_id: z.string().uuid(),
    refresh_token: payload,
    access_token: payload.nullable(),
    access_expires_at: z.string().nullable(),
    folder_cache: z.record(z.string(), z.string()).nullable(),
    status: z.enum(['connected', 'revoked', 'error']),
  })
  .strip();
export type DriveConnection = z.infer<typeof connection>;

export async function loadConnection(companyId: string): Promise<DriveConnection | null> {
  const { data, error } = await getAdminSupabase()
    .from('drive_connections')
    .select('id, company_id, refresh_token, access_token, access_expires_at, folder_cache, status')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return data ? connection.parse(data) : null;
}

async function decryptToken(companyId: string, value: EncryptedPayload): Promise<string> {
  const bytes = await getService('encryption').decrypt('oauth-tokens', value, companyId);
  return new TextDecoder().decode(bytes);
}

export async function markRevoked(companyId: string, message: string): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('drive_connections')
    .update({
      status: 'revoked',
      last_error: message.slice(0, 300),
      access_token: null,
      access_expires_at: null,
    })
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (error) log.error('drive link could not be marked as revoked', { error });
}

async function refresh(row: DriveConnection): Promise<string> {
  const env = getServerEnv();
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new ProviderUnavailableError('google_drive', 'Google sign-in is not configured.');
  }
  const refreshToken = await decryptToken(row.company_id, row.refresh_token);
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!response) throw new ProviderUnavailableError('google_drive', 'Google could not be reached.');
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (body.error === 'invalid_grant') {
      await markRevoked(row.company_id, 'Google no longer accepts the saved sign-in.');
      throw new ProviderUnavailableError('google_drive', 'The Google Drive link was revoked.');
    }
    throw new ProviderUnavailableError('google_drive', 'Google could not refresh the sign-in.');
  }
  const body = z
    .object({ access_token: z.string().min(10), expires_in: z.number().int().min(60) })
    .parse(await response.json());
  const encrypted = await getService('encryption').encrypt(
    'oauth-tokens',
    body.access_token,
    row.company_id,
  );
  await getAdminSupabase()
    .from('drive_connections')
    .update({
      access_token: encrypted,
      access_expires_at: new Date(Date.now() + body.expires_in * 1000).toISOString(),
      status: 'connected',
      last_error: null,
    })
    .eq('id', row.id);
  return body.access_token;
}

export const driveAccess: DriveAccess = {
  async accessToken(companyId) {
    const row = await loadConnection(companyId);
    if (!row || row.status === 'revoked') {
      throw new ProviderUnavailableError('google_drive', 'No Google Drive link is active.');
    }
    if (
      row.access_token &&
      row.access_expires_at &&
      Date.parse(row.access_expires_at) - Date.now() > 60_000
    ) {
      return decryptToken(companyId, row.access_token);
    }
    return refresh(row);
  },
  async folderCache(companyId) {
    return (await loadConnection(companyId))?.folder_cache ?? {};
  },
  async saveFolder(companyId, key, folderId) {
    const row = await loadConnection(companyId);
    if (!row) return;
    const { error } = await getAdminSupabase()
      .from('drive_connections')
      .update({ folder_cache: { ...(row.folder_cache ?? {}), [key]: folderId } })
      .eq('id', row.id);
    if (error) throw new InternalError(error);
  },
  markRevoked,
};
