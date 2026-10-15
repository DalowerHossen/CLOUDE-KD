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
];
