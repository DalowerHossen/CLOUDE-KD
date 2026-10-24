// path: config/permissions/s16-bankfeed.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'bankfeed.read',
    description:
      'See the bank links (never the keys), their accounts and when they were last synced',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'bankfeed.sync',
    description: 'Fetch the newest bank lines of a bank link now',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'bankfeed.manage',
    description:
      'Connect, change, link again and disconnect bank links and map their accounts to bank accounts of the books (needs a fresh identity check)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
