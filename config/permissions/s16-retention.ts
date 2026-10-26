// path: config/permissions/s16-retention.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'retention.manage',
    description:
      'Set the offers shown before a company cancels or goes to a lower plan, and read the exit survey (needs a fresh identity check to change)',
    defaultRoles: ['super_admin', 'ceo'],
    approvalLevel: 'L0',
  },
];
