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
  {
    id: 'settings-company',
    labelKey: 's07Company.nav.company',
    href: '/settings/company',
    icon: 'building',
    group: 'account',
    roles: ['owner'],
    order: 430,
  },
  {
    id: 'settings-branding',
    labelKey: 's07Company.nav.branding',
    href: '/settings/branding',
    icon: 'tag',
    group: 'account',
    roles: ['owner'],
    order: 435,
  },
  {
    id: 'settings-invoicing',
    labelKey: 's07Company.nav.invoicing',
    href: '/settings/invoicing',
    icon: 'file-text',
    group: 'account',
    roles: ['owner'],
    order: 440,
  },
  {
    id: 'settings-notifications',
    labelKey: 's07Company.nav.notifications',
    href: '/settings/notifications',
    icon: 'bell',
    group: 'account',
    roles: ['owner'],
    order: 445,
  },
  {
    id: 'settings-display',
    labelKey: 's07Company.nav.display',
    href: '/settings/display',
    icon: 'settings',
    group: 'account',
    roles: ['owner'],
    order: 450,
  },
];
