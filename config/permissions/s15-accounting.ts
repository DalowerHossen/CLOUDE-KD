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
  {
    action: 'expense.read',
    description:
      'See expenses (a staff member sees their own), categories, policies and expense reports',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'expense.create',
    description:
      'Add, change and delete own expenses and upload receipts (a staff expense waits for the owner)',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'expense.approve',
    description: 'Approve or reject expenses, including ones that breach a policy',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'expense.manage',
    description:
      'Manage expense categories, policies and recurring expenses and book payments of expenses',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
