// path: config/nav/s04.ts
import type { NavItem } from '@/config/nav-types';

export const nav: NavItem[] = [
  {
    id: 'admin-security',
    labelKey: 's04Security.nav.security',
    href: '/admin/security',
    icon: 'shield',
    group: 'admin',
    roles: ['super_admin', 'ceo', 'admin_staff'],
    order: 300,
  },
];
