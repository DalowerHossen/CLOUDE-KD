// path: config/permissions/s16-settlement.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'settlement.read',
    description:
      'See the settlement terms, balances, entries and recorded payouts of the sub-merchants and download a statement',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'settlement.manage',
    description:
      'Set the settlement terms, post entries and record or void payouts to sub-merchants (needs a fresh identity check for terms and payouts)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
