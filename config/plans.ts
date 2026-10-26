// path: config/plans.ts
// Plan entitlement catalogue. Prices and billing live in the database (STEP 14); this file defines
// which features and limits each plan key carries. A number limit of null means unlimited.

export const ENTITLEMENT_KEYS = [
  'invoices.monthly',
  'clients.max',
  'staff.seats',
  'storage.gigabytes',
  'emails.monthly',
  'api.requests_monthly',
  'token.expiry_days',
  'recurring.enabled',
  'projects.enabled',
  'inventory.enabled',
  'payroll.enabled',
  'accounting.enabled',
  'reports.advanced',
  'api.access',
  'webhooks.outgoing',
  'whatsapp.automation',
  'social.automation',
  'branding.white_label',
  'domain.custom',
  'display.multi_currency',
  'support.priority',
  'sso.ready',
] as const;

export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];
export type EntitlementValue = boolean | number | null;

export const PLAN_KEYS = ['free', 'pro', 'business', 'enterprise'] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export interface PlanDefinition {
  key: PlanKey;
  label: string;
  entitlements: Readonly<Record<EntitlementKey, EntitlementValue>>;
}

export const PLANS: Readonly<Record<PlanKey, PlanDefinition>> = {
  free: {
    key: 'free',
    label: 'Free',
    entitlements: {
      'invoices.monthly': 10,
      'clients.max': 25,
      'staff.seats': 1,
      'storage.gigabytes': 1,
      'emails.monthly': 100,
      'api.requests_monthly': 0,
      'token.expiry_days': 7,
      'recurring.enabled': false,
      'projects.enabled': false,
      'inventory.enabled': false,
      'payroll.enabled': false,
      'accounting.enabled': false,
      'reports.advanced': false,
      'api.access': false,
      'webhooks.outgoing': false,
      'whatsapp.automation': false,
      'social.automation': false,
      'branding.white_label': false,
      'domain.custom': false,
      'display.multi_currency': false,
      'support.priority': false,
      'sso.ready': false,
    },
  },
  pro: {
    key: 'pro',
    label: 'Pro',
    entitlements: {
      'invoices.monthly': 200,
      'clients.max': 500,
      'staff.seats': 5,
      'storage.gigabytes': 20,
      'emails.monthly': 2000,
      'api.requests_monthly': 50000,
      'token.expiry_days': 30,
      'recurring.enabled': true,
      'projects.enabled': true,
      'inventory.enabled': true,
      'payroll.enabled': false,
      'accounting.enabled': true,
      'reports.advanced': true,
      'api.access': true,
      'webhooks.outgoing': true,
      'whatsapp.automation': false,
      'social.automation': false,
      'branding.white_label': false,
      'domain.custom': true,
      'display.multi_currency': true,
      'support.priority': false,
      'sso.ready': false,
    },
  },
  business: {
    key: 'business',
    label: 'Business',
    entitlements: {
      'invoices.monthly': 2000,
      'clients.max': 5000,
      'staff.seats': 25,
      'storage.gigabytes': 200,
      'emails.monthly': 20000,
      'api.requests_monthly': 500000,
      'token.expiry_days': 90,
      'recurring.enabled': true,
      'projects.enabled': true,
      'inventory.enabled': true,
      'payroll.enabled': true,
      'accounting.enabled': true,
      'reports.advanced': true,
      'api.access': true,
      'webhooks.outgoing': true,
      'whatsapp.automation': true,
      'social.automation': true,
      'branding.white_label': true,
      'domain.custom': true,
      'display.multi_currency': true,
      'support.priority': true,
      'sso.ready': false,
    },
  },
  enterprise: {
    key: 'enterprise',
    label: 'Enterprise',
    entitlements: {
      'invoices.monthly': null,
      'clients.max': null,
      'staff.seats': null,
      'storage.gigabytes': null,
      'emails.monthly': null,
      'api.requests_monthly': null,
      'token.expiry_days': 365,
      'recurring.enabled': true,
      'projects.enabled': true,
      'inventory.enabled': true,
      'payroll.enabled': true,
      'accounting.enabled': true,
      'reports.advanced': true,
      'api.access': true,
      'webhooks.outgoing': true,
      'whatsapp.automation': true,
      'social.automation': true,
      'branding.white_label': true,
      'domain.custom': true,
      'display.multi_currency': true,
      'support.priority': true,
      'sso.ready': true,
    },
  },
};

export function isPlanKey(value: string): value is PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(value);
}
