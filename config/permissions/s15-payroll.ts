// path: config/permissions/s15-payroll.ts
import type { PermissionDefinition } from '@/types/contracts';

export const permissions: PermissionDefinition[] = [
  {
    action: 'payroll.employee.read',
    description: 'See the employee directory and profiles (without pay, bank or tax details)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'payroll.employee.manage',
    description: 'Add, change, import, export and archive employees and their documents',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'payroll.pay.read',
    description:
      'See pay, bank account and tax details of employees and run pay previews (every view is audited)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'payroll.pay.manage',
    description: 'Change pay, bank account and tax details of employees',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'payroll.settings.manage',
    description:
      'Set salary grades, components, structures, payroll settings and payroll tax rules',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
