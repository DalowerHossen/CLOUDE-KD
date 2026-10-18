// path: config/nav/s13.ts
import type { NavItem } from '@/config/nav-types';

export const nav: NavItem[] = [
  {
    id: 'client-mail',
    labelKey: 's13Portal.nav.clientMail',
    href: '/client-mail',
    icon: 'mail',
    group: 'dashboard',
    roles: ['owner', 'staff'],
    order: 75,
  },
];
