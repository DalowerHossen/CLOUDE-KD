// path: config/permissions/s16-commerce.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'commerce.read',
    description:
      'See the connected stores (never the credentials), their orders, conflicts, mappings and sync log',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'commerce.sync',
    description:
      'Try orders again, ignore orders, resolve conflicts and map store SKUs to products',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'commerce.manage',
    description:
      'Connect, change, check and disconnect stores and register their webhooks (needs a fresh identity check)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'commerce.admin',
    description:
      'Platform staff: see the stores of every company, connect a store for a company, check it and register its webhooks',
    defaultRoles: ['super_admin'],
    approvalLevel: 'L0',
  },
];
