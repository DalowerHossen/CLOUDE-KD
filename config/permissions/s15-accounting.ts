// path: config/permissions/s15-accounting.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'accounting.read',
    description: 'See the chart of accounts, journal entries and accounting reports',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'accounting.account.manage',
    description:
      'Change the chart of accounts: add, edit, merge, import and set the transaction accounts',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'accounting.journal.create',
    description: 'Make journal entries (a staff entry waits for the owner before it is posted)',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'accounting.journal.post',
    description: 'Post, approve and reverse journal entries',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'accounting.period.manage',
    description:
      'Set up fiscal years, close months and years, lock modules and manage recurring entries',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'accounting.period.reopen',
    description:
      'Reopen a closed month or year (needs a fresh identity check and a reason; audited)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
