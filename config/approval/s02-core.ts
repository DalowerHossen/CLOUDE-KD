// path: config/approval/s02-core.ts
import type { ApprovalRuleDefinition } from '@/types/contracts';

export const approvalRules: ApprovalRuleDefinition[] = [
  { action: 'flags.manage', level: 'L3', slaHours: 24 },
  { action: 'roles.manage', level: 'L3', slaHours: 24 },
  { action: 'approval.solo_mode', level: 'L3', slaHours: 24 },
  { action: 'compliance.manage', level: 'L2', slaHours: 48 },
  { action: 'dsar.process', level: 'L2', slaHours: 72 },
];
