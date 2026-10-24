// path: config/permissions/s16-messaging.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'integrations.messaging.read',
    description:
      'See messaging settings, routes, client preferences, messages, campaigns and reports',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'integrations.messaging.manage',
    description:
      'Set quiet hours, routes and client channel preferences, send messages, and make, start (needs a fresh identity check) and cancel campaigns',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
