// path: config/permissions/s08-catalog.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'product.read',
    description: 'See products, services, bundles and their prices',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'product.create',
    description: 'Add products and services',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'product.update',
    description: 'Change products, variants, pictures and categories',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'product.archive',
    description: 'Archive, deactivate and reactivate products',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'product.delete',
    description: 'Delete products (soft delete)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'product.client_rates',
    description: 'Set prices agreed with single clients',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'product.bulk',
    description: 'Change many products at once',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
];
