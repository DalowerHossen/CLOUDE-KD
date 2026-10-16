// path: services/auth/actor.ts
// Builds the Actor of the current request from the verified Supabase user and the platform session record.
// Checks end time, revocation, device binding and address change on every call (zero trust: nothing is cached across requests).
import 'server-only';
import { decodeJwt } from 'jose';
import { z } from 'zod';
import { isAdminSubRole, isRole } from '@/lib/auth/roles';
import { tryGetService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import { getContext } from '@/lib/logger/correlation';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import { readRequestMeta } from '@/services/audit/request-meta';
import type { Actor } from '@/types/contracts';
import { isSessionActive } from '@/lib/auth/session';
import { hashIdentifier } from './lock-service';
import { currentDeviceHash } from './device';
import { recordLoginEvent } from './login-events';

const log = createLogger({ component: 'actor' });

const sessionRow = z
  .object({
    id: z.string().uuid(),
    device_hash: z.string().nullable(),
    ip_hash: z.string().nullable(),
    aal: z.enum(['aal1', 'aal2']),
    last_active_at: z.string(),
    expires_at: z.string(),
    revoked_at: z.string().nullable(),
    created_at: z.string(),
    step_up_at: z.string().nullable(),
    impersonated_by: z.string().uuid().nullable(),
  })
  .strip();

const metadata = z
  .object({ company_id: z.string().uuid().nullable().optional(), role: z.string().optional() })
  .passthrough();
const TOUCH_AFTER_MS = 60_000;

const requestCache = new WeakMap<object, Promise<Actor | null>>();

async function resolveActor(): Promise<Actor | null> {
  const client = await createServerSupabase();
  const { data: auth } = await client.auth.getUser();
  const user = auth.user;
  if (!user || !user.email) return null;
  const meta = metadata.safeParse(user.app_metadata);
  if (!meta.success || !isRole(meta.data.role)) return null;
  const role = meta.data.role;

  const { data: sessionData } = await client.auth.getSession();
  const token = sessionData.session?.access_token;
  const authSessionId = token ? decodeJwt(token).session_id : undefined;
  if (typeof authSessionId !== 'string') return null;

  const admin = getAdminSupabase();
  const found = await admin
    .from('user_sessions')
    .select(
      'id, device_hash, ip_hash, aal, last_active_at, expires_at, revoked_at, created_at, step_up_at, impersonated_by',
    )
    .eq('auth_session_id', authSessionId)
    .is('deleted_at', null)
    .maybeSingle();
  if (found.error) throw new InternalError(found.error);
  if (!found.data) return null;
  const session = sessionRow.parse(found.data);
  const now = new Date();
  if (!isSessionActive({ expiresAt: session.expires_at, revokedAt: session.revoked_at }, now)) {
    await client.auth.signOut({ scope: 'local' });
    return null;
  }

  const request = await readRequestMeta();
  const device = await currentDeviceHash();
  const identifier = await hashIdentifier(user.email);
  // Same session on another device: the cookie was copied. End it and tell the security service.
  if (session.device_hash && session.device_hash !== device.hash) {
    await admin.rpc('kd_revoke_user_sessions', {
      p_user: user.id,
      p_except: null,
      p_reason: 'device_mismatch',
    });
    await recordLoginEvent({
      identifierHash: identifier,
      type: 'ip_change',
      userId: user.id,
      detail: { device_mismatch: true },
    });
    await tryGetService('security')?.raiseSecurityEvent('account_takeover_signal', {
      userId: user.id,
      reason: 'session_device_mismatch',
    });
    log.warn('session ended: device mismatch', { userId: user.id });
    return null;
  }
  const updates: Record<string, unknown> = {};
  if (request.ipHash && session.ip_hash && request.ipHash !== session.ip_hash) {
    updates.ip_hash = request.ipHash;
    updates.ip_masked = request.ipMasked;
    await recordLoginEvent({
      identifierHash: identifier,
      type: 'ip_change',
      userId: user.id,
      detail: { mid_session: true },
    });
    await tryGetService('security')?.raiseSecurityEvent('account_takeover_signal', {
      userId: user.id,
      reason: 'session_ip_change',
    });
  }
  if (now.getTime() - Date.parse(session.last_active_at) > TOUCH_AFTER_MS)
    updates.last_active_at = now.toISOString();
  if (Object.keys(updates).length > 0)
    await admin.from('user_sessions').update(updates).eq('id', session.id);

  let subRole = null;
  if (role === 'admin_staff') {
    const profile = await admin
      .from('profiles')
      .select('admin_sub_role')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!profile.error && isAdminSubRole(profile.data?.admin_sub_role))
      subRole = profile.data.admin_sub_role;
  }
  return {
    userId: user.id,
    role,
    subRole,
    companyId: meta.data.company_id ?? null,
    email: user.email,
    sessionId: session.id,
    impersonatedBy: session.impersonated_by,
    authenticatedAt: session.created_at,
    lastStepUpAt: session.step_up_at,
    mfaVerified: session.aal === 'aal2',
  };
}

/** Actor of the current request, or null. Memoized for the lifetime of one API request. */
export function currentActor(): Promise<Actor | null> {
  const context = getContext();
  if (!context) return resolveActor();
  const cached = requestCache.get(context);
  if (cached) return cached;
  const pending = resolveActor();
  requestCache.set(context, pending);
  return pending;
}
