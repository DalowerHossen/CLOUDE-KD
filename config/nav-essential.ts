// path: config/nav-essential.ts
// The short menu that a company owner or staff member sees by default: what is needed to sign up, get verified, set up
// the business and its look, invoice, get paid, connect an online store and run a team. Every other item stays one
// click away behind "Show all features". Hiding an item does not change what a role may open or do.

export const ESSENTIAL_NAV_IDS: readonly string[] = [
  // Main menu
  'dashboard-home',
  'onboarding',
  'clients',
  'products',
  'invoices',
  'estimates',
  'payments',
  'wallet',
  'payment-settings',
  'commerce',
  'developers',
  'team',
  'notifications',
  // Account menu
  'account-profile',
  'settings-company',
  'settings-branding',
  'settings-invoicing',
  'settings-kyc',
  'settings-notifications',
  'account-security',
  'support',
  'notices',
  'feedback',
];

/** Cookie that remembers the choice. Only "all" is stored; anything else means the short menu. */
export const MENU_MODE_COOKIE = 'kd_menu';
export type MenuMode = 'essential' | 'all';
