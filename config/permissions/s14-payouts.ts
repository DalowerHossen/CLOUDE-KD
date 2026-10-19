// path: config/permissions/s14-payouts.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'wallet.read',
    description: 'See the wallet balance, holds, ledger and statements of the company',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'payout.request',
    description: 'Ask for a payout from the wallet (a staff request waits for the owner)',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L1',
  },
  {
    action: 'payout.large',
    description: 'Ask for a payout at or above the large payout threshold (waits for the CEO)',
    defaultRoles: ['owner'],
    approvalLevel: 'L2',
  },
  {
    action: 'payout.method.manage',
    description: 'Add, change and remove payout methods and the payout schedule',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'payout.queue.manage',
    description: 'Work the payout queue: mark a payout paid or failed, reverse a payout',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'payout.settings.manage',
    description: 'Set payout minimum, limits, fees and the large payout threshold',
    defaultRoles: ['super_admin'],
    approvalLevel: 'L0',
  },
];
