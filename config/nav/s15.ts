// path: config/nav/s15.ts
import type { NavItem } from '@/config/nav-types';

export const nav: NavItem[] = [
  {
    id: 'accounting',
    labelKey: 's15Accounting.nav.accounting',
    href: '/accounting',
    icon: 'book-open',
    group: 'dashboard',
    roles: ['owner', 'staff'],
    order: 60,
  },
  {
    id: 'accounting-journals',
    labelKey: 's15Accounting.nav.journals',
    href: '/accounting/journals',
    icon: 'book-open',
    group: 'dashboard',
    roles: ['owner', 'staff'],
    order: 61,
  },
  {
    id: 'accounting-reports',
    labelKey: 's15Accounting.nav.reports',
    href: '/accounting/reports',
    icon: 'bar-chart',
    group: 'dashboard',
    roles: ['owner', 'staff'],
    order: 62,
  },
];
