// path: config/permissions/s02-core.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'audit.read',
    description: 'Read the audit log',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'audit.export',
    description: 'Export the audit log',
    defaultRoles: ['super_admin', 'ceo'],
    approvalLevel: 'L0',
  },
  {
    action: 'audit.verify',
    description: 'Verify the audit hash chain',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'approval.read',
    description: 'See approval requests',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff', 'owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'approval.decide',
    description: 'Approve or reject a request',
    defaultRoles: ['super_admin', 'ceo', 'owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'approval.delegate',
    description: 'Delegate approval rights for a period',
    defaultRoles: ['super_admin', 'ceo', 'owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'approval.bulk_decide',
    description: 'Approve several requests at once',
    defaultRoles: ['super_admin', 'ceo', 'owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'approval.solo_mode',
    description: 'Switch solo approval mode on or off',
    defaultRoles: ['super_admin'],
    approvalLevel: 'L3',
  },
  {
    action: 'compliance.read',
    description: 'View compliance settings and requests',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'compliance.manage',
    description: 'Change retention, classification and jurisdiction settings',
    defaultRoles: ['super_admin', 'ceo'],
    approvalLevel: 'L2',
  },
  {
    action: 'dsar.process',
    description: 'Process data export and erase requests',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L2',
  },
  {
    action: 'consent.read',
    description: 'View consent records',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff', 'owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'team.manage',
    description: 'Invite, suspend and remove staff',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'team.permissions',
    description: 'Grant or revoke staff permissions',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'company.update',
    description: 'Change company profile',
    defaultRoles: ['owner', 'super_admin', 'ceo'],
    approvalLevel: 'L0',
  },
  {
    action: 'flags.manage',
    description: 'Change feature flags',
    defaultRoles: ['super_admin'],
    approvalLevel: 'L3',
  },
  {
    action: 'roles.manage',
    description: 'Change role permission grants',
    defaultRoles: ['super_admin'],
    approvalLevel: 'L3',
  },
];
