// path: config/permissions/s16-migration.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'migration.read',
    description: 'See the imports from other tools, their dry run reports and the rows',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'migration.manage',
    description:
      'Upload a file from another tool, run the dry run, start (needs a fresh identity check) and cancel an import, and roll it back within 24 hours (needs a fresh identity check)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
