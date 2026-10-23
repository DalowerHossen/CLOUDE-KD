// path: lib/auth/approval-engine.ts
// Pure approval chain logic that mirrors the database functions (kd_approval_create / kd_approval_decide).
// The database is authoritative; these functions give the user interface and the services early, friendly answers.
import type { ApprovalLevel, Role } from '@/types/contracts';

export type StepLevel = 'L1' | 'L2' | 'L3';

/** Steps required for a level. A staff requester always starts with the owner (L1) when any approval is needed. */
export function planSteps(level: ApprovalLevel, requesterRole: Role): StepLevel[] {
  const base: StepLevel[] =
    level === 'L0'
      ? []
      : level === 'L1'
        ? ['L1']
        : level === 'L2'
          ? ['L2']
          : level === 'L3'
            ? ['L3']
            : ['L2', 'L3'];
  if (requesterRole === 'staff' && level !== 'L0' && !base.includes('L1')) return ['L1', ...base];
  return base;
}

/** Roles that may decide a step of the given level. Higher roles may always act for lower levels. */
export function roleCanDecide(role: Role, level: StepLevel): boolean {
  if (level === 'L1') return role === 'owner' || role === 'ceo' || role === 'super_admin';
  if (level === 'L2') return role === 'ceo' || role === 'super_admin';
  return role === 'super_admin';
}

export type DecisionBlock =
  | 'self_approval'
  | 'level_too_high'
  | 'other_company'
  | 'same_person_twice'
  | 'reason_required'
  | null;

export interface DecisionCheck {
  approver: { id: string; role: Role; companyId: string | null };
  request: { requesterId: string; companyId: string | null; requiredLevel: ApprovalLevel };
  stepLevel: StepLevel;
  decision: 'approve' | 'reject';
  reason: string | null;
  previousApproverId: string | null;
  soloMode: boolean;
}

export function checkDecision(input: DecisionCheck): DecisionBlock {
  const { approver, request } = input;
  if (approver.role === 'owner' && approver.companyId !== request.companyId) return 'other_company';
  if (approver.id === request.requesterId && !(input.soloMode && approver.role === 'super_admin')) {
    return 'self_approval';
  }
  if (!roleCanDecide(approver.role, input.stepLevel)) return 'level_too_high';
  if (
    request.requiredLevel === 'L2+L3' &&
    input.previousApproverId !== null &&
    input.previousApproverId === approver.id
  ) {
    return 'same_person_twice';
  }
  if (input.decision === 'reject' && (input.reason ?? '').trim().length < 3)
    return 'reason_required';
  return null;
}

export const NEXT_LEVEL: Readonly<Record<StepLevel, StepLevel | null>> = {
  L1: 'L2',
  L2: 'L3',
  L3: null,
};

/** Default hours before an open step escalates. Overridden per action by the approval rule. */
export const DEFAULT_SLA_HOURS = 24;
