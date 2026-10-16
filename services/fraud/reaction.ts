// path: services/fraud/reaction.ts
// Reaction to security events: records fraud signals for the address and the user, applies zero-tolerance actions and
// the fraud rules. Registered once at start-up (config/boot/s04-security.ts).
import 'server-only';
import { z } from 'zod';
import { SIGNAL_WEIGHTS } from '@/config/security';
import { evaluateRule, rulesForSignal, type FraudAction } from '@/lib/security/fraud-engine';
import { zeroToleranceFor } from '@/lib/security/zero-trust';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { banIp } from '@/services/security/rate-limit';
import { hashIdentifier } from '@/services/auth/lock-service';
import { LOCK_DURATION_SECONDS } from '@/config/auth-lock';
import type { SecurityEventListener } from '@/services/security/events';
import { recordSignal } from './signals';

const log = createLogger({ component: 'fraud-reaction' });

export interface ActionContext {
  ipHash: string | null;
  userId: string | null;
  companyId: string | null;
  banMinutes: number;
  reason: string;
}

export async function terminateSessions(userId: string, reason: string): Promise<void> {
  await getAdminSupabase().rpc('kd_revoke_user_sessions', {
    p_user: userId,
    p_except: null,
    p_reason: reason.slice(0, 100),
  });
}

/** Locks a user's sign-in for the standard lock time (same state as a failed-login lock, so the unlock workflow applies). */
export async function lockUser(userId: string, companyId: string | null): Promise<void> {
  const admin = getAdminSupabase();
  const profile = await admin
    .from('profiles')
    .select('email')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (profile.error || !profile.data?.email) return;
  const identifier = await hashIdentifier(String(profile.data.email));
  await admin.rpc('kd_lock_record_failure', {
    p_identifier: identifier,
    p_user: userId,
    p_company: companyId,
    p_kind: 'password',
    p_threshold: 1,
    p_duration_seconds: LOCK_DURATION_SECONDS,
  });
}

export async function applyAction(action: FraudAction, ctx: ActionContext): Promise<void> {
  switch (action) {
    case 'ban_ip':
      if (ctx.ipHash) await banIp(ctx.ipHash, null, ctx.reason, ctx.banMinutes * 60);
      return;
    case 'terminate_sessions':
      if (ctx.userId) await terminateSessions(ctx.userId, ctx.reason);
      return;
    case 'lock_user':
      if (ctx.userId) await lockUser(ctx.userId, ctx.companyId);
      return;
    case 'step_up':
    case 'alert':
      // Step-up is decided from the risk score at the next request; alerts are picked up by the alert engine.
      return;
  }
}

async function countSignals(
  subjectType: 'user' | 'ip',
  ref: string,
  signal: string,
  minutes: number,
): Promise<number> {
  const { data, error } = await getAdminSupabase().rpc('kd_signal_count', {
    p_subject_type: subjectType,
    p_ref: ref,
    p_type: signal,
    p_minutes: minutes,
  });
  if (error) return 0;
  return z.coerce.number().parse(data ?? 0);
}

export const reactToSecurityEvent: SecurityEventListener = async (event) => {
  if (!(event.type in SIGNAL_WEIGHTS)) return;
  try {
    if (event.ipHash)
      await recordSignal(event.type, 'ip', event.ipHash, {
        companyId: event.companyId,
        details: { severity: event.severity },
      });
    if (event.actorId)
      await recordSignal(event.type, 'user', event.actorId, { companyId: event.companyId });

    const base = { ipHash: event.ipHash, userId: event.actorId, companyId: event.companyId };
    const tolerance = zeroToleranceFor(event.type);
    if (tolerance) {
      for (const action of tolerance.actions) {
        await applyAction(action, {
          ...base,
          banMinutes: tolerance.banMinutes ?? 60,
          reason: `zero tolerance: ${event.type}`,
        });
      }
    }
    for (const [subject, ref] of [
      ['ip', event.ipHash],
      ['user', event.actorId],
    ] as const) {
      if (!ref) continue;
      for (const rule of rulesForSignal(event.type, subject)) {
        const hit = evaluateRule(
          rule,
          await countSignals(subject, ref, rule.signal, rule.windowMinutes),
        );
        if (!hit) continue;
        for (const action of rule.actions) {
          await applyAction(action, {
            ...base,
            banMinutes: rule.banMinutes ?? 60,
            reason: `rule ${rule.id}`,
          });
        }
      }
    }
  } catch (error) {
    log.error('fraud reaction failed', { type: event.type, error });
  }
};
