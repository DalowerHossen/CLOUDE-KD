// path: config/nav/s14.ts
import type { NavItem } from '@/config/nav-types';

export const nav: NavItem[] = [
  {
    id: 'wallet',
    labelKey: 's14Wallet.nav.wallet',
    href: '/wallet',
    icon: 'wallet',
    group: 'dashboard',
    roles: ['owner', 'staff'],
    order: 45,
  },
  {
    id: 'admin-payouts',
    labelKey: 's14Wallet.nav.adminPayouts',
    href: '/admin/payouts',
    icon: 'wallet',
    group: 'admin',
    roles: ['super_admin', 'ceo', 'admin_staff'],
    order: 520,
  },
  {
    id: 'admin-payout-settings',
    labelKey: 's14Wallet.nav.adminPayoutSettings',
    href: '/admin/payouts/settings',
    icon: 'settings',
    group: 'admin',
    roles: ['super_admin'],
    order: 521,
  },
  {
    id: 'payment-settings',
    labelKey: 's14Wallet.paymentSettings.pageTitle',
    href: '/wallet/payment-settings',
    icon: 'credit-card',
    group: 'dashboard',
    roles: ['owner'],
    order: 46,
  },
  {
    id: 'admin-payment-methods',
    labelKey: 's14Wallet.nav.adminMethods',
    href: '/admin/payouts/methods',
    icon: 'credit-card',
    group: 'admin',
    roles: ['super_admin'],
    order: 522,
  },
];
