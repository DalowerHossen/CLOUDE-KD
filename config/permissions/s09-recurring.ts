// path: config/permissions/s09-recurring.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'recurring.read',
    description: 'See recurring invoice schedules and their runs',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'recurring.manage',
    description:
      'Create, change, pause and end recurring invoice schedules (only the owner can set one to send by itself)',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'installment.manage',
    description: 'Set or remove an installment plan on a sent invoice',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
];
