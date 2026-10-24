// path: config/approval/s07-admin.ts
import type { ApprovalRuleDefinition } from '@/types/contracts';

export const approvalRules: ApprovalRuleDefinition[] = [
  { action: 'user.suspend', level: 'L2', slaHours: 24 },
  { action: 'user.reactivate', level: 'L2', slaHours: 24 },
  { action: 'tenant.suspend', level: 'L2', slaHours: 12 },
  { action: 'tenant.reactivate', level: 'L2', slaHours: 24 },
];
