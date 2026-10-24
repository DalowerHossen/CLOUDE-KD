// path: config/permissions/s08-transfer.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'import.manage',
    description:
      'Upload spreadsheets and run imports (each list also needs its own write permission)',
    defaultRoles: ['owner', 'staff'],
    approvalLevel: 'L0',
  },
  {
    action: 'list.export',
    description: 'Download a list as a spreadsheet (each list also needs its own read permission)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
