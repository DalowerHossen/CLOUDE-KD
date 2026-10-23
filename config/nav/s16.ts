// path: config/nav/s16.ts
import type { NavItem } from '@/config/nav-types';

export const nav: NavItem[] = [
  {
    id: 'developers',
    labelKey: 's16Developers.nav.developers',
    href: '/developers',
    icon: 'key',
    group: 'dashboard',
    roles: ['owner'],
    order: 90,
  },
];
