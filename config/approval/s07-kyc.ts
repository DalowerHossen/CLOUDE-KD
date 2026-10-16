// path: config/approval/s07-kyc.ts
import type { ApprovalRuleDefinition } from '@/types/contracts';

export const approvalRules: ApprovalRuleDefinition[] = [
  // A reviewer recommends; the CEO gives the final approval (maker-checker).
  { action: 'kyc.approve', level: 'L2', slaHours: 48 },
];
