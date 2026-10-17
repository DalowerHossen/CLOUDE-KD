// path: config/nav/s10.ts
import type { NavItem } from '@/config/nav-types';

export const nav: NavItem[] = [
  {
    id: 'admin-processors',
    labelKey: 's10Processors.nav.processors',
    href: '/admin/processors',
    icon: 'credit-card',
    group: 'admin',
    roles: ['super_admin'],
    order: 500,
  },
];
