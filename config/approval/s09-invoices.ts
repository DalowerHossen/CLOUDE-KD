// path: config/approval/s09-invoices.ts
import type { ApprovalRuleDefinition } from '@/types/contracts';

export const approvalRules: ApprovalRuleDefinition[] = [
  // A staff member's invoice is sent only after the owner approves it.
  { action: 'invoice.send', level: 'L1', slaHours: 24 },
];
