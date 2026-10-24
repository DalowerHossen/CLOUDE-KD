// path: lib/auth/approval-rules.ts
// Resolves the approval level of an action. Order: explicit approval rule, then the level of the permission
// definition, then L3 (an action nobody described needs the highest approval; the system fails closed).
import { approvalRules } from '@/config/approval-rules.generated';
import { permissions } from '@/config/permissions';
import type {
  ApprovalLevel,
  ApprovalRuleDefinition,
  PermissionDefinition,
} from '@/types/contracts';

export const APPROVAL_LEVELS: readonly ApprovalLevel[] = ['L0', 'L1', 'L2', 'L3', 'L2+L3'];

export function findApprovalRule(
  action: string,
  rules: readonly ApprovalRuleDefinition[] = approvalRules,
): ApprovalRuleDefinition | undefined {
  return rules.find((r) => r.action === action);
}

export function resolveApprovalLevel(
  action: string,
  rules: readonly ApprovalRuleDefinition[] = approvalRules,
  definitions: readonly PermissionDefinition[] = permissions,
): ApprovalLevel {
  const rule = findApprovalRule(action, rules);
  if (rule) return rule.level;
  const definition = definitions.find((d) => d.action === action);
  return definition ? definition.approvalLevel : 'L3';
}

/** Hours until a pending request escalates to the next level. */
export function resolveSlaHours(
  action: string,
  rules: readonly ApprovalRuleDefinition[] = approvalRules,
): number {
  return findApprovalRule(action, rules)?.slaHours ?? 24;
}
