// path: config/nav/s03.ts
import type { NavItem } from '@/config/nav-types';

export const nav: NavItem[] = [
  {
    id: 'admin-account-locks',
    labelKey: 's03Auth.nav.accountLocks',
    href: '/admin/account-locks',
    icon: 'key',
    group: 'admin',
    roles: ['super_admin', 'ceo', 'admin_staff'],
    order: 230,
  },
  {
    id: 'admin-impersonation',
    labelKey: 's03Auth.nav.impersonation',
    href: '/admin/impersonation',
    icon: 'user',
    group: 'admin',
    roles: ['super_admin'],
    order: 240,
  },
  {
    id: 'account-security',
    labelKey: 's03Auth.nav.security',
    href: '/account/security',
    icon: 'shield',
    group: 'account',
    roles: 'any',
    order: 20,
  },
  {
    id: 'account-profile',
    labelKey: 's03Auth.nav.profile',
    href: '/account/profile',
    icon: 'user',
    group: 'account',
    roles: ['owner', 'staff'],
    order: 10,
  },
];
