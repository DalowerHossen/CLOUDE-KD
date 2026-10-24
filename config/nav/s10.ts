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
  {
    id: 'admin-payment-webhooks',
    labelKey: 's10Payments.nav.webhooks',
    href: '/admin/payments/webhooks',
    icon: 'server',
    group: 'admin',
    roles: ['super_admin', 'ceo', 'admin_staff'],
    order: 520,
  },
  {
    id: 'payments',
    labelKey: 's10Payments.nav.payments',
    href: '/payments',
    icon: 'credit-card',
    group: 'dashboard',
    roles: ['owner', 'staff'],
    order: 60,
  },
  {
    id: 'admin-payments',
    labelKey: 's10Payments.nav.gateway',
    href: '/admin/payments',
    icon: 'activity',
    group: 'admin',
    roles: ['super_admin', 'ceo', 'admin_staff'],
    order: 505,
  },
];
