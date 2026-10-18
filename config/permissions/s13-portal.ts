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
  {
    action: 'contract.request_send',
    description: 'Ask the owner to send a contract for signature, or take the request back',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'portal.link.decide',
    description: 'Approve or deny a client request for a new link to an expired document',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'portal.mail.bulk',
    description: 'Send reminders for many open estimates at once',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'dispute.read',
    description: 'See disputes (chargebacks) of the company and their evidence',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'dispute.manage',
    description: 'Move a dispute through its workflow, add evidence and generate the evidence pack',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'dispute.refund.decide',
    description: 'Approve or deny a refund a client asked for',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'dispute.read.all',
    description: 'See the disputes of every company (dispute centre)',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L0',
  },
];
