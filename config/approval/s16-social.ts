// path: config/approval/s16-social.ts
import type { ApprovalRuleDefinition } from '@/types/contracts';

export const approvalRules: ApprovalRuleDefinition[] = [
  // When a company asks for approval of social posts, a post waits for the owner before it is published.
  { action: 'social.post.publish', level: 'L1', slaHours: 24 },
];
