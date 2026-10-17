// path: config/permissions/s09-reports.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'report.read',
    description: 'Open the reports (sales, receivables, tax, time)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'report.export',
    description: 'Download reports as CSV, Excel or PDF',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'report.schedule',
    description: 'Have a report e-mailed on a schedule',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
