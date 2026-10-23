// path: config/permissions/s16-social.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'social.read',
    description: 'See connected social accounts (never the token), posts and hashtag groups',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'social.manage',
    description: 'Connect, change and remove social accounts (needs a fresh identity check)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'social.post',
    description: 'Write, schedule, publish and cancel posts and keep hashtag groups',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
