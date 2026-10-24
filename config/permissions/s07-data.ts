// path: config/permissions/s07-data.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'data.export',
    description: 'Ask for an export of the company data (staff exports wait for the owner)',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L1',
  },
  {
    action: 'data.manage',
    description: 'Download exports, schedule backups and close the account',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'policy.manage',
    description: 'Change the company security policy',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
