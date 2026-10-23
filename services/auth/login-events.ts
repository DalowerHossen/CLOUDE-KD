// path: services/auth/login-events.ts
// Writes auth_login_events (append-only). Address and user agent are stored masked or hashed.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { getContext } from '@/lib/logger/correlation';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { readRequestMeta } from '@/services/audit/request-meta';

export type LoginEventType =
  | 'login_success'
  | 'login_failed'
  | 'two_factor_success'
  | 'two_factor_failed'
  | 'backup_code_used'
  | 'locked'
  | 'blocked_while_locked'
  | 'logout'
  | 'logout_all'
  | 'password_changed'
  | 'reset_requested'
  | 'reset_suppressed'
  | 'reset_completed'
  | 'unlock_requested'
  | 'unlock_confirmed'
  | 'unlock_completed'
  | 'new_device'
  | 'ip_change'
  | 'oauth_login'
  | 'impersonation_started'
  | 'impersonation_ended'
  | 'signup'
  | 'email_verified';

export async function recordLoginEvent(input: {
  identifierHash: string;
  type: LoginEventType;
  userId?: string | null;
  companyId?: string | null;
  deviceHash?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const meta = await readRequestMeta();
  const { error } = await getAdminSupabase()
    .from('auth_login_events')
    .insert({
      identifier_hash: input.identifierHash,
      event_type: input.type,
      user_id: input.userId ?? null,
      company_id: input.companyId ?? null,
      ip_masked: meta.ipMasked,
      ip_hash: meta.ipHash,
      user_agent_hash: meta.userAgentHash,
      device_hash: input.deviceHash ?? null,
      detail: input.detail ?? {},
      correlation_id: getContext()?.correlationId ?? null,
    });
  if (error) throw new InternalError(error);
}

/** Failed sign-ins from the current address inside the window. */
export async function currentIpFailures(windowSeconds: number): Promise<number> {
  const meta = await readRequestMeta();
  if (!meta.ipHash) return 0;
  const { data, error } = await getAdminSupabase().rpc('kd_ip_failures', {
    p_ip_hash: meta.ipHash,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new InternalError(error);
  return typeof data === 'number' ? data : 0;
}
