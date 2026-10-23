// path: lib/i18n/strings/en/s16-developers.ts
// Strings of the developer pages and API keys (STEP 16). English only.
export const strings = {
  scopes: {
    'read:clients': 'Read clients',
    'write:clients': 'Create and change clients',
    'read:products': 'Read products',
    'write:products': 'Create and change products',
    'read:invoices': 'Read invoices',
    'write:invoices': 'Create and change invoices',
    'read:payments': 'Read payments',
    'read:estimates': 'Read estimates',
    'write:estimates': 'Create and change estimates',
    'read:webhooks': 'Read webhook endpoints',
    'write:webhooks': 'Manage webhook endpoints',
  },
  keys: {
    title: 'API keys',
    states: { active: 'Active', expired: 'Expired', revoked: 'Revoked' },
    modes: { live: 'Live', sandbox: 'Sandbox' },
    secretOnce: 'Copy the key now. It is shown only once.',
  },
} as const;
