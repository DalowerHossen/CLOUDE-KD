// path: config/permissions/s07-domain.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'domain.manage',
    description: 'Add, verify, set as primary and remove custom domains',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
