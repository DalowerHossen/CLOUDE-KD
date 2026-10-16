// path: config/nav/s08.ts
import type { NavItem } from '@/config/nav-types';

export const nav: NavItem[] = [
  {
    id: 'clients',
    labelKey: 's08Crm.nav.clients',
    href: '/clients',
    icon: 'users',
    group: 'dashboard',
    roles: ['owner', 'staff'],
    order: 120,
  },
  {
    id: 'products',
    labelKey: 's08Crm.nav.products',
    href: '/products',
    icon: 'package',
    group: 'dashboard',
    roles: ['owner', 'staff'],
    order: 130,
  },
  {
    id: 'inventory',
    labelKey: 's08Crm.nav.inventory',
    href: '/inventory',
    icon: 'package',
    group: 'dashboard',
    roles: ['owner', 'staff'],
    order: 140,
  },
];
