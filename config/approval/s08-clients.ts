// path: config/approval/s08-clients.ts
import type { ApprovalRuleDefinition } from '@/types/contracts';

export const approvalRules: ApprovalRuleDefinition[] = [
  // A staff member's request to anonymize or delete a client waits for the owner.
  { action: 'client.anonymize', level: 'L1', slaHours: 72 },
];
