// path: config/permissions/s16-api.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'integrations.apikey.read',
    description: 'See the API keys of the company (never the secret) and their usage',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'integrations.apikey.manage',
    description: 'Create, change, rotate and revoke API keys (needs a fresh identity check)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
