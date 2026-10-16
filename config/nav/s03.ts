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
];
