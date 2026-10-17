// path: config/nav/s10.ts
import type { NavItem } from '@/config/nav-types';

export const nav: NavItem[] = [
  {
    id: 'admin-processors',
    labelKey: 's10Processors.nav.processors',
    href: '/admin/processors',
    icon: 'credit-card',
    group: 'admin',
    roles: ['super_admin'],
    order: 500,
  },
  {
    id: 'admin-payment-review',
    labelKey: 's10Payments.nav.review',
    href: '/admin/payments/review',
    icon: 'shield',
    group: 'admin',
    roles: ['super_admin', 'ceo', 'admin_staff'],
    order: 510,
  },
];
