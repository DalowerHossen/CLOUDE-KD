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
  {
    action: 'payroll.run.read',
    description: 'See pay runs and open payslips (every opening is audited)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'payroll.run.manage',
    description: 'Make, calculate and submit pay runs',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'payroll.run.approve',
    description: 'Approve or send back a submitted pay run',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'payroll.run.pay',
    description:
      'Make the bank transfer list and record that a pay run was paid (needs a fresh identity check)',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'payroll.report.read',
    description: 'See and export payroll reports',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
  {
    action: 'payroll.portal.manage',
    description: 'Send employees their portal link, revoke links and decide tax declarations',
    defaultRoles: ['owner'],
    approvalLevel: 'L0',
  },
];
