// path: config/nav/s07.ts
import type { NavItem } from '@/config/nav-types';

export const nav: NavItem[] = [
  {
    id: 'onboarding',
    labelKey: 's07Company.nav.onboarding',
    href: '/onboarding',
    icon: 'check-square',
    group: 'dashboard',
    roles: ['owner'],
    order: 20,
  },
];
