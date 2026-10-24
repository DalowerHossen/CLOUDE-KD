// path: config/permissions/s16-gateway.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'gateway.read',
    description:
      'See the app address, routes, sub-merchants, keys (never the secrets) and recent calls of the sub-merchant gateway',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'gateway.manage',
    description:
      'Set the app address and signing secret, choose the routes, add and stop sub-merchants and make or revoke their keys (needs a fresh identity check for secrets and keys)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
