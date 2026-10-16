// path: config/permissions/s08-purchasing.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'supplier.read',
    description: 'See suppliers, their orders, bills and statements',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'supplier.write',
    description: 'Add, change, archive and reactivate suppliers',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'supplier.delete',
    description: 'Delete suppliers (soft delete)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'po.read',
    description: 'See purchase orders',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'po.write',
    description: 'Write, submit and cancel purchase orders (a staff order waits for the owner)',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L1',
  },
  {
    action: 'po.send',
    description: 'Send an approved purchase order to the supplier',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'po.receive',
    description: 'Receive goods against a purchase order',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
];
