// path: config/permissions/s09-estimates.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'estimate.read',
    description: 'See estimates, their history and PDF',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'estimate.create',
    description: 'Write estimates as drafts',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'estimate.update',
    description: 'Change draft estimates and take a sent estimate back to a draft',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'estimate.delete',
    description: 'Move draft estimates to the trash and restore them',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'estimate.send',
    description: 'Send estimates to clients',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'estimate.convert',
    description: 'Turn an accepted estimate into an invoice draft',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'estimate.void',
    description: 'Void an estimate, with a reason',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
