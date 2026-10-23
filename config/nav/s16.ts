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
  {
    id: 'whatsapp',
    labelKey: 's16Whatsapp.nav.whatsapp',
    href: '/whatsapp',
    icon: 'message-circle',
    group: 'dashboard',
    roles: ['owner'],
    order: 85,
  },
  {
    id: 'social',
    labelKey: 's16Social.nav.social',
    href: '/social',
    icon: 'share',
    group: 'dashboard',
    roles: ['owner'],
    order: 86,
  },
];
