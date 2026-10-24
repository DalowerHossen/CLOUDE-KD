// path: config/approval/s08-purchasing.ts
import type { ApprovalRuleDefinition } from '@/types/contracts';

export const approvalRules: ApprovalRuleDefinition[] = [
  // A purchase order written by a staff member waits for the owner before it can be sent to the supplier.
  { action: 'po.approve', level: 'L1', slaHours: 48 },
];
