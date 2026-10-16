// path: config/permissions/s08-inventory.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'inventory.read',
    description: 'See stock levels, the stock ledger and warehouses',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'inventory.adjust',
    description: 'Correct stock counts and set reorder levels',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'inventory.transfer',
    description: 'Move stock between warehouses',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'inventory.warehouses',
    description: 'Add, change and switch off warehouses',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'inventory.costs',
    description: 'See stock value, costs and cost of goods sold',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
