// path: config/permissions/s13-portal.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'portal.mail.read',
    description:
      'See the messages sent to clients and whether they were delivered, opened or bounced',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
];
