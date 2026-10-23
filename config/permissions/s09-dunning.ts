// path: config/permissions/s09-dunning.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'reminder.manage',
    description: 'Set the reminder ladder, quiet hours and the reminder message',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'reminder.send',
    description:
      'Send a reminder by hand, record a promise to pay, pause or resume reminders for an invoice',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'latefee.manage',
    description: 'Set late fee rules, apply or waive late fees',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'invoice.writeoff',
    description: 'Write off money that will not be collected, with a reason',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
