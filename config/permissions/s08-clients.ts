// path: config/permissions/s08-clients.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'client.read',
    description: 'See clients, their history and statements',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'client.create',
    description: 'Add clients',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'client.update',
    description: 'Change clients, contacts, tags and notes',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'client.archive',
    description: 'Archive and reactivate clients',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'client.delete',
    description: 'Delete clients (soft delete)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'catalog.fields',
    description: 'Define custom fields for clients, products and suppliers',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'client.merge',
    description: 'Merge duplicate clients',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'client.export',
    description: 'Download all data kept about one client',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'client.privacy',
    description: 'Ask to anonymize or delete a client (staff requests need the owner)',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L1',
  },
  {
    action: 'client.bulk',
    description: 'Change many clients at once',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'client.email',
    description: 'E-mail a statement to a client',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
];
