// path: config/nav/s09.ts
import type { NavItem } from '@/config/nav-types';

export const nav: NavItem[] = [
  {
    id: 'invoices',
    labelKey: 's09Invoicing.nav.invoices',
    href: '/invoices',
    icon: 'file-text',
    group: 'dashboard',
    roles: ['owner', 'staff'],
    order: 20,
    bottomNav: true,
  },
  {
    id: 'estimates',
    labelKey: 's09Estimates.nav.estimates',
    href: '/estimates',
    icon: 'file-text',
    group: 'dashboard',
    roles: ['owner', 'staff'],
    order: 21,
  },
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
