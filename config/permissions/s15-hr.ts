// path: config/permissions/s15-hr.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'hr.read',
    description: 'See the organisation chart, checklists, leave balances and leave requests',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'hr.manage',
    description:
      'Set up departments and positions, place employees, make checklists, set leave and end employment',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'hr.leave.decide',
    description: 'Approve or reject leave requests and cancel approved leave',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'hr.performance.read',
    description: 'Read performance notes and reviews (every read is audited)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'hr.performance.manage',
    description: 'Write performance notes and reviews',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
