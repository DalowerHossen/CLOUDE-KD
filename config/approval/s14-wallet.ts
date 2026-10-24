// path: config/approval/s14-wallet.ts
import type { ApprovalRuleDefinition } from '@/types/contracts';

export const approvalRules: ApprovalRuleDefinition[] = [
  // A staff member's payout request waits for the owner. A payout at or above the large threshold waits for the CEO.
  { action: 'payout.request', level: 'L1', slaHours: 24 },
  { action: 'payout.large', level: 'L2', slaHours: 24 },
];
