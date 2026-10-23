// path: config/permissions/s03-auth.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'auth.account.read',
    description: 'See locked accounts',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'auth.account.unlock',
    description: 'Request and complete the unlock of a locked account',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'auth.impersonate',
    description: 'Sign in as another user for support',
    defaultRoles: ['super_admin'],
    approvalLevel: 'L3',
  },
  {
    action: 'auth.session.read',
    description: 'See sessions of staff in the own company',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'auth.session.revoke',
    description: 'End sessions of staff in the own company',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
