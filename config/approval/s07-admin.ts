// path: config/approval/s07-admin.ts
import type { ApprovalRuleDefinition } from '@/types/contracts';

export const approvalRules: ApprovalRuleDefinition[] = [
  { action: 'user.suspend', level: 'L2', slaHours: 24 },
  { action: 'user.reactivate', level: 'L2', slaHours: 24 },
  { action: 'user.soft_delete', level: 'L2', slaHours: 24 },
  { action: 'user.force_password_reset', level: 'L2', slaHours: 12 },
  { action: 'user.reset_2fa', level: 'L2', slaHours: 12 },
  { action: 'user.change_email', level: 'L2', slaHours: 24 },
  { action: 'tenant.suspend', level: 'L2', slaHours: 12 },
  { action: 'tenant.reactivate', level: 'L2', slaHours: 24 },
];
