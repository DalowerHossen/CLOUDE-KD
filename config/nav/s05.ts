// path: config/nav/s05.ts
import type { NavItem } from '@/config/nav-types';

export const nav: NavItem[] = [
  {
    id: 'settings-storage',
    labelKey: 's05Storage.nav.storageSettings',
    href: '/settings/storage',
    icon: 'layers',
    group: 'account',
    roles: ['owner'],
    order: 410,
  },
];
