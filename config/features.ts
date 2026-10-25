// path: config/features.ts
// The optional modules of a company dashboard. Every module is OFF for every company until the super admin turns it on
// (for all companies or for one company) in Admin > Feature flags. A module that is off is not in the menu, its pages
// answer "not found" and its company API answers "not found". The core screens (listed at the end) are always on.
// The flag key of a module is its `key`; a company flag beats the global flag; no flag means off. A module that names a
// plan `entitlement` is also tied to the company's plan: the plan must carry it, unless the super admin turned the module
// on for that one company (a grant for one company beats the plan).

import type { EntitlementKey } from '@/config/plans';

export interface ModuleDef {
  /** Flag key, for example "module.developers". */
  key: string;
  label: string;
  description: string;
  /** Ids of the menu items (config/nav/*) that belong to the module. */
  navIds: readonly string[];
  /** Dashboard page paths of the module (a path and everything below it). */
  pagePrefixes: readonly string[];
  /** Company API paths that only this module uses (a path and everything below it). */
  apiPrefixes: readonly string[];
  /** The plan switch the company's plan must carry for this module (not needed when granted to the company itself). */
  entitlement?: EntitlementKey;
}

export const MODULES: readonly ModuleDef[] = [
  {
    key: 'module.developers',
    label: 'Developers (API keys and webhooks)',
    description: 'API keys, outgoing webhooks and the API documentation.',
    navIds: ['developers'],
    pagePrefixes: ['/developers'],
    apiPrefixes: ['/api/integrations/keys', '/api/integrations/webhooks'],
  },
  {
    key: 'module.stores',
    label: 'Online stores (Shopify, WooCommerce)',
    description: 'Connect an online store and read its orders.',
    navIds: ['commerce'],
    pagePrefixes: ['/integrations/stores'],
    apiPrefixes: ['/api/integrations/commerce'],
  },
  {
    key: 'module.gateway',
    label: 'Sub-merchant gateway',
    description: 'Sub-merchants call the merchant app through the platform.',
    navIds: ['gateway'],
    pagePrefixes: ['/integrations/gateway'],
    apiPrefixes: ['/api/integrations/gateway'],
  },
  {
    key: 'module.settlement',
    label: 'Sub-merchant settlement',
    description: 'Settlement ledger between a merchant and its sub-merchants.',
    navIds: ['settlement'],
    pagePrefixes: ['/integrations/settlement'],
    apiPrefixes: ['/api/integrations/settlement'],
  },
  {
    key: 'module.automation',
    label: 'Automation',
    description: 'Automation tools such as Zapier-style connections.',
    navIds: ['automation'],
    pagePrefixes: ['/integrations/automation'],
    apiPrefixes: [],
  },
  {
    key: 'module.ocr',
    label: 'Receipt scanning (OCR)',
    description: 'Read receipts and bills from photos.',
    navIds: ['ocr'],
    pagePrefixes: ['/integrations/ocr'],
    apiPrefixes: ['/api/integrations/ocr'],
  },
  {
    key: 'module.messaging',
    label: 'Messaging',
    description: 'Send messages to clients through chat channels.',
    navIds: ['messaging'],
    pagePrefixes: ['/integrations/messaging'],
    apiPrefixes: ['/api/integrations/messaging'],
  },
  {
    key: 'module.bank_feed',
    label: 'Bank feed',
    description: 'Link a bank account and read its transactions.',
    navIds: ['bankfeed'],
    pagePrefixes: ['/integrations/bank'],
    apiPrefixes: ['/api/integrations/bank'],
  },
  {
    key: 'module.whatsapp',
    label: 'WhatsApp',
    description: 'WhatsApp messages, templates and campaigns.',
    navIds: ['whatsapp'],
    pagePrefixes: ['/whatsapp'],
    apiPrefixes: ['/api/whatsapp'],
    entitlement: 'whatsapp.automation',
  },
  {
    key: 'module.social',
    label: 'Social media',
    description: 'Plan and publish social posts.',
    navIds: ['social'],
    pagePrefixes: ['/social'],
    apiPrefixes: ['/api/social'],
    entitlement: 'social.automation',
  },
  {
    key: 'module.migration',
    label: 'Data migration',
    description: 'Move data from another system.',
    navIds: ['migration'],
    pagePrefixes: ['/migration'],
    apiPrefixes: ['/api/migration'],
  },
  {
    key: 'module.data_import',
    label: 'Data import',
    description: 'Import clients, products and invoices from files.',
    navIds: ['imports'],
    pagePrefixes: ['/imports'],
    apiPrefixes: ['/api/import'],
  },
  {
    key: 'module.accounting',
    label: 'Accounting, expenses and bills',
    description: 'Ledger, journals, expenses, bills, tax and financial reports.',
    navIds: [
      'accounting',
      'accounting-journals',
      'accounting-reports',
      'expenses',
      'accounting-assets',
      'accounting-budgets',
      'accounting-forecast',
      'accounting-insights',
      'accounting-entities',
      'accounting-tax',
      'accounting-audit-pack',
      'accounting-reconciliation',
      'bills',
    ],
    pagePrefixes: ['/accounting', '/expenses', '/bills'],
    apiPrefixes: ['/api/accounting', '/api/expenses', '/api/bills'],
    entitlement: 'accounting.enabled',
  },
  {
    key: 'module.payroll_hr',
    label: 'Payroll and HR',
    description: 'Employees, payroll runs, leave and performance.',
    navIds: [
      'payroll-employees',
      'payroll-structures',
      'payroll-preview',
      'payroll-settings',
      'payroll-runs',
      'payroll-reports',
      'payroll-declarations',
      'hr-org',
      'hr-leave',
      'hr-checklists',
      'hr-performance',
    ],
    pagePrefixes: ['/payroll', '/hr'],
    apiPrefixes: ['/api/payroll', '/api/hr'],
    entitlement: 'payroll.enabled',
  },
  {
    key: 'module.inventory',
    label: 'Inventory and purchasing',
    description: 'Stock, suppliers and purchase orders.',
    navIds: ['inventory', 'suppliers', 'purchase-orders'],
    pagePrefixes: ['/inventory', '/suppliers', '/purchase-orders'],
    apiPrefixes: ['/api/inventory', '/api/suppliers', '/api/purchase-orders'],
    entitlement: 'inventory.enabled',
  },
  {
    key: 'module.projects',
    label: 'Projects and time',
    description: 'Projects and timesheets.',
    navIds: ['projects', 'timesheets'],
    pagePrefixes: ['/projects', '/timesheets'],
    apiPrefixes: ['/api/projects', '/api/time'],
    entitlement: 'projects.enabled',
  },
  {
    key: 'module.reports',
    label: 'Reports',
    description: 'The reports library, saved reports and schedules.',
    navIds: ['reports'],
    pagePrefixes: ['/reports'],
    apiPrefixes: [],
    entitlement: 'reports.advanced',
  },
  {
    key: 'module.invoicing_extras',
    label: 'Advanced invoicing',
    description: 'Credit notes, recurring invoices, reminders, late fees, batches and tax tools.',
    navIds: [
      'credit-notes',
      'invoice-recurring',
      'invoice-reminders',
      'invoice-late-fees',
      'invoice-batches',
      'invoice-tax',
    ],
    pagePrefixes: [
      '/credit-notes',
      '/invoices/recurring',
      '/invoices/reminders',
      '/invoices/late-fees',
      '/invoices/batches',
      '/invoices/tax',
    ],
    apiPrefixes: [],
  },
  {
    key: 'module.client_subscriptions',
    label: 'Client subscriptions',
    description: 'Recurring plans that the company sells to its own clients.',
    navIds: ['client-subscriptions'],
    pagePrefixes: ['/subscriptions'],
    apiPrefixes: [],
    entitlement: 'recurring.enabled',
  },
  {
    key: 'module.bnpl',
    label: 'Buy now, pay later',
    description: 'Installment plans for clients.',
    navIds: ['bnpl'],
    pagePrefixes: ['/wallet/bnpl'],
    apiPrefixes: ['/api/wallet/bnpl'],
  },
  {
    key: 'module.client_tools',
    label: 'Client mail, contracts and disputes',
    description: 'Client mailbox and branding, contracts and signatures, disputes.',
    navIds: ['client-mail', 'client-branding', 'contracts', 'disputes'],
    pagePrefixes: ['/client-mail', '/contracts', '/disputes'],
    apiPrefixes: ['/api/contracts'],
  },
  {
    key: 'module.advanced_settings',
    label: 'Advanced settings',
    description:
      'Approvals, single sign-on, custom domains, storage, e-mail, security policy, data tools, several companies.',
    navIds: [
      'dashboard-approvals',
      'settings-storage',
      'settings-email',
      'settings-display',
      'settings-companies',
      'settings-sso',
      'settings-domains',
      'settings-policy',
      'settings-data',
    ],
    pagePrefixes: [
      '/approvals',
      '/settings/storage',
      '/settings/email',
      '/settings/display',
      '/settings/companies',
      '/settings/sso',
      '/settings/domains',
      '/settings/security',
      '/settings/data',
    ],
    apiPrefixes: ['/api/settings/sso', '/api/settings/domains', '/api/settings/data'],
  },
];

/** Menu items that are always on: sign-up, verification, the business and its look, invoicing, payments, team, help. */
export const CORE_NAV_IDS: readonly string[] = [
  'dashboard-home',
  'onboarding',
  'clients',
  'products',
  'invoices',
  'estimates',
  'payments',
  'wallet',
  'payment-settings',
  'billing',
  'team',
  'notifications',
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

const matches = (pathname: string, prefix: string): boolean =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/** The module that owns a dashboard page path, or null for a core page. The longest matching path wins. */
export function moduleForPage(pathname: string): ModuleDef | null {
  // The company's own platform billing lives under /subscriptions/billing and is core.
  if (matches(pathname, '/subscriptions/billing')) return null;
  return longest(pathname, (m) => m.pagePrefixes);
}

/** The module that owns a company API path, or null. */
export function moduleForApi(pathname: string): ModuleDef | null {
  return longest(pathname, (m) => m.apiPrefixes);
}

export function moduleOfNavItem(id: string): ModuleDef | null {
  return MODULES.find((m) => m.navIds.includes(id)) ?? null;
}

function longest(
  pathname: string,
  prefixesOf: (m: ModuleDef) => readonly string[],
): ModuleDef | null {
  let best: { module: ModuleDef; length: number } | null = null;
  for (const m of MODULES)
    for (const prefix of prefixesOf(m))
      if (matches(pathname, prefix) && (best === null || prefix.length > best.length))
        best = { module: m, length: prefix.length };
  return best?.module ?? null;
}
