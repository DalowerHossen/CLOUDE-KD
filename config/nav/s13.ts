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
  {
    id: 'client-branding',
    labelKey: 's13Portal.nav.clientBranding',
    href: '/client-mail/branding',
    icon: 'settings',
    group: 'dashboard',
    roles: ['owner'],
    order: 76,
  },
  {
    id: 'contracts',
    labelKey: 's13Portal.nav.contracts',
    href: '/contracts',
    icon: 'file-text',
    group: 'dashboard',
    roles: ['owner', 'staff'],
    order: 77,
  },
];
