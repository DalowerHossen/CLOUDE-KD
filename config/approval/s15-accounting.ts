// path: config/approval/s15-accounting.ts
import type { ApprovalRuleDefinition } from '@/types/contracts';

export const approvalRules: ApprovalRuleDefinition[] = [
  // A journal entry that a staff member wants to post waits for the owner.
  { action: 'journal.post', level: 'L1', slaHours: 48 },
];
