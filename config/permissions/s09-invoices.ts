// path: config/permissions/s09-invoices.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'invoice.read',
    description: 'See invoices, their history and timeline',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'invoice.create',
    description: 'Write invoices as drafts, copy invoices',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'invoice.update',
    description: 'Change draft invoices and restore earlier revisions',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'invoice.delete',
    description: 'Move draft invoices to the trash and restore them',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'invoice.override_status',
    description: 'Set the status of a sent invoice by hand, with a reason',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
