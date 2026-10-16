// path: config/permissions/s07-support.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'support.create',
    description: 'Open a support ticket and write in it',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'support.read',
    description: 'See the own support tickets',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'support.agent',
    description: 'Work the support queue: read all tickets, answer, assign and close',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L0',
  },
];
