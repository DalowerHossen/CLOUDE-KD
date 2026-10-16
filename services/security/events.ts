// path: services/security/events.ts
// Security events: stored in security_events (append-only), published as the domain event `security.event`.
// Details are redacted before they are stored. The zero-tolerance reaction (04.7) subscribes through `onSecurityEvent`.
import 'server-only';
import { tryGetService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getContext } from '@/lib/logger/correlation';
import { redact } from '@/lib/logger/redact';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { readRequestMeta } from '@/services/audit/request-meta';
import type { SecurityEventType } from '@/types/contracts';

const log = createLogger({ component: 'security-events' });

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

const SEVERITY: Readonly<Record<SecurityEventType, Severity>> = {
  sql_injection_attempt: 'high',
  xss_attempt: 'high',
  csrf_failure: 'medium',
  brute_force: 'high',
  credential_stuffing: 'high',
  token_abuse: 'high',
  webhook_signature_invalid: 'medium',
  network_blocked: 'low',
  account_takeover_signal: 'critical',
  data_exfiltration_signal: 'critical',
  other: 'low',
};

export type SecurityEventListener = (event: {
  type: SecurityEventType;
  severity: Severity;
  details: Record<string, unknown>;
  ipHash: string | null;
  actorId: string | null;
  companyId: string | null;
}) => Promise<void>;

const listeners: SecurityEventListener[] = [];

/** Registers a reaction to security events (zero-tolerance engine, alerting, SIEM forwarding). */
export function onSecurityEvent(listener: SecurityEventListener): void {
  listeners.push(listener);
}

export function severityOf(type: SecurityEventType): Severity {
  return SEVERITY[type];
}

export async function raiseEvent(
  type: SecurityEventType,
  details: Record<string, unknown>,
): Promise<void> {
  const context = getContext();
  const severity = SEVERITY[type];
  const safe = redact(details) as Record<string, unknown>;
  let ipHash: string | null = null;
  try {
    const meta = await readRequestMeta();
    ipHash = meta.ipHash;
    const { error } = await getAdminSupabase().rpc('kd_security_event', {
      p_company: context?.companyId ?? null,
      p_type: type,
      p_severity: severity,
      p_source: typeof details.source === 'string' ? details.source : 'app',
      p_actor: context?.actorId ?? null,
      p_ip_hash: meta.ipHash,
      p_ip_masked: meta.ipMasked,
      p_details: safe,
      p_correlation: context?.correlationId ?? null,
    });
    if (error) throw new InternalError(error);
  } catch (error) {
    log.error('security event could not be stored', { type, error });
  }
  try {
    if (severity === 'high' || severity === 'critical') {
      await tryGetService('events')?.publish({
        name: 'security.event',
        companyId: context?.companyId ?? null,
        payload: { type, severity },
      });
    }
    for (const listener of listeners) {
      await listener({
        type,
        severity,
        details: safe,
        ipHash,
        actorId: context?.actorId ?? null,
        companyId: context?.companyId ?? null,
      });
    }
  } catch (error) {
    log.error('security event reaction failed', { type, error });
  }
}
