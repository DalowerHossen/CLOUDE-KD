// path: services/fraud/admin-ops.ts
// Fraud console: top risks, recent signals and the manual actions of the fraud team.
import 'server-only';
import { z } from 'zod';
import { getService } from '@/lib/container';
import { adaptiveAction, type AdaptiveAction } from '@/lib/security/risk-scoring';
import { InternalError, NotFoundError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { banIp } from '@/services/security/rate-limit';
import type { Actor } from '@/types/contracts';
import { lockUser, terminateSessions } from './reaction';

export const fraudActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('clear_risk'),
      subjectType: z.enum(['user', 'device', 'ip', 'company']),
      ref: z.string().min(1).max(100),
    })
    .strict(),
  z.object({ action: z.literal('terminate_sessions'), userId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('lock_user'), userId: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal('ban_ip'),
      ipHash: z.string().regex(/^[0-9a-f]{64}$/),
      hours: z.number().int().min(1).max(8760).default(24),
    })
    .strict(),
]);

export interface FraudOverview {
  risks: {
    id: string;
    subjectType: string;
    ref: string;
    score: number;
    action: AdaptiveAction;
    factors: Record<string, number>;
    scoredAt: string;
  }[];
  signals: {
    id: string;
    type: string;
    subjectType: string;
    ref: string;
    delta: number;
    createdAt: string;
  }[];
}

const riskRow = z
  .object({
    id: z.string().uuid(),
    subject_type: z.string(),
    subject_ref: z.string(),
    score: z.coerce.number(),
    factors: z.record(z.string(), z.coerce.number()),
    scored_at: z.string(),
  })
  .strip();
const signalRow = z
  .object({
    id: z.string().uuid(),
    signal_type: z.string(),
    subject_type: z.string(),
    subject_ref: z.string(),
    score_delta: z.number(),
    created_at: z.string(),
  })
  .strip();

export async function fraudOverview(): Promise<FraudOverview> {
  const admin = getAdminSupabase();
  const [risks, signals] = await Promise.all([
    admin
      .from('risk_scores')
      .select('id, subject_type, subject_ref, score, factors, scored_at')
      .is('deleted_at', null)
      .gt('score', 0)
      .order('score', { ascending: false })
      .limit(50),
    admin
      .from('fraud_signals')
      .select('id, signal_type, subject_type, subject_ref, score_delta, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  if (risks.error) throw new InternalError(risks.error);
  if (signals.error) throw new InternalError(signals.error);
  return {
    risks: z
      .array(riskRow)
      .parse(risks.data)
      .map((r) => ({
        id: r.id,
        subjectType: r.subject_type,
        ref: r.subject_ref,
        score: r.score,
        action: adaptiveAction(r.score),
        factors: r.factors,
        scoredAt: r.scored_at,
      })),
    signals: z
      .array(signalRow)
      .parse(signals.data)
      .map((r) => ({
        id: r.id,
        type: r.signal_type,
        subjectType: r.subject_type,
        ref: r.subject_ref,
        delta: r.score_delta,
        createdAt: r.created_at,
      })),
  };
}

export async function runFraudAction(
  actor: Actor,
  input: z.infer<typeof fraudActionSchema>,
): Promise<void> {
  const audit = getService('audit');
  switch (input.action) {
    case 'clear_risk': {
      const { data, error } = await getAdminSupabase().rpc('kd_risk_clear', {
        p_subject_type: input.subjectType,
        p_ref: input.ref,
      });
      if (error) throw new InternalError(error);
      if (data !== true) throw new NotFoundError();
      await audit.record({
        action: 'fraud.risk_cleared',
        resourceType: 'risk_score',
        resourceId: null,
        companyId: null,
        metadata: { subject_type: input.subjectType },
      });
      return;
    }
    case 'terminate_sessions':
      await terminateSessions(input.userId, 'fraud team');
      await audit.record({
        action: 'fraud.sessions_terminated',
        resourceType: 'user',
        resourceId: input.userId,
        metadata: { by: actor.userId },
      });
      return;
    case 'lock_user':
      await lockUser(input.userId, null);
      await audit.record({
        action: 'fraud.user_locked',
        resourceType: 'user',
        resourceId: input.userId,
        metadata: { by: actor.userId },
      });
      return;
    case 'ban_ip':
      await banIp(input.ipHash, null, 'fraud team', input.hours * 3600, actor.userId);
      await audit.record({
        action: 'fraud.ip_banned',
        resourceType: 'ip_block',
        resourceId: null,
        companyId: null,
        metadata: { hours: input.hours },
      });
      return;
  }
}
