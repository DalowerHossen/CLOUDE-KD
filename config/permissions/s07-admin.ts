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
  {
    action: 'staff.read',
    description: 'See the admin staff, their sub-roles and shifts',
    defaultRoles: ['super_admin', 'ceo'],
    approvalLevel: 'L0',
  },
  {
    action: 'staff.manage',
    description: 'Create admin staff, change sub-roles and plan shifts',
    defaultRoles: ['super_admin'],
    approvalLevel: 'L0',
  },
  {
    action: 'announcement.manage',
    description: 'Publish and withdraw platform announcements',
    defaultRoles: ['super_admin', 'ceo'],
    approvalLevel: 'L0',
  },
  {
    action: 'announcement.read',
    description: 'See the platform announcements that are live',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'flags.read',
    description: 'See the feature flags',
    defaultRoles: ['super_admin', 'ceo'],
    approvalLevel: 'L0',
  },
  {
    action: 'setup.manage',
    description: 'Complete the first-login platform setup',
    defaultRoles: ['super_admin'],
    approvalLevel: 'L0',
  },
];
