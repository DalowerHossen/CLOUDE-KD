// path: config/approval/s07-lifecycle.ts
import type { ApprovalRuleDefinition } from '@/types/contracts';

export const approvalRules: ApprovalRuleDefinition[] = [
  // A data export asked for by a staff member waits for the owner.
  { action: 'data.export', level: 'L1', slaHours: 48 },
];
