// path: config/approval/s13-portal.ts
import type { ApprovalRuleDefinition } from '@/types/contracts';

export const approvalRules: ApprovalRuleDefinition[] = [
  // A staff member's contract is sent for signature only after the owner approves it.
  { action: 'contract.send', level: 'L1', slaHours: 24 },
];
