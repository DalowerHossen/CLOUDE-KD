// path: config/permissions/s07-support.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'support.create',
    description: 'Open a support ticket and write in it',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'support.read',
    description: 'See the own support tickets',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'support.agent',
    description: 'Work the support queue: read all tickets, answer, assign and close',
    defaultRoles: ['super_admin', 'ceo', 'admin_staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'feedback.send',
    description: 'Answer the satisfaction question and send feedback',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'feedback.read',
    description: 'Read the satisfaction score and the feedback of all companies',
    defaultRoles: ['super_admin', 'ceo'],
    approvalLevel: 'L0',
  },
  {
    action: 'company.switch',
    description: 'List the own companies, switch between them and add another one',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'sso.manage',
    description: 'Prepare single sign-on and ask for its activation',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
