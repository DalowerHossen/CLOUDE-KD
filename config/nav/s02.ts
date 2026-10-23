// path: config/nav/s02.ts
import type { NavItem } from '@/config/nav-types';

export const nav: NavItem[] = [
  {
    id: 'admin-audit',
    labelKey: 's02Governance.nav.audit',
    href: '/admin/audit',
    icon: 'shield',
    group: 'admin',
    roles: ['super_admin', 'ceo', 'admin_staff'],
    order: 200,
  },
  {
    id: 'admin-approvals',
    labelKey: 's02Governance.nav.approvals',
    href: '/admin/approvals',
    icon: 'check-square',
    group: 'admin',
    roles: ['super_admin', 'ceo', 'admin_staff'],
    order: 210,
  },
  {
    id: 'admin-compliance',
    labelKey: 's02Governance.nav.compliance',
    href: '/admin/compliance',
    icon: 'clipboard',
    group: 'admin',
    roles: ['super_admin', 'ceo', 'admin_staff'],
    order: 220,
  },
  {
    id: 'dashboard-approvals',
    labelKey: 's02Governance.nav.approvals',
    href: '/approvals',
    icon: 'check-square',
    group: 'dashboard',
    roles: ['owner'],
    order: 900,
  },
];
