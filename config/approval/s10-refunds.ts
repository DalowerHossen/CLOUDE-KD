// path: config/approval/s10-refunds.ts
import type { ApprovalRuleDefinition } from '@/types/contracts';

export const approvalRules: ApprovalRuleDefinition[] = [
  // A staff member's refund waits for the owner. A refund above the threshold in config/payment-risk.ts waits for the CEO.
  { action: 'payment.refund', level: 'L1', slaHours: 24 },
  { action: 'payment.refund.large', level: 'L2', slaHours: 24 },
];
