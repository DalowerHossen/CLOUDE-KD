// path: config/permissions/s16-releases.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'release.read',
    description: "Read the release notes (What's new) and take the product tours",
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'release.manage',
    description:
      'Publish and withdraw release notes and their tours (needs a fresh identity check)',
    defaultRoles: ['super_admin', 'ceo'],
    approvalLevel: 'L0',
  },
];
