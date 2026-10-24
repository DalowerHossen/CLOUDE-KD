// path: services/approval/approval-service.ts
// Implements the approval contract on top of the transactional database functions.
import 'server-only';
import { z } from 'zod';
import { resolveApprovalLevel, resolveSlaHours } from '@/lib/auth/approval-rules';
import { roleCanDecide, type StepLevel } from '@/lib/auth/approval-engine';
import { getService, tryGetService } from '@/lib/container';
import {
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import type {
  Actor,
  ApprovalDecision,
  ApprovalLevel,
  ApprovalRequestInput,
  ApprovalService,
  ApprovalState,
  ApprovalStatus,
} from '@/types/contracts';
import { mapApprovalDbError } from './db-errors';

const MAX_PAYLOAD_BYTES = 16_384;

const levelSchema = z.enum(['L0', 'L1', 'L2', 'L3', 'L2+L3']);
const stateRow = z
  .object({
    id: z.string().uuid(),
    status: z.enum(['pending', 'approved', 'rejected', 'escalated', 'expired', 'cancelled']),
    required_level: levelSchema,
    current_level: z.enum(['L0', 'L1', 'L2', 'L3']),
  })
  .strip();
const decideResult = z
  .object({
    requestId: z.string().uuid(),
    status: z.enum(['pending', 'approved', 'rejected', 'escalated', 'expired', 'cancelled']),
    requiredLevel: levelSchema,
    currentLevel: z.enum(['L0', 'L1', 'L2', 'L3']),
  })
  .strip();
const ruleRows = z.array(
  z
    .object({
      company_id: z.string().uuid().nullable(),
      level: levelSchema,
      sla_hours: z.number().int(),
    })
    .strip(),
);
const delegationRows = z.array(
  z
    .object({
      delegator_id: z.string().uuid(),
      delegator_role: z.enum(['super_admin', 'ceo', 'owner']),
    })
    .strip(),
);
const stepRows = z.array(z.object({ level: z.enum(['L1', 'L2', 'L3']) }).strip());

async function requireActor(): Promise<Actor> {
  const actor = await getService('auth').getActor();
  if (!actor) throw new UnauthorizedError();
  return actor;
}

/** Company rule first, then the platform rule, then the static rule or permission level. */
export async function resolveLevelAndSla(
  action: string,
  companyId: string | null,
): Promise<{ level: ApprovalLevel; slaHours: number }> {
  const { data, error } = await getAdminSupabase()
    .from('approval_rules')
    .select('company_id, level, sla_hours')
    .eq('action', action)
    .eq('enabled', true)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  const rows = ruleRows.parse(data);
  const own = rows.find((r) => companyId !== null && r.company_id === companyId);
  const platform = rows.find((r) => r.company_id === null);
  const chosen = own ?? platform;
  if (chosen) return { level: chosen.level, slaHours: chosen.sla_hours };
  return { level: resolveApprovalLevel(action), slaHours: resolveSlaHours(action) };
}

function toState(row: z.infer<typeof stateRow>): ApprovalState {
  return {
    requestId: row.id,
    status: row.status as ApprovalStatus,
    requiredLevel: row.required_level,
    currentLevel: row.current_level,
  };
}

async function openStepLevel(requestId: string): Promise<StepLevel | null> {
  const { data, error } = await getAdminSupabase()
    .from('approval_steps')
    .select('level')
    .eq('request_id', requestId)
    .eq('status', 'pending')
    .is('deleted_at', null)
    .order('step_order', { ascending: true })
    .limit(1);
  if (error) throw new InternalError(error);
  return stepRows.parse(data)[0]?.level ?? null;
}

/** Finds an active delegation whose delegator may decide a step of this level. */
async function findDelegation(
  actor: Actor,
  companyId: string | null,
  level: StepLevel,
): Promise<{ delegatorId: string; delegatorRole: 'super_admin' | 'ceo' | 'owner' } | null> {
  const now = new Date().toISOString();
  let query = getAdminSupabase()
    .from('approval_delegations')
    .select('delegator_id, delegator_role')
    .eq('delegate_id', actor.userId)
    .is('revoked_at', null)
    .is('deleted_at', null)
    .lte('starts_at', now)
    .gte('ends_at', now);
  query = companyId ? query.eq('company_id', companyId) : query.is('company_id', null);
  const { data, error } = await query;
  if (error) throw new InternalError(error);
  const hit = delegationRows.parse(data).find((d) => roleCanDecide(d.delegator_role, level));
  return hit ? { delegatorId: hit.delegator_id, delegatorRole: hit.delegator_role } : null;
}

async function notifyBestEffort(
  input: Parameters<ApprovalService['request']>[0],
  state: ApprovalState,
): Promise<void> {
  const notification = tryGetService('notification');
  if (!notification || state.status !== 'pending') return;
  try {
    await notification.notify({
      ...(input.companyId ? { companyId: input.companyId } : {}),
      type: 'approval.requested',
      title: 'Approval needed',
      body: `A request for "${input.action}" is waiting for ${state.currentLevel} approval.`,
      href: input.companyId ? '/approvals' : '/admin/approvals',
    });
  } catch {
    // A failed notification must never undo the request.
  }
}

async function readState(requestId: string): Promise<ApprovalState> {
  const { data, error } = await (
    await createServerSupabase()
  )
    .from('approval_requests')
    .select('id, status, required_level, current_level')
    .eq('id', requestId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return toState(stateRow.parse(data));
}

export async function decideAs(
  actor: Actor,
  requestId: string,
  decision: ApprovalDecision,
  companyId: string | null,
): Promise<ApprovalState> {
  // Visibility first (RLS): a request of another tenant answers 404 before any authority message.
  await readState(requestId);
  const level = await openStepLevel(requestId);
  if (!level) throw new NotFoundError();
  let actedFor: { delegatorId: string; delegatorRole: string } | null = null;
  if (!roleCanDecide(actor.role, level)) {
    actedFor = await findDelegation(actor, companyId, level);
    if (!actedFor) throw new ForbiddenError('This step needs a higher role.');
  }
  const { data, error } = await getAdminSupabase().rpc('kd_approval_decide', {
    p_request: requestId,
    p_approver: actor.userId,
    p_approver_role: actor.role,
    p_approver_company: actor.companyId,
    p_decision: decision.decision,
    p_reason: decision.reason,
    p_acted_for: actedFor?.delegatorId ?? null,
    p_acted_for_role: actedFor?.delegatorRole ?? null,
  });
  if (error) mapApprovalDbError(error);
  const result = decideResult.parse(data);
  await getService('audit').record({
    action: `approval.${decision.decision === 'approve' ? 'approved' : 'rejected'}`,
    resourceType: 'approval_request',
    resourceId: requestId,
    companyId,
    metadata: { level, status: result.status, delegated: actedFor !== null },
  });
  return {
    requestId: result.requestId,
    status: result.status,
    requiredLevel: result.requiredLevel,
    currentLevel: result.currentLevel,
  };
}

export function createApprovalService(): ApprovalService {
  return {
    async request(input: ApprovalRequestInput): Promise<ApprovalState> {
      const actor = await requireActor();
      if (input.requesterId !== actor.userId) throw new ForbiddenError();
      const companyId = actor.companyId;
      if (input.companyId !== companyId) throw new NotFoundError();
      if (JSON.stringify(input.payload).length > MAX_PAYLOAD_BYTES) {
        throw new ValidationError('The request details are too large.');
      }
      const { level, slaHours } = await resolveLevelAndSla(input.action, companyId);
      const { data, error } = await getAdminSupabase().rpc('kd_approval_create', {
        p_company: companyId,
        p_action: input.action,
        p_payload: input.payload,
        p_requester: actor.userId,
        p_requester_role: actor.role,
        p_level: level,
        p_sla_hours: slaHours,
        p_is_draft: actor.role === 'staff',
      });
      if (error) mapApprovalDbError(error);
      const id = z.string().uuid().parse(data);
      const state = await this.status(id);
      await getService('audit').record({
        action: 'approval.requested',
        resourceType: 'approval_request',
        resourceId: id,
        companyId,
        metadata: { request_action: input.action, level },
      });
      await notifyBestEffort(input, state);
      return state;
    },
    async decide(requestId, decision) {
      const actor = await requireActor();
      z.string().uuid().parse(requestId);
      return decideAs(actor, requestId, decision, actor.companyId);
    },
    async status(requestId) {
      z.string().uuid().parse(requestId);
      return readState(requestId);
    },
  };
}
