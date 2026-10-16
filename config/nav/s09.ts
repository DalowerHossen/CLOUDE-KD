// path: config/nav/s09.ts
import type { NavItem } from '@/config/nav-types';

export const nav: NavItem[] = [
  {
    id: 'invoice-tax',
    labelKey: 's09Invoicing.nav.tax',
    href: '/invoices/tax',
    icon: 'calculator',
    group: 'dashboard',
    roles: ['owner', 'staff'],
    order: 190,
  },
];
