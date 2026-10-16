// path: config/nav/s08.ts
import type { NavItem } from '@/config/nav-types';

export const nav: NavItem[] = [
  {
    id: 'clients',
    labelKey: 's08Crm.nav.clients',
    href: '/clients',
    icon: 'users',
    group: 'dashboard',
    roles: ['owner', 'staff'],
    order: 120,
  },
  {
    id: 'products',
    labelKey: 's08Crm.nav.products',
    href: '/products',
    icon: 'package',
    group: 'dashboard',
    roles: ['owner', 'staff'],
    order: 130,
  },
  {
    id: 'inventory',
    labelKey: 's08Crm.nav.inventory',
    href: '/inventory',
    icon: 'package',
    group: 'dashboard',
    roles: ['owner', 'staff'],
    order: 140,
  },
  {
    id: 'suppliers',
    labelKey: 's08Crm.nav.suppliers',
    href: '/suppliers',
    icon: 'truck',
    group: 'dashboard',
    roles: ['owner', 'staff'],
    order: 150,
  },
  {
    id: 'purchase-orders',
    labelKey: 's08Crm.nav.purchaseOrders',
    href: '/purchase-orders',
    icon: 'file-text',
    group: 'dashboard',
    roles: ['owner', 'staff'],
    order: 160,
  },
  {
    id: 'bills',
    labelKey: 's08Crm.nav.bills',
    href: '/bills',
    icon: 'receipt',
    group: 'dashboard',
    roles: ['owner', 'staff'],
    order: 170,
  },
];
