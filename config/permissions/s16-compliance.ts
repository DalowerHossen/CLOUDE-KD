// path: config/permissions/s16-compliance.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'compliance.read',
    description: 'See the country restrictions and the state of the sanctions lists',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'compliance.manage',
    description:
      'Switch country restrictions on or off and import a sanctions list (needs a fresh identity check)',
    defaultRoles: ['super_admin', 'ceo'],
    approvalLevel: 'L0',
  },
];
