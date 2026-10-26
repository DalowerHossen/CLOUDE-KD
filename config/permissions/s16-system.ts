// path: config/permissions/s16-system.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'system.read',
    description:
      'See the maintenance switch, kill switches, company caps, the job queue and which settings are configured',
    defaultRoles: ['super_admin', 'ceo'],
    approvalLevel: 'L0',
  },
  {
    action: 'system.manage',
    description:
      'Turn maintenance on or off, engage kill switches, set company caps and retry failed jobs (needs a fresh identity check)',
    defaultRoles: ['super_admin'],
    approvalLevel: 'L0',
  },
];
