// path: config/permissions/s07-company.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'company.read',
    description: 'See company profile, branding and invoice settings',
    defaultRoles: ['owner', 'staff', 'super_admin', 'ceo'],
    approvalLevel: 'L0',
  },
  {
    action: 'company.manage',
    description: 'Change company profile, branding, invoice settings and onboarding',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
