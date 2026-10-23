// path: services/storage/drive-link.ts
// Connect and disconnect the company's own Google Drive (OAuth 2.0 authorization code flow with PKCE, minimal scope
// drive.file, offline access). Tokens are stored encrypted (purpose oauth-tokens, scope = company id).
import 'server-only';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { getService } from '@/lib/container';
import { getServerEnv } from '@/lib/env';
import { getPublicEnv } from '@/lib/env/public';
import { InternalError, NotFoundError, UnauthorizedError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { cookieSecure } from '@/lib/auth/session';
import { buildAuthorizeUrl, createPkce, createState } from '@/lib/auth/oauth';
import { DRIVE_SCOPE } from '@/lib/storage/adapters/google-drive';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { quotaState } from './quota';

const log = createLogger({ component: 'drive-link' });
const COOKIE = 'kd_drive_oauth';
const TTL_SECONDS = 600;
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const ABOUT_URL =
  'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress),storageQuota(limit,usage)';

const key = (): Uint8Array =>
  new TextEncoder().encode(`drive-oauth:${getServerEnv().HMAC_TOKEN_SECRET}`);
const redirect = (): string =>
  `${getPublicEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, '')}/api/storage/drive/callback`;

function credentials(): { id: string; secret: string } {
  const env = getServerEnv();
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new ValidationError('Google Drive linking is not set up on this platform yet.');
  }
  return { id: env.GOOGLE_OAUTH_CLIENT_ID, secret: env.GOOGLE_OAUTH_CLIENT_SECRET };
}

export function driveLinkAvailable(): boolean {
  const env = getServerEnv();
  return Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET);
}

const cookieSchema = z.object({
  state: z.string(),
  verifier: z.string(),
  uid: z.string().uuid(),
  cid: z.string().uuid(),
});

export async function startDriveLink(actor: Actor): Promise<{ url: string }> {
  const { id } = credentials();
  if (!actor.companyId) throw new NotFoundError();
  const state = createState();
  const pkce = await createPkce();
  const token = await new SignJWT({
    state,
    verifier: pkce.verifier,
    uid: actor.userId,
    cid: actor.companyId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    path: '/api/storage/drive',
    maxAge: TTL_SECONDS,
  });
  // Same endpoint and PKCE as sign-in, with the Drive scope and a refresh token (offline access, consent each time).
  const base = buildAuthorizeUrl({
    provider: 'google',
    clientId: id,
    redirect: redirect(),
    state,
    challenge: pkce.challenge,
  });
  const url = new URL(base);
  url.searchParams.set('scope', DRIVE_SCOPE);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  if (url.origin + url.pathname !== AUTH_URL)
    throw new InternalError(new Error('Unexpected authorize URL'));
  return { url: url.toString() };
}

const tokenSchema = z
  .object({
    access_token: z.string().min(10),
    refresh_token: z.string().min(10).optional(),
    expires_in: z.number().int().min(60),
    scope: z.string().optional(),
  })
  .passthrough();
const aboutSchema = z
  .object({
    user: z.object({ emailAddress: z.string().email().optional() }).optional(),
    storageQuota: z
      .object({ limit: z.string().optional(), usage: z.string().optional() })
      .optional(),
  })
  .passthrough();

/** Finishes the link. Returns normally on success; every failure is a ValidationError with a safe message. */
export async function finishDriveLink(actor: Actor, code: string, state: string): Promise<void> {
  if (!actor.companyId) throw new UnauthorizedError();
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  jar.delete({ name: COOKIE, path: '/api/storage/drive' });
  if (!raw) throw new ValidationError('The link request expired. Please start again.');
  let saved: z.infer<typeof cookieSchema>;
  try {
    saved = cookieSchema.parse((await jwtVerify(raw, key())).payload);
  } catch {
    throw new ValidationError('The link request expired. Please start again.');
  }
  if (saved.state !== state || saved.uid !== actor.userId || saved.cid !== actor.companyId) {
    throw new ValidationError('The link request does not match your session. Please start again.');
  }
  const creds = credentials();
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: creds.id,
      client_secret: creds.secret,
      redirect_uri: redirect(),
      code_verifier: saved.verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!response?.ok)
    throw new ValidationError('Google did not accept the sign-in. Please try again.');
  const tokens = tokenSchema.parse(await response.json());
  if (!tokens.refresh_token) {
    throw new ValidationError(
      'Google did not allow access that lasts. Remove the app in your Google account permissions and link again.',
    );
  }
  if (!(tokens.scope ?? '').split(' ').includes(DRIVE_SCOPE)) {
    throw new ValidationError('The Drive permission was not granted.');
  }
  let email: string | null = null;
  let limit: number | null = null;
  let used: number | null = null;
  const about = await fetch(ABOUT_URL, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (about?.ok) {
    const parsed = aboutSchema.safeParse(await about.json());
    if (parsed.success) {
      email = parsed.data.user?.emailAddress ?? null;
      limit = parsed.data.storageQuota?.limit ? Number(parsed.data.storageQuota.limit) : null;
      used = parsed.data.storageQuota?.usage ? Number(parsed.data.storageQuota.usage) : null;
    }
  }
  const encryption = getService('encryption');
  const row = {
    company_id: actor.companyId,
    google_email: email,
    scope: DRIVE_SCOPE,
    refresh_token: await encryption.encrypt('oauth-tokens', tokens.refresh_token, actor.companyId),
    access_token: await encryption.encrypt('oauth-tokens', tokens.access_token, actor.companyId),
    access_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    folder_cache: {},
    status: 'connected',
    last_error: null,
    quota_limit_bytes: limit,
    quota_used_bytes: used,
    connected_by: actor.userId,
    connected_at: new Date().toISOString(),
    last_health_at: new Date().toISOString(),
  };
  const admin = getAdminSupabase();
  const existing = await admin
    .from('drive_connections')
    .select('id')
    .eq('company_id', actor.companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw new InternalError(existing.error);
  const result = existing.data
    ? await admin.from('drive_connections').update(row).eq('id', String(existing.data.id))
    : await admin.from('drive_connections').insert(row);
  if (result.error) throw new InternalError(result.error);
  await getService('audit').record({
    action: 'storage.drive_connected',
    resourceType: 'drive_connection',
    resourceId: null,
    companyId: actor.companyId,
    metadata: { reconnect: Boolean(existing.data) },
  });
}

export interface DriveStatus {
  available: boolean;
  connected: boolean;
  state: 'connected' | 'revoked' | 'error' | 'none';
  email: string | null;
  lastError: string | null;
  driveQuotaLimit: number | null;
  driveQuotaUsed: number | null;
  filesOnDrive: number;
  filesOnSupabase: number;
  provider: 'google_drive' | 'supabase';
  usedBytes: number;
  quotaBytes: number;
  monthlyLimitBytes: number;
}

async function countFiles(
  companyId: string,
  provider: 'google_drive' | 'supabase',
): Promise<number> {
  const { count, error } = await getAdminSupabase()
    .from('files')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('storage_provider', provider)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  return count ?? 0;
}

export async function driveStatus(companyId: string): Promise<DriveStatus> {
  const { data, error } = await getAdminSupabase()
    .from('drive_connections')
    .select('status, google_email, last_error, quota_limit_bytes, quota_used_bytes')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  const [onDrive, onSupabase, quota] = await Promise.all([
    countFiles(companyId, 'google_drive'),
    countFiles(companyId, 'supabase'),
    quotaState(companyId),
  ]);
  const state = data ? (String(data.status) as 'connected' | 'revoked' | 'error') : 'none';
  return {
    available: driveLinkAvailable(),
    connected: state === 'connected',
    state,
    email: data?.google_email ? String(data.google_email) : null,
    lastError: data?.last_error ? String(data.last_error) : null,
    driveQuotaLimit:
      data && data.quota_limit_bytes !== null ? Number(data.quota_limit_bytes) : null,
    driveQuotaUsed: data && data.quota_used_bytes !== null ? Number(data.quota_used_bytes) : null,
    filesOnDrive: onDrive,
    filesOnSupabase: onSupabase,
    provider: state === 'connected' ? 'google_drive' : 'supabase',
    usedBytes: quota.usedBytes,
    quotaBytes: quota.quotaBytes,
    monthlyLimitBytes: quota.monthlyLimitBytes,
  };
}

/** Removes the link. Files that still live in Drive cannot be opened afterwards, so move them first unless forced. */
export async function disconnectDrive(actor: Actor, force: boolean): Promise<void> {
  if (!actor.companyId) throw new NotFoundError();
  const onDrive = await countFiles(actor.companyId, 'google_drive');
  if (onDrive > 0 && !force) {
    throw new ValidationError(
      `${onDrive} file(s) are stored in your Google Drive. Move them to the platform storage first, or confirm that they may become unavailable.`,
    );
  }
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('drive_connections')
    .select('id, refresh_token')
    .eq('company_id', actor.companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  try {
    const token = new TextDecoder().decode(
      await getService('encryption').decrypt(
        'oauth-tokens',
        data.refresh_token as never,
        actor.companyId,
      ),
    );
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    // The grant can also be removed in the Google account; the local link is removed either way.
    log.warn('Google grant could not be revoked', {
      error: e instanceof Error ? e.message : 'failed',
    });
  }
  const del = await admin
    .from('drive_connections')
    .update({ deleted_at: new Date().toISOString(), access_token: null })
    .eq('id', String(data.id));
  if (del.error) throw new InternalError(del.error);
  await getService('audit').record({
    action: 'storage.drive_disconnected',
    resourceType: 'drive_connection',
    resourceId: String(data.id),
    companyId: actor.companyId,
    metadata: { forced: force, files_on_drive: onDrive },
  });
}
