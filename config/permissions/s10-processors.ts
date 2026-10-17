// path: config/permissions/s10-processors.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'payment.processor.view',
    description: 'See which payment processors are connected and their state',
    defaultRoles: ['super_admin'],
    approvalLevel: 'L0',
  },
  {
    action: 'payment.processor.manage',
    description:
      'Enter processor credentials, test, enable, disable, change environment or mode, edit routing rules',
    defaultRoles: ['super_admin'],
    approvalLevel: 'L0',
  },
];
