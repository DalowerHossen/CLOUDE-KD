// path: config/permissions/s13-portal.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'portal.mail.read',
    description:
      'See the messages sent to clients and whether they were delivered, opened or bounced',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'contract.read',
    description: 'See contracts, their signers and their history',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'contract.create',
    description: 'Write contract drafts and manage contract templates',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'contract.send',
    description: 'Send a contract for signature, remind signers and cancel a contract',
    defaultRoles: ['owner'],
    approvalLevel: 'L1',
  },
];
