// path: config/permissions/s07-team.ts
import type { PermissionDefinition } from '@/types/contracts';

// team.manage and team.permissions are registered by STEP 02. Staff never receive any team permission.
export const permissions: PermissionDefinition[] = [
  {
    action: 'team.read',
    description: 'See staff, invitations, seats and staff activity',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'team.security',
    description: 'Change staff security rules and approval rules of staff actions',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
