// path: config/permissions/s04-security.ts
import type { PermissionDefinition } from '@/types/contracts';

const platform = ['super_admin', 'ceo', 'admin_staff'] as const;
const top = ['super_admin', 'ceo'] as const;

export const permissions: PermissionDefinition[] = [
  {
    action: 'security.read',
    description: 'See security settings, blocks and events',
    defaultRoles: [...platform],
    approvalLevel: 'L0',
  },
  {
    action: 'security.manage',
    description: 'Change the network whitelist and address blocks',
    defaultRoles: [...top],
    approvalLevel: 'L0',
  },
  {
    action: 'fraud.read',
    description: 'See fraud signals and risk scores',
    defaultRoles: [...platform],
    approvalLevel: 'L0',
  },
  {
    action: 'fraud.manage',
    description: 'Change fraud rules and act on accounts',
    defaultRoles: [...top],
    approvalLevel: 'L0',
  },
  {
    action: 'siem.read',
    description: 'See SIEM destinations and correlation results',
    defaultRoles: [...platform],
    approvalLevel: 'L0',
  },
  {
    action: 'siem.manage',
    description: 'Change SIEM destinations and rules',
    defaultRoles: ['super_admin'],
    approvalLevel: 'L3',
  },
  {
    action: 'incident.read',
    description: 'See security incidents',
    defaultRoles: [...platform],
    approvalLevel: 'L0',
  },
  {
    action: 'incident.manage',
    description: 'Open, update and close incidents',
    defaultRoles: [...top],
    approvalLevel: 'L0',
  },
  {
    action: 'alert.read',
    description: 'See alerts and alert rules',
    defaultRoles: [...platform],
    approvalLevel: 'L0',
  },
  {
    action: 'alert.manage',
    description: 'Change alert rules, channels and the on-call roster',
    defaultRoles: [...top],
    approvalLevel: 'L0',
  },
];
