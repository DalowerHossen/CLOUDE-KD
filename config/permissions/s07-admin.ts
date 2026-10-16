// path: config/permissions/s07-admin.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'admin.home',
    description: 'Open the platform home with counters and the recent activity',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'people.read',
    description: 'Look up users and tenants and read their details',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'people.note',
    description: 'Write internal notes on users and tenants',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'people.manage',
    description: 'Suspend or reactivate users and tenants, and confirm an e-mail address by hand',
    defaultRoles: ['super_admin', 'ceo'],
    approvalLevel: 'L2',
  },
];
