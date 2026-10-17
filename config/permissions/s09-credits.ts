// path: config/permissions/s09-credits.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'credit.read',
    description: 'See credit notes and the credits applied to invoices',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'credit.create',
    description: 'Write credit notes, debit notes and deposit invoices as drafts',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'credit.issue',
    description: 'Issue a credit note (gives it a number and applies it)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'credit.apply',
    description: 'Apply a credit note or a paid deposit to an open invoice',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'credit.void',
    description: 'Void an issued credit note that was not applied',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
