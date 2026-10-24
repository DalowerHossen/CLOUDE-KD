// path: config/approval/s06-cms.ts
import type { ApprovalRuleDefinition } from '@/types/contracts';

export const approvalRules: ApprovalRuleDefinition[] = [
  { action: 'cms.publish', level: 'L2', slaHours: 24 },
  { action: 'blog.publish', level: 'L2', slaHours: 24 },
];
