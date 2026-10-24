// path: config/permissions/s16-gateway-kyc.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'gateway.kyc.review',
    description:
      'Send the verification link to a sub-merchant, open its documents, run the screening and approve, reject or ask for changes (needs a fresh identity check for the link and every decision)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
