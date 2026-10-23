// path: config/permissions/s09-tax.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'tax.read',
    description: 'See tax rates, tax settings and client tax exemptions',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'tax.manage',
    description: 'Change tax rates, tax settings, client tax exemptions and exchange rates',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
