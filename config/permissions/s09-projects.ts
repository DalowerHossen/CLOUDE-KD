// path: config/permissions/s09-projects.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'project.read',
    description: 'See projects, their team, milestones and budget use',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'project.manage',
    description: 'Create projects; change those you manage (the owner manages all)',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'time.log',
    description:
      'Log time with the timer or by hand, submit it, and approve time of projects you manage',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'time.settings',
    description: 'Set time rounding, approval and the lock date of time sheets',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'project.bill',
    description:
      'Make invoice drafts from approved time, milestones and expenses of projects you manage',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
];
