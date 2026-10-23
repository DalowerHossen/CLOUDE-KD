// path: config/nav/s04.ts
import type { NavItem } from '@/config/nav-types';

export const nav: NavItem[] = [
  {
    id: 'admin-security',
    labelKey: 's04Security.nav.security',
    href: '/admin/security',
    icon: 'shield',
    group: 'admin',
    roles: ['super_admin', 'ceo', 'admin_staff'],
    order: 300,
  },
  {
    id: 'admin-fraud',
    labelKey: 's04Security.nav.fraud',
    href: '/admin/fraud',
    icon: 'alert-triangle',
    group: 'admin',
    roles: ['super_admin', 'ceo', 'admin_staff'],
    order: 310,
  },
  {
    id: 'admin-siem',
    labelKey: 's04Security.nav.siem',
    href: '/admin/siem',
    icon: 'activity',
    group: 'admin',
    roles: ['super_admin', 'ceo', 'admin_staff'],
    order: 320,
  },
  {
    id: 'admin-incidents',
    labelKey: 's04Security.nav.incidents',
    href: '/admin/incidents',
    icon: 'alert-triangle',
    group: 'admin',
    roles: ['super_admin', 'ceo', 'admin_staff'],
    order: 330,
  },
  {
    id: 'admin-alerts',
    labelKey: 's04Security.nav.alerts',
    href: '/admin/alerts',
    icon: 'bell',
    group: 'admin',
    roles: ['super_admin', 'ceo', 'admin_staff'],
    order: 340,
  },
  {
    id: 'admin-health',
    labelKey: 's04Security.nav.health',
    href: '/admin/health',
    icon: 'activity',
    group: 'admin',
    roles: ['super_admin', 'ceo', 'admin_staff'],
    order: 350,
  },
];
