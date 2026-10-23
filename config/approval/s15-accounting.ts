// path: config/approval/s15-accounting.ts
import type { ApprovalRuleDefinition } from '@/types/contracts';

export const approvalRules: ApprovalRuleDefinition[] = [
  // A journal entry that a staff member wants to post waits for the owner.
  { action: 'journal.post', level: 'L1', slaHours: 48 },
  // A staff expense that no policy approves by itself waits for the owner.
  { action: 'expense.approve', level: 'L1', slaHours: 72 },
  // A budget that a staff member submitted waits for the owner.
  { action: 'budget.approve', level: 'L1', slaHours: 72 },
];
